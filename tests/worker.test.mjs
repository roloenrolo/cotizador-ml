import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuery, pickPrice, parseSearchHtml } from '../worker/src/index.js';
const prices = [{ type: 'NORMAL', priceWithoutFormatting: 11360, unit: ' plancha ' }, { type: 'CMR', priceWithoutFormatting: 8000, unit: 'plancha' }, { type: 'NORMAL', priceWithoutFormatting: 7000, crossed: true }];
test('normalizeQuery: limpieza, Unicode y límites', () => {
  assert.equal(normalizeQuery('  pino   2×4  '), 'pino 2×4'); assert.equal(normalizeQuery('a'), null); assert.equal(normalizeQuery('x'.repeat(81)), null);
  assert.equal(normalizeQuery('cafe\u0301 < >'), 'café'); assert.equal(normalizeQuery(null), null);
});
test('pickPrice excluye CMR más barato si hay precio normal', () => {
  assert.deepEqual(pickPrice(prices), { precio: 11360, unidadVenta: 'plancha', tipo: 'NORMAL' });
  assert.equal(pickPrice([{ priceWithoutFormatting: 0 }, { priceWithoutFormatting: -5 }]), null);
});
test('HTML sintético __NEXT_DATA__: deduplica productId y no usa precio CMR', () => {
  const producto = { productId: 'producto-1', skuId: 'sku-1', displayName: 'Plancha OSB', brand: 'Marca ejemplo', prices, mediaUrls: ['https://example.invalid/imagen.jpg'] };
  const data = { props: { pageProps: { searchProps: { searchData: { results: [producto, { ...producto, skuId: 'sku-duplicado' }, { ...producto, productId: 'producto-2', skuId: 'sku-2' }] } } } } };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
  const resultado = parseSearchHtml(html); assert.equal(resultado.length, 2);
  assert.equal(resultado[0].sku, 'sku-1'); assert.equal(resultado[0].precio, 11360); assert.equal(resultado[0].unidadVenta, 'plancha'); assert.equal(resultado[0].tipoPrecio, 'NORMAL');
  assert.equal(resultado[0].url, 'https://www.sodimac.cl/sodimac-cl/product/producto-1/p');
});
test('HTML sin script o sin resultados lanza estructura_cambio', () => {
  assert.throws(() => parseSearchHtml('<html>Sin script</html>'), /estructura_cambio/);
  assert.throws(() => parseSearchHtml('<script id="__NEXT_DATA__">{}</script>'), /estructura_cambio/);
});

const htmlDatos = data => `<script id="__NEXT_DATA__">${JSON.stringify(data)}</script>`;
const producto = { productId: 'producto-1', displayName: 'Material ejemplo', prices };
const buscar = p => parseSearchHtml(htmlDatos({ props: { pageProps: { searchProps: { searchData: { results: [p] } } } } }))[0];
test('Worker (a): URL de respaldo termina en /p', () => {
  assert.equal(buscar(producto).url, 'https://www.sodimac.cl/sodimac-cl/product/producto-1/p');
});
test('Worker (b): usa URL Sodimac del resultado sin query; descarta otros orígenes', () => {
  assert.equal(buscar({ ...producto, url: 'https://www.sodimac.cl/product/123/nombre/p?utm_source=ejemplo' }).url, 'https://www.sodimac.cl/product/123/nombre/p');
  assert.equal(buscar({ ...producto, url: 'https://example.invalid/product/123' }).url, 'https://www.sodimac.cl/sodimac-cl/product/producto-1/p');
});
test('Worker (c): precio de categoría con miles, sin unit, usa C/U', () => {
  assert.deepEqual(pickPrice([{ price: ['3.090'] }]), { precio: 3090, unidadVenta: 'C/U', tipo: 'NORMAL' });
});
test('Worker (d): lee resultados de categoría', () => {
  const r = parseSearchHtml(htmlDatos({ props: { pageProps: { results: [{ ...producto, prices: [{ price: ['3.090'] }] }] } } }));
  assert.equal(r.length, 1); assert.equal(r[0].nombre, 'Material ejemplo'); assert.equal(r[0].precio, 3090); assert.equal(r[0].unidadVenta, 'C/U');
});
test('Worker (d): redirección a portada sin resultados devuelve lista vacía', () => {
  assert.deepEqual(parseSearchHtml(htmlDatos({ page: '/[...uri]', props: { pageProps: {} } })), []);
});

import worker from '../worker/src/index.js';
test('Worker no almacena búsquedas vacías y responde no-store; con resultados sí almacena', async () => {
  const fetchAnterior = globalThis.fetch, cacheAnterior = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  let llamadas = 0, puts = 0, esperas = 0;
  try {
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: { match: async () => undefined, put: async () => { puts++; } } } });
    for (const resultados of [[], [producto]]) {
      globalThis.fetch = async () => { llamadas++; return new Response(htmlDatos({ props: { pageProps: { results: resultados } } })); };
      const respuesta = await worker.fetch(new Request('https://worker.invalid/buscar?q=plancha'), {}, { waitUntil: p => { esperas++; return p; } });
      assert.equal(respuesta.headers.get('Cache-Control'), resultados.length ? 'public, max-age=3600' : 'no-store');
      assert.equal((await respuesta.json()).resultados.length, resultados.length);
      assert.equal(puts, resultados.length); assert.equal(esperas, resultados.length);
    }
    assert.equal(llamadas, 2);
    globalThis.caches.default.match = async () => new Response(JSON.stringify({ resultados: [] }));
    const cacheAntigua = await worker.fetch(new Request('https://worker.invalid/buscar?q=plancha'), {}, { waitUntil: () => { throw new Error('No debe escribir'); } });
    assert.equal(cacheAntigua.headers.get('Cache-Control'), 'no-store'); assert.equal(llamadas, 2);
  } finally { globalThis.fetch = fetchAnterior; if (cacheAnterior) Object.defineProperty(globalThis, 'caches', cacheAnterior); else delete globalThis.caches; }
});
