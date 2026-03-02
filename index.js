const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const TORBOX_STREMIO_BASE = 'https://stremio.torbox.app';

const manifest = {
  id: 'org.torbox.proxy',
  name: 'TorBox Streams',
  version: '1.1.0',
  description: "TorBox destekli yüksek kalite stream'ler.",
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

    console.log(`[TorBox] ${streams.length} stream bulundu (${type}/${id})`);
    return { streams };
  } catch (err) {
    console.error(`[TorBox] Error:`, err.message);
    return { streams: [] };
  }
});

const port = process.env.PORT || 7001;
serveHTTP(builder.getInterface(), { port });
console.log(`TorBox Addon calisiyor: http://localhost:${port}`);
