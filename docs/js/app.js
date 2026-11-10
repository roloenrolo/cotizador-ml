import { DEFAULTS, UNIDADES, WORKER_URL } from './config.js';
import { calcular, manoObra, clp, sugerirValor, cambiarIVA, avisoUnidad, parsearNumero, siguienteNumero } from './calc.js';
import { crearVersion, diff, restaurar, sinVersionar } from './versiones.js';
import { cargar, guardar, recordarMaterial, descargarRespaldo, importar, leerRespaldo, empezarDeCero, descargarIlegibles, bloquearGuardado, estadoGuardado, KEY, vacio } from './storage.js';
import { buscarMateriales, urlSegura } from './sodimac.js';
import { descargarPDF, fechaChilena } from './pdf.js';
import { posicionPopover } from './posicion.js';

const inicial = cargar();
let estado = inicial.datos, actual = null, panel = null, popover = null;
let lecturas = [], indicador = null, bloqueTotales = null;
const main = document.querySelector('main');
const dialogo = document.querySelector('#dialogo');
const uid = () => crypto.randomUUID();
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function el(tag, texto, clase) {
  const node = document.createElement(tag);
  if (texto !== undefined && texto !== null) node.textContent = texto;
  if (clase) node.className = clase;
  return node;
}
function evento(node, tipo, fn) {
  node.addEventListener(tipo, async e => { try { await fn(e); } catch (error) { avisar(error.message || 'No se pudo completar la acción.'); } });
}
function boton(texto, fn, clase = '') { const b = el('button', texto, clase); b.type = 'button'; evento(b, 'click', fn); return b; }
function acciones(...botones) { const a = el('div', null, 'actions'); a.append(...botones); return a; }
let avisoTimer;
function avisar(texto) {
  clearTimeout(avisoTimer);
  const n = document.querySelector('#mensaje'); n.replaceChildren(); n.hidden = !texto;
  if (!texto) return;
  n.append(el('span', texto), boton('Cerrar', () => avisar('')));
  avisoTimer = setTimeout(() => avisar(''), 6000);
}
function avisoGuardado(texto) {
  const n = document.querySelector('#aviso-guardado');
  if (estadoGuardado() === 'ilegible') {
    n.replaceChildren(el('p', inicial.aviso), acciones(
      boton('Descargar datos ilegibles', descargarIlegibles),
      boton('Empezar de cero', async () => {
        if (!await pedir({ titulo: 'Empezar de cero', texto: 'Se reemplazarán los datos originales por un cotizador vacío. Descarga los datos ilegibles antes de continuar.', aceptar: 'Empezar de cero', peligro: true })) return;
        if (empezarDeCero(true)) { estado = vacio(); lista(); persistir(); }
        else if (estadoGuardado() === 'otra-pestana') conflictoPestana();
      })
    ));
    if (!inicial.preservado) n.append(el('p', 'No se pudo crear la copia local. El original sigue intacto; descárgalo antes de empezar de cero.'));
    n.hidden = false; return;
  }
  n.textContent = texto; n.hidden = !texto;
}
let conflictoVisible = false;
function conflictoPestana() {
  bloquearGuardado();
  if (conflictoVisible) return;
  conflictoVisible = true;
  const bloqueo = el('dialog'); bloqueo.setAttribute('aria-labelledby', 'conflicto-titulo');
  const titulo = el('h2', 'Este cotizador se modificó en otra pestaña'); titulo.id = 'conflicto-titulo';
  bloqueo.append(titulo, el('p', 'El guardado está detenido para no sobrescribir los datos más recientes.'), boton('Recargar con los datos más recientes', () => location.reload(), 'primary'));
  bloqueo.addEventListener('cancel', e => e.preventDefault()); document.body.append(bloqueo); bloqueo.showModal();
}
window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) conflictoPestana(); });
function validarCampos() {
  const invalido = document.querySelector('input[aria-invalid="true"]');
  if (!invalido) return true;
  avisar('Corrige los campos con números inválidos antes de guardar una versión o descargar el PDF.'); invalido.focus(); return false;
}
function persistir() {
  const error = guardar(estado);
  avisoGuardado(error);
  if (estadoGuardado() === 'otra-pestana') conflictoPestana();
  if (indicador && actual) indicador.textContent = `${error ? 'En memoria' : 'Borrador guardado en este navegador'} · ${sinVersionar(actual) ? 'Cambios sin versionar' : `Sin cambios desde v${actual.versiones.at(-1).n}`}`;
}
function input(valor, cambiar, { tipo = 'text', nombre = '', min = 0, step = 'any' } = {}) {
  const numerico = tipo === 'number';
  const n = el('input'); n.type = numerico ? 'text' : tipo; n.value = valor ?? ''; n.setAttribute('aria-label', nombre);
  const error = el('span', 'Ingresa un número válido', 'field-error'); error.id = `error-${uid()}`; error.hidden = true;
  if (numerico) { n.inputMode = 'decimal'; n.dataset.numeric = 'true'; n.setAttribute('aria-describedby', error.id); }
  evento(n, 'input', () => {
    if (!numerico) { if (n.validity.valid) cambiar(n.value); return; }
    const numero = parsearNumero(n.value);
    const valido = numero !== null && numero >= min && (step !== 1 || Number.isInteger(numero));
    n.setCustomValidity(valido ? '' : 'Ingresa un número válido'); n.setAttribute('aria-invalid', String(!valido));
    if (!error.isConnected) n.after(error); error.hidden = valido;
    if (valido) cambiar(numero);
  });
  return n;
}
function area(valor, cambiar, nombre) { const n = el('textarea'); n.value = valor; n.setAttribute('aria-label', nombre); evento(n, 'input', () => cambiar(n.value)); return n; }
function campo(nombre, control, clase = '') { const l = el('label', nombre, clase); l.append(control); return l; }
function select(opciones, valor, cambiar, nombre) {
  const s = el('select'); s.setAttribute('aria-label', nombre);
  for (const op of opciones) { const [v, t] = Array.isArray(op) ? op : [op, op]; const o = el('option', t); o.value = v; s.append(o); }
  s.value = valor; evento(s, 'change', () => cambiar(s.value)); return s;
}
function check(nombre, valor, cambiar) {
  const n = el('input'); n.type = 'checkbox'; n.checked = valor; evento(n, 'change', () => cambiar(n.checked)); return campo(nombre, n, 'check');
}
function cerrarPanel() { if (panel) { panel.cleanup?.(); panel.remove(); panel = null; } }
function cerrarPopover() { popover?.cleanup?.(); popover?.remove(); popover = null; }
function preparar() { main.querySelectorAll('.designation').forEach(d => d._observer?.disconnect()); cerrarPanel(); cerrarPopover(); lecturas = []; indicador = null; bloqueTotales = null; main.replaceChildren(); avisar(''); }
function abrirPanel(titulo) {
  cerrarPanel(); cerrarPopover();
  const anterior = document.activeElement;
  panel = el('aside', null, 'side-panel'); panel.setAttribute('aria-label', titulo);
  const head = el('div', null, 'page-top'); const cerrar = boton('Cerrar', () => { cerrarPanel(); if (anterior.isConnected) anterior.focus(); });
  head.append(el('h2', titulo), cerrar); panel.append(head); document.body.append(panel); cerrar.focus(); return panel;
}
function pedir({ titulo, texto, aceptar = 'Aceptar', control = null, valor = () => true, peligro = false }) {
  return new Promise(resolve => {
    dialogo.replaceChildren();
    const h = el('h2', titulo); h.id = 'dialogo-titulo'; dialogo.append(h, el('p', texto)); if (control) dialogo.append(control);
    const terminar = respuesta => { dialogo.close(); resolve(respuesta); };
    const ok = boton(aceptar, () => {
      const invalido = [...dialogo.querySelectorAll('input,select,textarea')].find(n => !n.checkValidity());
      if (invalido) { invalido.reportValidity(); return; }
      terminar(valor());
    }, peligro ? 'danger' : 'primary');
    dialogo.append(acciones(boton('Cancelar', () => terminar(null)), ok));
    dialogo.oncancel = e => { e.preventDefault(); terminar(null); };
    dialogo.showModal(); (control?.querySelector('input,textarea,select') ?? dialogo.querySelector('button')).focus();
  });
}
function nueva() {
  const numero = siguienteNumero(estado.cotizaciones, estado.ultimoNumero || 0); estado.ultimoNumero = Number(numero);
  return { id: uid(), numero, proyecto: '', cliente: '', fecha: hoy(), duracion: '', notaPie: estado.configuracion.notaPie,
    ggPorcentaje: estado.configuracion.ggPorcentaje, tarifaDiaria: estado.configuracion.tarifaDiaria, iva: { desglosar: false }, capitulos: [], versiones: [] };
}
function nuevaPartida() { return { id: uid(), designacion: '', unidad: 'un', cantidad: 1, material: { valorUnitario: 0, origen: 'manual', rendimiento: 1 }, manoObra: { modo: 'manual', personas: 1, dias: 1, monto: 0 } }; }
function abrir(c) { actual = c; editor(); }
function crear() { const c = nueva(); estado.cotizaciones.push(c); abrir(c); persistir(); }
async function ejemplo() {
  const respuesta = await fetch('./ejemplo.json'); if (!respuesta.ok) throw new Error('No se pudo cargar el ejemplo local. Revisa que el servidor esté activo.');
  const f = await respuesta.json(), c = nueva();
  Object.assign(c, { proyecto: f.proyecto, cliente: f.cliente, duracion: f.duracion, notaPie: f.notaPie, ggPorcentaje: f.ggPorcentaje });
  c.capitulos = f.capitulos.map(cap => ({ id: uid(), titulo: cap.titulo, partidas: cap.partidas.map(p => ({ ...nuevaPartida(), designacion: p.designacion, unidad: p.unidad, cantidad: p.cantidad, material: { valorUnitario: p.valorMaterial, origen: 'manual', rendimiento: 1 }, manoObra: { ...nuevaPartida().manoObra, ...p.manoObra } })) }));
  estado.cotizaciones.push(c); c.capitulos.forEach(cap => cap.partidas.forEach(p => recordarMaterial(estado, p))); abrir(c); persistir();
}
function lista() {
  actual = null; preparar();
  const top = el('div', null, 'page-top'), titulo = el('div'); titulo.append(el('h1', 'Cotizaciones'), el('p', 'Presupuestos de obra, materiales y mano de obra en un solo lugar.', 'muted'));
  top.append(titulo, acciones(boton('Cargar ejemplo', ejemplo), boton('Nueva cotización', crear, 'primary'))); main.append(top);
  if (!estado.cotizaciones.length) {
    const empty = el('section', null, 'empty'); empty.append(el('h2', 'Tu primera cotización empieza aquí'), el('p', 'Organiza la obra en capítulos, calcula sus partidas y entrega un presupuesto en PDF. Tus datos se guardan en este navegador.'), acciones(boton('Importar respaldo', abrirImportacion), boton('Crear cotización', crear, 'primary'))); main.append(empty); return;
  }
  const wrap = el('div', null, 'table-scroll'), t = el('table', null, 'list-table'), head = el('thead'), tr = el('tr');
  ['Presupuesto / proyecto', 'Cliente', 'Fecha', 'Total', 'Acciones'].forEach(x => tr.append(el('th', x))); head.append(tr); t.append(head);
  const body = el('tbody');
  for (const c of estado.cotizaciones) {
    const row = el('tr'), name = el('td'); name.append(boton(`N° ${c.numero} · ${c.proyecto || 'Sin proyecto'}`, () => abrir(c)));
    const total = el('td', clp(calcular(c).totalFinal), 'money'), acts = el('td');
    acts.append(acciones(boton('Abrir', () => abrir(c)), boton('Duplicar', () => {
      const copia = structuredClone(c); copia.id = uid(); copia.numero = nueva().numero; copia.proyecto = `${c.proyecto} (copia)`; copia.versiones = [];
      copia.capitulos.forEach(cap => { cap.id = uid(); cap.partidas.forEach(p => p.id = uid()); });
      estado.cotizaciones.push(copia); persistir(); lista();
    }), boton('Eliminar', async () => {
      if (await pedir({ titulo: 'Eliminar cotización', texto: `Se eliminará el presupuesto ${c.numero}, incluido su historial de versiones.`, aceptar: 'Eliminar cotización', peligro: true })) {
        estado.ultimoNumero = Number(siguienteNumero(estado.cotizaciones, estado.ultimoNumero || 0)) - 1;
        estado.cotizaciones = estado.cotizaciones.filter(x => x.id !== c.id); persistir(); lista();
      }
    }, 'danger')));
    row.append(name, el('td', c.cliente || 'Sin cliente'), el('td', fechaChilena(c.fecha)), total, acts); body.append(row);
  }
  t.append(body); wrap.append(t); main.append(wrap, el('p', 'Guardado local · Descarga respaldos para conservar tus cotizaciones fuera de este navegador.', 'muted'));
}
function mover(lista, i, delta) { const j = i + delta; if (j < 0 || j >= lista.length) return; [lista[i], lista[j]] = [lista[j], lista[i]]; persistir(); editor(); }
function orden(lista, i, tipo, eliminar, compacto = false) {
  const subir = boton('Subir', () => mover(lista, i, -1)), bajar = boton('Bajar', () => mover(lista, i, 1));
  subir.disabled = i === 0; bajar.disabled = i === lista.length - 1;
  subir.setAttribute('aria-label', `Subir ${tipo}`); bajar.setAttribute('aria-label', `Bajar ${tipo}`);
  const borrar = boton('Eliminar', eliminar, 'danger');
  borrar.setAttribute('aria-label', `Eliminar ${tipo}`);
  if (compacto) {
    for (const [b, icono] of [[subir, '↑'], [bajar, '↓'], [borrar, '✕']]) {
      b.title = b.getAttribute('aria-label'); b.textContent = icono;
    }
  }
  const grupo = acciones(subir, bajar, borrar); if (compacto) grupo.classList.add('row-actions'); return grupo;
}
function actualizar() {
  for (const fn of lecturas) fn();
  if (bloqueTotales) pintarTotales(); persistir();
}
function pintarTotales() {
  const t = calcular(actual); bloqueTotales.replaceChildren();
  const linea = (label, valor, final = false) => { const n = el('div', null, `total-line${final ? ' final' : ''}`); n.append(el('span', label), el('span', clp(valor), 'money')); bloqueTotales.append(n); };
  linea('Total partidas', t.neto); linea(`Gastos generales y utilidad (${actual.ggPorcentaje} %)`, t.gg);
  if (actual.iva.desglosar) { linea('Neto', t.total); linea('IVA 19 %', t.iva); linea('Total con IVA', t.totalFinal, true); }
  else linea('Total final', t.total, true);
}
function editor() {
  preparar();
  const top = el('div', null, 'page-top'), titulo = el('div'); titulo.append(el('h1', 'Editar cotización'));
  indicador = el('div', '', 'save-state'); titulo.append(indicador);
  top.append(titulo, acciones(boton('Volver a cotizaciones', lista), boton('Versiones', versiones), boton('Guardar versión', guardarVersion, 'primary'), boton('Descargar PDF', () => { if (validarCampos()) descargarPDF(actual, estado.empresa); }))); main.append(top);
  const campos = el('section', null, 'panel fields header-fields');
  for (const [key, label, tipo] of [['numero', 'N° presupuesto'], ['proyecto', 'Proyecto'], ['cliente', 'Cliente'], ['fecha', 'Fecha', 'date'], ['duracion', 'Duración']]) {
    campos.append(campo(label, input(actual[key], v => { actual[key] = v; persistir(); }, { nombre: label, tipo })));
  }
  main.append(campos);
  actual.capitulos.forEach((cap, ci) => main.append(capitulo(cap, ci)));
  if (!actual.capitulos.length) { const e = el('div', null, 'empty'); e.append(el('h2', 'Agrega el primer capítulo'), el('p', 'Por ejemplo: obras preliminares, estructura o terminaciones. Luego incorpora las partidas de trabajo.')); main.append(e); }
  main.append(boton('Agregar capítulo', () => { actual.capitulos.push({ id: uid(), titulo: 'Nuevo capítulo', partidas: [] }); persistir(); editor(); }));
  const bottom = el('div', null, 'bottom'), left = el('section', null, 'panel'), fields = el('div', null, 'fields');
  fields.append(campo('Gastos generales y utilidad (%)', input(actual.ggPorcentaje, v => { actual.ggPorcentaje = v; actualizar(); }, { tipo: 'number', nombre: 'Gastos generales y utilidad (%)' })),
    campo('Tarifa diaria (CLP)', input(actual.tarifaDiaria, v => { actual.tarifaDiaria = v; actualizar(); }, { tipo: 'number', step: 1, nombre: 'Tarifa diaria' })));
  left.append(el('h2', 'Condiciones del presupuesto'), fields, el('p', 'La mano de obra por jornadas se calcula con esta tarifa y se suma una sola vez por partida.', 'muted'));
  left.append(check('Desglosar IVA (19 %)', actual.iva.desglosar, valor => {
    const cambio = cambiarIVA(actual, valor); Object.assign(actual, cambio.datos); persistir(); editor();
    avisar(`IVA actualizado: ${cambio.recalculadas} partidas Sodimac recalculadas. ${cambio.manuales} partidas manuales y ${cambio.ajustadas} precios Sodimac ajustados a mano quedaron sin tocar. Revisa si esos precios incluyen IVA.`);
  }), el('p', 'El cambio de IVA recalcula solo los precios Sodimac sin ajuste manual.', 'muted'), campo('Nota al pie', area(actual.notaPie, v => { actual.notaPie = v; persistir(); }, 'Nota al pie')));
  bloqueTotales = el('section', null, 'totals'); bloqueTotales.setAttribute('aria-label', 'Totales'); bloqueTotales.setAttribute('aria-live', 'polite'); bottom.append(left, bloqueTotales); main.append(bottom);
  pintarTotales(); indicador.textContent = `Borrador local · ${sinVersionar(actual) ? 'Cambios sin versionar' : `Sin cambios desde v${actual.versiones.at(-1).n}`}`;
}
function capitulo(cap, ci) {
  const sec = el('section', null, 'chapter'), head = el('div', null, 'chapter-head');
  head.append(el('strong', `${ci + 1}.`), input(cap.titulo, v => { cap.titulo = v; persistir(); }, { nombre: `Título capítulo ${ci + 1}` }), orden(actual.capitulos, ci, 'capítulo', async () => {
    if (await pedir({ titulo: 'Eliminar capítulo', texto: `Se eliminará “${cap.titulo}” y todas sus partidas del borrador.`, aceptar: 'Eliminar capítulo', peligro: true })) { actual.capitulos.splice(ci, 1); persistir(); editor(); }
  })); sec.append(head);
  const wrap = el('div', null, 'table-scroll'), tabla = el('table', null, 'planilla'), thead = el('thead'), tr = el('tr');
  tabla.setAttribute('aria-label', `Partidas del capítulo ${ci + 1}`);
  ['N°', 'Designación', 'Unidad', 'Cantidad', 'Valor material', 'Mano de obra', 'Total', 'Acciones'].forEach(t => { const th = el('th', t); th.scope = 'col'; tr.append(th); }); thead.append(tr); tabla.append(thead);
  const body = el('tbody'); cap.partidas.forEach((p, pi) => body.append(fila(cap, p, ci, pi))); tabla.append(body); wrap.append(tabla); sec.append(wrap);
  const foot = el('div', null, 'chapter-foot'), sub = el('strong', '', 'money');
  const leer = () => sub.textContent = `Subtotal capítulo ${clp(calcular(actual).capitulos[ci].subtotal)}`; lecturas.push(leer); leer();
  foot.append(boton('Agregar partida', () => { cap.partidas.push(nuevaPartida()); persistir(); editor(); }), sub); sec.append(foot); return sec;
}
function fila(cap, p, ci, pi) {
  const row = el('tr'), design = el('td'), unidad = el('td'), cantidad = el('td'), material = el('td'), labor = el('td'), total = el('td', '', 'money row-total'), acts = el('td');
  const nombre = `${ci + 1}.${pi + 1}`;
  const d = area(p.designacion, v => { p.designacion = v; persistir(); }, `Designación ${nombre}`); d.className = 'designation'; d.rows = 1;
  const crecer = () => { d.style.height = 'auto'; d.style.height = `${d.scrollHeight + 2}px`; };
  evento(d, 'input', crecer);
  const observador = new ResizeObserver(crecer); observador.observe(design);
  d._observer = observador;
  evento(d, 'change', () => { recordarMaterial(estado, p); persistir(); }); design.append(d);
  const aviso = el('small', '', 'warning'); design.append(aviso);
  unidad.append(select(UNIDADES, p.unidad, v => { p.unidad = v; recordarMaterial(estado, p); actualizar(); }, `Unidad ${nombre}`));
  cantidad.append(input(p.cantidad, v => { p.cantidad = v; actualizar(); }, { tipo: 'number', nombre: `Cantidad ${nombre}` }));
  const precio = input(p.material.valorUnitario, v => { p.material.valorUnitario = v; if (p.material.origen === 'sodimac') p.material.ajustadoManual = true; actualizar(); }, { tipo: 'number', step: 1, nombre: `Valor material CLP ${nombre}` });
  evento(precio, 'change', () => { recordarMaterial(estado, p); persistir(); });
  const meta = el('small', '', 'material-reference'), linea = el('div', null, 'material-controls');
  const buscar = boton('Buscar', () => selectorMaterial(p)); buscar.setAttribute('aria-label', `Buscar material ${nombre}`); buscar.title = 'Buscar material';
  linea.append(precio, buscar); material.append(linea, meta);
  if (p.material.origen === 'sodimac') linea.append(boton('Editar rendimiento', () => aplicarMaterial(p, p.material, p.material.sodimac.nombre, undefined, true)));
  const mo = boton('', e => editarManoObra(p, e.currentTarget)); mo.setAttribute('aria-label', `Editar mano de obra ${nombre}`); labor.append(mo);
  const modo = el('small'); labor.append(modo);
  const leer = () => {
    aviso.textContent = avisoUnidad(p); aviso.hidden = !aviso.textContent;
    meta.textContent = p.material.origen === 'sodimac' ? `Referencial Sodimac al ${fechaChilena(p.material.sodimac.fecha)}` : ''; meta.hidden = !meta.textContent; precio.title = p.material.ajustadoManual ? 'Precio ajustado a mano' : 'Valor material por unidad';
    mo.textContent = clp(manoObra(p, actual.tarifaDiaria)); modo.textContent = p.manoObra.modo === 'jornadas' ? `${p.manoObra.personas} personas × ${p.manoObra.dias} días` : 'Monto manual';
    total.textContent = clp(calcular(actual).capitulos[ci].partidas[pi]);
  }; lecturas.push(leer); leer();
  acts.append(orden(cap.partidas, pi, `partida ${nombre}`, async () => {
    if (await pedir({ titulo: 'Eliminar partida', texto: `Se eliminará “${p.designacion || nombre}” del borrador.`, aceptar: 'Eliminar partida', peligro: true })) { cap.partidas.splice(pi, 1); persistir(); editor(); }
  }, true)); row.append(el('td', nombre), design, unidad, cantidad, material, labor, total, acts); return row;
}
function editarManoObra(p, anchor) {
  cerrarPopover(); const draft = structuredClone(p.manoObra); popover = el('div', null, 'popover'); popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', 'Mano de obra');
  const caja = popover;
  const posicionar = () => {
    if (!caja.isConnected) return;
    const { left, top } = posicionPopover(anchor.getBoundingClientRect(), caja.offsetHeight, caja.offsetWidth,
      document.documentElement.clientHeight, document.documentElement.clientWidth);
    caja.style.left = `${left}px`; caja.style.top = `${top}px`;
  };
  const cont = el('div'), preview = el('p');
  const recalcular = () => preview.textContent = `Monto de esta partida: ${clp(manoObra({ manoObra: draft }, actual.tarifaDiaria))}`;
  const controles = () => {
    cont.replaceChildren();
    if (draft.modo === 'jornadas') {
      for (const [key, name] of [['personas', 'Personas'], ['dias', 'Días']]) cont.append(campo(name, input(draft[key] ?? 1, v => { draft[key] = v; recalcular(); }, { tipo: 'number', step: key === 'personas' ? 1 : 'any', nombre: name })));
      cont.append(el('small', `Tarifa diaria: ${clp(actual.tarifaDiaria)}. No se multiplica por la cantidad.`));
    } else cont.append(campo('Monto manual (CLP)', input(draft.monto ?? 0, v => { draft.monto = v; recalcular(); }, { tipo: 'number', step: 1, nombre: 'Monto manual' })));
    recalcular(); posicionar();
  };
  popover.append(el('h3', 'Mano de obra'), campo('Modo', select([['manual', 'Monto manual'], ['jornadas', 'Por jornadas']], draft.modo, v => { draft.modo = v; draft.personas ??= 1; draft.dias ??= 1; draft.monto ??= 0; controles(); }, 'Modo de mano de obra')), cont, preview,
    acciones(boton('Cancelar', () => { cerrarPopover(); anchor.focus(); }), boton('Aplicar', () => { if ([...popover.querySelectorAll('input')].some(n => !n.reportValidity())) return; p.manoObra = draft; actualizar(); cerrarPopover(); anchor.focus(); }, 'primary')));
  document.body.append(caja); controles(); posicionar();
  window.addEventListener('resize', posicionar);
  const observador = new ResizeObserver(posicionar); observador.observe(caja);
  caja.cleanup = () => { window.removeEventListener('resize', posicionar); observador.disconnect(); };
  caja.querySelector('select').focus();
}
async function guardarVersion() {
  if (!validarCampos()) return;
  let comentario = '';
  const control = campo('Comentario (opcional)', input('', v => comentario = v, { nombre: 'Comentario de versión' }));
  const ok = await pedir({ titulo: 'Guardar versión', texto: 'Se conservará una copia de este presupuesto y sus totales.', aceptar: 'Guardar versión', control });
  if (!ok || !validarCampos() || estadoGuardado() === 'otra-pestana') return;
  actual.versiones.push(crearVersion(actual, comentario)); persistir();
  if (estado.configuracion.respaldoAutomatico) descargarRespaldo(estado);
  avisar(`Versión ${actual.versiones.at(-1).n} guardada.${estado.configuracion.respaldoAutomatico ? ' Se solicitó la descarga del respaldo; revisa las descargas del navegador.' : ''}`);
}
function versiones() {
  const pane = abrirPanel('Versiones');
  if (!actual.versiones.length) { pane.append(el('p', 'Todavía no hay versiones. Guarda una versión para conservar el estado del presupuesto.'), boton('Guardar primera versión', async () => { await guardarVersion(); versiones(); }, 'primary')); return; }
  if (actual.versiones.length > 1) {
    const opciones = actual.versiones.map(v => [String(v.n), `Versión ${v.n}`]);
    let a = actual.versiones.at(-2).n, b = actual.versiones.at(-1).n;
    const out = el('div', '', 'diff');
    const mostrar = () => out.textContent = diff(actual.versiones.find(v => v.n === a), actual.versiones.find(v => v.n === b)).resumen;
    pane.append(el('h3', 'Comparar versiones'), acciones(campo('Desde', select(opciones, String(a), v => { a = Number(v); mostrar(); }, 'Versión inicial')), campo('Hasta', select(opciones, String(b), v => { b = Number(v); mostrar(); }, 'Versión final'))), out); mostrar();
  }
  for (const v of [...actual.versiones].reverse()) {
    const block = el('article', null, 'version'); block.append(el('h3', `v${v.n} · ${clp(v.totales.totalFinal)}`), el('p', new Date(v.fecha).toLocaleString('es-CL'), 'muted'));
    if (v.comentario) block.append(el('p', v.comentario));
    const details = el('details'), summary = el('summary', 'Resumen de cambios'); details.append(summary, el('div', actual.versiones.indexOf(v) > 0 ? diff(actual.versiones[actual.versiones.indexOf(v) - 1], v).resumen : 'Versión inicial.', 'diff')); block.append(details, boton('Restaurar', async () => {
      if (await pedir({ titulo: `Restaurar versión ${v.n}`, texto: 'Se reemplazará el borrador actual. Todas las versiones guardadas se conservarán.', aceptar: 'Restaurar versión' })) { Object.assign(actual, restaurar(actual, v)); persistir(); editor(); avisar(`Versión ${v.n} restaurada al borrador. Se conservó todo el historial.`); }
    })); pane.append(block);
  }
}
async function aplicarMaterial(p, material, nombre, unidad, editarRendimiento = false) {
  const m = structuredClone(material); let rendimiento = m.rendimiento || 1;
  if (m.origen === 'sodimac') {
    if (!editarRendimiento && ['GL', 'un'].includes(p.unidad)) rendimiento = 1;
    else {
    const control = campo(`Una ${m.sodimac.unidadVenta} rinde (en ${p.unidad})`, input(rendimiento, v => rendimiento = v, { tipo: 'number', min: 0.000001, nombre: 'Rendimiento' }));
    control.querySelector('input').required = true;
    if (!await pedir({ titulo: 'Rendimiento del material', texto: `${nombre}. Precio por ${m.sodimac.unidadVenta}: ${clp(m.sodimac.precioBruto)} con IVA. Indica cuántas unidades de la partida cubre una unidad de venta. Se aplicará el precio sugerido.`, control, aceptar: 'Usar material' })) return;
    }
    m.rendimiento = rendimiento; m.valorUnitario = sugerirValor(m.sodimac.precioBruto, rendimiento, actual.iva.desglosar); m.ajustadoManual = false;
  } else if (unidad && unidad !== p.unidad) {
    if (!await pedir({ titulo: 'Unidad del material', texto: `Este precio manual está guardado por ${unidad}. La partida cambiará de ${p.unidad} a ${unidad}; revisa su cantidad.`, aceptar: 'Usar material' })) return;
    p.unidad = unidad;
  }
  p.material = m; if (!p.designacion) p.designacion = nombre;
  recordarMaterial(estado, p); persistir(); editor();
}
function selectorMaterial(p) {
  const pane = abrirPanel('Buscar material');
  let tab = WORKER_URL ? 'sodimac' : 'propios', consulta = '', timer, controller, serial = 0;
  pane.cleanup = () => { clearTimeout(timer); controller?.abort(); serial++; };
  const tabs = el('div', null, 'actions tabs'), resultados = el('div'); resultados.setAttribute('aria-live', 'polite');
  const buscador = input('', v => { consulta = v; clearTimeout(timer); controller?.abort(); serial++; timer = setTimeout(ejecutar, 600); }, { nombre: 'Buscar materiales por nombre' }); buscador.placeholder = 'Nombre o descripción del material';
  const renderResultado = (nombre, marca, precio, unidadVenta, url, elegir, fecha) => {
    const r = el('article', null, 'result'); r.append(el('h3', nombre), el('p', `${marca ? marca + ' · ' : ''}${clp(precio)} / ${unidadVenta}`));
    if (fecha) r.append(el('small', `Referencial Sodimac al ${fechaChilena(fecha)}`));
    const acts = acciones(boton('Usar material', elegir, 'primary')); const href = urlSegura(url);
    if (href) { const a = el('a', 'Ver en Sodimac'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; acts.append(a); }
    r.append(acts); resultados.append(r);
  };
  async function ejecutar() {
    clearTimeout(timer); controller?.abort(); const turno = ++serial; resultados.replaceChildren();
    if (tab === 'propios') {
      const encontrados = estado.materiales.filter(m => m.nombre.toLocaleLowerCase('es-CL').includes(consulta.toLocaleLowerCase('es-CL')));
      if (!encontrados.length) resultados.append(el('p', 'No hay materiales guardados que coincidan. Al usar un material, quedará disponible aquí.'));
      for (const m of encontrados) renderResultado(m.nombre, '', m.material.valorUnitario, m.unidad, m.url, () => aplicarMaterial(p, m.material, m.nombre, m.unidad), m.material.sodimac?.fecha);
      return;
    }
    if (consulta.trim().length < 3 && WORKER_URL) { resultados.append(el('p', 'Escribe al menos 3 caracteres para buscar.')); return; }
    resultados.append(el('p', 'Buscando materiales…')); controller = new AbortController();
    try {
      const data = await buscarMateriales(consulta, { signal: controller.signal });
      if (turno !== serial || !pane.isConnected) return;
      resultados.replaceChildren();
      if (!data.resultados.length) resultados.append(el('p', 'No encontramos materiales. Prueba otra descripción o ingresa el precio manual.'));
      for (const r of data.resultados) renderResultado(r.nombre, r.marca, r.precio, r.unidadVenta, r.url, () => aplicarMaterial(p, { origen: 'sodimac', valorUnitario: 0, rendimiento: 1, sodimac: { sku: r.sku, nombre: r.nombre, marca: r.marca || '', precioBruto: r.precio, unidadVenta: r.unidadVenta, url: r.url || '', fecha: data.fecha } }, r.nombre), data.fecha);
    } catch (error) { if (turno === serial && pane.isConnected) resultados.replaceChildren(el('p', error.message, 'warning')); }
  }
  const botones = [['sodimac', 'Sodimac'], ['propios', 'Mis materiales']].map(([id, label]) => {
    const b = boton(label, () => { tab = id; marcar(); ejecutar(); }); b.dataset.tab = id; return b;
  });
  function marcar() { for (const b of botones) b.setAttribute('aria-pressed', String(b.dataset.tab === tab)); }
  tabs.append(...botones); marcar();
  const search = el('div', null, 'search-row'); search.append(buscador, boton('Buscar', ejecutar));
  evento(buscador, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ejecutar(); } });
  pane.append(el('p', 'Elige un material o cierra este panel para ingresar el precio directamente en la planilla.', 'muted'), tabs, search);
  if (!WORKER_URL) pane.append(el('p', 'El buscador Sodimac aún no está configurado. Mis materiales y los precios manuales siguen disponibles.', 'warning'));
  pane.append(resultados); ejecutar(); buscador.focus();
}
async function logo(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Elige un logo PNG, JPG o WebP.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const escala = Math.min(1, 400 / img.naturalWidth), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala)); canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    estado.empresa.logoDataUrl = canvas.toDataURL('image/png'); persistir(); configuracion();
  } finally { URL.revokeObjectURL(url); }
}
async function abrirImportacion() {
  const control = el('div'), file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.required = true;
  let modo = 'fusionar'; control.append(campo('Archivo de respaldo (.json)', file), campo('Cómo importar', select([['fusionar', 'Fusionar con los datos actuales'], ['reemplazar', 'Reemplazar todos los datos']], modo, v => modo = v, 'Modo de importación')));
  const ok = await pedir({ titulo: 'Importar respaldo', texto: 'Fusionar conserva la empresa y configuración actuales; omite las cotizaciones idénticas y copia las distintas con ID repetido. Reemplazar elimina los datos actuales.', control, aceptar: 'Revisar respaldo' });
  if (!ok) return;
  const contenido = await file.files[0].text(); leerRespaldo(contenido);
  if (modo === 'reemplazar' && !await pedir({ titulo: 'Reemplazar datos locales', texto: 'Se reemplazarán empresa, configuración, cotizaciones, versiones y materiales. Descarga un respaldo primero si quieres conservar los datos actuales.', aceptar: 'Reemplazar datos', peligro: true })) return;
  estado = importar(contenido, estado, modo); persistir(); lista(); avisar('Respaldo importado correctamente.');
}
function configuracion() {
  actual = null; preparar(); const page = el('div', null, 'settings');
  page.append(el('h1', 'Configuración'), el('p', 'Los datos de empresa se guardan solo en este navegador y se incluyen en los PDF y respaldos que descargues.', 'muted'));
  const empresa = el('section', null, 'panel'), fields = el('div', null, 'fields'); empresa.append(el('h2', 'Datos de empresa'));
  for (const [key, label] of [['nombre', 'Nombre de empresa'], ['rut', 'RUT'], ['contacto', 'Contacto'], ['telefono', 'Teléfono']]) fields.append(campo(label, input(estado.empresa[key], v => { estado.empresa[key] = v; persistir(); }, { nombre: label })));
  const subir = el('input'); subir.type = 'file'; subir.accept = 'image/png,image/jpeg,image/webp'; evento(subir, 'change', () => logo(subir.files[0])); fields.append(campo('Logo (PNG, JPG o WebP)', subir)); empresa.append(fields);
  if (estado.empresa.logoDataUrl) { const img = el('img', null, 'logo-preview'); img.src = estado.empresa.logoDataUrl; img.alt = 'Logo de la empresa'; empresa.append(img, boton('Quitar logo', () => { estado.empresa.logoDataUrl = ''; persistir(); configuracion(); })); }
  const defaults = el('section', null, 'panel'), defs = el('div', null, 'fields'); defaults.append(el('h2', 'Valores para nuevas cotizaciones'), el('p', 'Estos valores no modifican los presupuestos existentes.', 'muted'));
  for (const [key, label] of [['tarifaDiaria', 'Tarifa diaria (CLP)'], ['ggPorcentaje', 'Gastos generales y utilidad (%)']]) defs.append(campo(label, input(estado.configuracion[key], v => { estado.configuracion[key] = v; persistir(); }, { tipo: 'number', nombre: label, step: key === 'tarifaDiaria' ? 1 : 'any' })));
  defs.append(campo('Nota al pie por defecto', area(estado.configuracion.notaPie, v => { estado.configuracion.notaPie = v; persistir(); }, 'Nota al pie por defecto'), 'wide')); defaults.append(defs);
  const backup = el('section', null, 'panel'); backup.append(el('h2', 'Respaldos'), check('Descargar respaldo al guardar cada versión', estado.configuracion.respaldoAutomatico, v => { estado.configuracion.respaldoAutomatico = v; persistir(); }), el('p', 'El respaldo incluye todos los datos de este navegador. Conserva el archivo en un lugar privado. El navegador puede pedir autorización para descargas automáticas.', 'muted'), acciones(boton('Exportar respaldo', () => descargarRespaldo(estado), 'primary'), boton('Importar respaldo', abrirImportacion)));
  page.append(empresa, defaults, backup, boton('Volver a cotizaciones', lista)); main.append(page);
}
evento(document.querySelector('#ir-lista'), 'click', lista);
evento(document.querySelector('.brand'), 'click', e => { e.preventDefault(); lista(); });
evento(document.querySelector('#configuracion'), 'click', configuracion);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !dialogo.open) { if (popover) cerrarPopover(); else cerrarPanel(); }
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.planilla input, .planilla textarea, .planilla select')) {
    e.preventDefault(); const campos = [...main.querySelectorAll('.planilla input, .planilla textarea, .planilla select, .planilla button')]; const i = campos.indexOf(e.target); campos[i + 1]?.focus();
  }
});
lista(); avisoGuardado(inicial.aviso);
