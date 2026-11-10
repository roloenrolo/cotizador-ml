// Buscador de precios Sodimac para el cotizador.
// Único destino permitido: la búsqueda de www.sodimac.cl. Único parámetro: q.

const SODIMAC_SEARCH = "https://www.sodimac.cl/sodimac-cl/search";
const PRODUCT_URL = "https://www.sodimac.cl/sodimac-cl/product/";
const CACHE_SECONDS = 3600;
const MAX_RESULTS = 24;
const Q_MIN = 2;
const Q_MAX = 80;

function corsHeaders(env, request) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const allow = allowed.includes(origin) ? origin : allowed[0] || "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body, status, headers, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheSeconds ? `public, max-age=${cacheSeconds}` : "no-store",
      ...headers,
    },
  });
}

export function normalizeQuery(raw) {
  const q = (raw || "").normalize("NFC").replace(/[^\p{L}\p{N} .,/"'x×+\-]/gu, " ").replace(/\s+/g, " ").trim();
  if (q.length < Q_MIN || q.length > Q_MAX) return null;
  return q;
}

// Elige el precio vigente más bajo y conserva el normal como referencia.
export function pickPrice(prices) {
  // La búsqueda trae priceWithoutFormatting; las páginas de categoría traen price: ["3.090"].
  const valid = (prices || [])
    .map((p) => {
      let n = p.priceWithoutFormatting;
      if (!Number.isFinite(n)) {
        const texto = Array.isArray(p.price) ? p.price[0] : p.price;
        n = Number(String(texto ?? "").replace(/\./g, "").replace(/[^\d]/g, ""));
      }
      return { ...p, priceWithoutFormatting: n };
    })
    .filter((p) => Number.isFinite(p.priceWithoutFormatting) && p.priceWithoutFormatting > 0 && !p.crossed);
  if (!valid.length) return null;
  // Los precios con tarjeta (CMR) no son el precio que paga cualquiera: se excluyen si hay alternativa.
  const sinTarjeta = valid.filter((p) => !/CMR/i.test(p.type || ""));
  const pool = sinTarjeta.length ? sinTarjeta : valid;
  const best = pool.reduce((a, b) => (b.priceWithoutFormatting < a.priceWithoutFormatting ? b : a));
  return { precio: best.priceWithoutFormatting, unidadVenta: (best.unit || "").trim() || "C/U", tipo: best.type || "NORMAL" };
}

export function parseSearchHtml(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("estructura_cambio");
  const data = JSON.parse(m[1]);
  const pageProps = data?.props?.pageProps;
  // Tres respuestas posibles: página de búsqueda, redirección a una categoría
  // (ej. "enchufe") o redirección a la portada cuando no hay resultados.
  let results = pageProps?.searchProps?.searchData?.results;
  if (!Array.isArray(results)) results = pageProps?.results;
  if (!Array.isArray(results)) {
    if (data?.page === "/[...uri]") return [];
    throw new Error("estructura_cambio");
  }
  const out = [];
  const vistos = new Set();
  for (const r of results) {
    const price = pickPrice(r.prices);
    if (!price || !r.displayName) continue;
    const id = String(r.productId || r.skuId || "");
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push({
      sku: String(r.skuId || id),
      nombre: r.displayName,
      marca: r.brand || "",
      precio: price.precio, // CLP, IVA incluido
      unidadVenta: price.unidadVenta,
      tipoPrecio: price.tipo,
      url: typeof r.url === "string" && r.url.startsWith("https://www.sodimac.cl/") ? r.url.split("?")[0] : id ? PRODUCT_URL + encodeURIComponent(id) + "/p" : "",
      imagen: Array.isArray(r.mediaUrls) && r.mediaUrls[0] ? r.mediaUrls[0] : "",
    });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "metodo_no_permitido" }, 405, cors);

    const url = new URL(request.url);
    if (url.pathname !== "/buscar") return json({ error: "no_encontrado" }, 404, cors);

    const q = normalizeQuery(url.searchParams.get("q"));
    if (!q) return json({ error: "consulta_invalida" }, 400, cors);

    const cache = caches.default;
    const cacheKey = new Request(`https://cache.cotizador/buscar?q=${encodeURIComponent(q.toLowerCase())}`);
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.text();
      return new Response(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}`, "X-Cache": "HIT", ...cors } });
    }

    if (env.RATE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "anon";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return json({ error: "demasiadas_consultas" }, 429, cors);
    }

    let upstream;
    try {
      upstream = await fetch(`${SODIMAC_SEARCH}?Ntt=${encodeURIComponent(q)}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "es-CL,es;q=0.9",
        },
        redirect: "follow",
      });
    } catch {
      return json({ error: "sodimac_sin_respuesta" }, 502, cors);
    }
    if (!upstream.ok) return json({ error: "sodimac_rechazo", status: upstream.status }, 502, cors);

    let resultados;
    try {
      resultados = parseSearchHtml(await upstream.text());
    } catch {
      return json({ error: "estructura_cambio" }, 502, cors);
    }

    const body = JSON.stringify({ q, fecha: new Date().toISOString(), fuente: "sodimac.cl", ivaIncluido: true, resultados });
    ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } })));
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}`, "X-Cache": "MISS", ...cors } });
  },
};
