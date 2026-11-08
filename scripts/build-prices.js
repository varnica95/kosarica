// Iz raspakirane dnevne arhive cijene.dev stvara malu datoteku prices.json za aplikaciju.
// Upotreba: node scripts/build-prices.js <mapa-arhive> <datum YYYY-MM-DD> [izlaz.json]
// Arhiva ima mapu po lancu (konzum/, lidl/ ...), a u svakoj products.csv, prices.csv i stores.csv.
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const P = require("../products.js");

const [dir, date, outFile = "prices.json"] = process.argv.slice(2);
if (!dir) { console.error("Upotreba: node scripts/build-prices.js <mapa> <datum> [izlaz]"); process.exit(1); }

const CHAINS = ["konzum", "lidl", "kaufland", "spar", "plodine", "studenac", "tommy", "eurospin"];
const KEEP = 6;

const strip = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
const num = (x) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return isFinite(n) && n > 0 ? n : null; };

function splitCsv(line, d) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out;
}

async function readCsv(file, onRow) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let header = null, delim = ",";
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, "");
    if (!line.trim()) continue;
    if (!header) {
      delim = (line.split(";").length > line.split(",").length) ? ";" : ",";
      header = splitCsv(line, delim).map((h) => strip(h).trim());
      continue;
    }
    const cells = splitCsv(line, delim); const row = {};
    header.forEach((h, i) => (row[h] = cells[i]));
    onRow(row);
  }
  return header || [];
}
const pick = (row, names) => { for (const n of names) if (row[n] != null && row[n] !== "") return row[n]; return ""; };

function findChainDir(chain) {
  // mapa može biti izravno u arhivi ili jednu razinu niže (npr. 2026-11-08/konzum)
  const direct = path.join(dir, chain);
  if (fs.existsSync(path.join(direct, "products.csv"))) return direct;
  for (const sub of fs.readdirSync(dir)) {
    const d = path.join(dir, sub, chain);
    if (fs.existsSync(path.join(d, "products.csv"))) return d;
  }
  return null;
}

// "500 g" -> 500, "1 kg" -> 1000, "3×80 g" -> 240, "0,5 L" -> 500; nepoznato -> null
function amount(str) {
  const m = String(str || "").toLowerCase().replace(",", ".").match(/^(?:(\d+)\s*[x×]\s*)?([\d.]+)\s*(kg|g|ml|l)\b/);
  if (!m) return null;
  const n = parseFloat(m[2]) * (m[1] ? parseInt(m[1]) : 1);
  return m[3] === "kg" || m[3] === "l" ? n * 1000 : n;
}
function median(a) { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
// "KRUH POLUBIJELI 500g" -> "Kruh polubijeli 500g"
function niceName(s) {
  s = String(s || "").trim().replace(/\s+/g, " ");
  const letters = s.replace(/[^A-Za-zČĆŽŠĐčćžšđ]/g, "");
  if (letters && letters === letters.toUpperCase()) s = s.toLowerCase().replace(/^./, (c) => c.toUpperCase());
  return s;
}
// "0.50 kg" + "ko" -> "0,5 kg"; komadi se ne prikazuju
function niceQty(q, u) {
  q = String(q || "").trim(); u = String(u || "").trim().toLowerCase();
  // Lidl piše npr. "0,5 500g" ili "150g,180g": uzmi zadnju vrijednost s jedinicom
  const tokens = [...q.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)(?![a-z])/gi)];
  let n, unit;
  if (tokens.length) { const t = tokens[tokens.length - 1]; n = parseFloat(t[1].replace(",", ".")); unit = t[2].toLowerCase(); }
  else {
    const m = q.match(/^([\d.,]+)\s*([a-zA-Z]*)$/);
    if (!m) return "";
    n = parseFloat(m[1].replace(",", ".")); unit = (m[2] || u).toLowerCase();
  }
  if (!isFinite(n) || !n || !["kg", "g", "ml", "l"].includes(unit)) return "";
  if (unit === "kg" && n < 1) return Math.round(n * 1000) + " g";
  if (unit === "l" && n < 1) return Math.round(n * 1000) + " ml";
  return String(+n.toFixed(2)).replace(".", ",") + " " + (unit === "l" ? "L" : unit);
}
const terms = [];
for (const cat in P) for (const it of P[cat]) {
  terms.push({
    id: it[0], est: it[3], size: amount(it[2]),
    start: new RegExp("^(" + it[7] + ")"),            // naziv počinje traženom riječju (prednost)
    must: new RegExp("(^|[^a-z])(" + it[7] + ")"),    // ili je sadrži kao zasebnu riječ
    ex: it[8] ? new RegExp(it[8]) : null,
  });
}

(async () => {
  const result = { date: date || null, generated: new Date().toISOString(), chains: {} };
  for (const chain of CHAINS) {
    const cdir = findChainDir(chain);
    if (!cdir) { console.warn(`${chain}: nema podataka u arhivi`); continue; }

    // 1) proizvodi: pronađi one koji odgovaraju pojmovima
    const products = new Map(); // product_id -> {info, termIds}
    const ph = await readCsv(path.join(cdir, "products.csv"), (r) => {
      const id = pick(r, ["product_id", "id", "sifra", "code"]);
      const name = pick(r, ["name", "naziv", "product"]);
      const brand = pick(r, ["brand", "marka"]);
      if (!id || !name) return;
      const n = strip(name).trim(), nb = strip(brand);
      const ts = [];
      for (const t of terms) {
        if (PET.test(n + " " + nb) || (t.ex && t.ex.test(n + " " + nb))) continue;
        if (t.start.test(n)) ts.push([t.id, 0]); else if (t.must.test(n)) ts.push([t.id, 1]);
      }
      if (!ts.length) return;
      products.set(id, {
        ts, name: name.trim(), brand: brand.trim(),
        ean: pick(r, ["barcode", "ean"]).trim() || null,
        quantity: pick(r, ["quantity", "kolicina"]).trim(), unit: pick(r, ["unit", "jedinica"]).trim(),
        prices: [],
      });
    });

    // 2) cijene: najniža cijena u lancu (uzima i akcijsku cijenu)
    const prh = await readCsv(path.join(cdir, "prices.csv"), (r) => {
      const p = products.get(pick(r, ["product_id", "id", "sifra", "code"]));
      if (!p) return;
      const price = Math.min(...[num(r.price), num(r.special_price), num(r.retail_price), num(r.regular_price)].filter(Boolean));
      if (isFinite(price)) p.prices.push(price);
    });

    const byTerm = {};
    const estOf = Object.fromEntries(terms.map((t) => [t.id, t.est]));
    for (const p of products.values()) {
      if (!p.prices.length) continue;
      p.price = median(p.prices); // uobičajena cijena u lancu; izbacuje greške pojedinih poslovnica
      for (const [t, tier] of p.ts) {
        const ratio = p.price / estOf[t];
        if (ratio < 0.3 || ratio > 3.5) continue; // premala pakiranja, greške i krivi proizvodi
        const size = amount(niceQty(p.quantity, p.unit));
        const want = terms.find((x) => x.id === t).size;
        const sizeOk = !want || !size ? 1 : (size / want >= 0.4 && size / want <= 2.4 ? 1 : 0);
        (byTerm[t] = byTerm[t] || []).push({ ...p, tier, sizeOk });
      }
    }
    const out = {};
    for (const t in byTerm) {
      // prednost: pakiranje slične veličine, zatim naziv koji počinje traženom riječju, zatim cijena
      let list = byTerm[t];
      if (list.some((x) => x.sizeOk)) list = list.filter((x) => x.sizeOk);
      const best = Math.min(...list.map((x) => x.tier));
      out[t] = list.filter((x) => x.tier === best).sort((a, b) => a.price - b.price).slice(0, KEEP)
        .map(({ name, brand, ean, quantity, unit, price }) => ({ name: niceName(name), brand: niceName(brand), ean, quantity: niceQty(quantity, unit), unit: "", price: Math.round(price * 100) / 100 }));
    }
    result.chains[chain] = out;
    console.log(`${chain}: ${products.size} odgovarajućih proizvoda, ${Object.keys(out).length}/${terms.length} pojmova pokriveno`);
    if (!Object.keys(out).length) console.warn(`${chain}: stupci products.csv = ${ph.join(",")} | prices.csv = ${prh.join(",")}`);
  }
  const covered = Object.values(result.chains).reduce((a, c) => a + Object.keys(c).length, 0);
  if (!covered) { console.error("Nijedan proizvod nije pronađen. prices.json nije promijenjen."); process.exit(1); }
  fs.writeFileSync(outFile, JSON.stringify(result));
  console.log(`Spremljeno ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
})();
