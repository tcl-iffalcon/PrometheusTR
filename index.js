const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const TORBOX_STREMIO_BASE = 'https://stremio.torbox.app';

// Kalite tespiti - stream title'dan 4K/2160p içerenleri bul
function is4K(stream) {
  const title = (stream.title || '') + (stream.name || '');
  return /4k|2160p|uhd/i.test(title);
}

// Kalite skoru - sıralama için
function qualityScore(stream) {
  const title = (stream.title || '') + (stream.name || '');
  if (/remux/i.test(title)) return 100;
  if (/bluray|blu-ray/i.test(title)) return 90;
  if (/web-dl|webdl/i.test(title)) return 80;
  if (/webrip/i.test(title)) return 70;
  if (/hdtv/i.test(title)) return 60;
  return 50;
}

const manifest = {
  id: 'org.torbox.proxy',
  name: 'TorBox 4K',
  version: '1.2.0',
  description: "TorBox destekli sadece 4K stream'ler.",
  logo: 'https://torbox.app/favicon.ico',
  resources: ['stream'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt', 'kitsu'],
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
  const TORBOX_API_KEY = process.env.TORBOX_API_KEY;
  if (!TORBOX_API_KEY) {
    console.error('[TorBox] TORBOX_API_KEY eksik!');
    return { streams: [] };
  }

  try {
    const url = `${TORBOX_STREMIO_BASE}/${TORBOX_API_KEY}/stream/${type}/${id}.json`;
    console.log(`[TorBox] Fetching: ${type}/${id}`);

    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) {
      console.error(`[TorBox] HTTP ${res.status}`);
      return { streams: [] };
    }

    const data = await res.json();
    const streams = data.streams || [];

    // Sadece 4K filtrele
    const filtered = streams.filter(is4K);

    // En yüksek kalite önce sırala
    filtered.sort((a, b) => qualityScore(b) - qualityScore(a));

    console.log(`[TorBox] ${streams.length} stream → ${filtered.length} adet 4K (${type}/${id})`);
    return { streams: filtered };
  } catch (err) {
    console.error(`[TorBox] Error:`, err.message);
    return { streams: [] };
  }
});

const port = process.env.PORT || 7001;
serveHTTP(builder.getInterface(), { port });
console.log(`TorBox 4K Addon calisiyor: http://localhost:${port}`);
