const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

const TORRENTIO_BASE = 'https://torrentio.strem.fun';

// Torrentio ayarları - 4K dahil tüm kaliteler, sadece cam/scr/unknown hariç
const TORRENTIO_CONFIG = 'sort=qualitysize|qualityfilter=cam,scr,unknown';

const manifest = {
  id: 'org.torbox.proxy',
  name: 'Prometheus Streams',
  version: '1.0.0',
  description: 'TorBox destekli yüksek kalite 4K içerikler sunan Nuvio eklenyisi.',
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
    const url = `${TORRENTIO_BASE}/${TORRENTIO_CONFIG}|torbox=${TORBOX_API_KEY}/stream/${type}/${id}.json`;
    console.log(`[TorBox] Fetching: ${type}/${id}`);

    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) {
      console.error(`[TorBox] Torrentio HTTP ${res.status}`);
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
console.log(`TorBox Addon çalışıyor: http://localhost:${port}`);
