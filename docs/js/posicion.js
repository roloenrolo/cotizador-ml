// Las dimensiones recibidas son las medidas reales, ya limitadas por CSS al viewport.
export function posicionPopover(ancla, alto, ancho, altoViewport, anchoViewport) {
  const margen = 8, separacion = 6;
  const left = Math.max(margen, Math.min(ancla.left, anchoViewport - ancho - margen));
  const debajo = ancla.bottom + separacion;
  const arriba = ancla.top - separacion - alto;
  let top = margen;
  if (debajo >= margen && debajo + alto <= altoViewport - margen) top = debajo;
  else if (arriba >= margen && arriba + alto <= altoViewport - margen) top = arriba;
  return { left, top };
}
