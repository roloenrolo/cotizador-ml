import { calcular, clp } from './calc.js';
export function datosBorrador(c) {
  const { versiones, ...datos } = c;
  return structuredClone(datos);
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function congelar(obj) {
  if (obj && typeof obj === 'object') { Object.values(obj).forEach(congelar); Object.freeze(obj); }
  return obj;
}
export function sinVersionar(c) {
  const ultima = c.versiones.at(-1);
  return !ultima || !igual(datosBorrador(c), ultima.datos);
}
export function diff(a, b) {
  a = a.datos ?? a; b = b.datos ?? b;
  const capitulos = { agregados: [], eliminados: [], renombrados: [] };
  const partidas = { agregadas: [], eliminadas: [], modificadas: [] };
  const encabezado = [];
  const ca = new Map(a.capitulos.map(c => [c.id, c]));
  const cb = new Map(b.capitulos.map(c => [c.id, c]));
  for (const c of b.capitulos) {
    if (!ca.has(c.id)) capitulos.agregados.push({ id: c.id, titulo: c.titulo });
    else if (ca.get(c.id).titulo !== c.titulo) capitulos.renombrados.push({ id: c.id, antes: ca.get(c.id).titulo, despues: c.titulo });
  }
  for (const c of a.capitulos) if (!cb.has(c.id)) capitulos.eliminados.push({ id: c.id, titulo: c.titulo });
  const mapa = c => new Map(c.capitulos.flatMap((cap, ci) => cap.partidas.map((p, pi) => [p.id, { p, capitulo: cap.id, posicion: `${ci + 1}.${pi + 1}` }])));
  const pa = mapa(a), pb = mapa(b);
  for (const [id, nuevo] of pb) {
    if (!pa.has(id)) { partidas.agregadas.push({ id, designacion: nuevo.p.designacion }); continue; }
    const anterior = pa.get(id), campos = [];
    const comparar = (campo, antes, despues) => { if (!igual(antes, despues)) campos.push({ campo, antes: structuredClone(antes), despues: structuredClone(despues) }); };
    for (const campo of ['designacion', 'unidad', 'cantidad', 'manoObra']) comparar(campo, anterior.p[campo], nuevo.p[campo]);
    comparar('valor material', anterior.p.material.valorUnitario, nuevo.p.material.valorUnitario);
    comparar('posición', anterior.posicion, nuevo.posicion);
    comparar('capítulo', anterior.capitulo, nuevo.capitulo);
    // Conserva además cambios de fuente, rendimiento y ajuste que no alteran el total.
    comparar('detalle material', anterior.p.material, nuevo.p.material);
    if (campos.length) partidas.modificadas.push({ id, designacion: nuevo.p.designacion, campos });
  }
  for (const [id, viejo] of pa) if (!pb.has(id)) partidas.eliminadas.push({ id, designacion: viejo.p.designacion });
  for (const campo of ['numero', 'proyecto', 'cliente', 'fecha', 'duracion', 'notaPie', 'ggPorcentaje', 'tarifaDiaria', 'iva']) {
    if (!igual(a[campo], b[campo])) encabezado.push({ campo, antes: structuredClone(a[campo]), despues: structuredClone(b[campo]) });
  }
  const deltaTotal = calcular(b).totalFinal - calcular(a).totalFinal;
  const texto = (campo, v) => {
    if (v === undefined || v === null) return 'sin definir';
    if (campo === 'detalle material') {
      if (v.origen === 'manual') return 'precio manual';
      const s = v.sodimac;
      return `Sodimac «${s.nombre}» (${clp(s.precioBruto)} por ${s.unidadVenta}, rendimiento ${v.rendimiento}${v.ajustadoManual ? ', ajustado a mano' : ''})`;
    }
    if (campo === 'manoObra') return v.modo === 'jornadas' ? `${v.personas} personas × ${v.dias} días` : `monto manual ${clp(v.monto)}`;
    if (campo === 'iva') return v.desglosar ? 'desglosado (19 %)' : 'sin desglosar';
    if (campo === 'valor material' || campo === 'tarifaDiaria') return clp(v);
    return String(v);
  };
  const etiquetas = { 'detalle material': 'material', manoObra: 'mano de obra', ggPorcentaje: 'gastos generales y utilidad (%)', tarifaDiaria: 'tarifa diaria', iva: 'IVA' };
  const cambio = f => `${etiquetas[f.campo] || f.campo}: ${texto(f.campo, f.antes)} → ${texto(f.campo, f.despues)}`;
  const lineas = [
    ...capitulos.agregados.map(c => `Capítulo agregado: ${c.titulo}.`),
    ...capitulos.eliminados.map(c => `Capítulo eliminado: ${c.titulo}.`),
    ...capitulos.renombrados.map(c => `Capítulo renombrado: ${c.antes} → ${c.despues}.`),
    ...partidas.agregadas.map(p => `Partida agregada: ${p.designacion}.`),
    ...partidas.eliminadas.map(p => `Partida eliminada: ${p.designacion}.`),
    ...partidas.modificadas.map(p => `${p.designacion}: ${p.campos.map(f => cambio(f)).join('; ')}.`),
    ...encabezado.map(f => `${cambio(f)}.`)
  ];
  if (!lineas.length) lineas.push('Sin cambios.');
  lineas.push(`Variación del total: ${deltaTotal >= 0 ? '+' : '−'}${clp(Math.abs(deltaTotal))}.`);
  return { capitulos, partidas, encabezado, deltaTotal, resumen: lineas.join('\n') };
}
export function crearVersion(c, comentario = '', fecha = new Date().toISOString()) {
  const datos = datosBorrador(c), anterior = c.versiones.at(-1);
  return congelar({ n: Math.max(0, ...c.versiones.map(v => v.n)) + 1, fecha, comentario, datos,
    totales: calcular(datos), resumenCambios: anterior ? diff(anterior.datos, datos).resumen : 'Versión inicial.' });
}
export function restaurar(c, version) {
  return { ...structuredClone(version.datos), id: c.id, versiones: structuredClone(c.versiones) };
}
