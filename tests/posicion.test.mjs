import test from 'node:test';
import assert from 'node:assert/strict';
import { posicionPopover } from '../docs/js/posicion.js';

test('popover: cabe debajo del ancla', () => {
  assert.deepEqual(posicionPopover({ left: 100, top: 50, bottom: 80 }, 200, 320, 600, 1000), { left: 100, top: 86 });
});
test('popover: no cabe debajo, abre hacia arriba', () => {
  assert.deepEqual(posicionPopover({ left: 100, top: 450, bottom: 480 }, 300, 320, 600, 1000), { left: 100, top: 144 });
});
test('popover: no cabe en ningún lado, se pega a 8 px', () => {
  assert.deepEqual(posicionPopover({ left: 100, top: 180, bottom: 210 }, 384, 320, 400, 960), { left: 100, top: 8 });
});
test('popover: ancla junto al borde derecho, mantiene todo el ancho dentro', () => {
  assert.deepEqual(posicionPopover({ left: 950, top: 50, bottom: 80 }, 200, 320, 600, 1000), { left: 672, top: 86 });
});
test('popover: crecimiento y resize con viewport de 600 px al 150 %', () => {
  const ancla = { left: 850, top: 240, bottom: 270 };
  assert.deepEqual(posicionPopover(ancla, 200, 320, 600, 1000), { left: 672, top: 276 });
  assert.deepEqual(posicionPopover(ancla, 350, 320, 600, 1000), { left: 672, top: 8 });
  const { left, top } = posicionPopover(ancla, 384, 320, 400, 640);
  assert.deepEqual({ left, top }, { left: 312, top: 8 });
  assert.ok(left + 320 <= 640 - 8); assert.ok(top + 384 <= 400 - 8);
});
test('popover: ancla desplazada fuera de la ventana no arrastra al flotante', () => {
  assert.deepEqual(posicionPopover({ left: -50, top: -100, bottom: -70 }, 200, 320, 400, 640), { left: 8, top: 8 });
});
