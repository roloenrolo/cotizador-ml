// No DOM, fecha actual ni estado compartido: entradas y salidas independientes.
export const clp = valor => '$' + Math.round(valor).toLocaleString('es-CL');
export function manoObra(partida, tarifaDiaria = 50000) {
  const m = partida.manoObra;
  return m.modo === 'jornadas' ? m.personas * m.dias * tarifaDiaria : m.monto;
}
export function totalPartida(partida, tarifaDiaria = 50000) {
  // valorMaterial permite verificar directamente el fixture original.
  return Math.round(partida.cantidad * (partida.material?.valorUnitario ?? partida.valorMaterial ?? 0) + manoObra(partida, tarifaDiaria));
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
    && sugerirRendimiento(p.material.sodimac.nombre || '', p.material.sodimac.unidadVenta, p.unidad)?.fuente !== 'misma_unidad'
    ? `El precio es por ${p.material.sodimac.unidadVenta}; indica cuánto rinde en ${p.unidad}` : '';
}

// Un solo punto es decimal; varios grupos de miles hacen inequívoco el formato.
export function parsearNumero(valor) {
  const texto = String(valor).trim();
  if (!texto) return 0;
  const normal = /^\d{1,3}(?:\.\d{3}){2,}$/.test(texto) ? texto.replaceAll('.', '') : texto.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normal)) return null;
  const numero = Number(normal);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}
export function siguienteNumero(cotizaciones, ultimoNumero = 0) {
  const max = cotizaciones.reduce((n, c) => /^\d+$/.test(c.numero) ? Math.max(n, Number(c.numero)) : n, ultimoNumero);
  return String(max + 1).padStart(3, '0');
}

export function sugerirRendimiento(nombre, unidadVenta, unidadPartida) {
  const normalizar = unidad => {
    const u = String(unidad).toLowerCase().replace(/\s/g, '').replace('²', '2').replace('³', '3');
    if (['m2', 'mt2', 'mts2'].includes(u)) return 'm2';
    if (['ml', 'm', 'mt', 'metro', 'metrolineal'].includes(u)) return 'ml';
    return u;
  };
  const unidad = normalizar(unidadPartida);
  if (normalizar(unidadVenta) === unidad) return { rendimiento: 1, fuente: 'misma_unidad' };
  if (!['m2', 'ml'].includes(unidad)) return null;
  const texto = String(nombre).toLowerCase();
  const numero = '\\d+(?:[.,]\\d+)?';
  const validar = (valores, fuente) => valores.length === 1 && valores[0] > 0 && valores[0] <= 100
    ? { rendimiento: valores[0], fuente } : null;
  if (unidad === 'ml') {
    const largos = [...texto.matchAll(new RegExp(`(?<![\\d.,x×-])(${numero})\\s*(?:mt|m)(?![\\p{L}\\p{N}²³])`, 'gu'))];
    return validar(largos.map(m => parsearNumero(m[1])), 'nombre');
  }
  const superficies = [...texto.matchAll(new RegExp(`(?<![\\d.,-])(${numero})\\s*m[2²](?![\\p{L}\\p{N}])`, 'gu'))];
  if (superficies.length) return validar(superficies.map(m => parsearNumero(m[1])), 'nombre');
  // Quita solo factores identificados expresamente como espesor en mm.
  const sinEspesor = texto.replace(new RegExp(`${numero}\\s*mm\\s*[x×]\\s*`, 'g'), '')
    .replace(new RegExp(`\\s*[x×]\\s*${numero}\\s*mm\\b`, 'g'), '');
  const medidas = [...sinEspesor.matchAll(new RegExp(`(?<![\\d.,x×-])(${numero})\\s*[x×]\\s*(${numero})\\s*(cm|m)(?![\\p{L}\\p{N}²³])`, 'gu'))];
  if (medidas.some(m => /[x×]\s*$/.test(sinEspesor.slice(0, m.index)) || /^\s*[x×]/.test(sinEspesor.slice(m.index + m[0].length)))) return null;
  return validar(medidas.map(m => {
    const divisor = m[3] === 'cm' ? 100 : 1;
    return Math.round((parsearNumero(m[1]) / divisor) * (parsearNumero(m[2]) / divisor) * 100) / 100;
  }), 'dimensiones');
}
export function unidadesAComprar(cantidad, rendimiento) {
  return Math.ceil(cantidad / rendimiento);
}

export function unidadesVentaLegibles(unidad, cantidad) {
  if (cantidad === 1) return unidad;
  if (/^unidad$/i.test(unidad)) return `${unidad}es`;
  if (/^plancha$/i.test(unidad)) return `${unidad}s`;
  return unidad;
}
