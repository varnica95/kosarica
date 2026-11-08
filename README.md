# Košarica do budžeta

Planer kupnje: odabereš trgovinu, broj osoba, budžet i kategorije hrane, a aplikacija složi popis proizvoda koji stane u budžet.
Dobiješ i popis za kupnju s kvačicama.

**Aplikacija:** https://varnica95.github.io/kosarica/

Trgovine: Konzum, Lidl, Kaufland, Spar, Plodine, Studenac, Tommy, Eurospin.
Cijene dolaze s [cijene.dev](https://cijene.dev), a slike proizvoda s [Open Food Facts](https://world.openfoodfacts.org) (prema barkodu, gdje postoje).

## Stvarne cijene

1. Registriraj se na cijene.dev i uzmi besplatni API ključ (za nekomercijalnu upotrebu).
2. U aplikaciji otvori **Postavke cijena**, zalijepi ključ i stisni **Spremi i učitaj cijene**.

Ključ se sprema samo u tvom pregledniku (`localStorage`) i nikad ne ide u ovaj repozitorij.
Bez ključa aplikacija radi s okvirnim (procijenjenim) cijenama.

## Ako preglednik blokira poziv (CORS)

Ako aplikacija javi da je preglednik blokirao poziv prema cijene.dev, cijene.dev ne dopušta izravne pozive sa stranica.
Tada postavi besplatni Cloudflare Worker iz datoteke `worker.js`:

1. Na dash.cloudflare.com otvori **Workers & Pages → Create → Worker**, zalijepi sadržaj `worker.js` i stisni **Deploy**.
2. U postavkama workera dodaj Secret `CIJENE_API_KEY` sa svojim ključem.
3. U aplikaciji pod **Adresa API-ja ili proxyja** upiši adresu workera (npr. `https://kosarica.ime.workers.dev`), ključ ostavi prazan i spremi.

## Lokalno pokretanje (alternativa)

`server.js` je mali Node server (Node 18+, bez paketa) koji radi isto na tvom računalu:

```
CIJENE_API_KEY=tvoj_kljuc node server.js
```

Zatim otvori http://localhost:3000. Lokalna verzija koristi `local.html`.

## Prilagodba

Popis proizvoda i pojmova za pretragu je na vrhu skripte u `index.html` (objekt `P`):
naziv, pakiranje, okvirna cijena, ikona, koliko osoba pokriva jedan komad, pojam za pretragu te riječi koje naziv mora ili ne smije sadržavati.
