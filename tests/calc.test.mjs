import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calcular, manoObra, totalPartida, sugerirValor, cambiarIVA, avisoUnidad } from '../site/js/calc.js';
import { buscarMateriales } from '../site/js/sodimac.js';
import { DEFAULTS } from '../site/js/config.js';
const ejemplo = JSON.parse(await readFile(new URL('./fixtures/ejemplo.json', import.meta.url), 'utf8'));
const partida = (extras = {}) => ({ id: 'p1', designacion: 'Plancha', unidad: 'm2', cantidad: 10, material: { origen: 'manual', valorUnitario: 1000, rendimiento: 1 }, manoObra: { modo: 'manual', monto: 0 }, ...extras });

test('fixture: cada partida, cada capítulo y totales exactos', () => {
  const t = calcular(ejemplo);
  ejemplo.capitulos.forEach((c, ci) => {
    c.partidas.forEach((p, pi) => assert.equal(t.capitulos[ci].partidas[pi], p.totalEsperado, p.numero));
    assert.equal(t.capitulos[ci].subtotal, c.subtotalEsperado, c.titulo);
  });
  assert.equal(t.neto, 20995000); assert.equal(t.gg, 1679600); assert.equal(t.totalFinal, 22674600);
  assert.equal(DEFAULTS.notaPie, ejemplo.notaPie);
});
test('jornadas: 2 × 3 × 50.000 = 300.000; cantidad no multiplica mano de obra', () => {
  const p = partida({ manoObra: { modo: 'jornadas', personas: 2, dias: 3 } });
  assert.equal(manoObra(p, 50000), 300000);
  assert.equal(totalPartida(p, 50000), 310000);
  p.cantidad = 0; assert.equal(totalPartida(p, 50000), 300000);
  p.manoObra = { modo: 'manual', monto: 200000 }; p.cantidad = 100;
  assert.equal(totalPartida(p, 90000), 300000);
});
test('rendimiento Sodimac y redondeo por etapas', () => {
  assert.equal(sugerirValor(11360, 2.88, false), 3944);
  assert.equal(sugerirValor(11360, 2.88, true), Math.round(Math.round(11360 / 1.19) / 2.88));
  assert.throws(() => sugerirValor(100, 0), /rendimiento/);
});
test('interruptor IVA puro: recalcula Sodimac, respeta manuales y ajustes', () => {
  const p = partida({ material: { origen: 'sodimac', valorUnitario: 3944, rendimiento: 2.88, sodimac: { precioBruto: 11360, unidadVenta: 'plancha' } } });
  const ajustada = structuredClone(p); ajustada.id = 'ajustada'; ajustada.material.ajustadoManual = true; ajustada.material.valorUnitario = 5000;
  const manual = partida({ id: 'manual' });
  const c = { capitulos: [{ partidas: [p, ajustada, manual] }], iva: { desglosar: false } };
  const previo = structuredClone(c), r = cambiarIVA(c, true), ps = r.datos.capitulos[0].partidas;
  assert.deepEqual(c, previo); assert.equal(ps[0].material.valorUnitario, 3315);
  assert.equal(ps[1].material.valorUnitario, 5000); assert.equal(ps[2].material.valorUnitario, 1000);
  assert.equal(r.manuales, 1); assert.equal(r.ajustadas, 1); assert.equal(r.recalculadas, 1);
  assert.equal(cambiarIVA(r.datos, false).datos.capitulos[0].partidas[0].material.valorUnitario, 3944);
  p.material.rendimiento = 1; assert.equal(avisoUnidad(p), 'El precio es por plancha; indica cuánto rinde en m2');
  p.unidad = 'un'; assert.equal(avisoUnidad(p), '');
});
test('IVA desglosado sobre el ejemplo', () => {
  const t = calcular({ ...ejemplo, iva: { desglosar: true } });
  assert.equal(t.neto, 20995000); assert.equal(t.total, 22674600);
  assert.equal(t.iva, 4308174); assert.equal(t.totalFinal, 26982774);
});
test('copia estática del ejemplo es idéntica al fixture', async () => {
  assert.deepEqual(JSON.parse(await readFile(new URL('../site/ejemplo.json', import.meta.url), 'utf8')), ejemplo);
});
test('cliente Worker: URL vacía y errores permiten recuperación manual', async () => {
  await assert.rejects(buscarMateriales('plancha', { base: '' }), /precio manual/);
  const casos = ['consulta_invalida', 'demasiadas_consultas', 'sodimac_sin_respuesta', 'sodimac_rechazo', 'estructura_cambio'];
  let llamadas = 0;
  for (const error of casos) await assert.rejects(buscarMateriales('plancha', { base: 'https://worker.invalid', fetchImpl: async () => { llamadas++; return { ok: false, json: async () => ({ error }) }; } }));
  assert.equal(llamadas, 5);
  await assert.rejects(buscarMateriales('plancha', { base: 'https://worker.invalid', fetchImpl: async () => { throw new Error('offline'); } }), /precio manual/);
});
test('cliente Worker: contrato, búsqueda codificada y respuesta válida', async () => {
  let llamadas = 0;
  const resultado = await buscarMateriales('pino 2×4', { base: 'https://worker.invalid/', fetchImpl: async url => {
    llamadas++; assert.equal(url, 'https://worker.invalid/buscar?q=pino%202%C3%974');
    return { ok: true, json: async () => ({ ivaIncluido: true, fecha: '2026-01-01', resultados: [{ sku: '1', nombre: 'Pino', precio: 1000, unidadVenta: 'C/U' }] }) };
  } });
  assert.equal(llamadas, 1); assert.equal(resultado.resultados[0].precio, 1000);
});
