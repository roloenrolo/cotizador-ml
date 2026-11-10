import { WORKER_URL } from './config.js';
const mensajes = {
  consulta_invalida: 'Escribe una búsqueda de entre 3 y 80 caracteres.',
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
  if (q.trim().length < 3 || q.trim().length > 80) throw new Error(mensajes.consulta_invalida);
  const controller = new AbortController();
  const cancelar = () => controller.abort();
  if (signal?.aborted) cancelar();
  signal?.addEventListener('abort', cancelar, { once: true });
  const timer = setTimeout(cancelar, 12000);
  try {
    const respuesta = await fetchImpl(`${base.replace(/\/$/, '')}/buscar?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal });
    const datos = await respuesta.json();
    if (!respuesta.ok || datos.error) throw new Error(mensajes[datos.error] || mensajes.sodimac_sin_respuesta);
    if (datos.ivaIncluido !== true || typeof datos.fecha !== 'string' || !Array.isArray(datos.resultados)) throw new Error(mensajes.estructura_cambio);
    datos.resultados = datos.resultados.filter(r => r && typeof r === 'object').map(r => {
      const limpio = { precio: r.precio };
      for (const campo of ['sku', 'nombre', 'marca', 'unidadVenta', 'url']) limpio[campo] = typeof r[campo] === 'string' ? r[campo] : '';
      return limpio;
    }).filter(r => r.nombre.trim() && Number.isInteger(r.precio) && r.precio > 0);
    return datos;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (Object.values(mensajes).includes(error.message)) throw error;
    throw new Error(mensajes.sodimac_sin_respuesta);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancelar); }
}
