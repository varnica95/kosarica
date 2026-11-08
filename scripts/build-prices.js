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

const terms = [];
for (const cat in P) for (const it of P[cat]) {
  terms.push({ id: it[0], must: new RegExp("(^|[^a-z])(" + it[7] + ")"), ex: it[8] ? new RegExp(it[8]) : null });
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
      const n = strip(name + " " + brand);
      const ts = terms.filter((t) => t.must.test(n) && !(t.ex && t.ex.test(n))).map((t) => t.id);
      if (!ts.length) return;
      products.set(id, {
        ts, name: name.trim(), brand: brand.trim(),
        ean: pick(r, ["barcode", "ean"]).trim() || null,
        quantity: pick(r, ["quantity", "kolicina"]).trim(), unit: pick(r, ["unit", "jedinica"]).trim(),
        price: null,
      });
    });

    // 2) cijene: najniža cijena u lancu (uzima i akcijsku cijenu)
    const prh = await readCsv(path.join(cdir, "prices.csv"), (r) => {
      const p = products.get(pick(r, ["product_id", "id", "sifra", "code"]));
      if (!p) return;
      const price = Math.min(...[num(r.price), num(r.special_price), num(r.retail_price), num(r.regular_price)].filter(Boolean));
      if (isFinite(price) && (p.price == null || price < p.price)) p.price = price;
    });

    const byTerm = {};
    for (const p of products.values()) {
      if (p.price == null) continue;
      for (const t of p.ts) (byTerm[t] = byTerm[t] || []).push(p);
    }
    const out = {};
    for (const t in byTerm) {
      out[t] = byTerm[t].sort((a, b) => a.price - b.price).slice(0, KEEP)
        .map(({ name, brand, ean, quantity, unit, price }) => ({ name, brand, ean, quantity, unit, price: Math.round(price * 100) / 100 }));
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
