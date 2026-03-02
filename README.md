# TorBox Streams - Stremio/Nuvio Eklentisi

TorBox API key'ini gizli tutarak Torrentio üzerinden stream sunan eklenti.

## Kurulum

### 1. GitHub'a Push Et
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/KULLANICI/torbox-addon
git push -u origin main
```

### 2. Render'a Deploy Et
1. [render.com](https://render.com) → **New Web Service**
2. GitHub repo'nu bağla
3. Ayarlar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variables:**
     - `TORBOX_API_KEY` = TorBox API key'in (Settings > API Keys)
4. Deploy et

### 3. Nuvio'ya Ekle
Deploy sonrası URL'yi kopyala:
```
https://torbox-addon.onrender.com/manifest.json
```
Nuvio → Eklenti Ekle → bu URL'yi yapıştır.

## Notlar
- API key sadece Render'da saklanır, kimse göremez
- Kalite filtresi: 4K, 1080p dahil — cam, scr, unknown hariç
- Stream sıralaması: kalite + boyuta göre
