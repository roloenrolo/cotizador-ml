import test from 'node:test';
import assert from 'node:assert/strict';
import { sugerirRendimiento, unidadesAComprar, sugerirValor, unidadesVentaLegibles } from '../docs/js/calc.js';

const casos = [
  ['Wall Panel 3D 11x240 cm Haya 0.28 m2', 'C/U', 'm2', 0.28, 'nombre'],
  ['Yeso Cartón Borde Rebajado 15 mm 120x240 cm', 'Plancha', 'm2', 2.88, 'dimensiones'],
  ['OSB Estructural 11 mm 122x244 cm', 'C/U', 'm2', 2.98, 'dimensiones'],
  ['Teja Asfáltica 0,333X1M 3,1M2 Rojo', 'm2', 'm2', 1, 'misma_unidad'],
  ['Polionda Acanalado 0,7mmx0,81x3,66 m', 'C/U', 'm2', 2.96, 'dimensiones'],
  ['Perfil C Metalcon Estructural Metal 60x20x0.85 mm 4 m', 'C/U', 'ml', 4, 'nombre'],
  ['Tubo PVC gris 110 mm 6 mt', 'C/U', 'ml', 6, 'nombre'],
  ['Cemento Melón especial 25 Kg', 'Saco', 'm2', null],
  ['Tarugo volcanita 15 mm 50 unidades', 'C/U', 'm2', null]
];
for (const [nombre, venta, partida, rendimiento, fuente] of casos) test(`rendimiento: ${nombre}`, () => {
  assert.deepEqual(sugerirRendimiento(nombre, venta, partida), rendimiento === null ? null : { rendimiento, fuente });
});
test('normaliza unidades y prioriza precio ya vendido por unidad de partida', () => {
  for (const u of ['M2', 'm²', 'mt2', 'mts2', ' m ² ']) assert.deepEqual(sugerirRendimiento('Producto 3 m2', u, 'm2'), { rendimiento: 1, fuente: 'misma_unidad' });
  for (const u of ['ML', 'm', 'mt', 'metro', 'metro lineal']) assert.deepEqual(sugerirRendimiento('Perfil 4 m', u, 'ml'), { rendimiento: 1, fuente: 'misma_unidad' });
  assert.deepEqual(sugerirRendimiento('Árido', 'm³', 'm3'), { rendimiento: 1, fuente: 'misma_unidad' });
  assert.equal(sugerirRendimiento('Árido 2 m3', 'Saco', 'm3'), null);
});
test('acepta coma, punto, mayúsculas, espacios y espesor explícito en mm', () => {
  for (const [nombre, esperado] of [['3,1M2 Rojo', 3.1], ['Panel 1.56 m2', 1.56], ['Panel 0,28 m²', 0.28], ['122 x 244 cm', 2.98], ['120x240 cm x 15 mm', 2.88], ['0,81x3,66 m', 2.96]]) assert.equal(sugerirRendimiento(nombre, 'C/U', 'm2')?.rendimiento, esperado, nombre);
  for (const [nombre, esperado] of [['Perfil 2.4 m', 2.4], ['Perfil 3,2 m', 3.2]]) assert.equal(sugerirRendimiento(nombre, 'C/U', 'ml')?.rendimiento, esperado);
});
test('rechaza ambigüedad, ceros, negativos, >100 y confusión entre mm/m2/metros', () => {
  for (const nombre of ['Panel 0 m2', 'Panel -2 m2', 'Panel 101 m2', 'Panel 2 m2 o 3 m2', 'Panel 100x200 cm o 120x240 cm', '1 x 2 x 3 m', 'Panel 0x240 cm', 'Panel 100x200 m']) assert.equal(sugerirRendimiento(nombre, 'C/U', 'm2'), null, nombre);
  for (const nombre of ['Tubo 110 mm', 'Panel 2 m2', 'Tubo 3 m o 4 m', 'Tubo -4 m', 'Tubo 101 mt']) assert.equal(sugerirRendimiento(nombre, 'C/U', 'ml'), null, nombre);
});
test('Wall Panel: 12 m2 requieren 43 unidades a $32.107/m2, con y sin IVA', () => {
  assert.equal(unidadesAComprar(12, 0.28), 43);
  assert.equal(unidadesAComprar(0, 0.28), 0);
  assert.equal(unidadesAComprar(12, 3), 4);
  assert.equal(sugerirValor(8990, 0.28), 32107);
  assert.equal(sugerirValor(8990, 0.28, true), Math.round(Math.round(8990 / 1.19) / 0.28));
  assert.equal(43 * 8990, 386570);
});

test('fila y diálogo comparten plural de unidad y plancha', () => {
  for (const [unidad, cantidad, esperado] of [['unidad', 43, 'unidades'], ['unidad', 1, 'unidad'], ['plancha', 5, 'planchas'], ['plancha', 1, 'plancha'], ['Plancha', 5, 'Planchas']]) {
    assert.equal(unidadesVentaLegibles(unidad, cantidad), esperado);
  }
});
