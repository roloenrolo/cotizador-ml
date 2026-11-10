import { calcular, manoObra, clp } from './calc.js';
import { sinVersionar } from './versiones.js';
export function fechaChilena(valor) {
  // Las fechas sin hora son fechas civiles; los instantes ISO se convierten a hora local.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return valor.split('-').reverse().join('-');
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return `${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${fecha.getFullYear()}`;
}
export function crearPDF(c, empresa, JsPDF = globalThis.jspdf?.jsPDF) {
  if (!JsPDF) throw new Error('No se pudo cargar la biblioteca de PDF local. Recarga la página.');
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const total = calcular(c), ultima = c.versiones.at(-1);
  const estado = sinVersionar(c) ? 'Borrador' : `Versión ${ultima.n}`;
  const margin = 14, ancho = 182, limite = 278;
  const partir = (texto, size, width, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    return doc.splitTextToSize(String(texto || ''), width);
  };
  const dibujar = (lineas, x, y, size, bold = false, align = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    lineas.forEach((linea, i) => doc.text(linea, x, y + i * (size * 0.45 + 1), { align }));
    return y + lineas.length * (size * 0.45 + 1);
  };
  let logoFin = 14;
  if (empresa.logoDataUrl) {
    try {
      const info = doc.getImageProperties(empresa.logoDataUrl);
      const escala = Math.min(32 / info.width, 28 / info.height);
      doc.addImage(empresa.logoDataUrl, info.fileType, margin, 12, info.width * escala, info.height * escala);
      logoFin = 12 + info.height * escala;
    } catch { throw new Error('No se pudo incorporar el logo. Vuelve a subirlo en Configuración o quítalo.'); }
  }
  dibujar(['PRESUPUESTO'], 105, 19, 18, true, 'center');
  const tituloFin = dibujar(partir(c.proyecto, 12, 100, true), 105, 27, 12, true, 'center');
  dibujar([`Stgo ${fechaChilena(c.fecha)}`], 196, 14, 9, false, 'right');
  const columnasY = Math.max(logoFin, tituloFin) + 5;
  const columna = (filas, x, width) => {
    let cursor = columnasY;
    for (const [texto, bold] of filas) {
      if (texto) cursor = dibujar(partir(texto, 9, width, bold), x, cursor, 9, bold);
    }
    return cursor;
  };
  const izquierda = columna([
    [empresa.nombre, true], [empresa.rut && `RUT: ${empresa.rut}`],
    [empresa.contacto && `Contacto: ${empresa.contacto}`], [empresa.telefono && `Teléfono: ${empresa.telefono}`]
  ], margin, 82);
  const derecha = columna([
    [`Cliente: ${c.cliente}`], [`Presupuesto N° ${c.numero} · ${estado}`, true], [`Proyecto: ${c.proyecto}`]
  ], 108, 88);
  let y = Math.max(izquierda, derecha) + 5;
  const body = [];
  c.capitulos.forEach((cap, ci) => {
    body.push([{ content: `${ci + 1}. ${cap.titulo}`, colSpan: 7, styles: { fillColor: [230, 235, 233], fontStyle: 'bold', textColor: [25, 45, 38] } }]);
    cap.partidas.forEach((p, pi) => body.push([
      `${ci + 1}.${pi + 1}`, p.designacion, p.unidad,
      p.cantidad === 0 && p.material.valorUnitario === 0 ? '' : p.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 6 }), p.cantidad === 0 && p.material.valorUnitario === 0 ? '' : clp(p.material.valorUnitario), clp(manoObra(p, c.tarifaDiaria)), clp(total.capitulos[ci].partidas[pi])
    ]));
    body.push([{ content: 'sub total', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } }, { content: clp(total.capitulos[ci].subtotal), styles: { fontStyle: 'bold', halign: 'right' } }]);
  });
  doc.autoTable({ startY: y, margin: { left: margin, right: margin, top: 16, bottom: 20 },
    head: [['Ítem', 'Designación', 'Unidad', 'Cantidad', 'Valor material', 'Mano de obra', 'Total']], body,
    theme: 'grid', rowPageBreak: 'avoid', showHead: 'everyPage',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, lineColor: [215, 222, 219], lineWidth: 0.15, overflow: 'linebreak' },
    headStyles: { fillColor: [29, 67, 53], textColor: 255 },
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 53 }, 2: { cellWidth: 17 }, 3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 27, halign: 'right' }, 5: { cellWidth: 27, halign: 'right' }, 6: { cellWidth: 28, halign: 'right' } }
  });
  // Medir todo el cierre antes de dibujar: nunca separar la firma de la nota.
  const filas = [['Total', total.neto], [`Gastos generales y utilidad (${c.ggPorcentaje} %)`, total.gg], ['Total final', total.total, true]];
  if (c.iva.desglosar) filas.push(['Neto', total.total], ['IVA 19 %', total.iva], ['Total con IVA', total.totalFinal, true]);
  const duracion = partir(`Duración del proyecto: ${c.duracion}`, 10, ancho, true);
  const nota = partir(c.notaPie, 9, ancho);
  const alto = filas.length * 7 + 5 + duracion.length * 5.5 + 3 + nota.length * 5.05 + 29;
  // Una nota excepcionalmente larga se reduce junto al bloque para caber en una página.
  const escala = Math.min(1, (limite - 18) / alto);
  y = doc.lastAutoTable.finalY + 10;
  if (y + alto * escala > limite) { doc.addPage(); y = 18; }
  for (const [label, valor, bold] of filas) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10 * escala);
    doc.text(label, margin, y); doc.text(clp(valor), 196, y, { align: 'right' }); y += 7 * escala;
  }
  y += 5 * escala;
  const parrafo = (lineas, size, paso, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size * escala);
    for (const linea of lineas) { doc.text(linea, margin, y); y += paso * escala; }
  };
  parrafo(duracion, 10, 5.5, true); y += 3 * escala;
  parrafo(nota, 9, 5.05); y += 18 * escala;
  doc.line(margin, y, 95, y); y += 5 * escala;
  parrafo(['Aceptación del cliente'], 9, 5.05);
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80);
    doc.text(`Página ${i} de ${paginas}`, 105, 289, { align: 'center' });
  }
  return doc;
}
export function nombrePDF(c) {
  const numero = String(c.numero || 'sin-numero').replace(/[^\p{L}\p{N}_-]/gu, '-');
  const n = c.versiones.at(-1)?.n ?? 0;
  return `Presupuesto-${numero}-${sinVersionar(c) ? 'borrador' : `v${n}`}.pdf`;
}

export function descargarPDF(c, empresa) { crearPDF(c, empresa).save(nombrePDF(c)); }
