import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 8080;
const TMDB_KEY = '7045bc4055c6293e84534dd8f6dbb024';
const TMDB = 'https://api.themoviedb.org/3';
const FLIXBABA = 'https://flixbaba.mov';

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

const manifest = {
  id: 'community.flixbaba',
  version: '1.0.0',
  name: 'PrometheusTR',
  description: 'Yerli ve yabancı film ve diziler için Nuvio eklentisi.',
  logo: 'https://flixbaba.mov/favicon.ico',
  resources: [
    { name: 'catalog', types: ['movie', 'series'], idPrefixes: ['fb_'] },
    { name: 'meta',    types: ['movie', 'series'], idPrefixes: ['fb_'] },
    { name: 'stream',  types: ['movie', 'series'], idPrefixes: ['fb_'] }
  ],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'fb_movie_popular',
      name: '🎬 Filmler',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip',   isRequired: false }
      ]
    },
    {
      type: 'series',
      id: 'fb_tv_popular',
      name: '📺 Diziler',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip',   isRequired: false }
      ]
    }
  ]
};

app.get('/manifest.json', (req, res) => res.json(manifest));

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseId(id) {
  const parts = id.split('_');
  return { mediaType: parts[1], tmdbId: parts[2] };
}

function toMeta(item, stremioType, mediaType) {
  const title = item.title || item.name || '';
  return {
    id: `fb_${mediaType}_${item.id}`,
    type: stremioType,
    name: title,
    poster: item.poster_path
      ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
      : `https://via.placeholder.com/300x450?text=${encodeURIComponent(title)}`,
    background: item.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`
      : undefined,
    description: item.overview || '',
    releaseInfo: (item.release_date || item.first_air_date || '').slice(0, 4)
  };
}

const CATALOG_ENDPOINTS = {
  fb_movie_popular: { media: 'movie', path: '/discover/movie?sort_by=popularity.desc&include_adult=false' },
  fb_tv_popular:    { media: 'tv',    path: '/discover/tv?sort_by=popularity.desc&include_adult=false' }
};

app.get('/catalog/:type/:id.json', async (req, res) => {
  const { id } = req.params;
  const { search, skip } = req.query;
  const page = Math.floor((parseInt(skip) || 0) / 20) + 1;

  try {
    let url, mediaType;

    if (search) {
      mediaType = id.startsWith('fb_tv') ? 'tv' : 'movie';
      url = `${TMDB}/search/${mediaType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(search)}&page=${page}&include_adult=false`;
    } else {
      const ep = CATALOG_ENDPOINTS[id];
      if (!ep) return res.json({ metas: [] });
      mediaType = ep.media;
      url = `${TMDB}${ep.path}&api_key=${TMDB_KEY}&page=${page}`;
    }

    const { data } = await axios.get(url, { timeout: 10000 });
    const stremioType = mediaType === 'tv' ? 'series' : 'movie';
    res.json({ metas: (data.results || []).map(i => toMeta(i, stremioType, mediaType)) });
  } catch (err) {
    console.error('Catalog error:', err.message);
    res.json({ metas: [] });
  }
});

app.get('/meta/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  const { mediaType, tmdbId } = parseId(id);

  try {
    const { data } = await axios.get(
      `${TMDB}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits,videos`,
      { timeout: 10000 }
    );
    const title   = data.title || data.name || '';
    const trailer = (data.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube');

    res.json({
      meta: {
        id, type,
        name:        title,
        poster:      data.poster_path   ? `https://image.tmdb.org/t/p/w500${data.poster_path}`    : null,
        background:  data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : null,
        description: data.overview || '',
        releaseInfo: (data.release_date || data.first_air_date || '').slice(0, 4),
        runtime:     data.runtime || null,
        genres:      (data.genres || []).map(g => g.name),
        cast:        (data.credits?.cast || []).slice(0, 8).map(c => c.name),
        trailers:    trailer ? [{ source: trailer.key, type: 'Trailer' }] : [],
        imdbRating:  data.vote_average ? String(data.vote_average.toFixed(1)) : null,
        website:     `${FLIXBABA}/${mediaType}/${tmdbId}/${slugify(title)}`
      }
    });
  } catch (err) {
    console.error('Meta error:', err.message);
    res.json({ meta: { id, type, name: 'FlixBaba' } });
  }
});

async function fetchStreams(pageUrl) {
  try {
    const { data } = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': FLIXBABA,
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);
    const streams = [];
    const seen = new Set();

    function add(url, title) {
      if (!url || seen.has(url)) return;
      seen.add(url);
      streams.push({ title, url });
    }

    $('iframe').each((i, el) => {
      let src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (src.startsWith('//')) src = 'https:' + src;
      if (src.startsWith('http')) add(src, `Kaynak ${streams.length + 1}`);
    });

    $('video, video source, source').each((i, el) => {
      const src = $(el).attr('src');
      if (src) add(src, `Video ${streams.length + 1}`);
    });

    for (const m of data.matchAll(/["'](?:file|src|source)["']\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)['"]/gi))
      add(m[1], `Player ${streams.length + 1}`);

    const nd = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nd) {
      try {
        for (const m of JSON.stringify(JSON.parse(nd[1])).matchAll(/"(https?:\/\/[^"]+\.(?:m3u8|mp4)[^"]*)"/g))
          add(m[1], `Stream ${streams.length + 1}`);
      } catch {}
    }

    return streams;
  } catch (err) {
    console.error('fetchStreams error:', err.message);
    return [];
  }
}

app.get('/stream/:type/:id.json', async (req, res) => {
  const { id } = req.params;
  const { mediaType, tmdbId } = parseId(id);

  try {
    const { data } = await axios.get(`${TMDB}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}`, { timeout: 10000 });
    const title   = data.title || data.name || '';
    const pageUrl = `${FLIXBABA}/${mediaType}/${tmdbId}/${slugify(title)}`;
    const streams = await fetchStreams(pageUrl);

    res.json({
      streams: streams.length > 0
        ? streams
        : [{ title: "▶ PrometheusTR'de İzle", externalUrl: pageUrl }]
    });
  } catch (err) {
    console.error('Stream error:', err.message);
    res.json({ streams: [] });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/', (_req, res) => res.json({ name: manifest.name, manifest: '/manifest.json' }));

app.listen(PORT, () => console.log(`PrometheusTR addon running on port ${PORT}`));