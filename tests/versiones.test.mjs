import test from 'node:test';
import assert from 'node:assert/strict';
import { crearVersion, diff, restaurar, sinVersionar } from '../docs/js/versiones.js';
import { vacio, exportar, importar, validarRespaldo, recordarMaterial, guardar, cargar, empezarDeCero, bloquearGuardado, estadoGuardado, leerRespaldo, KEY } from '../docs/js/storage.js';
function cotizacion() {
  return { id: 'c1', numero: '001', proyecto: 'Ejemplo', cliente: '', fecha: '2026-01-01', duracion: '', notaPie: '', ggPorcentaje: 8, tarifaDiaria: 50000, iva: { desglosar: false }, capitulos: [{ id: 'cap1', titulo: 'Estructura', partidas: [{ id: 'p1', designacion: 'Pino', unidad: 'un', cantidad: 2, material: { origen: 'manual', valorUnitario: 1000, rendimiento: 1 }, manoObra: { modo: 'manual', monto: 10000 } }] }], versiones: [] };
}
test('snapshot: copia profunda congelada, sin historial recursivo y número correlativo', () => {
  const c = cotizacion(), v = crearVersion(c, 'Inicial', '2026-01-01T00:00:00Z'); c.versiones.push(v);
  assert.equal(v.n, 1); assert.equal(v.datos.versiones, undefined); assert.equal(v.fecha, '2026-01-01T00:00:00Z'); assert.equal(sinVersionar(c), false);
  c.capitulos[0].partidas[0].material.valorUnitario = 4000;
  assert.equal(v.datos.capitulos[0].partidas[0].material.valorUnitario, 1000); assert.equal(v.totales.totalFinal, 12960); assert.equal(sinVersionar(c), true);
  assert.throws(() => { v.datos.proyecto = 'Mutación'; }, TypeError);
  assert.equal(crearVersion(c).n, 2);
});
test('diff: capítulos y partidas agregados, eliminados, renombrados y campos antes/después', () => {
  const a = cotizacion();
  a.capitulos.push({ id: 'eliminar', titulo: 'Antiguo', partidas: [{ ...structuredClone(a.capitulos[0].partidas[0]), id: 'p2' }] });
  const b = structuredClone(a); b.capitulos.pop(); b.capitulos[0].titulo = 'Nueva estructura';
  b.capitulos[0].partidas[0].cantidad = 4; b.capitulos[0].partidas[0].manoObra.monto = 20000;
  b.capitulos.push({ id: 'nuevo', titulo: 'Terminaciones', partidas: [{ ...structuredClone(a.capitulos[0].partidas[0]), id: 'p3' }] });
  b.ggPorcentaje = 10; b.tarifaDiaria = 60000; b.iva.desglosar = true;
  const r = diff(a, b);
  assert.equal(r.capitulos.agregados[0].id, 'nuevo'); assert.equal(r.capitulos.eliminados[0].id, 'eliminar');
  assert.deepEqual(r.capitulos.renombrados[0], { id: 'cap1', antes: 'Estructura', despues: 'Nueva estructura' });
  assert.equal(r.partidas.agregadas[0].id, 'p3'); assert.equal(r.partidas.eliminadas[0].id, 'p2');
  assert.deepEqual(r.partidas.modificadas[0].campos.find(x => x.campo === 'cantidad'), { campo: 'cantidad', antes: 2, despues: 4 });
  assert.equal(r.partidas.modificadas[0].campos.find(x => x.campo === 'manoObra').despues.monto, 20000);
  assert.deepEqual(r.encabezado.map(x => x.campo), ['ggPorcentaje', 'tarifaDiaria', 'iva']);
  assert.equal(r.deltaTotal, 47124 - 25920); assert.match(r.resumen, /Partida agregada: Pino/); assert.match(r.resumen, /cantidad: 2 → 4/);
});
test('diff: detecta designación, unidad, valor material, orden y encabezados', () => {
  const a = cotizacion(), b = structuredClone(a), p = b.capitulos[0].partidas[0];
  p.designacion = 'Tabla'; p.unidad = 'ml'; p.material.valorUnitario = 2000; b.proyecto = 'Nuevo';
  const r = diff(a, b);
  for (const campo of ['designacion', 'unidad', 'valor material']) assert.ok(r.partidas.modificadas[0].campos.some(x => x.campo === campo));
  assert.equal(r.encabezado[0].campo, 'proyecto');
});
test('restaurar copia los datos y conserva todas las versiones', () => {
  const c = cotizacion(); c.versiones.push(crearVersion(c)); c.proyecto = 'Revisado'; c.versiones.push(crearVersion(c));
  const restaurada = restaurar(c, c.versiones[0]); assert.equal(restaurada.proyecto, 'Ejemplo'); assert.equal(c.proyecto, 'Revisado');
  assert.equal(restaurada.versiones.length, 2); assert.equal(sinVersionar(restaurada), true);
  restaurada.capitulos[0].partidas[0].cantidad = 99; assert.equal(c.versiones[0].datos.capitulos[0].partidas[0].cantidad, 2);
  assert.equal(crearVersion(restaurada).n, 3);
});
test('respaldo: ida y vuelta, validación de números/IDs/modelo, fusionar y reemplazar', () => {
  const d = vacio(), c = cotizacion(); c.versiones.push(crearVersion(c)); d.cotizaciones.push(c);
  const original = exportar(d); assert.deepEqual(validarRespaldo(JSON.parse(original)), JSON.parse(original));
  assert.equal(importar(original, d, 'fusionar').cotizaciones.length, 1);
  const distinto = JSON.parse(original); distinto.cotizaciones[0].proyecto = 'Revisión';
  const fusion = importar(exportar(distinto), d, 'fusionar'); assert.equal(fusion.cotizaciones.length, 2);
  assert.equal(fusion.cotizaciones[1].proyecto, 'Revisión (importada)'); assert.notEqual(fusion.cotizaciones[0].id, fusion.cotizaciones[1].id);
  assert.equal(fusion.cotizaciones[1].versiones[0].datos.id, fusion.cotizaciones[1].id); validarRespaldo(fusion);
  assert.equal(importar(exportar(vacio()), d, 'reemplazar').cotizaciones.length, 0);
  for (const cambiar of [x => x.version = 999, x => x.cotizaciones[0].tarifaDiaria = -1, x => x.cotizaciones[0].capitulos[0].partidas[0].material.rendimiento = 0, x => x.cotizaciones[0].capitulos[0].partidas[0].manoObra = {}, x => x.cotizaciones.push(x.cotizaciones[0])]) {
    const mal = JSON.parse(original); cambiar(mal); assert.throws(() => validarRespaldo(mal), /estructura/);
  }
});
test('mis materiales: conserva el último precio y permite uso sin Worker', () => {
  const d = vacio(), p = cotizacion().capitulos[0].partidas[0];
  recordarMaterial(d, p, '2026-01-01'); p.material.valorUnitario = 1500; recordarMaterial(d, p, '2026-01-02');
  assert.equal(d.materiales.length, 1); assert.equal(d.materiales[0].ultimoPrecio, 1500); assert.equal(d.materiales[0].unidad, 'un'); assert.equal(d.materiales[0].fecha, '2026-01-02');
  assert.equal(validarRespaldo(d).materiales[0].material.valorUnitario, 1500);
});
test('localStorage vacío o fallido avisa y conserva una app utilizable; prefijo propio', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); let llamadas = 0;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => { assert.equal(key, 'cotizadorml:datos'); llamadas++; return null; }, setItem: key => { assert.equal(key, 'cotizadorml:datos'); llamadas++; throw new Error('quota'); } } });
    assert.match(cargar().aviso, /No hay datos/); assert.match(guardar(vacio()), /memoria/); assert.equal(llamadas, 3);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('denied'); } });
    assert.equal(cargar().error, true); assert.deepEqual(cargar().datos.cotizaciones, []);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});

test('resumen legible: materiales, jornadas e IVA sin objetos serializados', () => {
  const a = cotizacion(), b = structuredClone(a);
  b.capitulos[0].partidas[0].material = { origen: 'sodimac', valorUnitario: 11360, rendimiento: 1, sodimac: { nombre: 'Yeso Cartón Borde Rebajado 15 mm 120x240 cm', precioBruto: 11360, unidadVenta: 'Plancha' } };
  b.capitulos[0].partidas[0].manoObra = { modo: 'jornadas', personas: 2, dias: 3 };
  b.iva.desglosar = true;
  const resumen = diff(a, b).resumen;
  assert.ok(resumen.includes('material: precio manual → Sodimac «Yeso Cartón Borde Rebajado 15 mm 120x240 cm» ($11.360 por Plancha, rendimiento 1)'));
  assert.ok(resumen.includes('mano de obra: monto manual $10.000 → 2 personas × 3 días'));
  assert.ok(resumen.includes('IVA: sin desglosar → desglosado (19 %)'));
  assert.doesNotMatch(resumen, /[{}"]|\[object Object\]/);
});

test('ilegibles: preserva JSON corrupto, versión futura y estructura inválida; bloquea hasta confirmar', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const crudo of ['{corrupto', JSON.stringify({ ...vacio(), version: 999 }), '{}']) {
      const memoria = new Map([[KEY, crudo]]); let escriturasPrincipal = 0;
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: k => memoria.get(k) ?? null,
        setItem: (k, v) => { if (k === KEY) escriturasPrincipal++; memoria.set(k, v); }
      } });
      const r = cargar(); assert.equal(r.ilegible, true); assert.equal(r.crudo, crudo); assert.equal(r.preservado, true);
      assert.match(r.clave, /^cotizadorml:datos-ilegible-/); assert.equal(memoria.get(r.clave), crudo);
      assert.match(guardar(vacio()), /bloqueado/); assert.equal(empezarDeCero(false), false);
      guardar(vacio()); assert.equal(memoria.get(KEY), crudo); assert.equal(escriturasPrincipal, 0);
      assert.equal(empezarDeCero(true), true); assert.equal(guardar(vacio()), '');
      assert.equal(escriturasPrincipal, 1); assert.equal(memoria.get(r.clave), crudo);
    }
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});
test('otra pestaña: bloquea incluso antes de recibir storage, sin sobrescribir', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memoria = new Map([[KEY, exportar(vacio())]]); let escrituras = 0;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: k => memoria.get(k) ?? null, setItem: (k, v) => { escrituras++; memoria.set(k, v); } } });
    const datos = cargar().datos, reciente = { ...vacio(), ultimoNumero: 4 };
    memoria.set(KEY, exportar(reciente)); assert.match(guardar(datos), /otra pestaña/);
    assert.equal(estadoGuardado(), 'otra-pestana'); assert.equal(escrituras, 0); assert.equal(memoria.get(KEY), exportar(reciente));
    cargar(); bloquearGuardado(); assert.match(guardar(datos), /otra pestaña/); assert.equal(escrituras, 0);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});
test('importación: JSON malformado tiene mensaje propio, nunca SyntaxError', () => {
  assert.throws(() => leerRespaldo('{'), { message: 'El archivo no es un respaldo válido del cotizador' });
  assert.throws(() => importar('{', vacio(), 'fusionar'), { message: 'El archivo no es un respaldo válido del cotizador' });
});
