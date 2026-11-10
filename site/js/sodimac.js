import { WORKER_URL } from './config.js';
const mensajes = {
  consulta_invalida: 'Escribe una búsqueda de entre 2 y 80 caracteres.',
  demasiadas_consultas: 'Hay demasiadas consultas. Espera un momento e intenta nuevamente.',
  sodimac_sin_respuesta: 'Sodimac no respondió. Puedes ingresar un precio manual o usar Mis materiales.',
  sodimac_rechazo: 'Sodimac rechazó la consulta. Puedes ingresar un precio manual o usar Mis materiales.',
  estructura_cambio: 'La búsqueda no pudo leer el catálogo. Puedes ingresar un precio manual o usar Mis materiales.'
};
export function urlSegura(valor) {
  try { const url = new URL(valor); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export async function buscarMateriales(q, { signal, base = WORKER_URL, fetchImpl = globalThis.fetch } = {}) {
  if (!base) throw new Error('El buscador Sodimac aún no está configurado. Usa un precio manual o Mis materiales.');
  if (q.trim().length < 2 || q.trim().length > 80) throw new Error(mensajes.consulta_invalida);
  try {
    const respuesta = await fetchImpl(`${base.replace(/\/$/, '')}/buscar?q=${encodeURIComponent(q.trim())}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
    const datos = await respuesta.json();
    if (!respuesta.ok || datos.error) throw new Error(mensajes[datos.error] || mensajes.sodimac_sin_respuesta);
    if (datos.ivaIncluido !== true || typeof datos.fecha !== 'string' || !Array.isArray(datos.resultados) || !datos.resultados.every(r => typeof r.sku === 'string' && typeof r.nombre === 'string' && typeof r.unidadVenta === 'string' && Number.isFinite(r.precio) && r.precio > 0)) throw new Error(mensajes.estructura_cambio);
    return datos;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (Object.values(mensajes).includes(error.message)) throw error;
    throw new Error(mensajes.sodimac_sin_respuesta);
  }
}
