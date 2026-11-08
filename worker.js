// Cloudflare Worker: proxy prema cijene.dev koji čuva API ključ i dopušta pozive s tvoje GitHub Pages stranice.
// Postavljanje: dash.cloudflare.com → Workers & Pages → Create → Worker → zalijepi ovaj kod → Deploy.
// Zatim Settings → Variables and Secrets → dodaj Secret CIJENE_API_KEY s tvojim ključem.
// U aplikaciji pod "Adresa API-ja ili proxyja" upiši adresu workera, npr. https://kosarica.tvoje-ime.workers.dev
// (ključ u aplikaciji tada ostavi prazan).

const UPSTREAM = "https://api.cijene.dev/v1";
const ALLOWED_ORIGIN = "https://varnica95.github.io";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Authorization",
      "Access-Control-Max-Age": "86400",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/products")) return new Response("Not found", { status: 404, headers: cors });

    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      headers: { Authorization: "Bearer " + env.CIJENE_API_KEY, Accept: "application/json" },
      cf: { cacheTtl: 21600, cacheEverything: true }, // cjenici se mijenjaju jednom dnevno
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=21600" },
    });
  },
};
