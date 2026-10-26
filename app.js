import { init, subscribe, state, db } from './data.js';
import * as C from './calc.js';
import { money, short, pct, esc, icon, sheet, toast, confirmar, moneyInput, parseMonto, fmtInput } from './ui.js';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const ui = { route: (location.hash.slice(1) || 'inicio'), ym: C.ymOf(), filtro: 'todos' };
let pendingRender = false;

// v3: animación de entrada. Se retira cuando terminó (≈1,4 s) y los datos están listos (máx. 4 s).
(() => {
  const el = document.getElementById('intro'); if (!el) return;
  const t0 = Date.now(); let hecho = false;
  const quitar = () => { if (hecho) return; hecho = true; el.classList.add('out'); setTimeout(() => el.remove(), 400); };
  const revisar = () => { if (state.ready && Date.now() - t0 >= 1400) quitar(); };
  const iv = setInterval(() => { revisar(); if (hecho) clearInterval(iv); }, 100);
  setTimeout(() => { quitar(); clearInterval(iv); }, 4000);
})();

const hoy = () => new Date().toLocaleDateString('en-CA');
const yo = () => state.user?.uid;
const novSinLeer = () => state.novedades.filter((n) => n.ts > (state.perfil?.vistoHasta || 0) && n.autor !== yo()).length;
const alertas = () => (state.config ? C.alertasPago(state) : []);
const sinLeer = () => novSinLeer() + alertas().length;
const catDe = (id) => C.categorias(state).find((c) => c.id === id) || { nombre: 'Otros', color: '#8A8F98' };
const nombreConcepto = (id) => C.concepto(state, id)?.nombre || 'Sin concepto';

window.addEventListener('hashchange', () => { ui.route = location.hash.slice(1) || 'inicio'; render(); window.scrollTo(0, 0); });
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender && !editing()) render(); }, 50));
const editing = () => document.activeElement?.matches?.('#app input, #app select, #app textarea');
const go = (r) => { location.hash = r; };

// ------------------------------------------------------------------ shell
function render() {
  if (editing()) { pendingRender = true; return; }
  pendingRender = false;
  if (!state.ready) { app.innerHTML = `<div class="splash"><div class="logo-mark">${logo(56)}</div></div>`; return; }
  if (!state.user || (state.authError && !state.config)) { app.innerHTML = viewLogin(); bindLogin(); return; }
  if (!state.config) { app.innerHTML = viewVacio(); bindVacio(); return; }
  const views = { inicio: viewInicio, plan: viewPlan, movs: viewMovs, deudas: viewDeudas, mas: viewMas, reporte: viewReporte, novedades: viewNovedades, conceptos: viewConceptos, metas: viewMetas };
  const v = views[ui.route] || viewInicio;
  const tab = ['inicio', 'plan', 'movs', 'deudas'].includes(ui.route) ? ui.route : 'mas';
  const y = render.last === ui.route + ui.ym ? window.scrollY : 0; render.last = ui.route + ui.ym;
  app.innerHTML = `<main class="view view-${ui.route}">${v()}</main>${ui.route === 'reporte' ? '' : navBar(tab)}${['inicio', 'movs'].includes(ui.route) ? `<button class="fab" id="fab" aria-label="Registrar movimiento">${icon('plus', 26)}</button>` : ''}`;
  $('#fab')?.addEventListener('click', () => movSheet());
  bind[ui.route]?.();
  bindComunes();
  if (y) window.scrollTo(0, y);
}

const logo = (s = 32) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#1F5F4F"/><path d="M15 36c4 9 30 9 34 0" fill="none" stroke="#F3EFE6" stroke-width="4" stroke-linecap="round"/><path d="M19 30c5 5 21 5 26 0" fill="none" stroke="#E7C873" stroke-width="3.4" stroke-linecap="round"/><circle cx="27" cy="25" r="4.2" fill="#F3EFE6"/><circle cx="37" cy="25" r="4.2" fill="#F3EFE6"/></svg>`;

function navBar(active) {
  const it = [['inicio', 'home', 'Inicio'], ['plan', 'plan', 'Plan'], ['movs', 'list', 'Movimientos'], ['deudas', 'debt', 'Deudas'], ['mas', 'more', 'Más']];
  return `<nav class="tabbar">${it.map(([r, i, t]) => `<a href="#${r}" class="${active === r ? 'on' : ''}" ${active === r ? 'aria-current="page"' : ''}>${icon(i, 22)}<span>${t}</span>${r === 'mas' && sinLeer() ? '<i class="dot"></i>' : ''}</a>`).join('')}</nav>`;
}

function header(title, { back, month = false, extra = '' } = {}) {
  const n = sinLeer();
  return `<header class="top">
    ${back ? `<a class="icon-btn" href="#${back}" aria-label="Volver">${icon('left')}</a>` : ''}
    <h1>${title}</h1>
    <div class="top-act">${extra}<a class="icon-btn bell" href="#novedades" aria-label="Novedades${n ? `, ${n} sin leer` : ''}">${icon('bell')}${n ? `<b>${n}</b>` : ''}</a></div>
  </header>${month ? monthNav() : ''}`;
}
function monthNav() {
  return `<div class="month-nav"><button class="icon-btn" data-mes="-1" aria-label="Mes anterior">${icon('left')}</button>
    <button class="month-label" data-mes="0">${C.mesLargo(ui.ym)}${ui.ym === C.ymOf() ? '<small>Mes actual</small>' : ''}</button>
    <button class="icon-btn" data-mes="1" aria-label="Mes siguiente">${icon('right')}</button></div>`;
}
function bindComunes() {
  app.querySelectorAll('[data-mes]').forEach((b) => b.onclick = () => { const d = +b.dataset.mes; ui.ym = d ? C.addMonths(ui.ym, d) : C.ymOf(); render(); });
  app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
}

function bar(real, plan, color) {
  const p = plan ? Math.min(1, real / plan) : real ? 1 : 0;
  const over = plan && real > plan;
  return `<div class="bar ${over ? 'over' : ''}" role="img" aria-label="${pct(plan ? real / plan : 0)} del plan"><span style="width:${p * 100}%;background:${over ? 'var(--bad)' : color}"></span></div>`;
}

// ------------------------------------------------------------------ login
function viewLogin() {
  return `<section class="login">
    <div class="login-mark">${logo(72)}</div>
    <h1 class="brand">Nido</h1>
    <p class="muted">Finanzas del hogar · ${esc(state.config?.hogar || 'Rojas Álvarez')}</p>
    ${state.authError ? `<p class="err" role="alert">${icon('alert', 18)} ${esc(state.authError)}</p>` : ''}
    <button class="btn primary big" id="login"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> ${state.user ? 'Usar otra cuenta' : 'Entrar con Google'}</button>
    <p class="fine">${icon('shield', 14)} Solo las cuentas del hogar pueden entrar.</p>
  </section>`;
}
function bindLogin() {
  $('#login').onclick = async () => {
    try { if (state.user) await db.logout(); await db.login(); } catch (e) { state.authError = e.message; render(); }
  };
}

// Base vacía: carga inicial desde el archivo de datos (se usa una sola vez)
function viewVacio() {
  return `<section class="login"><div class="login-mark">${logo(56)}</div><h1 class="brand" style="font-size:28px">Bienvenidos a Nido</h1>
    <p class="muted">El hogar aún no tiene datos. Carga el archivo <b>nido-datos.json</b> para empezar.</p>
    <label class="btn primary big" style="background:var(--brand);color:#fff">Cargar datos iniciales<input type="file" id="seed" accept=".json,application/json" hidden></label>
    <p class="fine">${esc(state.user.email)}</p></section>`;
}
function bindVacio() {
  $('#seed').onchange = async (e) => {
    try { const seed = JSON.parse(await e.target.files[0].text()); const n = await db.importar(seed); toast(`Datos cargados (${n} registros)`); }
    catch (err) { toast('No se pudo cargar: ' + err.message); }
  };
}

// ------------------------------------------------------------------ inicio
function viewInicio() {
  const r = C.resumenMes(state, ui.ym);
  const f = C.fondo(state), d = C.deudas(state);
  const nombre = (state.user.displayName || '').split(' ')[0];
  const avance = r.totalPlan ? r.totalReal / r.totalPlan : 0;
  const alertas = Object.entries(r.real).map(([id, v]) => ({ id, v, p: +r.plan[id] || 0 })).filter((x) => x.v > x.p).sort((a, b) => (b.v - b.p) - (a.v - a.p)).slice(0, 3);
  const recientes = [...r.movs].sort((a, b) => (b.fecha + b.ts).localeCompare(a.fecha + a.ts)).slice(0, 4);
  return `${header(`Hola, ${esc(nombre)}`, { month: true, extra: `<a class="icon-btn" href="#reporte" aria-label="Reporte del mes">${icon('report')}</a>` })}
  <section class="hero card">
    <p class="eyebrow">Disponible del mes</p>
    <p class="hero-num ${r.disponible < 0 ? 'neg' : ''}">${money(r.disponible)}</p>
    <div class="hero-grid">
      <div><span>Ingresos</span><b>${money(r.ingresoReal)}</b></div>
      <div><span>Gastado</span><b>${money(r.totalReal)}</b></div>
      <div><span>Planeado</span><b>${money(r.totalPlan)}</b></div>
    </div>
    <div class="meter"><span style="width:${Math.min(100, avance * 100)}%"></span></div>
    <p class="meter-cap">${pct(avance)} del plan ejecutado · balance planeado ${money(r.balancePlan)}</p>
  </section>

  ${proximosPagos()}
  <h2 class="sec">Plan vs. real</h2>
  <section class="card cats">
    ${C.categorias(state).map((c) => { const x = r.porCat[c.id] || { plan: 0, real: 0 }; return `
      <div class="cat-row">
        <div class="cat-top"><span class="chip-dot" style="background:${c.color}"></span><b>${esc(c.nombre)}</b><span class="num">${short(x.real)} <small>/ ${short(x.plan)}</small></span></div>
        ${bar(x.real, x.plan, c.color)}
      </div>`; }).join('')}
  </section>

  ${alertas.length ? `<h2 class="sec">Por encima del plan</h2><section class="card list">${alertas.map((a) => `
    <div class="li"><span class="li-ic warn">${icon('up', 16)}</span><div class="li-main"><b>${esc(nombreConcepto(a.id))}</b><small>Plan ${money(a.p)}</small></div><span class="num bad">+${money(a.v - a.p)}</span></div>`).join('')}</section>` : ''}

  <div class="duo">
    <button class="card mini" data-go="deudas"><span class="eyebrow">${icon('piggy', 16)} Fondo</span><b>${money(f.saldo)}</b>
      <div class="meter thin"><span style="width:${f.niveles[0].pct * 100}%"></span></div><small>${pct(f.niveles[0].pct)} del Nivel 1</small></button>
    <button class="card mini" data-go="deudas"><span class="eyebrow">${icon('debt', 16)} Deudas</span><b>${money(d.total)}</b>
      <small class="sem ${d.semaforo.cls}">● ${d.semaforo.txt} · ${pct(d.nivel)} en cuotas</small></button>
  </div>

  <h2 class="sec">Últimos movimientos <a href="#movs" class="link">Ver todos</a></h2>
  <section class="card list">${recientes.length ? recientes.map(movItem).join('') : `<p class="empty">Aún no hay movimientos este mes. Toca <b>+</b> para registrar el primero.</p>`}</section>`;
}
const bind = {};
bind.inicio = () => { bindMovItems(); bindPagos(); };

function movItem(m) {
  const ing = m.tipo === 'ingreso';
  const c = ing ? { color: 'var(--ok)' } : catDe(C.concepto(state, m.conceptoId)?.categoria);
  const d = new Date(m.fecha + 'T12:00');
  return `<button class="li mov" data-mov="${m.id}">
    <span class="li-ic" style="--c:${c.color}">${ing ? icon('down', 16) : `<i class="chip-dot" style="background:${c.color}"></i>`}</span>
    <div class="li-main"><b>${esc(ing ? (m.nota || 'Ingreso extra') : nombreConcepto(m.conceptoId))}</b>
    <small>${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}${m.autor && m.autor !== 'Excel' ? ` · ${esc(m.autor)}` : ''}${!ing && m.nota ? ` · ${esc(m.nota)}` : ''}</small></div>
    <span class="num ${ing ? 'ok' : ''}">${ing ? '+' : ''}${money(m.monto)}</span></button>`;
}
function bindMovItems() { app.querySelectorAll('[data-mov]').forEach((b) => b.onclick = () => movSheet(state.movimientos.find((m) => m.id === b.dataset.mov))); }

// ------------------------------------------------------------------ registrar movimiento
function movSheet(mov, preset = {}) {
  const nuevo = !mov;
  mov = mov || { tipo: 'gasto', fecha: ui.ym === C.ymOf() ? hoy() : `${ui.ym}-01`, monto: 0, conceptoId: '', ...preset };
  const cats = C.categorias(state);
  const opts = cats.map((c) => `<optgroup label="${esc(c.nombre)}">${C.conceptosActivos(state).filter((x) => x.categoria === c.id).map((x) => `<option value="${x.id}" ${x.id === mov.conceptoId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</optgroup>`).join('');
  sheet(`<h3 class="sheet-title">${nuevo ? 'Registrar' : 'Editar movimiento'}</h3>
    <div class="seg" role="tablist"><button role="tab" data-t="gasto" class="${mov.tipo === 'gasto' ? 'on' : ''}">Gasto o pago</button><button role="tab" data-t="ingreso" class="${mov.tipo === 'ingreso' ? 'on' : ''}">Ingreso extra</button></div>
    <label class="amount"><span>$</span><input id="m-monto" inputmode="numeric" autocomplete="off" placeholder="0" value="${fmtInput(mov.monto)}" aria-label="Valor"></label>
    <div class="f only-gasto"><label for="m-con">Concepto</label><select id="m-con"><option value="">Elige un concepto…</option>${opts}</select><small id="m-hint" class="hint"></small></div>
    <div class="f"><label for="m-nota" id="m-nota-l">Nota (opcional)</label><input id="m-nota" value="${esc(mov.nota && mov.nota !== 'Importado del Excel' ? mov.nota : mov.nota || '')}" placeholder="Ej: Éxito, quincena…"></div>
    <div class="f"><label for="m-fecha">Fecha</label><input id="m-fecha" type="date" value="${mov.fecha}"></div>
    <div class="row-btns">${nuevo ? '<button class="btn ghost" data-close>Cancelar</button>' : `<button class="btn ghost danger-t" id="m-del">${icon('trash', 18)} Eliminar</button>`}<button class="btn primary" id="m-ok">${icon('check', 18)} Guardar</button></div>`,
  { onMount: (el, close) => {
    let tipo = mov.tipo;
    const monto = $('#m-monto', el), con = $('#m-con', el), hint = $('#m-hint', el);
    moneyInput(monto);
    const setTipo = (t) => { tipo = t; el.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); el.classList.toggle('is-ingreso', t === 'ingreso'); $('#m-nota-l', el).textContent = t === 'ingreso' ? 'Descripción' : 'Nota (opcional)'; $('#m-nota', el).placeholder = t === 'ingreso' ? 'Ej: Prima, cesantías, bono…' : 'Ej: Éxito, quincena…'; };
    el.querySelectorAll('.seg button').forEach((b) => b.onclick = () => setTipo(b.dataset.t));
    setTipo(tipo);
    const upHint = () => {
      const id = con.value; if (!id) { hint.textContent = ''; return; }
      const ym = ($('#m-fecha', el).value || hoy()).slice(0, 7); const r = C.resumenMes(state, ym);
      const p = +r.plan[id] || 0, v = (r.real[id] || 0) - (!nuevo && mov.conceptoId === id && mov.mes === ym ? mov.monto : 0);
      hint.innerHTML = `Plan ${C.mesCorto(ym)}: <b>${money(p)}</b> · llevan <b>${money(v)}</b>${p ? ` · quedan <b>${money(p - v)}</b>` : ''}`;
    };
    con.onchange = upHint; $('#m-fecha', el).onchange = upHint; upHint();
    if (nuevo) setTimeout(() => monto.focus(), 250);
    $('#m-ok', el).onclick = async () => {
      const v = parseMonto(monto.value), fecha = $('#m-fecha', el).value || hoy(), nota = $('#m-nota', el).value.trim();
      if (!v) { monto.focus(); toast('Escribe el valor'); return; }
      if (tipo === 'gasto' && !con.value) { con.focus(); toast('Elige el concepto'); return; }
      const data = { ...(nuevo ? {} : { id: mov.id, ts: mov.ts, autor: mov.autor }), tipo, monto: v, fecha, mes: fecha.slice(0, 7), nota, conceptoId: tipo === 'gasto' ? con.value : '' };
      close();
      await db.saveMov(data);
      const que = tipo === 'gasto' ? nombreConcepto(con.value) : (nota || 'ingreso extra');
      db.novedad(`${nuevo ? 'registró' : 'editó'} ${money(v)} en ${que}${tipo === 'ingreso' ? ' (ingreso)' : ''}`);
      toast(nuevo ? 'Movimiento guardado' : 'Cambios guardados');
    };
    $('#m-del', el) && ($('#m-del', el).onclick = async () => {
      close();
      if (!(await confirmar('¿Eliminar este movimiento?'))) return;
      await db.delMov(mov.id);
      db.novedad(`eliminó ${money(mov.monto)} de ${mov.tipo === 'gasto' ? nombreConcepto(mov.conceptoId) : (mov.nota || 'ingresos')}`);
      toast('Movimiento eliminado');
    });
  } });
}

// ------------------------------------------------------------------ fechas de pago (v2)
const fCorta = (f) => new Date(f + 'T12:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
function textoEstado(e) {
  if (e.pagado) return e.manual && e.real < e.plan ? 'Pagado (marcado a mano)' : 'Pagado';
  if (!e.fecha) return '';
  if (e.dias === null) return `Paga el ${fCorta(e.fecha)}`;
  if (e.dias < 0) return `Venció el ${fCorta(e.fecha)} · hace ${-e.dias} día${e.dias === -1 ? '' : 's'}`;
  if (e.dias === 0) return 'Vence hoy';
  if (e.dias === 1) return 'Vence mañana';
  return `Vence el ${fCorta(e.fecha)} · en ${e.dias} días`;
}
const dotEstado = (e) => (e.color ? `<i class="sdot ${e.color}" aria-hidden="true"></i>` : '');
function planRow(x, r) {
  const e = C.estadoPago(state, ui.ym, x.id, r);
  const plan = +r.plan[x.id] || 0;
  const linea = [e.fecha || e.pagado ? dotEstado(e) + esc(textoEstado(e)) : plan ? '<span class="add-date">+ fecha de pago</span>' : '',
    r.real[x.id] ? `real ${money(r.real[x.id])}` : ''].filter(Boolean).join(' · ');
  return `<div class="pl-row ${e.color ? 'st-' + e.color : ''}">
    <button class="pl-name" data-pago="${x.id}" aria-label="${esc(x.nombre)}: fecha de pago y estado"><b>${esc(x.nombre)}</b>${linea ? `<small>${linea}</small>` : ''}</button>
    <input inputmode="numeric" data-plan="${x.id}" value="${fmtInput(plan)}" placeholder="0" aria-label="Plan ${esc(x.nombre)}"></div>`;
}
function alertaItem(a) {
  return `<button class="li alerta st-${a.color}" data-pagar="${a.id}" data-ym="${a.ym}">
    <span class="li-ic" style="--c:${a.color === 'rojo' ? 'var(--s-rojo)' : a.color === 'amarillo' ? 'var(--s-amarillo)' : 'var(--s-verde)'}">${icon(a.color === 'verde' ? 'bell' : 'alert', 16)}</span>
    <div class="li-main"><b>${esc(a.nombre)}</b><small>${dotEstado(a)}${esc(textoEstado(a))}</small></div>
    <span class="num">${money(a.falta)}</span></button>`;
}
function proximosPagos() {
  if (ui.ym !== C.ymOf()) return '';
  const r = C.resumenMes(state, ui.ym);
  const todos = C.conceptosActivos(state).map((c) => ({ ...C.estadoPago(state, ui.ym, c.id, r), nombre: c.nombre, ym: ui.ym })).filter((e) => e.fecha && e.plan > 0);
  const al = alertas();
  const verdes = todos.filter((e) => e.color === 'verde').sort((a, b) => a.dias - b.dias).slice(0, Math.max(0, 4 - al.length));
  const pagados = todos.filter((e) => e.pagado).length;
  if (!todos.length) return '';
  return `<h2 class="sec">Próximos pagos <span class="sec-num">${pagados} de ${todos.length} pagados</span></h2>
  <section class="card list">${[...al, ...verdes].map(alertaItem).join('') || '<p class="empty">Todo al día. No hay pagos próximos este mes.</p>'}</section>`;
}
function bindPagos() {
  app.querySelectorAll('[data-pagar]').forEach((b) => b.onclick = () => {
    const ym = b.dataset.ym, id = b.dataset.pagar, e = C.estadoPago(state, ym, id);
    movSheet(null, { conceptoId: id, monto: e.falta || e.plan, fecha: ym === C.ymOf() ? hoy() : C.fechaPago(state, ym, id) || `${ym}-01` });
  });
}
function pagoSheet(id, ym) {
  const c = C.concepto(state, id), mes = state.meses[ym] || {};
  const e = C.estadoPago(state, ym, id);
  const diaMes = mes.diaPago?.[id];
  sheet(`<h3 class="sheet-title">${esc(c.nombre)}</h3>
    <p class="hint" style="margin:-8px 0 14px">${e.fecha || e.pagado ? dotEstado(e) + esc(textoEstado(e)) : 'Sin fecha de pago'}</p>
    <div class="f"><label for="p-dia">Día de pago (se repite cada mes)</label><input id="p-dia" type="number" inputmode="numeric" min="1" max="31" placeholder="Ej: 5" value="${c.diaPago || ''}"></div>
    <div class="f"><label for="p-mes">Solo en ${C.mesLargo(ym)} (opcional)</label><input id="p-mes" type="number" inputmode="numeric" min="1" max="31" placeholder="Igual que siempre" value="${diaMes ?? ''}"><small class="hint">Úsalo si este mes la fecha cambia.</small></div>
    <label class="check"><input type="checkbox" id="p-pag" ${mes.pagado?.[id] ? 'checked' : ''}><span>Marcar como pagado en ${C.mesLargo(ym)}<small>Se marca solo cuando lo registrado cubre lo planeado.</small></span></label>
    <div class="row-btns"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="p-ok">${icon('check', 18)} Guardar</button></div>`,
  { onMount: (el, close) => {
    $('#p-ok', el).onclick = async () => {
      const norm = (v) => { const n = parseInt(v, 10); return n >= 1 && n <= 31 ? n : null; };
      const dia = norm($('#p-dia', el).value), dm = norm($('#p-mes', el).value), pag = $('#p-pag', el).checked;
      close();
      const cambios = [];
      if ((c.diaPago || null) !== dia) { await db.saveConcepto({ id, diaPago: dia }); cambios.push(dia ? `día de pago ${dia}` : 'sin fecha de pago'); }
      if ((diaMes ?? null) !== dm) { await db.setMes(ym, { diaPago: { [id]: dm } }); if (dm) cambios.push(`día ${dm} solo en ${C.mesLargo(ym)}`); }
      if (!!mes.pagado?.[id] !== pag) { await db.setMes(ym, { pagado: { [id]: pag } }); cambios.push(pag ? `marcado como pagado en ${C.mesLargo(ym)}` : `desmarcado como pagado en ${C.mesLargo(ym)}`); }
      if (cambios.length) { db.novedad(`ajustó ${c.nombre}: ${cambios.join(', ')}`); toast('Guardado'); }
    };
  } });
}

// ------------------------------------------------------------------ plan
function viewPlan() {
  const r = C.resumenMes(state, ui.ym);
  const ing = r.mes.ingresos || {};
  const cats = C.categorias(state);
  const obj = state.config.objetivos || {};
  return `${header('Plan del mes', { month: true })}
  <section class="sum-strip card">
    <div><span>Ingresos</span><b>${short(r.ingresoPlan)}</b></div>
    <div><span>Egresos</span><b>${short(r.totalPlan)}</b></div>
    <div><span>Balance</span><b class="${r.balancePlan < 0 ? 'bad' : 'ok'}">${short(r.balancePlan)}</b></div>
  </section>
  ${r.balancePlan < 0 ? `<p class="notice bad">${icon('alert', 16)} El plan supera los ingresos en ${money(-r.balancePlan)}.</p>` : ''}

  <h2 class="sec">Ingresos</h2>
  <section class="card form-list">
    ${incomeRow('daniel', 'Ingreso Daniel', ing.daniel)}
    ${incomeRow('angye', 'Ingreso Angye', ing.angye)}
    <label class="pl-row${+r.mes.extraPlan > 0 ? ' st-ingreso' : ''}"><span>Extra esperado <small>prima, cesantías</small></span><input inputmode="numeric" data-extra value="${fmtInput(r.mes.extraPlan)}" placeholder="0"></label>
    ${r.extraReal ? `<p class="pl-foot">Extras recibidos: <b>${money(r.extraReal)}</b></p>` : ''}
  </section>

  ${cats.map((c) => { const cs = C.conceptosActivos(state).filter((x) => x.categoria === c.id); const tot = r.porCat[c.id]?.plan || 0; return `
  <h2 class="sec"><span class="chip-dot" style="background:${c.color}"></span>${esc(c.nombre)} <span class="sec-num">${money(tot)} · ${pct(r.totalPlan ? tot / r.totalPlan : 0)}${obj[c.id] != null ? ` <small>(meta ${pct(obj[c.id])})</small>` : ''}</span></h2>
  <section class="card form-list">${cs.map((x) => `
    ${planRow(x, r)}`).join('') || '<p class="empty">Sin conceptos</p>'}
  </section>`; }).join('')}
  <div class="actions">
    <button class="btn ghost" id="copiar">${icon('copy', 18)} Copiar plan de ${C.mesCorto(C.addMonths(ui.ym, -1))}</button>
    <button class="btn ghost" data-go="conceptos">${icon('tag', 18)} Conceptos y categorías</button>
  </div>`;
}
const incomeRow = (k, label, v) => `<label class="pl-row${+v > 0 ? ' st-ingreso' : ''}"><span>${label}</span><input inputmode="numeric" data-ing="${k}" value="${fmtInput(+v || 0)}" placeholder="0"></label>`;
const avisoPlan = {};
function notiPlan(txt) { // una novedad por mes cada 10 minutos, para no llenar el historial
  const k = ui.ym + txt; if (avisoPlan[k] && Date.now() - avisoPlan[k] < 6e5) return;
  avisoPlan[k] = Date.now(); db.novedad(txt);
}
bind.plan = () => {
  const ym = ui.ym;
  app.querySelectorAll('[data-pago]').forEach((b) => b.onclick = () => pagoSheet(b.dataset.pago, ym));
  app.querySelectorAll('[data-plan],[data-ing],[data-extra]').forEach((inp) => {
    moneyInput(inp);
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('change', async () => {
      const v = parseMonto(inp.value);
      if (inp.dataset.plan) { await db.setMes(ym, { plan: { [inp.dataset.plan]: v } }); notiPlan(`actualizó el plan de ${C.mesLargo(ym)}`); }
      else if (inp.dataset.ing) { await db.setMes(ym, { ingresos: { [inp.dataset.ing]: v } }); db.novedad(`ajustó ${inp.dataset.ing === 'daniel' ? 'el ingreso de Daniel' : 'el ingreso de Angye'} de ${C.mesLargo(ym)} a ${money(v)}`); }
      else { await db.setMes(ym, { extraPlan: v }); notiPlan(`actualizó el plan de ${C.mesLargo(ym)}`); }
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const all = [...app.querySelectorAll('.pl-row input')]; all[all.indexOf(inp) + 1]?.focus(); } });
  });
  $('#copiar').onclick = async () => {
    const prev = C.addMonths(ym, -1), src = state.meses[prev];
    if (!src) { toast('El mes anterior no tiene plan'); return; }
    if (!(await confirmar(`¿Reemplazar el plan de ${C.mesLargo(ym)} con el de ${C.mesLargo(prev)}?`, 'Copiar'))) return;
    await db.replaceMesPlan(ym, { ...(src.plan || {}) });
    if (!state.meses[ym]?.ingresos || !Object.keys(state.meses[ym].ingresos).length) await db.setMes(ym, { ingresos: { ...(src.ingresos || {}) } });
    db.novedad(`copió el plan de ${C.mesLargo(prev)} a ${C.mesLargo(ym)}`);
    toast('Plan copiado');
  };
};

// ------------------------------------------------------------------ movimientos
function viewMovs() {
  const r = C.resumenMes(state, ui.ym);
  let list = r.movs;
  if (ui.filtro !== 'todos') list = list.filter((m) => m.tipo === ui.filtro);
  list = [...list].sort((a, b) => (b.fecha + (b.ts || 0)).localeCompare(a.fecha + (a.ts || 0)));
  const grupos = {};
  list.forEach((m) => (grupos[m.fecha] ||= []).push(m));
  return `${header('Movimientos', { month: true })}
  <section class="sum-strip card">
    <div><span>Gastado</span><b>${short(r.totalReal)}</b></div>
    <div><span>Ingresos extra</span><b class="ok">${short(r.extraReal)}</b></div>
    <div><span>Registros</span><b>${r.movs.length}</b></div>
  </section>
  <div class="chips" role="tablist">${[['todos', 'Todos'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos']].map(([k, t]) => `<button role="tab" data-f="${k}" class="${ui.filtro === k ? 'on' : ''}">${t}</button>`).join('')}</div>
  ${Object.keys(grupos).length ? Object.entries(grupos).map(([f, ms]) => `
    <h3 class="day">${new Date(f + 'T12:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    <section class="card list">${ms.map(movItem).join('')}</section>`).join('') : `<section class="card"><p class="empty">No hay movimientos en ${C.mesLargo(ui.ym)}.</p></section>`}`;
}
bind.movs = () => { bindMovItems(); app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { ui.filtro = b.dataset.f; render(); }); };

// ------------------------------------------------------------------ deudas y fondo
function viewDeudas() {
  const d = C.deudas(state), f = C.fondo(state);
  return `${header('Deudas y fondo')}
  <section class="card hero small">
    <p class="eyebrow">Deuda total pendiente</p>
    <p class="hero-num">${money(d.total)}</p>
    <div class="hero-grid two">
      <div><span>Cuotas al mes</span><b>${money(d.cuotas)}</b></div>
      <div><span>Endeudamiento</span><b class="sem ${d.semaforo.cls}">● ${pct(d.nivel)} · ${d.semaforo.txt}</b></div>
    </div>
    ${d.interes ? `<p class="meter-cap">Intereses estimados: ${money(d.interes)} al mes</p>` : ''}
  </section>
  <h2 class="sec">Deudas <small class="muted">ordenadas por tasa</small></h2>
  <section class="card list">${d.lista.map((x) => `
    <button class="li debt" data-deuda="${x.id}">
      <div class="li-main"><b>${esc(x.nombre)} ${x.porConfirmar ? '<em class="tag warn">por confirmar</em>' : ''}${!x.porConfirmar && !x.saldoActual ? '<em class="tag ok">pagada</em>' : ''}</b>
        <small>${esc(x.tipo || '')}${x.tasa ? ` · ${(x.tasa * 100).toFixed(2).replace('.', ',')}% m.v.` : ' · sin interés'}${x.cuota ? ` · cuota ${short(x.cuota)}` : ''}${x.mesesRestantes ? ` · ~${x.mesesRestantes} meses` : ''}</small>
        ${x.saldoOriginal ? `<div class="meter thin"><span style="width:${x.pct * 100}%"></span></div>` : ''}</div>
      <span class="num">${money(x.saldoActual)}</span></button>`).join('')}
  </section>
  <div class="actions"><button class="btn ghost" id="nueva-deuda">${icon('plus', 18)} Agregar deuda</button></div>

  <h2 class="sec">Fondo de emergencia</h2>
  <section class="card">
    <div class="fondo-top"><div><p class="eyebrow">Saldo actual</p><p class="big-num">${money(f.saldo)}</p></div><div class="right"><p class="eyebrow">Cubre</p><p class="big-num">${f.meses.toFixed(1).replace('.', ',')} <small>meses</small></p></div></div>
    ${f.niveles.map((n) => `<div class="lvl"><div class="cat-top"><b>${n.nombre}</b><span class="num">${pct(n.pct)} <small>de ${short(n.meta)}</small></span></div><div class="bar"><span style="width:${n.pct * 100}%;background:var(--ok)"></span></div></div>`).join('')}
    <p class="fine">Los aportes se registran como gasto en el concepto <b>${esc(nombreConcepto(state.config.fondoConceptoId))}</b>.</p>
  </section>`;
}
bind.deudas = () => {
  app.querySelectorAll('[data-deuda]').forEach((b) => b.onclick = () => deudaSheet(C.deudas(state).lista.find((x) => x.id === b.dataset.deuda)));
  $('#nueva-deuda').onclick = () => deudaSheet();
};
function deudaSheet(d) {
  const nuevo = !d;
  d = d || { nombre: '', tipo: '', saldo: 0, saldoActual: 0, tasa: 0, cuota: 0, conceptoId: '' };
  const opts = C.conceptosActivos(state).map((x) => `<option value="${x.id}" ${x.id === d.conceptoId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  sheet(`<h3 class="sheet-title">${nuevo ? 'Nueva deuda' : esc(d.nombre)}</h3>
    <div class="f"><label for="d-n">Nombre</label><input id="d-n" value="${esc(d.nombre)}"></div>
    <div class="f"><label for="d-s">Saldo pendiente hoy</label><input id="d-s" inputmode="numeric" value="${fmtInput(d.saldoActual)}" placeholder="0"></div>
    <div class="f2"><div class="f"><label for="d-t">Tasa % mensual</label><input id="d-t" inputmode="decimal" value="${String(+(d.tasa * 100).toFixed(3)).replace('.', ',')}"></div>
    <div class="f"><label for="d-c">Cuota mensual</label><input id="d-c" inputmode="numeric" value="${fmtInput(d.cuota)}" placeholder="0"></div></div>
    <div class="f"><label for="d-ti">Tipo</label><input id="d-ti" value="${esc(d.tipo || '')}" placeholder="Tarjeta, familiar, crédito…"></div>
    <div class="f"><label for="d-con">Los pagos se registran en</label><select id="d-con"><option value="">Elige el concepto…</option>${opts}</select><small class="hint">Cada pago a este concepto baja el saldo automáticamente.</small></div>
    <div class="row-btns">${nuevo ? '<button class="btn ghost" data-close>Cancelar</button>' : `<button class="btn ghost danger-t" id="d-del">${icon('trash', 18)} Eliminar</button>`}<button class="btn primary" id="d-ok">${icon('check', 18)} Guardar</button></div>`,
  { onMount: (el, close) => {
    ['#d-s', '#d-c'].forEach((s) => moneyInput($(s, el)));
    $('#d-ok', el).onclick = async () => {
      const nombre = $('#d-n', el).value.trim(); if (!nombre) { toast('Escribe el nombre'); return; }
      const saldoNuevo = parseMonto($('#d-s', el).value);
      const cambioSaldo = nuevo || saldoNuevo !== d.saldoActual || d.porConfirmar;
      const data = { ...(nuevo ? {} : { id: d.id }), nombre, tipo: $('#d-ti', el).value.trim(), tasa: (parseFloat($('#d-t', el).value.replace(',', '.')) || 0) / 100, cuota: parseMonto($('#d-c', el).value), conceptoId: $('#d-con', el).value };
      // El saldo digitado es el de hoy: solo los pagos registrados después de este momento lo descuentan.
      if (cambioSaldo) Object.assign(data, { saldo: saldoNuevo, fechaSaldo: hoy(), saldoTs: Date.now(), saldoOriginal: Math.max(saldoNuevo, d.porConfirmar || nuevo ? 0 : +d.saldoOriginal || 0), porConfirmar: false });
      close();
      await db.saveDeuda(data);
      db.novedad(`${nuevo ? 'agregó la deuda' : 'actualizó la deuda'} ${nombre}${cambioSaldo ? ` (saldo ${money(saldoNuevo)})` : ''}`);
      toast('Deuda guardada');
    };
    $('#d-del', el) && ($('#d-del', el).onclick = async () => { close(); if (!(await confirmar(`¿Eliminar la deuda ${d.nombre}?`))) return; await db.delDeuda(d.id); db.novedad(`eliminó la deuda ${d.nombre}`); });
  } });
}

// ------------------------------------------------------------------ más
function viewMas() {
  const n = sinLeer();
  const it = (r, i, t, s, badge = '') => `<a class="li" href="#${r}"><span class="li-ic plain">${icon(i, 20)}</span><div class="li-main"><b>${t}</b><small>${s}</small></div>${badge}${icon('right', 18)}</a>`;
  return `${header('Más')}
  <section class="card list">
    ${it('reporte', 'report', 'Reporte mensual', 'Resumen ejecutivo para guardar o enviar en PDF')}
    ${it('novedades', 'bell', 'Novedades', 'Lo que ha cambiado el otro', n ? `<b class="badge">${n}</b>` : '')}
    ${it('conceptos', 'tag', 'Conceptos y categorías', 'Crear, renombrar o eliminar')}
    ${it('metas', 'gear', 'Metas y reglas', 'Fondo de emergencia, distribución objetivo')}
  </section>
  <section class="card list">
    <div class="li"><span class="li-ic plain">${state.user.photoURL ? `<img src="${esc(state.user.photoURL)}" alt="" class="avatar" referrerpolicy="no-referrer">` : icon('shield')}</span><div class="li-main"><b>${esc(state.user.displayName || '')}</b><small>${esc(state.user.email)}</small></div></div>
    <button class="li" id="salir"><span class="li-ic plain">${icon('logout', 20)}</span><div class="li-main"><b>Cerrar sesión</b></div></button>
  </section>
  <p class="fine center">Nido · Finanzas del hogar ${esc(state.config.hogar || '')}</p>`;
}
bind.mas = () => { $('#salir').onclick = () => db.logout(); };

// ------------------------------------------------------------------ novedades
function viewNovedades() {
  const visto = state.perfil?.vistoHasta || 0;
  setTimeout(() => novSinLeer() && db.marcarVisto(), 1200);
  const fmt = (ts) => { const d = new Date(ts); const dif = (Date.now() - ts) / 6e4; return dif < 1 ? 'ahora' : dif < 60 ? `hace ${Math.round(dif)} min` : dif < 1440 ? `hace ${Math.round(dif / 60)} h` : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
  const al = alertas();
  return `${header('Novedades', { back: 'mas' })}
  ${al.length ? `<h2 class="sec">Alertas de pago</h2><section class="card list">${al.map(alertaItem).join('')}</section><h2 class="sec">Cambios recientes</h2>` : ''}
  <section class="card list">${state.novedades.length ? state.novedades.map((n) => `
    <div class="li nov ${n.ts > visto && n.autor !== yo() ? 'unread' : ''}"><span class="av">${esc((n.nombre || '?')[0])}</span><div class="li-main"><p><b>${n.autor === yo() ? 'Tú' : esc(n.nombre)}</b> ${esc(n.texto)}</p><small>${fmt(n.ts)}</small></div></div>`).join('') : '<p class="empty">Todavía no hay novedades.</p>'}</section>`;
}

bind.novedades = () => bindPagos();

// ------------------------------------------------------------------ conceptos y categorías
function viewConceptos() {
  const cats = C.categorias(state);
  return `${header('Conceptos', { back: 'mas' })}
  ${cats.map((c) => `<h2 class="sec"><span class="chip-dot" style="background:${c.color}"></span>${esc(c.nombre)} <button class="link" data-cat="${c.id}">Editar</button></h2>
  <section class="card list">${C.conceptosActivos(state).filter((x) => x.categoria === c.id).map((x) => `<button class="li" data-con="${x.id}"><div class="li-main"><b>${esc(x.nombre)}</b></div>${icon('edit', 16)}</button>`).join('') || '<p class="empty">Sin conceptos</p>'}</section>`).join('')}
  <div class="actions"><button class="btn primary" id="n-con">${icon('plus', 18)} Nuevo concepto</button><button class="btn ghost" id="n-cat">${icon('plus', 18)} Nueva categoría</button></div>`;
}
bind.conceptos = () => {
  app.querySelectorAll('[data-con]').forEach((b) => b.onclick = () => conceptoSheet(C.concepto(state, b.dataset.con)));
  app.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => categoriaSheet(C.categorias(state).find((c) => c.id === b.dataset.cat)));
  $('#n-con').onclick = () => conceptoSheet();
  $('#n-cat').onclick = () => categoriaSheet();
};
function conceptoSheet(c) {
  const nuevo = !c; c = c || { nombre: '', categoria: C.categorias(state)[0]?.id };
  sheet(`<h3 class="sheet-title">${nuevo ? 'Nuevo concepto' : 'Editar concepto'}</h3>
    <div class="f"><label for="c-n">Nombre</label><input id="c-n" value="${esc(c.nombre)}" placeholder="Ej: Mascotas"></div>
    <div class="f"><label for="c-c">Categoría</label><select id="c-c">${C.categorias(state).map((k) => `<option value="${k.id}" ${k.id === c.categoria ? 'selected' : ''}>${esc(k.nombre)}</option>`).join('')}</select></div>
    ${nuevo ? '' : '<p class="fine">Si lo eliminas, el historial se conserva en reportes y movimientos anteriores.</p>'}
    <div class="row-btns">${nuevo ? '<button class="btn ghost" data-close>Cancelar</button>' : `<button class="btn ghost danger-t" id="c-del">${icon('trash', 18)} Eliminar</button>`}<button class="btn primary" id="c-ok">${icon('check', 18)} Guardar</button></div>`,
  { onMount: (el, close) => {
    $('#c-ok', el).onclick = async () => {
      const nombre = $('#c-n', el).value.trim(); if (!nombre) { toast('Escribe el nombre'); return; }
      const orden = nuevo ? Math.max(0, ...state.conceptos.map((x) => x.orden || 0)) + 1 : c.orden;
      close(); await db.saveConcepto({ ...(nuevo ? {} : { id: c.id }), nombre, categoria: $('#c-c', el).value, orden, activo: true });
      db.novedad(nuevo ? `creó el concepto ${nombre}` : `editó el concepto ${nombre}`);
    };
    $('#c-del', el) && ($('#c-del', el).onclick = async () => { close(); if (!(await confirmar(`¿Eliminar el concepto ${c.nombre}?`))) return; await db.saveConcepto({ id: c.id, activo: false }); db.novedad(`eliminó el concepto ${c.nombre}`); });
  } });
}
const COLORES = ['#3B6EA8', '#C2553D', '#B8892A', '#2F8F6B', '#7A5BA6', '#3E8E9E', '#A3566F', '#6B7A3A'];
function categoriaSheet(k) {
  const nuevo = !k; k = k || { nombre: '', color: COLORES[C.categorias(state).length % COLORES.length] };
  sheet(`<h3 class="sheet-title">${nuevo ? 'Nueva categoría' : 'Editar categoría'}</h3>
    <div class="f"><label for="k-n">Nombre</label><input id="k-n" value="${esc(k.nombre)}"></div>
    <div class="f"><label>Color</label><div class="swatches">${COLORES.map((c) => `<button class="sw ${c === k.color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>
    <div class="row-btns">${nuevo ? '<button class="btn ghost" data-close>Cancelar</button>' : `<button class="btn ghost danger-t" id="k-del">${icon('trash', 18)} Eliminar</button>`}<button class="btn primary" id="k-ok">${icon('check', 18)} Guardar</button></div>`,
  { onMount: (el, close) => {
    let color = k.color;
    el.querySelectorAll('.sw').forEach((b) => b.onclick = () => { color = b.dataset.c; el.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b)); });
    const cats = () => [...(state.config.categorias || [])];
    $('#k-ok', el).onclick = async () => {
      const nombre = $('#k-n', el).value.trim(); if (!nombre) { toast('Escribe el nombre'); return; }
      let list = cats();
      if (nuevo) list.push({ id: 'cat-' + Date.now().toString(36), nombre, color, orden: list.length + 1 });
      else list = list.map((x) => (x.id === k.id ? { ...x, nombre, color } : x));
      close(); await db.saveConfig({ categorias: list }); db.novedad(`${nuevo ? 'creó' : 'editó'} la categoría ${nombre}`);
    };
    $('#k-del', el) && ($('#k-del', el).onclick = async () => {
      if (C.conceptosActivos(state).some((x) => x.categoria === k.id)) { toast('Primero mueve o elimina sus conceptos'); return; }
      close(); if (!(await confirmar(`¿Eliminar la categoría ${k.nombre}?`))) return;
      await db.saveConfig({ categorias: cats().filter((x) => x.id !== k.id) }); db.novedad(`eliminó la categoría ${k.nombre}`);
    });
  } });
}

// ------------------------------------------------------------------ metas
function viewMetas() {
  const c = state.config, o = c.objetivos || {};
  const opts = C.conceptosActivos(state).map((x) => `<option value="${x.id}" ${x.id === c.fondoConceptoId ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  return `${header('Metas y reglas', { back: 'mas' })}
  <h2 class="sec">Fondo de emergencia</h2>
  <section class="card form-list">
    <label class="pl-row"><span>Meta Nivel 1 <small>fondo semilla</small></span><input inputmode="numeric" data-cfg="metaN1" value="${fmtInput(c.metaN1)}"></label>
    <label class="pl-row"><span>Saldo inicial <small>lo que ya estaba ahorrado</small></span><input inputmode="numeric" data-cfg="fondoInicial" value="${fmtInput(c.fondoInicial)}"></label>
    <div class="pl-row"><span>Concepto de aportes</span><select data-cfgsel="fondoConceptoId">${opts}</select></div>
    <p class="pl-foot">Los niveles 2 y 3 se calculan solos: 3 y 6 meses del gasto esencial promedio.</p>
  </section>
  <h2 class="sec">Distribución objetivo</h2>
  <section class="card form-list">${C.categorias(state).map((k) => `<label class="pl-row"><span><i class="chip-dot" style="background:${k.color}"></i> ${esc(k.nombre)}</span><span class="pct-in"><input inputmode="numeric" data-obj="${k.id}" value="${Math.round((o[k.id] || 0) * 100)}">%</span></label>`).join('')}</section>
  <h2 class="sec">Hogar</h2>
  <section class="card form-list"><label class="pl-row"><span>Nombre del hogar</span><input data-txt="hogar" value="${esc(c.hogar || '')}"></label></section>`;
}
bind.metas = () => {
  app.querySelectorAll('[data-cfg]').forEach((i) => { moneyInput(i); i.onchange = () => { db.saveConfig({ [i.dataset.cfg]: parseMonto(i.value) }); toast('Guardado'); }; });
  app.querySelectorAll('[data-cfgsel]').forEach((i) => i.onchange = () => { db.saveConfig({ [i.dataset.cfgsel]: i.value }); toast('Guardado'); });
  app.querySelectorAll('[data-obj]').forEach((i) => i.onchange = () => { db.saveConfig({ objetivos: { ...(state.config.objetivos || {}), [i.dataset.obj]: (parseFloat(i.value) || 0) / 100 } }); toast('Guardado'); });
  app.querySelectorAll('[data-txt]').forEach((i) => i.onchange = () => { db.saveConfig({ [i.dataset.txt]: i.value.trim() }); toast('Guardado'); });
};

// ------------------------------------------------------------------ reporte
function viewReporte() {
  const r = C.resumenMes(state, ui.ym), d = C.deudas(state), f = C.fondo(state);
  const cats = C.categorias(state);
  const ejec = r.totalPlan ? r.totalReal / r.totalPlan : 0;
  // Tendencia: últimos 6 meses
  const hist = Object.fromEntries((state.config.historico || []).map((h) => [h.mes, h]));
  const meses = Array.from({ length: 6 }, (_, i) => C.addMonths(ui.ym, i - 5)).map((ym) => {
    const x = C.resumenMes(state, ym);
    if (!x.movs.length && hist[ym]) return { ym, ingresoReal: hist[ym].ingresos, totalReal: hist[ym].gasto, totalPlan: hist[ym].plan };
    return { ym, ...x };
  });
  const maxT = Math.max(1, ...meses.map((m) => Math.max(m.ingresoReal, m.totalReal, m.totalPlan)));
  const W = 300, H = 120, bw = 16;
  const trend = `<svg viewBox="0 0 ${W} ${H + 22}" class="trend" role="img" aria-label="Ingresos y gasto de los últimos 6 meses">
    ${[0.5, 1].map((g) => `<line x1="0" x2="${W}" y1="${H - g * H}" y2="${H - g * H}" class="grid"/>`).join('')}
    ${meses.map((m, i) => { const x = i * (W / 6) + (W / 6 - bw * 2 - 3) / 2; const hi = (m.ingresoReal / maxT) * H, hg = (m.totalReal / maxT) * H; return `
      <rect x="${x}" y="${H - hi}" width="${bw}" height="${hi}" rx="3" fill="var(--c-ing)"><title>Ingresos ${money(m.ingresoReal)}</title></rect>
      <rect x="${x + bw + 3}" y="${H - hg}" width="${bw}" height="${hg}" rx="3" fill="var(--c-gas)"><title>Gasto ${money(m.totalReal)}</title></rect>
      <text x="${i * (W / 6) + W / 12}" y="${H + 15}" text-anchor="middle">${C.mesCorto(m.ym).split(' ')[0]}</text>`; }).join('')}
  </svg>`;
  const desv = Object.keys({ ...r.plan, ...r.real }).map((id) => ({ id, p: +r.plan[id] || 0, v: r.real[id] || 0 })).filter((x) => x.p || x.v).map((x) => ({ ...x, d: x.v - x.p })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8);
  const maxC = Math.max(1, ...cats.map((c) => Math.max(r.porCat[c.id]?.plan || 0, r.porCat[c.id]?.real || 0)));
  const hallazgos = [];
  if (r.disponible < 0) hallazgos.push(`El gasto superó los ingresos del mes en ${money(-r.disponible)}.`);
  else hallazgos.push(`Quedó un disponible de ${money(r.disponible)} (${pct(r.ingresoReal ? r.disponible / r.ingresoReal : 0)} del ingreso).`);
  const top = desv.filter((x) => x.d > 0)[0]; if (top) hallazgos.push(`La mayor desviación fue ${nombreConcepto(top.id)}: ${money(top.d)} por encima del plan.`);
  const deudaCat = r.porCat.deuda?.real || 0; if (r.ingresoReal) hallazgos.push(`A deudas se destinó el ${pct(deudaCat / r.ingresoReal)} del ingreso; nivel de endeudamiento ${d.semaforo.txt.toLowerCase()} (${pct(d.nivel)}).`);
  hallazgos.push(`Fondo de emergencia en ${money(f.saldo)}: ${pct(f.niveles[0].pct)} de la meta Nivel 1.`);

  return `<div class="report-bar no-print"><a class="icon-btn" href="#inicio" aria-label="Volver">${icon('left')}</a>${monthNav()}<button class="btn primary" id="pdf">${icon('report', 18)} PDF</button></div>
  <article class="report">
    <header class="r-head"><div class="r-brand">${logo(30)}<div><b>Nido</b><span>Finanzas del hogar · ${esc(state.config.hogar || '')}</span></div></div>
      <div class="r-title"><span>Reporte mensual</span><b>${C.mesLargo(ui.ym)}</b></div></header>
    <section class="r-kpis">
      <div><span>Ingresos</span><b>${money(r.ingresoReal)}</b><small>plan ${money(r.ingresoPlan)}</small></div>
      <div><span>Gasto ejecutado</span><b>${money(r.totalReal)}</b><small>plan ${money(r.totalPlan)}</small></div>
      <div><span>Balance real</span><b class="${r.disponible < 0 ? 'bad' : 'ok'}">${money(r.disponible)}</b><small>plan ${money(r.balancePlan)}</small></div>
      <div><span>Ejecución</span><b>${pct(ejec)}</b><small>del presupuesto</small></div>
    </section>
    <section class="r-grid">
      <div class="r-box"><h3>Plan vs. real por categoría</h3>
        ${cats.map((c) => { const x = r.porCat[c.id] || { plan: 0, real: 0 }; return `<div class="r-cat"><div class="r-cat-l"><i class="chip-dot" style="background:${c.color}"></i>${esc(c.nombre)}</div>
          <div class="r-bars"><span class="pl" style="width:${(x.plan / maxC) * 100}%"></span><span class="re" style="width:${(x.real / maxC) * 100}%;background:${c.color}"></span></div>
          <div class="r-cat-n">${short(x.real)}<small>/${short(x.plan)}</small></div></div>`; }).join('')}
        <p class="legend"><i class="lg pl"></i>Plan <i class="lg re"></i>Real</p></div>
      <div class="r-box"><h3>Tendencia 6 meses</h3>${trend}<p class="legend"><i class="lg" style="background:var(--c-ing)"></i>Ingresos <i class="lg" style="background:var(--c-gas)"></i>Gasto</p></div>
    </section>
    <section class="r-box"><h3>Principales desviaciones</h3>
      <div class="r-scroll"><table class="r-table"><thead><tr><th>Concepto</th><th>Plan</th><th>Real</th><th>Diferencia</th></tr></thead><tbody>
      ${desv.map((x) => `<tr><td>${esc(nombreConcepto(x.id))}</td><td>${money(x.p)}</td><td>${money(x.v)}</td><td class="${x.d > 0 ? 'bad' : x.d < 0 ? 'ok' : ''}">${x.d > 0 ? '+' : ''}${money(x.d)}</td></tr>`).join('') || '<tr><td colspan="4">Sin datos</td></tr>'}
      </tbody></table></div></section>
    <section class="r-grid">
      <div class="r-box"><h3>Deudas</h3><p class="r-big">${money(d.total)}</p><p class="r-sub">Cuotas ${money(d.cuotas)}/mes · <span class="sem ${d.semaforo.cls}">● ${d.semaforo.txt} ${pct(d.nivel)}</span></p>
        <ul class="r-list">${d.lista.filter((x) => x.saldoActual || x.porConfirmar).slice(0, 6).map((x) => `<li><span>${esc(x.nombre)}${x.porConfirmar ? ' *' : ''}</span><b>${short(x.saldoActual)}</b></li>`).join('')}</ul>
        ${d.lista.some((x) => x.porConfirmar) ? '<p class="r-note">* saldo por confirmar</p>' : ''}</div>
      <div class="r-box"><h3>Fondo de emergencia</h3><p class="r-big">${money(f.saldo)}</p><p class="r-sub">Cubre ${f.meses.toFixed(1).replace('.', ',')} meses de gasto esencial</p>
        ${f.niveles.map((n) => `<div class="r-lvl"><span>${n.nombre.split(' · ')[0]}</span><div class="bar"><span style="width:${n.pct * 100}%;background:var(--ok)"></span></div><b>${pct(n.pct)}</b></div>`).join('')}</div>
    </section>
    <section class="r-box"><h3>Conclusiones</h3><ul class="r-find">${hallazgos.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></section>
    <footer class="r-foot">Generado el ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })} · Nido</footer>
  </article>`;
}
bind.reporte = () => { $('#pdf').onclick = () => { document.title = `Nido - Reporte ${C.mesLargo(ui.ym)}`; window.print(); setTimeout(() => (document.title = 'Nido'), 1000); }; };

// ------------------------------------------------------------------ arranque
subscribe(() => render());
render();
init();
if ('serviceWorker' in navigator && !location.search.includes('demo')) navigator.serviceWorker.register('sw.js');
