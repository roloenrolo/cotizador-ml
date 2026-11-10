// No DOM, fecha actual ni estado compartido: entradas y salidas independientes.
export const clp = valor => '$' + Math.round(valor).toLocaleString('es-CL');
export function manoObra(partida, tarifaDiaria = 50000) {
  const m = partida.manoObra;
  return m.modo === 'jornadas' ? m.personas * m.dias * tarifaDiaria : m.monto;
}
export function totalPartida(partida, tarifaDiaria = 50000) {
  // valorMaterial permite verificar directamente el fixture original.
  return partida.cantidad * (partida.material?.valorUnitario ?? partida.valorMaterial ?? 0) + manoObra(partida, tarifaDiaria);
}
export function calcular(cotizacion) {
  const capitulos = cotizacion.capitulos.map(c => {
    const partidas = c.partidas.map(p => totalPartida(p, cotizacion.tarifaDiaria ?? 50000));
    return { id: c.id, partidas, subtotal: partidas.reduce((a, b) => a + b, 0) };
  });
  const neto = capitulos.reduce((s, c) => s + c.subtotal, 0);
  const gg = Math.round(neto * (cotizacion.ggPorcentaje ?? 8) / 100);
  const total = neto + gg;
  const iva = cotizacion.iva?.desglosar ? Math.round(total * 0.19) : 0;
  return { capitulos, neto, gg, total, iva, totalFinal: total + iva };
}
export function sugerirValor(precioBruto, rendimiento = 1, desglosar = false) {
  if (!(rendimiento > 0)) throw new Error('El rendimiento debe ser mayor que cero.');
  return Math.round((desglosar ? Math.round(precioBruto / 1.19) : precioBruto) / rendimiento);
}
export function cambiarIVA(cotizacion, desglosar) {
  const datos = structuredClone(cotizacion);
  datos.iva = { desglosar };
  let manuales = 0, ajustadas = 0, recalculadas = 0;
  for (const c of datos.capitulos) for (const p of c.partidas) {
    if (p.material.origen !== 'sodimac') { manuales++; continue; }
    if (p.material.ajustadoManual) { ajustadas++; continue; }
    p.material.valorUnitario = sugerirValor(p.material.sodimac.precioBruto, p.material.rendimiento, desglosar);
    recalculadas++;
  }
  return { datos, manuales, ajustadas, recalculadas };
}
export function avisoUnidad(p) {
  return p.material.origen === 'sodimac' && !['un', 'GL'].includes(p.unidad) && p.material.rendimiento === 1
    ? `El precio es por ${p.material.sodimac.unidadVenta}; indica cuánto rinde en ${p.unidad}` : '';
}
