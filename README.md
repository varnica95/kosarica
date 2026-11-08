# Košarica do budžeta

Planer kupnje: odabereš trgovinu, broj osoba, budžet i kategorije hrane, a aplikacija složi popis proizvoda koji stane u budžet.
Dobiješ i popis za kupnju s kvačicama.

Dva načina rada:
- **Jela po receptima:** aplikacija predloži jela (bolonjez, lazanje, curry, losos…) koja zajedno stanu u budžet i složi popis namirnica za njih.
  Zajedničke namirnice se zbrajaju, a svako jelo ima i upute za pripremu.
- **Slobodna kupnja:** popis pojedinačnih namirnica iz odabranih kategorija.

**Aplikacija:** https://varnica95.github.io/kosarica/

Trgovine: Konzum, Lidl, Kaufland, Spar, Plodine, Studenac, Tommy, Eurospin.

## Odakle su cijene

Trgovački lanci u Hrvatskoj svaki dan objavljuju cjenike, a [cijene.dev](https://cijene.dev) ih skuplja u jednu besplatnu dnevnu arhivu.
GitHub Action `Osvježi cijene` svako jutro oko 8:17:

1. preuzme najnoviju arhivu (bez registracije i API ključa),
2. skriptom `scripts/build-prices.js` izvuče samo proizvode koje aplikacija koristi,
3. spremi ih u `prices.json` i to commita.

Aplikacija čita `prices.json`, pa ne treba nikakav ključ. Za svaki proizvod uzima uobičajenu (srednju) cijenu u lancu, uključujući akcijske cijene,
pa u tvojoj poslovnici cijena može biti malo drukčija. Slike proizvoda dolaze s [Open Food Facts](https://world.openfoodfacts.org) prema barkodu, gdje postoje.

Dok `prices.json` ne postoji, aplikacija prikazuje okvirne (procijenjene) cijene.

### Ručno osvježavanje

**Actions → Osvježi cijene → Run workflow.**

## Prilagodba proizvoda

Popis proizvoda je u `products.js`. Svaki redak sadrži: oznaku, naziv, pakiranje, okvirnu cijenu, ikonu, koliko osoba pokriva jedan komad,
pojam za pretragu te riječi koje naziv mora sadržavati i one koje ne smije (regularni izrazi bez dijakritika).
Nakon promjene pokreni workflow ručno da se `prices.json` osvježi.

## Dodavanje recepata

Recepti su u `recipes.js`. Svaka namirnica u receptu je `[oznaka iz products.js, broj pakiranja po osobi]`,
npr. `["mljeveno", 0.25]` je četvrtina pakiranja od 500 g po osobi. Ako recept treba namirnicu koje nema, dodaj je u `products.js` (kategorija `dodatno`).

## Lokalno pokretanje (alternativa s API ključem)

`server.js` je mali Node server (Node 18+, bez paketa) koji cijene dohvaća uživo preko cijene.dev API-ja:

```
CIJENE_API_KEY=tvoj_kljuc node server.js
```

Zatim otvori http://localhost:3000 (koristi `local.html`). `worker.js` je ista ideja kao Cloudflare Worker.
