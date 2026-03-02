import express from 'express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 8080;
const TMDB_KEY = process.env.TMDB_KEY || '7045bc4055c6293e84534dd8f6dbb024';
const TMDB = 'https://api.themoviedb.org/3';

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

const manifest = {
  id: 'community.flixbaba',
  version: '2.0.0',
  name: 'FlixBaba',
  description: 'FlixBaba üzerinden film ve dizi izle',
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

function makeEmbedUrl(mediaType, tmdbId, season, episode) {
  const ts  = Date.now();
  const rnd = Math.random().toString(36).slice(2, 12);
  const base = `https://player.vidify.top/embed/${mediaType}/${tmdbId}-${ts}${rnd}`;
  const params = 'autoplay=true&poster=true&chromecast=true&servericon=true&setting=true&pip=true';

  if (mediaType === 'tv' && season && episode) {
    return `${base}/${season}/${episode}?${params}&server=1`;
  }
  return `${base}?${params}&server=1`;
}

function parseId(id) {
  const [fbPart, ...rest] = id.split(':');
  const parts = fbPart.split('_');
  return {
    mediaType: parts[1],
    tmdbId:    parts[2],
    season:    rest[0] || '1',
    episode:   rest[1] || '1'
  };
}

function toMeta(item, stremioType, mediaType) {
  const title = item.title || item.name || '';
  return {
    id:          `fb_${mediaType}_${item.id}`,
    type:        stremioType,
    name:        title,
    poster:      item.poster_path
                   ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                   : `https://via.placeholder.com/300x450?text=${encodeURIComponent(title)}`,
    background:  item.backdrop_path
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
        imdbRating:  data.vote_average ? String(data.vote_average.toFixed(1)) : null
      }
    });
  } catch (err) {
    console.error('Meta error:', err.message);
    res.json({ meta: { id, type, name: 'FlixBaba' } });
  }
});

app.get('/stream/:type/:id.json', async (req, res) => {
  const { id } = req.params;
  const { mediaType, tmdbId, season, episode } = parseId(decodeURIComponent(id));

  try {
    const s1 = makeEmbedUrl(mediaType, tmdbId, season, episode);
    const s2 = s1.replace('server=1', 'server=2');
    const s3 = s1.replace('server=1', 'server=3');

    console.log(`Stream → ${s1}`);

    res.json({
      streams: [
        { title: '▶ Server 1', url: s1 },
        { title: '▶ Server 2', url: s2 },
        { title: '▶ Server 3', url: s3 }
      ]
    });
  } catch (err) {
    console.error('Stream error:', err.message);
    res.json({ streams: [] });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/', (_req, res) => res.json({ name: manifest.name, manifest: '/manifest.json' }));

app.listen(PORT, () => console.log(`FlixBaba addon running on port ${PORT}`));

package.json — cheerio artık gerekmiyor:
json{
  "name": "flixbaba-addon",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.2"
  }
}
