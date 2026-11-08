// Košarica do budžeta – mali server bez dodatnih paketa (Node 18+)
// Pokretanje:  CIJENE_API_KEY=tvoj_kljuc node server.js   →  http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const KEY = process.env.CIJENE_API_KEY || "";
const API = process.env.CIJENE_API_URL || "https://api.cijene.dev/v1";
const TTL = 6 * 60 * 60 * 1000; // cijene se mijenjaju jednom dnevno
const cache = new Map();

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

async function api(pathAndQuery) {
  const res = await fetch(API + pathAndQuery, {
    headers: { Authorization: "Bearer " + KEY, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`cijene.dev je vratio ${res.status}`);
    err.status = res.status; err.body = body.slice(0, 300);
    throw err;
  }
  return res.json();
}

const num = (x) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return isFinite(n) && n > 0 ? n : null; };

// Pretvara odgovor API-ja u jednostavne retke za jedan lanac.
function normalize(raw, chain) {
  const list = Array.isArray(raw) ? raw : raw.products || raw.results || raw.items || [];
  const out = [];
  for (const p of list) {
    const entries = p.chains || p.prices || [p];
    for (const e of entries) {
      const c = String(e.chain || e.chain_code || e.code || p.chain || "").toLowerCase();
      if (chain && c && c !== chain) continue;
      const price = num(e.min_price) ?? num(e.price) ?? num(e.avg_price) ?? num(e.special_price) ?? num(e.regular_price);
      if (!price) continue;
      out.push({
        ean: p.ean || e.ean || null,
        name: p.name || e.name || "",
        brand: p.brand || e.brand || "",
        quantity: p.quantity || e.quantity || "",
        unit: p.unit || e.unit || "",
        price,
        date: e.price_date || e.date || null,
        chain: c || chain,
      });
    }
  }
  return out;
}

async function search(q, chain) {
  return cached(`s:${chain}:${q}`, async () => {
    const qs = new URLSearchParams({ q, limit: "50" });
    if (chain) qs.set("chains", chain);
    return normalize(await api("/products/?" + qs), chain);
  });
}

async function image(ean) {
  return cached("img:" + ean, async () => {
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=image_front_small_url,image_small_url`,
        { headers: { "User-Agent": "KosaricaDoBudzeta/1.0" } });
      if (!r.ok) return null;
      const j = await r.json();
      return j.product?.image_front_small_url || j.product?.image_small_url || null;
    } catch { return null; }
  });
}

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/" || u.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(path.join(__dirname, "local.html")).pipe(res);
    }
    if (u.pathname === "/api/status") return send(res, 200, { hasKey: !!KEY });
    if (u.pathname === "/api/search") {
      if (!KEY) return send(res, 401, { error: "Nema API ključa. Pokreni server s CIJENE_API_KEY=..." });
      const q = (u.searchParams.get("q") || "").trim();
      const chain = (u.searchParams.get("chain") || "").toLowerCase();
      if (!q) return send(res, 400, { error: "Nedostaje pojam za pretragu" });
      return send(res, 200, { items: await search(q, chain) });
    }
    if (u.pathname === "/api/image") {
      const ean = u.searchParams.get("ean") || "";
      if (!/^\d{6,14}$/.test(ean)) return send(res, 200, { url: null });
      return send(res, 200, { url: await image(ean) });
    }
    if (u.pathname === "/api/debug") {
      // Sirovi odgovor API-ja, korisno ako se nešto ne prikazuje dobro
      const qs = new URLSearchParams({ q: u.searchParams.get("q") || "mlijeko", limit: "3" });
      return send(res, 200, await api("/products/?" + qs));
    }
    send(res, 404, { error: "Nema te stranice" });
  } catch (e) {
    console.error(e.message, e.body || "");
    send(res, e.status === 401 || e.status === 403 ? 401 : 502, {
      error: e.status === 401 || e.status === 403 ? "API ključ nije prihvaćen. Provjeri ga na cijene.dev." : e.message,
    });
  }
}).listen(PORT, () => {
  console.log(`Košarica radi na http://localhost:${PORT}`);
  if (!KEY) console.log("Upozorenje: CIJENE_API_KEY nije postavljen, aplikacija će koristiti okvirne cijene.");
});
