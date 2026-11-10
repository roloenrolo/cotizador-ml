import { DEFAULTS, UNIDADES } from './config.js';
import { calcular } from './calc.js';
const KEY = 'cotizadorml:datos';
export const vacio = () => ({ version: 1, empresa: { nombre: '', rut: '', contacto: '', telefono: '', logoDataUrl: '' }, configuracion: { ...DEFAULTS }, cotizaciones: [], materiales: [] });
const objeto = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const texto = x => typeof x === 'string';
const numero = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
function exigir(condicion) { if (!condicion) throw new Error('El respaldo tiene una estructura inválida o una versión no compatible.'); }
const textos = (x, claves) => objeto(x) && claves.every(k => texto(x[k]));
const idsUnicos = lista => new Set(lista.map(x => x.id)).size === lista.length;
function validarMaterial(m) {
  exigir(objeto(m) && numero(m.valorUnitario) && numero(m.rendimiento) && m.rendimiento > 0 && ['manual', 'sodimac'].includes(m.origen));
  exigir(m.ajustadoManual === undefined || typeof m.ajustadoManual === 'boolean');
  if (m.origen === 'sodimac') exigir(textos(m.sodimac, ['sku', 'nombre', 'marca', 'unidadVenta', 'url', 'fecha']) && numero(m.sodimac.precioBruto));
}
function validarCotizacion(c, snapshot = false) {
  exigir(textos(c, ['id', 'numero', 'proyecto', 'cliente', 'fecha', 'duracion', 'notaPie']) && c.id.length > 0);
  exigir(numero(c.ggPorcentaje) && numero(c.tarifaDiaria) && objeto(c.iva) && typeof c.iva.desglosar === 'boolean');
  exigir(Array.isArray(c.capitulos) && idsUnicos(c.capitulos));
  const ids = new Set();
  for (const cap of c.capitulos) {
    exigir(textos(cap, ['id', 'titulo']) && cap.id && Array.isArray(cap.partidas));
    for (const p of cap.partidas) {
      exigir(textos(p, ['id', 'designacion', 'unidad']) && p.id && !ids.has(p.id) && UNIDADES.includes(p.unidad) && numero(p.cantidad)); ids.add(p.id);
      validarMaterial(p.material);
      exigir(objeto(p.manoObra) && ['manual', 'jornadas'].includes(p.manoObra.modo));
      exigir(p.manoObra.modo === 'manual' ? numero(p.manoObra.monto) : numero(p.manoObra.personas) && numero(p.manoObra.dias));
    }
  }
  exigir(Number.isFinite(calcular(c).totalFinal));
  if (!snapshot) {
    exigir(Array.isArray(c.versiones));
    let n = 0;
    for (const v of c.versiones) {
      exigir(objeto(v) && Number.isInteger(v.n) && v.n > n && texto(v.fecha) && texto(v.resumenCambios) && (v.comentario === undefined || texto(v.comentario)));
      n = v.n; validarCotizacion(v.datos, true); exigir(v.datos.id === c.id && v.datos.versiones === undefined);
      exigir(objeto(v.totales) && numero(v.totales.totalFinal));
      // Los totales guardados no son una fuente de cálculo confiable al importar.
      v.totales = calcular(v.datos);
    }
  }
}
export function validarRespaldo(datos) {
  const d = structuredClone(datos);
  exigir(objeto(d) && d.version === 1 && textos(d.empresa, ['nombre', 'rut', 'contacto', 'telefono', 'logoDataUrl']));
  exigir(!d.empresa.logoDataUrl || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d.empresa.logoDataUrl));
  exigir(objeto(d.configuracion) && numero(d.configuracion.tarifaDiaria) && numero(d.configuracion.ggPorcentaje) && texto(d.configuracion.notaPie) && typeof d.configuracion.respaldoAutomatico === 'boolean');
  exigir(Array.isArray(d.cotizaciones) && idsUnicos(d.cotizaciones) && Array.isArray(d.materiales));
  d.cotizaciones.forEach(c => validarCotizacion(c));
  for (const m of d.materiales) { exigir(textos(m, ['id', 'nombre', 'unidad', 'fecha', 'url']) && UNIDADES.includes(m.unidad)); validarMaterial(m.material); }
  return d;
}
export function cargar() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { datos: validarRespaldo(JSON.parse(raw)), aviso: '' } : { datos: vacio(), aviso: 'No hay datos guardados en este navegador. Puedes crear una cotización o importar un respaldo.' };
  } catch { return { datos: vacio(), aviso: 'No se pudieron leer los datos locales. Puedes trabajar en memoria e importar un respaldo; descarga tus cambios para conservarlos.', error: true }; }
}
export function guardar(datos) {
  try { localStorage.setItem(KEY, JSON.stringify(datos)); return ''; }
  catch { return 'No se pudo guardar en este navegador. Los cambios siguen en memoria: descarga un respaldo antes de cerrar.'; }
}
export function exportar(datos) { return JSON.stringify({ ...datos, version: 1 }, null, 2); }
export function importar(contenido, actual, modo) {
  const nuevo = validarRespaldo(JSON.parse(contenido));
  if (modo === 'reemplazar') return nuevo;
  if (modo !== 'fusionar') throw new Error('Selecciona fusionar o reemplazar.');
  const resultado = structuredClone(actual);
  // En conflictos se conserva la cotización local y se importa una copia completa.
  for (const c of nuevo.cotizaciones) {
    if (resultado.cotizaciones.some(x => x.id === c.id)) {
      c.id = crypto.randomUUID();
      for (const v of c.versiones) v.datos.id = c.id;
    }
    resultado.cotizaciones.push(c);
  }
  const materiales = new Map(resultado.materiales.map(m => [m.id, m]));
  for (const m of nuevo.materiales) if (!materiales.has(m.id) || m.fecha > materiales.get(m.id).fecha) materiales.set(m.id, m);
  resultado.materiales = [...materiales.values()];
  return resultado;
}
export function recordarMaterial(datos, p, fecha = new Date().toISOString()) {
  const nombre = p.material.sodimac?.nombre || p.material.nombre || p.designacion.trim();
  if (!nombre) return;
  const id = p.material.origen === 'sodimac' ? `sku:${p.material.sodimac.sku}:${p.unidad}` : `manual:${nombre.toLocaleLowerCase('es-CL')}:${p.unidad}`;
  const registro = { id, nombre, unidad: p.unidad, rendimiento: p.material.rendimiento, ultimoPrecio: p.material.valorUnitario,
    fecha: p.material.sodimac?.fecha || fecha, url: p.material.sodimac?.url || '', material: structuredClone(p.material) };
  const i = datos.materiales.findIndex(m => m.id === id);
  if (i < 0) datos.materiales.push(registro); else datos.materiales[i] = registro;
}
export function descargarRespaldo(datos) {
  const url = URL.createObjectURL(new Blob([exportar(datos)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `cotizador-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
