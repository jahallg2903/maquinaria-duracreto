import { crearDB, MODO_DEMO } from './data.js';
import { analizarLibro, leerArchivo } from './importer.js';

const CFG = window.APP_CONFIG || {};
const ALERTA_DIAS = CFG.ALERTA_DIAS || 30;
const AVISO_DIAS = CFG.AVISO_DIAS || 14;

// ---------------------------------------------------------------- utilidades
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fecha = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
const fechaHora = iso => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }); };
const dias = (desde, hasta = hoyISO()) => desde ? Math.max(0, Math.round((new Date(hasta) - new Date(String(desde).slice(0, 10))) / 864e5)) : null;
const L = n => n == null || n === '' ? '—' : 'L ' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const L2 = n => n == null || n === '' ? '—' : 'L ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const numOrNull = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : null; };
const iniciales = s => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const ESTADOS = { habilitado: 'Habilitado', inhabilitado: 'Inhabilitado', taller: 'En taller', sin_info: 'Sin información' };
const ORDEN_ESTADOS = ['habilitado', 'inhabilitado', 'taller', 'sin_info'];
const INC = {
  reportada: ['Reportada', '#A8A29E'], pendiente_diagnostico: ['Pendiente de diagnóstico', '#F59E0B'],
  pendiente_repuestos: ['Pendiente de repuestos', '#F59E0B'], en_reparacion: ['En reparación', '#2563EB'],
  en_espera: ['En espera', '#78716C'], reparada: ['Reparada', '#16A34A'], cerrada: ['Cerrada', '#78716C']
};
const ABIERTA = e => !['reparada', 'cerrada'].includes(e);
const PRIO = { baja: ['Baja', '#A8A29E', 'No afecta la operación; se atiende en la próxima ventana.'], media: ['Media', '#F59E0B', 'Afecta el rendimiento; el equipo sigue operando.'], alta: ['Alta', '#EA580C', 'El equipo no puede operar con seguridad.'], critica: ['Crítica', '#DC2626', 'Detiene la producción de la planta.'] };
const MANT = { programado: 'Programado', en_proceso: 'En proceso', ejecutado: 'Ejecutado', cancelado: 'Cancelado' };
const ROLES = { maestro: 'Administrador general', admin: 'Jefe de planta', gerencia: 'Gerencia', mantenimiento: 'Mantenimiento' };
const PLAZO = { menor_semana: 'Menos de una semana', mayor_semana: 'Más de una semana' };

const PERM = {
  importar: ['maestro', 'admin'], editarEquipo: ['maestro', 'admin', 'mantenimiento'], reportar: ['maestro', 'admin', 'mantenimiento'],
  gestionar: ['maestro', 'admin', 'mantenimiento'], comentar: ['maestro', 'admin', 'mantenimiento'], mantener: ['maestro', 'admin', 'mantenimiento'],
  costos: ['maestro', 'admin', 'gerencia', 'mantenimiento'], usuarios: ['maestro'], reportes: ['maestro', 'admin', 'gerencia', 'mantenimiento'],
  observaciones: ['maestro', 'admin', 'mantenimiento'], exportar: ['maestro', 'admin', 'mantenimiento']
};
const can = a => !!(S.yo && PERM[a].includes(S.yo.rol));

const ICON = {
  panel: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  inventario: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  falla: 'M12 3 2 20h20L12 3zM12 10v4M12 17h.01',
  seguimiento: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z',
  mantenimiento: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  reportes: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  importar: 'M12 15V3M7 8l5-5 5 5M4 15v5h16v-5',
  usuarios: 'M16 20v-2a4 4 0 0 0-8 0v2M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  salir: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  menu: 'M3 6h18M3 12h18M3 18h18',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  atras: 'M15 18l-6-6 6-6',
  descargar: 'M12 3v12M7 10l5 5 5-5M4 21h16'
};
const ico = (k, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${ICON[k]}"/></svg>`;

const LOGO_NEG = 'assets/logo_negativo.png';
const LOGO_COLOR = 'assets/logo_color.png';

// ---------------------------------------------------------------- estado global
const S = { db: null, yo: null, D: null, idx: {}, filtros: {}, importacion: null };

function indexar() {
  const D = S.D, idx = {};
  idx.eq = new Map(D.equipos.map(e => [e.id, e]));
  idx.planta = new Map(D.plantas.map(p => [p.id, p]));
  idx.neg = new Map(D.negocios.map(n => [n.id, n]));
  idx.perfil = new Map(D.perfiles.map(p => [p.id, p]));
  idx.incPorEq = new Map();
  D.incidencias.forEach(i => { if (!idx.incPorEq.has(i.equipo_id)) idx.incPorEq.set(i.equipo_id, []); idx.incPorEq.get(i.equipo_id).push(i); });
  idx.mantPorEq = new Map();
  D.mantenimientos.forEach(m => { if (!idx.mantPorEq.has(m.equipo_id)) idx.mantPorEq.set(m.equipo_id, []); idx.mantPorEq.get(m.equipo_id).push(m); });
  S.idx = idx;
}
const negNom = id => id ? (S.idx.neg.get(id)?.nombre || id) : 'Sin asignar';
const plantaNom = id => id ? (S.idx.planta.get(id)?.nombre || '—') : 'Sin planta';
const perfilNom = id => { const p = id && S.idx.perfil.get(id); return p ? (p.nombre || p.username) : '—'; };
const MINUS = new Set(['de', 'del', 'la', 'el', 'y', 'a', 'en', 'para', 'con', 'por', 'sin']);
const nombreBonito = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim()
  .replace(/[a-záéíóúñü0-9]+/gi, (w, i) => /\d/.test(w) ? w.toUpperCase() : (i > 0 && MINUS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1));
const eqNom = e => e ? nombreBonito(e.descripcion) : '—';
const eqCod = e => e ? (e.codigo || e.codigo_sap || e.clave) : '';

const pill = e => `<span class="pill ${esc(e)}">${ESTADOS[e] || e}</span>`;
const pillEq = e => can('editarEquipo')
  ? `<span class="pill ${esc(e.estado)} pill-btn" role="button" tabindex="0" data-estado-eq="${esc(e.id)}" title="Cambiar estado">${ESTADOS[e.estado] || e.estado}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span>`
  : pill(e.estado);
const tsPill = e => `<span class="ts ${esc(e)}"><i style="background:${INC[e][1]}"></i>${INC[e][0]}</span>`;
const prio = p => `<span class="prio"><span class="dot" style="background:${PRIO[p][1]}"></span>${PRIO[p][0]}</span>`;

function toast(msg, bad = false) {
  $$('.toast').forEach(x => x.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3200);
}

function modal(html, onBind) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(bg);
  const cerrar = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('mousedown', e => { if (e.target === bg) cerrar(); });
  $$('[data-cerrar]', bg).forEach(b => b.onclick = cerrar);
  const first = $('input:not([readonly]),select,textarea', bg); if (first) first.focus();
  onBind && onBind(bg, cerrar);
  return cerrar;
}

async function accion(btn, fn) {
  const txt = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try { await fn(); return true; }
  catch (e) { toast(e.message || String(e), true); return false; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = txt; } }
}

async function recargar() {
  S.D = await S.db.cargarTodo(S.yo);
  indexar();
}

function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function csv(nombre, cabeceras, filas) {
  const q = v => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  descargar(nombre, '﻿' + [cabeceras, ...filas].map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

// ---------------------------------------------------------------- arranque
async function iniciar() {
  try {
    S.db = await crearDB();
    S.yo = await S.db.sesion();
  } catch (e) {
    $('#app').innerHTML = `<div class="login"><div class="card pad" style="max-width:420px"><h2>No se pudo iniciar</h2><p class="cap" style="margin-top:8px">${esc(e.message)}</p></div></div>`;
    return;
  }
  window.addEventListener('dc-sesion-expirada', () => { if (S.yo) { S.yo = null; pantallaLogin('Su sesión terminó. Inicie sesión de nuevo.'); } });
  if (!S.yo) return pantallaLogin();
  if (S.yo.debe_cambiar) return pantallaCambio();
  await entrar();
}

let suscrito = false;
async function entrar() {
  if (S.yo.debe_cambiar) return pantallaCambio();
  $('#app').innerHTML = '<div class="loading">Cargando información…</div>';
  try { await recargar(); }
  catch (e) { $('#app').innerHTML = `<div class="loading">${esc(e.message)}</div>`; return; }
  if (!suscrito) {
    suscrito = true;
    S.db.suscribir(async () => {
      if (!S.yo) return;
      try { await recargar(); } catch (_) { return; }
      const enForm = document.activeElement && document.activeElement.closest && document.activeElement.closest('form, .modal');
      if (!enForm && !$('.modal-bg')) render(); else S.pendiente = true;
    });
    window.addEventListener('hashchange', render);
  }
  render();
}


// ================================================================ INSTALAR (iPhone / Android / computadora)
const UA = navigator.userAgent;
const ES_IOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ES_SAFARI_IOS = ES_IOS && !/CriOS|FxiOS|EdgiOS|GSA\//i.test(UA);
const INSTALADA = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let promptInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar = e; });
window.addEventListener('appinstalled', () => { promptInstalar = null; $$('.js-instalar').forEach(x => x.remove()); });
const ICO_COMPARTIR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
const ICO_BAJAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
async function instalarApp() {
  if (promptInstalar) { promptInstalar.prompt(); const r = await promptInstalar.userChoice; if (r.outcome === 'accepted') promptInstalar = null; return; }
  const pasos = ES_SAFARI_IOS ? `
      <li><span class="n">1</span><div>Toque el botón <b>Compartir</b> <span class="kbd">${ICO_COMPARTIR}</span> en la barra de Safari (abajo en iPhone, arriba en iPad).</div></li>
      <li><span class="n">2</span><div>Deslice hacia abajo y toque <b>Agregar a pantalla de inicio</b>.</div></li>
      <li><span class="n">3</span><div>Toque <b>Agregar</b>. El ícono de DC Maquinaria aparecerá junto a sus apps.</div></li>`
    : ES_IOS ? `
      <li><span class="n">1</span><div>En iPhone la app se instala desde <b>Safari</b>. Copie el enlace y ábralo en Safari.</div></li>
      <li><span class="n">2</span><div>En Safari toque <b>Compartir</b> <span class="kbd">${ICO_COMPARTIR}</span> y luego <b>Agregar a pantalla de inicio</b>.</div></li>`
    : `
      <li><span class="n">1</span><div>En Chrome o Edge, toque el ícono de <b>instalar</b> <span class="kbd">${ICO_BAJAR}</span> a la derecha de la barra de direcciones, o el menú <b>⋮</b> → <b>Instalar app</b>.</div></li>
      <li><span class="n">2</span><div>En iPhone: abra este enlace en <b>Safari</b> → <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>.</div></li>`;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal inst" role="dialog" aria-modal="true" aria-labelledby="instT">
    <div class="inst-h"><img src="icons/apple-touch-icon.png" alt=""><div><h2 id="instT">Instalar DC Maquinaria</h2><p class="cap">Se abre a pantalla completa, como una app, y sin buscar el enlace.</p></div></div>
    <ol class="inst-p">${pasos}</ol>
    ${ES_IOS && !ES_SAFARI_IOS ? '<button class="btn" id="instCopiar" style="width:100%;margin-bottom:10px">Copiar enlace</button>' : ''}
    <button class="btn primary" id="instOk" style="width:100%">Entendido</button></div>`;
  document.body.appendChild(bg);
  const cerrar = () => bg.remove();
  bg.onclick = e => { if (e.target === bg) cerrar(); };
  $('#instOk', bg).onclick = cerrar;
  const cp = $('#instCopiar', bg);
  if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname); cp.textContent = 'Enlace copiado'; } catch { cp.textContent = location.origin + location.pathname; } };
}
const botonInstalar = (cls = 'btn') => INSTALADA() ? '' : `<button type="button" class="${cls} js-instalar">${ICO_BAJAR}<span>Descargar la app${ES_IOS ? ' en el iPhone' : ''}</span></button>`;
function enlazarInstalar(raiz = document) { $$('.js-instalar', raiz).forEach(b => b.onclick = instalarApp); }

function pantallaLogin(aviso = '') {
  $('#app').innerHTML = `
  <main class="login">
    <form id="lf" novalidate>
      <img src="${LOGO_COLOR}" alt="Duracreto">
      <div>
        <h1>Control de maquinaria</h1>
        <p class="eyebrow" style="margin-top:6px">Plataforma de operaciones</p>
      </div>
      <label class="fld">Usuario<input class="ctl" id="lu" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
      <label class="fld">Contraseña<input class="ctl" id="lp" type="password" autocomplete="current-password" required></label>
      <div class="err" id="le" ${aviso ? '' : 'hidden'}>${esc(aviso)}</div>
      <button class="btn primary" type="submit">Ingresar</button>
      <p class="hint">¿Olvidó su contraseña? Pídale al Administrador general que la restablezca.</p>
      ${botonInstalar('btn inst-btn')}
    </form>
  </main>`;
  enlazarInstalar();
  if (ES_IOS && !INSTALADA()) { try { if (!localStorage.getItem('dc-inst-visto')) { localStorage.setItem('dc-inst-visto', '1'); setTimeout(instalarApp, 600); } } catch {} }
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const u = $('#lu').value.trim().toLowerCase(), p = $('#lp').value;
    const er = $('#le'), b = $('#lf button');
    if (!u || !p) { er.textContent = 'Escriba su usuario y contraseña.'; er.hidden = false; return; }
    b.disabled = true; b.textContent = 'Ingresando…'; er.hidden = true;
    try { S.yo = await S.db.login(u, p); location.hash = '#/panel'; if (S.yo.debe_cambiar) pantallaCambio(); else await entrar(); }
    catch (err) { er.textContent = err.message; er.hidden = false; b.disabled = false; b.textContent = 'Ingresar'; }
  };
}

const REGLA_PW = 'Mínimo 8 caracteres, con letras y números, y sin su nombre de usuario.';
function validarPw(nueva, repetida) {
  if (nueva !== repetida) return 'Las contraseñas nuevas no coinciden.';
  if (nueva.length < 8 || !/[A-Za-z]/.test(nueva) || !/[0-9]/.test(nueva)) return REGLA_PW;
  if (nueva.toLowerCase().includes(S.yo.username.toLowerCase())) return 'La contraseña no puede contener su nombre de usuario.';
  return '';
}
function pantallaCambio() {
  $('#app').innerHTML = `
  <main class="login">
    <form id="cf" novalidate>
      <img src="${LOGO_COLOR}" alt="Duracreto">
      <div><h1>Cree su contraseña</h1><p class="hint" style="margin-top:6px">Hola, ${esc(S.yo.nombre || S.yo.username)}. Por seguridad, cambie la contraseña temporal antes de continuar. Solo usted la conocerá.</p></div>
      <label class="fld">Contraseña temporal<input class="ctl" type="password" id="cfA" autocomplete="current-password"></label>
      <label class="fld">Nueva contraseña<input class="ctl" type="password" id="cfN" autocomplete="new-password"><small>${REGLA_PW}</small></label>
      <label class="fld">Repita la nueva contraseña<input class="ctl" type="password" id="cfR" autocomplete="new-password"></label>
      <div class="err" id="cfE" hidden></div>
      <button class="btn primary" type="submit">Guardar y entrar</button>
      <button class="btn ghost" type="button" id="cfSalir">Salir</button>
    </form>
  </main>`;
  $('#cfSalir').onclick = async () => { await S.db.logout(); S.yo = null; pantallaLogin(); };
  $('#cf').onsubmit = async e => {
    e.preventDefault();
    const er = $('#cfE'), b = $('#cf button[type=submit]');
    const msg = validarPw($('#cfN').value, $('#cfR').value);
    if (msg) { er.textContent = msg; er.hidden = false; return; }
    b.disabled = true; b.textContent = 'Guardando…';
    try { S.yo = await S.db.cambiarMiPassword($('#cfA').value, $('#cfN').value); toast('Contraseña creada'); await entrar(); }
    catch (err) { er.textContent = err.message; er.hidden = false; b.disabled = false; b.textContent = 'Guardar y entrar'; }
  };
}
function miCuenta() {
  modal(`
    <h2>Mi cuenta</h2>
    <dl class="dl" style="margin-bottom:18px"><div><dt>Usuario</dt><dd>${esc(S.yo.username)}</dd></div><div><dt>Nombre</dt><dd>${esc(S.yo.nombre || '—')}</dd></div><div><dt>Rol</dt><dd>${ROLES[S.yo.rol]}</dd></div></dl>
    <form class="form" id="mcF" novalidate>
      <h3 style="font-size:14px">Cambiar contraseña</h3>
      <label class="fld">Contraseña actual<input class="ctl" type="password" name="a" autocomplete="current-password"></label>
      <div class="grid2">
        <label class="fld">Nueva contraseña<input class="ctl" type="password" name="n" autocomplete="new-password"></label>
        <label class="fld">Repítala<input class="ctl" type="password" name="r" autocomplete="new-password"></label>
      </div>
      <small class="cap">${REGLA_PW}</small>
      <div class="err" id="mcE" hidden></div>
      <div class="form-acts"><button type="button" class="btn" data-cerrar>Cerrar</button><button class="btn primary" type="submit">Cambiar contraseña</button></div>
    </form>`, (bg, cerrar) => {
    $('#mcF', bg).onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target, er = $('#mcE', bg);
      const msg = validarPw(f.n.value, f.r.value);
      if (msg) { er.textContent = msg; er.hidden = false; return; }
      await accion(ev.submitter, async () => { S.yo = await S.db.cambiarMiPassword(f.a.value, f.n.value); cerrar(); toast('Contraseña actualizada'); });
    };
  });
}

// ---------------------------------------------------------------- estructura
function navItems() {
  const abiertasViejas = S.D.incidencias.filter(i => ABIERTA(i.estado) && dias(i.fecha_reporte) > ALERTA_DIAS).length;
  const g = [
    ['Operación', [
      ['panel', 'Panel ejecutivo', true], ['inventario', 'Inventario', true], ['falla', 'Reportar falla', can('reportar')],
      ['seguimiento', 'Seguimiento', true, abiertasViejas], ['mantenimiento', 'Mantenimiento', true]]],
    ['Análisis', [['reportes', 'Reportes', can('reportes')]]],
    ['Administración', [['importar', 'Cargar inventario', can('importar')], ['usuarios', 'Usuarios', can('usuarios')]]]
  ];
  return g.map(([t, items]) => [t, items.filter(i => i[2])]).filter(([, items]) => items.length);
}

function marco(ruta, titulo, contenido) {
  const activo = { equipo: 'inventario', incidencia: 'seguimiento', negocio: 'panel' }[ruta] || ruta;
  return `
  ${MODO_DEMO ? `<div class="demo-band"><b>MODO DE PRUEBA</b> Los datos se guardan solo en este navegador. Para uso real, conecte la hoja de Google (ver README).</div>` : ''}
  <div class="shell" id="shell">
    <nav class="side" aria-label="Navegación principal">
      <div class="brand"><img src="${LOGO_NEG}" alt="Duracreto"><span>Control de maquinaria</span></div>
      ${navItems().map(([t, items]) => `<div class="grp"><span>${t}</span>${items.map(([k, l, , b]) =>
        `<a class="nav${k === activo ? ' on' : ''}" href="#/${k}" ${k === activo ? 'aria-current="page"' : ''}>${ico(k)}<span>${l}</span>${b ? `<span class="badge" title="Incidencias con más de ${ALERTA_DIAS} días">${b}</span>` : ''}</a>`).join('')}</div>`).join('')}
      ${INSTALADA() ? '' : `<button type="button" class="nav nav-inst js-instalar">${ICO_BAJAR}<span>Descargar la app</span></button>`}
      <div class="me"><button id="miCuenta" class="me-btn" title="Mi cuenta y contraseña"><span class="avatar">${esc(iniciales(S.yo.nombre || S.yo.username))}</span>
        <span style="min-width:0;text-align:left"><b>${esc(S.yo.nombre || S.yo.username)}</b><small>${ROLES[S.yo.rol]} · Mi cuenta</small></span></button>
        <button id="salir" title="Cerrar sesión" aria-label="Cerrar sesión">${ico('salir', 'width="18" height="18"')}</button></div>
    </nav>
    <div style="flex:1;min-width:0">
      <header class="topbar"><button id="abrirMenu" aria-label="Abrir menú">${ico('menu', 'width="22" height="22"')}</button><img src="${LOGO_NEG}" alt="Duracreto"><span class="t">${esc(titulo)}</span></header>
      <main class="main" id="main">${contenido}</main>
    </div>
  </div>`;
}

function render() {
  if (!S.yo) return pantallaLogin();
  S.pendiente = false;
  const [path, query] = (location.hash.replace(/^#\/?/, '') || 'panel').split('?');
  const [ruta, id] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  const vistas = { panel: vPanel, inventario: vInventario, negocio: vNegocio, equipo: vEquipo, falla: vFalla, seguimiento: vSeguimiento, incidencia: vIncidencia, mantenimiento: vMantenimiento, reportes: vReportes, importar: vImportar, usuarios: vUsuarios };
  let v = vistas[ruta] || vPanel;
  if ((ruta === 'importar' && !can('importar')) || (ruta === 'usuarios' && !can('usuarios')) || (ruta === 'reportes' && !can('reportes')) || (ruta === 'falla' && !can('reportar'))) v = vPanel;
  const vista = v(id, params);
  document.title = `${vista.titulo} · Duracreto Maquinaria`;
  $('#app').innerHTML = marco(ruta, vista.titulo, vista.html);
  $('#salir').onclick = async () => { await S.db.logout(); S.yo = null; location.hash = ''; pantallaLogin(); };
  $('#miCuenta').onclick = miCuenta;
  enlazarInstalar();
  $('#abrirMenu').onclick = () => $('#shell').classList.toggle('menu-open');
  $('#shell').addEventListener('click', e => { if (e.target.closest('.nav')) $('#shell').classList.remove('menu-open'); });
  $('#shell').addEventListener('mousedown', e => { if ($('#shell').classList.contains('menu-open') && !e.target.closest('.side') && !e.target.closest('#abrirMenu')) $('#shell').classList.remove('menu-open'); });
  vista.bind && vista.bind($('#main'));
  if (!vista.mantenerScroll) window.scrollTo(0, 0);
}

// Controles reutilizables
const opts = (lista, sel, vacio) => (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '') + lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('');
const optNegocios = (sel, vacio = 'Todos los negocios') => opts([...S.D.negocios.map(n => [n.id, n.nombre]), ['__sin', 'Sin asignar']], sel, vacio);
const optPlantas = (sel, vacio = 'Todas las plantas', negocio = '') => opts(S.D.plantas.filter(p => !negocio || negocio === '__sin' || p.negocio_id === negocio || S.D.equipos.some(e => e.planta_id === p.id && e.negocio_id === negocio)).map(p => [p.id, p.nombre]), sel, vacio);
const filtraNeg = (e, n) => !n || (n === '__sin' ? !e.negocio_id : e.negocio_id === n);

// ================================================================ PANEL EJECUTIVO
function anillo(pctValor) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pctValor));
  const color = v >= 85 ? 'var(--ok)' : v >= 70 ? 'var(--warn)' : 'var(--bad)';
  return `<svg class="ring" viewBox="0 0 128 128" role="img" aria-label="Disponibilidad ${v} %">
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="12"/>
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${(c * v / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)"/>
    <text x="64" y="62" text-anchor="middle" class="ring-v">${v}%</text>
    <text x="64" y="82" text-anchor="middle" class="ring-l">disponible</text></svg>`;
}
function saludo() {
  const h = new Date().getHours();
  return (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches') + ', ' + (S.yo.nombre || S.yo.username).split(' ')[0];
}
function fechaLarga() {
  const t = new Date().toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}


// Costo de reparación de un equipo: el que puso el taller (o el Excel) en el equipo; si no hay,
// la suma de lo estimado en sus fallas abiertas. null = nadie ha puesto costo todavía.
function costoEquipo(e) {
  if (e.inversion_reparacion !== null && e.inversion_reparacion !== undefined && e.inversion_reparacion !== '') return Number(e.inversion_reparacion);
  const v = S.D.incidencias.filter(i => i.equipo_id === e.id && ABIERTA(i.estado) && i.costo_estimado != null && i.costo_estimado !== '');
  return v.length ? v.reduce((a, i) => a + Number(i.costo_estimado), 0) : null;
}
const parado = e => e.estado === 'inhabilitado' || e.estado === 'taller';
const sinCosto = e => parado(e) && costoEquipo(e) == null;
// Inversión pendiente: lo que falta invertir para dejar operativo lo que está parado o con falla abierta.
function inversionPendiente(eqs) {
  return eqs.reduce((t, e) => { const c = (parado(e) || S.D.incidencias.some(i => i.equipo_id === e.id && ABIERTA(i.estado))) ? costoEquipo(e) : null; return t + (c || 0); }, 0);
}

function vPanel() {
  const f = S.filtros.panel || (S.filtros.panel = { negocio: '' });
  if (!S.D.equipos.length) {
    return { titulo: 'Panel ejecutivo', html: `
      <div class="ph"><div><p class="eyebrow-p">${fechaLarga()}</p><h1>${esc(saludo())}</h1></div></div>
      <div class="card empty"><b>Todavía no hay equipos cargados</b>${can('importar') ? 'Cargue el inventario desde la hoja de maquinaria.<div style="margin-top:14px"><a class="btn primary" href="#/importar">Cargar inventario</a></div>' : 'El jefe de planta debe cargar el inventario.'}</div>` };
  }
  const eqs = S.D.equipos.filter(e => e.activo !== false && filtraNeg(e, f.negocio));
  const c = { habilitado: 0, inhabilitado: 0, taller: 0, sin_info: 0 };
  eqs.forEach(e => c[e.estado]++);
  const total = eqs.length, conEstado = total - c.sin_info;
  const disp = pct(c.habilitado, conEstado);

  const grupos = [...S.D.negocios.map(n => ({ id: n.id, nombre: n.nombre })), { id: '__sin', nombre: 'Sin negocio asignado' }]
    .map(g => { const l = S.D.equipos.filter(e => e.activo !== false && filtraNeg(e, g.id)); const k = { habilitado: 0, inhabilitado: 0, taller: 0, sin_info: 0 }; l.forEach(e => k[e.estado]++); return { ...g, n: l.length, k }; })
    .filter(g => g.n && (!f.negocio || g.id === f.negocio));

  const atencion = eqs.filter(e => e.estado === 'inhabilitado' || e.estado === 'taller')
    .sort((a, b) => (a.fecha_inhabilitado || '9999').localeCompare(b.fecha_inhabilitado || '9999'));
  const incAb = S.D.incidencias.filter(i => ABIERTA(i.estado) && filtraNeg(S.idx.eq.get(i.equipo_id) || {}, f.negocio));
  const viejas = incAb.filter(i => dias(i.fecha_reporte) > ALERTA_DIAS).sort((a, b) => a.fecha_reporte.localeCompare(b.fecha_reporte));
  const criticas = incAb.filter(i => i.prioridad === 'critica');
  const hoy = hoyISO(), mes = hoy.slice(0, 7);
  const vencidos = S.D.mantenimientos.filter(m => m.estado === 'programado' && m.fecha_programada && m.fecha_programada < hoy && filtraNeg(S.idx.eq.get(m.equipo_id) || {}, f.negocio));
  const sinNeg = S.D.equipos.filter(e => !e.negocio_id).length;
  const sinFecha = atencion.filter(e => !e.fecha_inhabilitado).length;
  const gastoMes = S.D.incidencias.filter(i => i.fecha_resolucion && i.fecha_resolucion.slice(0, 7) === mes && i.costo_real != null && filtraNeg(S.idx.eq.get(i.equipo_id) || {}, f.negocio)).reduce((a, i) => a + Number(i.costo_real), 0)
    + S.D.mantenimientos.filter(m => m.estado === 'ejecutado' && m.fecha_ejecucion && m.fecha_ejecucion.slice(0, 7) === mes && m.costo != null && filtraNeg(S.idx.eq.get(m.equipo_id) || {}, f.negocio)).reduce((a, m) => a + Number(m.costo), 0);
  const inversion = inversionPendiente(eqs);
  const asignadas = S.D.incidencias.filter(i => ABIERTA(i.estado) && i.responsable_id === S.yo.id).length;

  const alertas = [];
  if (viejas.length) alertas.push(['inhabilitado', `${viejas.length} incidencia${viejas.length > 1 ? 's' : ''} con más de ${ALERTA_DIAS} días`, `La más antigua: ${viejas[0].codigo} · ${eqNom(S.idx.eq.get(viejas[0].equipo_id))}`, '#/seguimiento']);
  if (criticas.length) alertas.push(['inhabilitado', `${criticas.length} falla${criticas.length > 1 ? 's' : ''} crítica${criticas.length > 1 ? 's' : ''} sin resolver`, criticas.slice(0, 3).map(i => i.codigo).join(' · '), '#/seguimiento']);
  if (vencidos.length) alertas.push(['taller', `${vencidos.length} mantenimiento${vencidos.length > 1 ? 's' : ''} vencido${vencidos.length > 1 ? 's' : ''}`, 'Programados con fecha anterior a hoy', '#/mantenimiento']);
  if (sinFecha) alertas.push(['sin_info', `${sinFecha} equipos parados sin fecha`, 'Registre desde cuándo están fuera de servicio', '#/inventario?estado=fuera']);
  const nSinCosto = can('costos') ? atencion.filter(sinCosto).length : 0;
  if (nSinCosto) alertas.push(['taller', `${nSinCosto} equipo${nSinCosto > 1 ? 's' : ''} parado${nSinCosto > 1 ? 's' : ''} sin costo de reparación`, can('editarEquipo') ? 'Toque para agregar cuánto costará repararlos' : 'Falta estimar cuánto costará repararlos', '#/inventario?estado=sincosto']);
  if (sinNeg && can('editarEquipo')) alertas.push(['sin_info', `${sinNeg} equipos sin negocio asignado`, 'Asígnelos desde la ficha de cada equipo', '#/inventario?negocio=__sin']);

  const mini = [
    ['Incidencias abiertas', incAb.length, criticas.length ? `${criticas.length} crítica${criticas.length > 1 ? 's' : ''}` : 'Ninguna crítica', '#/seguimiento'],
    ...(can('costos') ? [['Gasto del mes', L(gastoMes), 'Reparaciones y mantenimiento', can('reportes') ? '#/reportes' : null], ['Inversión pendiente', L(inversion), 'Estimado de las fallas abiertas', '#/seguimiento']] : []),
    ...(S.yo.rol === 'mantenimiento' ? [['Asignadas a mí', asignadas, 'Reparaciones pendientes', '#/seguimiento']] : [])
  ];
  const ult = S.D.importaciones && S.D.importaciones[0];

  const html = `
  <div class="ph">
    <div><p class="eyebrow-p">${fechaLarga()}</p><h1>${esc(saludo())}</h1></div>
    <div class="acts"><label class="sr" for="pNeg">Negocio</label><select class="ctl ctl-pill" id="pNeg">${optNegocios(f.negocio)}</select></div>
  </div>

  <section class="card hero" aria-label="Resumen de la maquinaria">
    <div class="hero-ring">${anillo(disp)}<div class="hero-tot"><b class="tnum">${total}</b><span>equipos en total</span></div></div>
    <div class="hero-stats">
      <a class="hs" href="#/inventario?estado=habilitado"><span class="l"><span class="dot habilitado"></span>Operativos</span><b class="tnum">${c.habilitado}</b><small>${pct(c.habilitado, total)} % del total</small></a>
      <a class="hs" href="#/inventario?estado=inhabilitado"><span class="l"><span class="dot inhabilitado"></span>Inhabilitados</span><b class="tnum">${c.inhabilitado}</b><small>${pct(c.inhabilitado, total)} % del total</small></a>
      <a class="hs" href="#/inventario?estado=taller"><span class="l"><span class="dot taller"></span>En taller</span><b class="tnum">${c.taller}</b><small>${pct(c.taller, total)} % del total</small></a>
      ${c.sin_info ? `<a class="hs muted" href="#/inventario?estado=sin_info"><span class="l"><span class="dot sin_info"></span>Sin información</span><b class="tnum">${c.sin_info}</b><small>por completar</small></a>` : ''}
    </div>
    <div class="hero-mini">${mini.map(([l, v, s, h]) => `<${h ? `a href="${h}"` : 'div'} class="mi"><span>${l}</span><b class="tnum">${v}</b><small>${s}</small></${h ? 'a' : 'div'}>`).join('')}</div>
  </section>

  <div class="row">
    <section class="card pad grow" aria-label="Disponibilidad por negocio">
      <div class="sec-h"><h2>Disponibilidad por negocio</h2>
        <div class="legend"><span><i style="background:var(--ok)"></i>Operativo</span><span><i style="background:var(--bad)"></i>Inhabilitado</span><span><i style="background:var(--warn)"></i>Taller</span></div></div>
      <div class="bars">${grupos.map(g => { const d = pct(g.k.habilitado, g.n - g.k.sin_info); return `<a class="brow brow-link" href="#/negocio/${encodeURIComponent(g.id)}" title="Ver equipos de ${esc(g.nombre)}">
        <div class="n"><b>${esc(g.nombre)}</b><small>${g.n} equipos${g.k.inhabilitado + g.k.taller ? ` · ${g.k.inhabilitado + g.k.taller} parados` : ''}</small></div>
        <div class="bar" role="img" aria-label="${esc(g.nombre)}: ${ORDEN_ESTADOS.map(s => `${g.k[s]} ${ESTADOS[s].toLowerCase()}`).join(', ')}">${ORDEN_ESTADOS.filter(s => g.k[s]).map(s => `<div class="${s}" style="width:${g.k[s] / g.n * 100}%" title="${ESTADOS[s]}: ${g.k[s]}"></div>`).join('')}</div>
        <span class="pct tnum ${d >= 85 ? 'ok' : d >= 70 ? 'warn' : 'bad'}">${d}%</span><span class="chev">›</span></a>`; }).join('')}
      </div>
    </section>
    <section class="card pad side-col" aria-label="Alertas">
      <div class="sec-h"><h2>Alertas</h2>${alertas.length ? `<span class="count">${alertas.length}</span>` : ''}</div>
      ${alertas.length ? `<div class="alerts">${alertas.map(([t, b, s, h]) => `<a class="alert" href="${h}"><span class="dot ${t}"></span><div><b>${esc(b)}</b><small>${esc(s)}</small></div><span class="chev">›</span></a>`).join('')}</div>` : '<p class="cap">Todo en orden. No hay alertas.</p>'}
    </section>
  </div>

  <section class="card pad" aria-label="Equipos que requieren atención">
    <div class="sec-h"><h2>Equipos parados más tiempo</h2><a class="link-sm" href="#/inventario?estado=fuera">Ver los ${atencion.length} →</a></div>
    ${atencion.length ? `<div class="att">${atencion.slice(0, 6).map(e => { const d = dias(e.fecha_inhabilitado); return `<a class="att-it" href="#/equipo/${e.id}">
      <div class="att-n"><b>${esc(eqNom(e))}</b><small>${esc(eqCod(e))} · ${esc(plantaNom(e.planta_id))}</small></div>
      <div class="att-c hm" title="${esc(e.causa_inactividad || '')}">${esc(e.causa_inactividad ? nombreBonito(e.causa_inactividad).slice(0, 70) : 'Sin causa registrada')}</div>
      <div class="att-s">${pillEq(e)}${can('costos') ? (costoEquipo(e) == null ? (can('editarEquipo') ? `<span class="chip cost-add" role="button" tabindex="0" data-estado-eq="${e.id}">+ Costo</span>` : '<span class="chip">Sin costo</span>') : `<span class="cost-v tnum">${L(costoEquipo(e))}</span>`) : ''}</div>
      <div class="att-d tnum ${d > ALERTA_DIAS ? 'late' : d > AVISO_DIAS ? 'late-soft' : ''}">${d == null ? '<span class="chip">Sin fecha</span>' : `<b>${d}</b> días`}</div></a>`; }).join('')}</div>` : '<p class="cap">No hay equipos fuera de servicio.</p>'}
  </section>
  <p class="foot-note">${ult ? `Inventario actualizado el ${fecha(ult.fecha)}` : ''}</p>`;
  return {
    titulo: 'Panel ejecutivo', html,
    bind: m => { $('#pNeg', m).onchange = e => { f.negocio = e.target.value; render(); }; }
  };
}

// ---------------------------------------------------------------- Cambio rápido de estado (taller)
const OPC_ESTADO = [
  ['habilitado', 'Operativo', 'Funciona y está trabajando', 'var(--ok)'],
  ['taller', 'En taller', 'En mantenimiento o reparación', 'var(--warn)'],
  ['inhabilitado', 'Inhabilitado', 'Parado, no se puede usar', 'var(--bad)']
];
function cambiarEstadoRapido(id) {
  const e = S.idx.eq.get(id);
  if (!e || !can('editarEquipo')) return;
  const abiertas = S.D.incidencias.filter(i => i.equipo_id === id && ABIERTA(i.estado));
  let sel = e.estado === 'sin_info' ? '' : e.estado;
  modal(`
    <div class="est-h"><h2>Estado y costo</h2><p class="cap">${esc(eqNom(e))} · ${esc(eqCod(e))}</p></div>
    <div class="est-ops" role="radiogroup" aria-label="Nuevo estado">
      ${OPC_ESTADO.map(([k, t, d, c]) => `<button type="button" class="est-op" role="radio" aria-checked="${k === sel}" data-k="${k}" style="--c:${c}">
        <span class="est-dot"></span><span class="est-t"><b>${t}</b><small>${d}</small></span>${k === e.estado ? '<span class="est-now">Actual</span>' : ''}</button>`).join('')}
    </div>
    <div id="estAviso" class="note" hidden></div>
    ${can('costos') ? `<label class="fld" id="estCostoF">Costo estimado de reparación<div class="money"><span>L</span><input class="ctl" id="estCosto" inputmode="decimal" placeholder="0.00" value="${costoEquipo(e) != null ? costoEquipo(e) : ''}"></div><small id="estCostoH">Suma a la inversión pendiente del panel.</small></label>` : ''}
    <label class="fld" id="estNotaF">Comentario (opcional)<textarea class="ctl" id="estNota" rows="2" placeholder="ej. Se cambió la bomba hidráulica"></textarea></label>
    <div class="err" id="estErr" hidden></div>
    <div class="form-acts" style="justify-content:space-between">
      ${can('reportar') ? `<a class="btn ghost" href="#/falla?equipo=${e.id}" data-cerrar>+ Reportar falla nueva</a>` : '<span></span>'}
      <div style="display:flex;gap:8px"><button class="btn" data-cerrar>Cancelar</button><button class="btn primary" id="estOk" disabled>Guardar</button></div>
    </div>`, (bg, cerrar) => {
    bg.querySelector('.modal').classList.add('est');
    const pintar = () => {
      $$('.est-op', bg).forEach(b => b.setAttribute('aria-checked', String(b.dataset.k === sel)));
      const cf = $('#estCostoF', bg);
      if (cf) cf.hidden = sel === 'habilitado';
      $('#estOk', bg).disabled = !sel || (sel === e.estado && !costoCambio());
      const av = $('#estAviso', bg);
      const txt = sel === 'habilitado' && abiertas.length ? `Tiene ${abiertas.length} falla${abiertas.length > 1 ? 's' : ''} abierta${abiertas.length > 1 ? 's' : ''} (${abiertas.map(i => i.codigo).join(', ')}): se marcará${abiertas.length > 1 ? 'n' : ''} como reparada${abiertas.length > 1 ? 's' : ''}.`
        : sel === 'taller' && abiertas.length ? `Las fallas abiertas de este equipo pasarán a «En reparación».`
        : sel === 'inhabilitado' && !abiertas.length && can('reportar') ? 'Consejo: si sabe qué falló, use «Reportar falla nueva» para registrar el costo y darle seguimiento.' : '';
      av.textContent = txt; av.hidden = !txt;
      $('#estNota', bg).placeholder = sel === 'habilitado' ? 'ej. Se cambió la bomba hidráulica' : 'ej. Falla en el sistema eléctrico';
    };
    const costoIni = costoEquipo(e);
    const leerCosto = () => { const i = $('#estCosto', bg); if (!i) return undefined; const t = i.value.replace(/[L,\s]/gi, ''); return t === '' ? null : Number(t); };
    const costoCambio = () => { const c = leerCosto(); return c !== undefined && sel !== 'habilitado' && c !== costoIni && !(c == null && costoIni == null); };
    $$('.est-op', bg).forEach(b => b.onclick = () => { sel = b.dataset.k; pintar(); });
    if ($('#estCosto', bg)) $('#estCosto', bg).addEventListener('input', pintar);
    $('#estOk', bg).onclick = async ev => {
      await accion(ev.currentTarget, async () => {
        const c = leerCosto();
        if (c !== undefined && c !== null && (isNaN(c) || c < 0)) throw new Error('Escriba el costo en números, por ejemplo 15000.');
        const r = await S.db.estadoRapido(id, sel, $('#estNota', bg).value.trim() || null, sel !== 'habilitado' && costoCambio() ? c : undefined);
        cerrar();
        await recargar(); render();
        toast(`${eqNom(e)}: ${ESTADOS[sel]}${r && r.incidencias ? ` · ${r.incidencias} falla${r.incidencias > 1 ? 's' : ''} actualizada${r.incidencias > 1 ? 's' : ''}` : ''}`);
      });
    };
    pintar();
  });
}
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-estado-eq]');
  if (!t) return;
  ev.preventDefault(); ev.stopPropagation();
  cambiarEstadoRapido(t.dataset.estadoEq);
}, true);
document.addEventListener('keydown', ev => {
  const t = ev.target.closest && ev.target.closest('span[data-estado-eq]');
  if (t && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); cambiarEstadoRapido(t.dataset.estadoEq); }
});

function filasClicables(m) {
  $$('tr.click', m).forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a,button,input,select')) location.hash = tr.dataset.href; }));
}


// ================================================================ DETALLE POR NEGOCIO (desde el panel)
function vNegocio(idRaw) {
  const id = decodeURIComponent(idRaw || '');
  const nom = id === '__sin' ? 'Sin negocio asignado' : negNom(id);
  const eqs = S.D.equipos.filter(e => e.activo !== false && filtraNeg(e, id));
  const k = { habilitado: 0, inhabilitado: 0, taller: 0, sin_info: 0 }; eqs.forEach(e => k[e.estado]++);
  const disp = pct(k.habilitado, eqs.length - k.sin_info);
  const parados = eqs.filter(parado).sort((a, b) => (a.fecha_inhabilitado || '9999').localeCompare(b.fecha_inhabilitado || '9999'));
  const inv = inversionPendiente(eqs);
  const nSin = parados.filter(e => costoEquipo(e) == null).length;
  const agrupar = clave => {
    const m = new Map();
    eqs.forEach(e => { const g = clave(e) || 'Sin dato'; if (!m.has(g)) m.set(g, { n: 0, k: { habilitado: 0, inhabilitado: 0, taller: 0, sin_info: 0 } }); const x = m.get(g); x.n++; x.k[e.estado]++; });
    return [...m.entries()].sort((a, b) => (b[1].k.inhabilitado + b[1].k.taller) - (a[1].k.inhabilitado + a[1].k.taller) || b[1].n - a[1].n);
  };
  const barras = (lista, href) => `<div class="bars">${lista.map(([g, x]) => { const d = pct(x.k.habilitado, x.n - x.k.sin_info); return `<${href ? `a href="${href(g)}"` : 'div'} class="brow${href ? ' brow-link' : ''}">
      <div class="n"><b>${esc(g)}</b><small>${x.n} equipo${x.n > 1 ? 's' : ''}${x.k.inhabilitado + x.k.taller ? ` · ${x.k.inhabilitado + x.k.taller} parado${x.k.inhabilitado + x.k.taller > 1 ? 's' : ''}` : ''}</small></div>
      <div class="bar">${ORDEN_ESTADOS.filter(s => x.k[s]).map(s => `<div class="${s}" style="width:${x.k[s] / x.n * 100}%" title="${ESTADOS[s]}: ${x.k[s]}"></div>`).join('')}</div>
      <span class="pct tnum ${d >= 85 ? 'ok' : d >= 70 ? 'warn' : 'bad'}">${d}%</span>${href ? '<span class="chev">›</span>' : ''}</${href ? 'a' : 'div'}>`; }).join('')}</div>`;
  const porPlanta = agrupar(e => plantaNom(e.planta_id) === '—' ? null : plantaNom(e.planta_id));
  const porTipo = agrupar(e => e.tipo);
  const plantaId = new Map(S.D.plantas.map(p => [p.nombre, p.id]));
  const html = `
  <div><a class="back" href="#/panel">${ico('atras', 'width="16" height="16"')}Panel ejecutivo</a>
  <div class="ph"><div><p class="eyebrow-p">Negocio</p><h1>${esc(nom)}</h1></div>
    <div class="acts"><a class="btn" href="#/inventario?negocio=${encodeURIComponent(id)}&estado=">Ver inventario completo</a></div></div></div>
  <section class="card hero" aria-label="Resumen del negocio">
    <div class="hero-ring">${anillo(disp)}<div class="hero-tot"><b class="tnum">${eqs.length}</b><span>equipos</span></div></div>
    <div class="hero-stats">
      <a class="hs" href="#/inventario?negocio=${encodeURIComponent(id)}&estado=habilitado"><span class="l"><span class="dot habilitado"></span>Operativos</span><b class="tnum">${k.habilitado}</b><small>${pct(k.habilitado, eqs.length)} %</small></a>
      <a class="hs" href="#/inventario?negocio=${encodeURIComponent(id)}&estado=inhabilitado"><span class="l"><span class="dot inhabilitado"></span>Inhabilitados</span><b class="tnum">${k.inhabilitado}</b><small>${pct(k.inhabilitado, eqs.length)} %</small></a>
      <a class="hs" href="#/inventario?negocio=${encodeURIComponent(id)}&estado=taller"><span class="l"><span class="dot taller"></span>En taller</span><b class="tnum">${k.taller}</b><small>${pct(k.taller, eqs.length)} %</small></a>
      ${can('costos') ? `<a class="hs" href="#/inventario?negocio=${encodeURIComponent(id)}&estado=${nSin ? 'sincosto' : 'fuera'}"><span class="l">Inversión pendiente</span><b class="tnum" style="font-size:22px">${L(inv)}</b><small>${nSin ? `${nSin} parado${nSin > 1 ? 's' : ''} sin costo` : 'Todos con costo'}</small></a>` : ''}
    </div>
  </section>
  <div class="row">
    <section class="card pad grow"><div class="sec-h"><h2>Por planta</h2></div>${porPlanta.length ? barras(porPlanta, g => plantaId.has(g) ? `#/inventario?negocio=${encodeURIComponent(id)}&planta=${plantaId.get(g)}&estado=` : null) : '<p class="cap">Sin plantas.</p>'}</section>
    <section class="card pad grow"><div class="sec-h"><h2>Por tipo de equipo</h2></div>${barras(porTipo.slice(0, 8))}</section>
  </div>
  <section class="card pad"><div class="sec-h"><h2>Equipos parados</h2>${parados.length ? `<a class="link-sm" href="#/inventario?negocio=${encodeURIComponent(id)}&estado=fuera">Ver los ${parados.length} →</a>` : ''}</div>
    ${parados.length ? `<div class="att">${parados.slice(0, 8).map(e => { const d = dias(e.fecha_inhabilitado); return `<a class="att-it" href="#/equipo/${e.id}">
      <div class="att-n"><b>${esc(eqNom(e))}</b><small>${esc(eqCod(e))} · ${esc(plantaNom(e.planta_id))}</small></div>
      <div class="att-c hm">${esc(e.causa_inactividad ? nombreBonito(e.causa_inactividad).slice(0, 70) : 'Sin causa registrada')}</div>
      <div class="att-s">${pillEq(e)}${can('costos') ? (costoEquipo(e) == null ? (can('editarEquipo') ? `<span class="chip cost-add" role="button" tabindex="0" data-estado-eq="${e.id}">+ Costo</span>` : '<span class="chip">Sin costo</span>') : `<span class="cost-v tnum">${L(costoEquipo(e))}</span>`) : ''}</div>
      <div class="att-d tnum ${d > ALERTA_DIAS ? 'late' : d > AVISO_DIAS ? 'late-soft' : ''}">${d == null ? '<span class="chip">Sin fecha</span>' : `<b>${d}</b> días`}</div></a>`; }).join('')}</div>` : '<p class="cap">Todo el equipo de este negocio está operativo.</p>'}
  </section>`;
  return { titulo: nom, html };
}

// ================================================================ INVENTARIO
function vInventario(_, params) {
  const f = S.filtros.inv || (S.filtros.inv = { q: '', negocio: '', planta: '', estado: '', tipo: '' });
  if (params.estado !== undefined) { f.estado = params.estado; f.pag = 1; }
  if (params.negocio !== undefined) { f.negocio = params.negocio; f.planta = params.planta || ''; f.pag = 1; }
  if (params.estado !== undefined || params.negocio !== undefined) history.replaceState(null, '', '#/inventario');
  const tipos = [...new Set(S.D.equipos.map(e => e.tipo).filter(Boolean))].sort();

  const html = `
  <div class="ph">
    <div><h1>Inventario de equipos</h1><p id="invCuenta"></p></div>
    <div class="acts">
      ${can('exportar') ? `<button class="btn" id="invCsv">${ico('descargar')}Exportar CSV</button>` : ''}
      ${can('importar') ? '<a class="btn hm" href="#/importar">Actualizar desde la hoja</a>' : ''}
      ${can('editarEquipo') ? '<button class="btn primary" id="invNuevo">+ Nuevo equipo</button>' : ''}
    </div>
  </div>
  <div class="segs" id="invSeg" role="tablist" aria-label="Estado"></div>
  <div class="card filters" role="search">
    <div class="search">${ico('buscar')}<label class="sr" for="invQ">Buscar</label><input class="ctl" id="invQ" type="search" placeholder="Buscar equipo, código, serie o ubicación" value="${esc(f.q)}"></div>
    <label class="sr" for="invNeg">Negocio</label><select class="ctl" id="invNeg">${optNegocios(f.negocio)}</select>
    <label class="sr" for="invPl">Planta</label><select class="ctl" id="invPl">${optPlantas(f.planta, 'Todas las plantas', f.negocio)}</select>
    <label class="sr" for="invTipo">Tipo</label><select class="ctl hm" id="invTipo">${opts(tipos.map(t => [t, t]), f.tipo, 'Todos los tipos')}</select>
  </div>
  <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Equipo</th><th class="hm">Negocio</th><th class="hm">Planta</th><th class="hm">Marca / modelo</th><th>Estado</th><th class="hm">Observaciones</th>
  </tr></thead><tbody id="invBody"></tbody></table></div><div class="tbl-foot" id="invFoot"></div></section>`;

  const POR_PAG = 20;
  f.pag = f.pag || 1;
  const base = () => {
    const q = f.q.trim().toUpperCase();
    return S.D.equipos.filter(e => e.activo !== false && filtraNeg(e, f.negocio) && (!f.planta || String(e.planta_id) === f.planta)
      && (!f.tipo || e.tipo === f.tipo)
      && (!q || [e.clave, e.codigo, e.codigo_sap, e.serie, e.descripcion, e.marca, e.modelo, e.ubicacion_excel, plantaNom(e.planta_id)].some(x => String(x || '').toUpperCase().includes(q))));
  };
  const porEstado = (l, st) => !st ? l : l.filter(e => st === 'fuera' ? parado(e) : st === 'sincosto' ? sinCosto(e) : e.estado === st);
  const filtrar = () => porEstado(base(), f.estado);
  const pintar = m => {
    const b = base(), l = porEstado(b, f.estado);
    const paginas = Math.max(1, Math.ceil(l.length / POR_PAG));
    if (f.pag > paginas) f.pag = paginas;
    const vis = l.slice((f.pag - 1) * POR_PAG, f.pag * POR_PAG);
    $('#invCuenta', m).textContent = `${S.D.equipos.length} equipos registrados`;
    $('#invSeg', m).innerHTML = [['', 'Todos'], ['habilitado', 'Operativos'], ['fuera', 'Parados'], ['inhabilitado', 'Inhabilitados'], ['taller', 'En taller'], ['sin_info', 'Sin información'], ...(can('costos') ? [['sincosto', 'Parados sin costo']] : [])]
      .map(([k, t]) => { const n = porEstado(b, k).length; return n || !k ? `<button role="tab" aria-selected="${f.estado === k}" data-e="${k}">${k && k !== 'fuera' ? `<span class="dot ${k}"></span>` : ''}${t}<span class="n">${n}</span></button>` : ''; }).join('');
    $$('#invSeg button', m).forEach(x => x.onclick = () => { f.estado = x.dataset.e; f.pag = 1; pintar(m); });
    $('#invBody', m).innerHTML = vis.length ? vis.map(e => `<tr class="click" data-href="#/equipo/${e.id}">
      <td><a class="lk" href="#/equipo/${e.id}">${esc(eqNom(e))}</a><span class="sub">${esc(eqCod(e))}<span class="sm-only"> · ${esc(plantaNom(e.planta_id))}</span></span></td>
      <td class="nw hm">${esc(negNom(e.negocio_id))}</td><td class="nw hm">${esc(plantaNom(e.planta_id))}</td>
      <td class="hm">${e.marca || e.modelo ? esc([e.marca, e.modelo, e.anio].filter(Boolean).join(' · ')) : '<span class="cap">—</span>'}</td>
      <td>${pillEq(e)}${can('costos') && parado(e) ? (costoEquipo(e) == null ? (can('editarEquipo') ? ` <span class="chip cost-add" role="button" tabindex="0" data-estado-eq="${e.id}">+ Costo</span>` : ' <span class="chip">Sin costo</span>') : `<span class="sub tnum">${L(costoEquipo(e))}</span>`) : ''}</td><td class="clip hm" title="${esc(e.observaciones || e.causa_inactividad || '')}" style="color:var(--muted)">${esc(e.observaciones || (e.causa_inactividad ? nombreBonito(e.causa_inactividad) : '') || '—')}</td></tr>`).join('')
      : '<tr><td colspan="6"><div class="empty"><b>Sin resultados</b>Pruebe con otros filtros.</div></td></tr>';
    $('#invFoot', m).innerHTML = l.length ? `<span>${(f.pag - 1) * POR_PAG + 1}–${Math.min(f.pag * POR_PAG, l.length)} de ${l.length}</span>
      <div class="pager"><button class="btn sm" id="pgA" ${f.pag <= 1 ? 'disabled' : ''}>Anterior</button><span class="cap">Página ${f.pag} de ${paginas}</span><button class="btn sm" id="pgS" ${f.pag >= paginas ? 'disabled' : ''}>Siguiente</button></div>` : '';
    const pa = $('#pgA', m), ps = $('#pgS', m);
    if (pa) pa.onclick = () => { f.pag--; pintar(m); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    if (ps) ps.onclick = () => { f.pag++; pintar(m); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    filasClicables(m);
    return l;
  };
  return {
    titulo: 'Inventario', html,
    bind: m => {
      pintar(m);
      $('#invQ', m).oninput = debounce(e => { f.q = e.target.value; f.pag = 1; pintar(m); });
      $('#invNeg', m).onchange = e => { f.negocio = e.target.value; f.planta = ''; f.pag = 1; render(); };
      $('#invPl', m).onchange = e => { f.planta = e.target.value; f.pag = 1; pintar(m); };
      $('#invTipo', m).onchange = e => { f.tipo = e.target.value; f.pag = 1; pintar(m); };
      if ($('#invCsv', m)) $('#invCsv', m).onclick = () => {
        const l = filtrar();
        csv(`inventario-maquinaria-${hoyISO()}.csv`,
          ['Código', 'Código SAP', 'Equipo', 'Tipo', 'Negocio', 'Planta', 'Ubicación (Excel)', 'Marca', 'Modelo', 'Año', 'Estado', 'Fecha inhabilitado', 'Días fuera', 'Causa', 'Observaciones'],
          l.map(e => [e.codigo || e.clave, e.codigo_sap, e.descripcion, e.tipo, negNom(e.negocio_id), plantaNom(e.planta_id), e.ubicacion_excel, e.marca, e.modelo, e.anio, ESTADOS[e.estado], fecha(e.fecha_inhabilitado), dias(e.fecha_inhabilitado) ?? '', e.causa_inactividad, e.observaciones]));
      };
      const nb = $('#invNuevo', m); if (nb) nb.onclick = () => formEquipo(null);
    }
  };
}

function formEquipo(eq) {
  const e = eq || { estado: 'habilitado' };
  modal(`
    <h2>${eq ? 'Editar equipo' : 'Nuevo equipo'}</h2>
    <form class="form" id="fe" novalidate>
      <div class="grid2">
        <label class="fld">Código interno<input class="ctl" name="codigo" value="${esc(e.codigo || '')}" placeholder="ej. 45BC-14" ${eq && eq.origen === 'excel' ? 'readonly' : ''}>${eq && eq.origen === 'excel' ? '<small>Viene del Excel; se cambia en el archivo.</small>' : ''}</label>
        <label class="fld">Código SAP<input class="ctl" name="codigo_sap" value="${esc(e.codigo_sap || '')}" placeholder="ej. MAQ00181" ${eq && eq.origen === 'excel' ? 'readonly' : ''}></label>
      </div>
      <label class="fld">Descripción del equipo<input class="ctl" name="descripcion" required value="${esc(e.descripcion || '')}"></label>
      <div class="grid2">
        <label class="fld">Tipo<input class="ctl" name="tipo" value="${esc(e.tipo || '')}" list="dlTipos" placeholder="ej. Camion Concretero"></label>
        <label class="fld">Negocio<select class="ctl" name="negocio_id">${opts(S.D.negocios.map(n => [n.id, n.nombre]), e.negocio_id, 'Sin asignar')}</select></label>
        <label class="fld">Planta<select class="ctl" name="planta_id">${opts(S.D.plantas.map(p => [p.id, p.nombre]), e.planta_id, 'Sin planta')}</select></label>
      </div>
      <datalist id="dlTipos">${[...new Set(S.D.equipos.map(x => x.tipo).filter(Boolean))].sort().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      <div class="grid2">
        <label class="fld">Marca<input class="ctl" name="marca" value="${esc(e.marca || '')}"></label>
        <label class="fld">Modelo<input class="ctl" name="modelo" value="${esc(e.modelo || '')}"></label>
        <label class="fld">Año<input class="ctl" name="anio" inputmode="numeric" value="${esc(e.anio || '')}"></label>
      </div>
      <label class="fld">Número de serie<input class="ctl" name="serie" value="${esc(e.serie || '')}" placeholder="Serie, VIN o chasis"></label>
      <div class="grid2">
        <label class="fld">Estado operativo<select class="ctl" name="estado">${opts(ORDEN_ESTADOS.map(s => [s, ESTADOS[s]]), e.estado)}</select></label>
        <label class="fld">Fecha en que se inhabilitó<input class="ctl" type="date" name="fecha_inhabilitado" value="${esc(e.fecha_inhabilitado || '')}"><small>Solo si está fuera de servicio</small></label>
      </div>
      <label class="fld">Causa de inactividad<input class="ctl" name="causa_inactividad" value="${esc(e.causa_inactividad || '')}"></label>
      <label class="fld">Observaciones<textarea class="ctl" name="observaciones">${esc(e.observaciones || '')}</textarea></label>
      <div class="err" id="feErr" hidden></div>
      <div class="form-acts"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`, (bg, cerrar) => {
    $('#fe', bg).onsubmit = async ev => {
      ev.preventDefault();
      const fd = Object.fromEntries(new FormData(ev.target));
      const err = $('#feErr', bg);
      const show = t => { err.textContent = t; err.hidden = false; };
      if (!fd.descripcion?.trim()) return show('Escriba la descripción del equipo.');
      const anio = numOrNull(fd.anio);
      if (fd.anio && (!Number.isInteger(anio) || anio < 1950 || anio > 2100)) return show('El año debe ser un número entre 1950 y 2100.');
      const datos = {
        descripcion: fd.descripcion.trim(), tipo: fd.tipo?.trim() || null, negocio_id: fd.negocio_id || null, planta_id: fd.planta_id ? Number(fd.planta_id) : null,
        marca: fd.marca?.trim() || null, modelo: fd.modelo?.trim() || null, anio, estado: fd.estado, serie: fd.serie?.trim().toUpperCase() || null,
        fecha_inhabilitado: ['inhabilitado', 'taller'].includes(fd.estado) ? (fd.fecha_inhabilitado || null) : null,
        causa_inactividad: fd.causa_inactividad?.trim() || null, observaciones: fd.observaciones?.trim() || null
      };
      if (!eq || eq.origen !== 'excel') {
        const codigo = fd.codigo?.trim().toUpperCase() || null, sap = fd.codigo_sap?.trim().toUpperCase() || null;
        if (!codigo && !sap && !datos.serie) return show('Indique el código interno, el código SAP o el número de serie.');
        Object.assign(datos, { codigo, codigo_sap: sap });
        if (!eq) {
          datos.clave = codigo || sap || datos.serie;
          if (datos.serie && S.D.equipos.some(x => x.serie && x.serie === datos.serie)) return show(`Ya existe un equipo con la serie ${datos.serie}.`);
          if (S.D.equipos.some(x => x.clave === datos.clave)) return show(`Ya existe un equipo con el código ${datos.clave}.`);
        }
      }
      if (eq) datos.id = eq.id;
      const ok = await accion(ev.submitter, async () => { const r = await S.db.guardarEquipo(datos); await recargar(); cerrar(); toast('Equipo guardado'); location.hash = '#/equipo/' + (r.id || eq.id); render(); });
      if (!ok) return;
    };
  });
}

// ---------------------------------------------------------------- ficha
function vEquipo(id) {
  const e = S.idx.eq.get(id);
  if (!e) return { titulo: 'Equipo', html: `<a class="back" href="#/inventario">${ico('atras', 'width="16" height="16"')}Inventario</a><div class="card empty"><b>Equipo no encontrado</b>Puede que no tenga acceso a su planta.</div>` };
  const incs = (S.idx.incPorEq.get(id) || []);
  const mants = (S.idx.mantPorEq.get(id) || []).slice().sort((a, b) => (b.fecha_ejecucion || b.fecha_programada || '').localeCompare(a.fecha_ejecucion || a.fecha_programada || ''));
  const estados = S.D.estados.filter(x => x.equipo_id === id).slice().reverse();
  const d = dias(e.fecha_inhabilitado);
  const hist = [
    ...incs.map(i => ({ f: i.created_at || i.fecha_reporte, t: `Falla ${i.codigo}`, x: `${i.descripcion} · ${INC[i.estado][0]}`, h: `#/incidencia/${i.id}` })),
    ...mants.map(m => ({ f: m.fecha_ejecucion || m.fecha_programada || m.created_at, t: `Mantenimiento ${m.tipo}`, x: `${m.descripcion} · ${MANT[m.estado]}` })),
    ...estados.map(s => ({ f: s.fecha, t: 'Cambio de estado', x: `${s.estado_anterior ? ESTADOS[s.estado_anterior] + ' → ' : ''}${ESTADOS[s.estado_nuevo]}${s.origen === 'excel' ? ' (importación de Excel)' : ''}`, u: s.usuario_id }))
  ].sort((a, b) => String(b.f).localeCompare(String(a.f)));

  const html = `
  <div><a class="back" href="#/inventario">${ico('atras', 'width="16" height="16"')}Inventario</a>
  <div class="ph"><div>
    <h1>${esc(eqNom(e))}</h1>
    <p style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span>${esc(eqCod(e))}${e.codigo_sap && e.codigo ? ' · ' + esc(e.codigo_sap) : ''}</span>${pillEq(e)}${d != null && e.estado !== 'habilitado' ? `<span class="${d > ALERTA_DIAS ? 'late' : ''}">${d} días fuera de servicio</span>` : ''}</p></div>
    <div class="acts">
      ${can('editarEquipo') ? `<button class="btn primary" data-estado-eq="${e.id}">Cambiar estado</button>` : ''}
      ${can('reportar') ? `<a class="btn${can('editarEquipo') ? '' : ' primary'}" href="#/falla?equipo=${e.id}">Reportar falla</a>` : ''}
      ${can('mantener') ? '<button class="btn" id="eqMant">Programar mantenimiento</button>' : ''}
      ${can('editarEquipo') ? '<button class="btn" id="eqEdit">Editar</button>' : ''}
    </div></div></div>
  <div class="row top">
    <div class="grow" style="display:flex;flex-direction:column;gap:16px">
      <section class="card pad"><h2 style="margin-bottom:14px">Datos del equipo</h2>
        <dl class="dl">
          <div><dt>Negocio</dt><dd>${esc(negNom(e.negocio_id))}</dd></div>
          <div><dt>Planta</dt><dd>${esc(plantaNom(e.planta_id))}</dd></div>
          <div><dt>Ubicación en el Excel</dt><dd>${esc(e.ubicacion_excel || '—')}</dd></div>
          <div><dt>Tipo</dt><dd>${esc(e.tipo || '—')}</dd></div>
          <div><dt>Número de serie</dt><dd>${esc(e.serie || '—')}</dd></div>
          <div><dt>Marca</dt><dd>${esc(e.marca || '—')}</dd></div>
          <div><dt>Modelo</dt><dd>${esc(e.modelo || '—')}</dd></div>
          <div><dt>Año</dt><dd>${esc(e.anio || '—')}</dd></div>
          <div><dt>Condición general</dt><dd>${e.condicion_pct != null ? e.condicion_pct + ' %' : '—'}</dd></div>
          ${e.consumo_combustible ? `<div><dt>Consumo (gal/h)</dt><dd>${esc(e.consumo_combustible)}</dd></div>` : ''}
          <div><dt>Inhabilitado desde</dt><dd>${fecha(e.fecha_inhabilitado)}</dd></div>
          ${e.plazo_reparacion ? `<div><dt>Plazo de reparación</dt><dd>${PLAZO[e.plazo_reparacion]}</dd></div>` : ''}
          ${can('costos') ? `<div><dt>Inversión para reparación</dt><dd>${L2(e.inversion_reparacion)}</dd></div>` : ''}
          <div><dt>Origen</dt><dd>${e.origen === 'excel' ? `Excel · ${esc(e.hoja_origen || '')}${e.fila_origen ? ', fila ' + e.fila_origen : ''}` : 'Registro manual'}</dd></div>
        </dl>
        ${e.causa_inactividad ? `<div class="note" style="margin-top:16px"><b>Causa de inactividad: </b>${esc(nombreBonito(e.causa_inactividad))}</div>` : ''}
      </section>
      <section class="card pad"><h2 style="margin-bottom:12px">Historial de incidencias y mantenimientos</h2>
        ${hist.length ? `<div class="tl">${hist.map(h => `<div class="it"><i></i><div><small>${fechaHora(h.f)} · <b>${esc(h.t)}</b>${h.u ? ' · ' + esc(perfilNom(h.u)) : ''}</small><p>${h.h ? `<a href="${h.h}">${esc(h.x)}</a>` : esc(h.x)}</p></div></div>`).join('')}</div>` : '<p class="cap">Sin registros todavía.</p>'}
      </section>
    </div>
    <div class="side-col" style="display:flex;flex-direction:column;gap:16px">
      <section class="card pad"><h2 style="margin-bottom:10px">Observaciones</h2>
        ${can('observaciones') ? `<form id="obsF" class="form" style="gap:10px"><label class="sr" for="obsT">Observaciones</label><textarea class="ctl" id="obsT" rows="4">${esc(e.observaciones || '')}</textarea><button class="btn dark" type="submit" style="align-self:flex-start">Guardar observaciones</button></form>`
        : `<p style="font-size:13px">${esc(e.observaciones || 'Sin observaciones.')}</p>`}
      </section>
      <section class="card pad"><h2 style="margin-bottom:10px">Incidencias abiertas</h2>
        ${incs.filter(i => ABIERTA(i.estado)).map(i => `<p style="font-size:13px;margin-bottom:8px"><a class="lk" href="#/incidencia/${i.id}"><b>${i.codigo}</b></a> · ${tsPill(i.estado)}<br><span class="cap">${esc(i.descripcion)}</span></p>`).join('') || '<p class="cap">Ninguna.</p>'}
      </section>
    </div>
  </div>`;
  return {
    titulo: eqNom(e), html,
    bind: m => {
      const eb = $('#eqEdit', m); if (eb) eb.onclick = () => formEquipo(e);
      const mb = $('#eqMant', m); if (mb) mb.onclick = () => formMantenimiento({ equipo_id: e.id, tipo: 'preventivo', estado: 'programado' });
      const of = $('#obsF', m); if (of) of.onsubmit = async ev => { ev.preventDefault(); await accion(ev.submitter, async () => { await S.db.actualizarObservaciones(e.id, $('#obsT', m).value.trim()); await recargar(); toast('Observaciones guardadas'); }); };
    }
  };
}

// ================================================================ REPORTAR FALLA
function vFalla(_, params) {
  const visibles = S.D.equipos.filter(e => e.activo !== false).sort((a, b) => eqCod(a).localeCompare(eqCod(b)));
  const etiqueta = e => `${eqCod(e)} · ${nombreBonito(e.descripcion)}${e.serie ? ' · Serie ' + e.serie : ''}`;
  const pre = params.equipo ? S.idx.eq.get(params.equipo) : null;
  const html = `
  <div class="ph"><div><h1>Reportar falla</h1><p>Escriba el equipo; si no está en el inventario, se agrega solo.</p></div></div>
  <div class="row top" style="max-width:1100px">
    <form class="card pad form grow" id="ff" novalidate>
      <label class="fld">Equipo afectado
        <input class="ctl" id="ffEq" list="dlEq" autocomplete="off" placeholder="Código, nombre o número de serie" value="${pre ? esc(etiqueta(pre)) : ''}" required>
        <datalist id="dlEq">${visibles.map(e => `<option value="${esc(etiqueta(e))}">`).join('')}</datalist>
        <small id="ffEqH">Elija de la lista o escriba un equipo nuevo.</small>
      </label>
      <div class="grid2" id="ffInfo" ${pre ? '' : 'hidden'}>
        <label class="fld">Negocio<input class="ctl" id="ffNeg" readonly value="${pre ? esc(negNom(pre.negocio_id)) : ''}"></label>
        <label class="fld">Planta<input class="ctl" id="ffPl" readonly value="${pre ? esc(plantaNom(pre.planta_id)) : ''}"></label>
      </div>
      <fieldset class="nuevo-eq" id="ffNuevo" hidden>
        <legend><span class="chip ok-chip">Equipo nuevo</span> Se agregará al inventario</legend>
        <label class="fld">Nombre del equipo<input class="ctl" id="nqDesc" placeholder="ej. Camión concretero Mack"></label>
        <div class="grid2">
          <label class="fld">Negocio<select class="ctl" id="nqNeg">${opts(S.D.negocios.map(n => [n.id, n.nombre]), '', 'Elija el negocio')}</select></label>
          <label class="fld">Planta<select class="ctl" id="nqPl">${opts(S.D.plantas.map(p => [p.id, p.nombre]), '', 'Sin planta')}</select></label>
        </div>
        <div class="grid2">
          <label class="fld">Código interno<input class="ctl" id="nqCod" placeholder="Opcional · ej. 45BC-30"></label>
          <label class="fld">Número de serie<input class="ctl" id="nqSerie" placeholder="Opcional · serie, VIN o chasis"></label>
        </div>
        <div class="grid2">
          <label class="fld">Marca<input class="ctl" id="nqMarca" placeholder="Opcional"></label>
          <label class="fld">Modelo<input class="ctl" id="nqModelo" placeholder="Opcional"></label>
        </div>
      </fieldset>
      <label class="fld">Descripción de la falla<textarea class="ctl" id="ffDesc" placeholder="Qué ocurre, desde cuándo y en qué condiciones" required></textarea></label>
      <div class="grid2">
        <label class="fld">Costo aproximado de la reparación<div class="money"><span>L</span><input class="ctl" id="ffCosto" inputmode="decimal" placeholder="0.00" required></div><small>Suma a la inversión pendiente del panel.</small></label>
        <label class="fld">Fecha del reporte<input class="ctl" id="ffFecha" type="date" value="${hoyISO()}" max="${hoyISO()}"></label>
      </div>
      <label class="fld">Causa, si se conoce<input class="ctl" id="ffCausa" placeholder="Opcional"></label>
      <fieldset style="border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:8px">
        <legend class="fld" style="padding:0;margin-bottom:8px">Prioridad</legend>
        <div class="seg" id="ffPrio">${Object.entries(PRIO).map(([k, [l, c]]) => `<button type="button" data-p="${k}" aria-pressed="${k === 'media'}"><span class="dot" style="background:${c}"></span>${l}</button>`).join('')}</div>
        <small class="cap" id="ffPrioH">${PRIO.media[2]}</small>
      </fieldset>
      <label class="check"><input type="checkbox" id="ffFuera"><span><b>El equipo quedó fuera de servicio</b><br><span class="cap">Pasa a «Inhabilitado» y baja la disponibilidad del panel hasta que se repare.</span></span></label>
      <div class="fld">Fotografías o archivos
        <label class="drop">${ico('importar', 'width="22" height="22"')}<b style="font-size:13px">Toque para tomar una foto o elegir archivos</b><span class="cap">JPG, PNG o PDF · hasta 10 MB cada uno</span>
          <input type="file" id="ffFiles" multiple accept="image/*,application/pdf"></label>
        <div id="ffFileList" class="cap"></div>
      </div>
      <div class="err" id="ffErr" hidden></div>
      <div class="form-acts"><a class="btn" href="#/seguimiento">Cancelar</a><button class="btn primary" type="submit">Registrar falla</button></div>
    </form>
    <aside class="card pad side-col"><h2 style="margin-bottom:10px">Qué pasa al registrar</h2>
      <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--fg-2)">
        <li>Se asigna un código único (INC-0001, INC-0002…) y aparece en Seguimiento.</li>
        <li>Si el equipo no existía, se agrega al inventario y cuenta en el total y en su negocio.</li>
        <li>El costo aproximado suma a la inversión pendiente.</li>
        <li>Si quedó fuera de servicio, el panel lo refleja al instante.</li>
      </ol></aside>
  </div>`;
  return {
    titulo: 'Reportar falla', html,
    bind: m => {
      let eq = pre, prioSel = 'media', fueraTocado = false, files = [];
      const N = k => k.toUpperCase().replace(/\s+/g, ' ').trim();
      const resolver = () => {
        const v = $('#ffEq', m).value.trim(), V = N(v);
        eq = !v ? null : visibles.find(e => etiqueta(e) === v) || visibles.find(e => [e.clave, e.codigo, e.codigo_sap, e.serie].some(c => c && N(String(c)) === V)) || null;
        $('#ffInfo', m).hidden = !eq;
        $('#ffNuevo', m).hidden = !!eq || !v;
        $('#ffNeg', m).value = eq ? negNom(eq.negocio_id) : '';
        $('#ffPl', m).value = eq ? plantaNom(eq.planta_id) : '';
        $('#ffEqH', m).textContent = eq ? 'Equipo del inventario.' : v ? 'No está en el inventario: complete los datos de abajo y se agregará.' : 'Elija de la lista o escriba un equipo nuevo.';
        if (!eq && v && !$('#nqDesc', m).dataset.tocado) $('#nqDesc', m).value = v;
      };
      $('#nqDesc', m).addEventListener('input', e => { e.target.dataset.tocado = '1'; });
      $('#nqNeg', m).onchange = e => { $('#nqPl', m).innerHTML = optPlantas('', 'Sin planta', e.target.value); };
      $('#ffEq', m).addEventListener('input', resolver);
      $('#ffEq', m).addEventListener('change', resolver);
      $('#ffFuera', m).onchange = () => { fueraTocado = true; };
      $$('#ffPrio button', m).forEach(b => b.onclick = () => {
        prioSel = b.dataset.p;
        $$('#ffPrio button', m).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        $('#ffPrioH', m).textContent = PRIO[prioSel][2];
        if (!fueraTocado) $('#ffFuera', m).checked = ['alta', 'critica'].includes(prioSel);
      });
      $('#ffFiles', m).onchange = ev => {
        files = [...ev.target.files];
        const grandes = files.filter(f => f.size > 10 * 1024 * 1024);
        if (grandes.length) { toast(`${grandes.map(f => f.name).join(', ')} supera 10 MB y no se adjuntará.`, true); files = files.filter(f => f.size <= 10 * 1024 * 1024); }
        $('#ffFileList', m).textContent = files.length ? files.map(f => f.name).join(' · ') : '';
      };
      $('#ff', m).onsubmit = async ev => {
        ev.preventDefault();
        resolver();
        const err = $('#ffErr', m), show = t => { err.textContent = t; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
        err.hidden = true;
        const typed = $('#ffEq', m).value.trim();
        if (!eq && !typed) return show('Escriba o elija el equipo afectado.');
        let nuevo = null;
        if (!eq) {
          const desc = $('#nqDesc', m).value.trim();
          if (desc.length < 3) return show('Escriba el nombre del equipo nuevo.');
          if (!$('#nqNeg', m).value) return show('Elija a qué negocio pertenece el equipo nuevo.');
          nuevo = { descripcion: desc, negocio_id: $('#nqNeg', m).value, planta_id: $('#nqPl', m).value ? Number($('#nqPl', m).value) : null,
            codigo: $('#nqCod', m).value.trim().toUpperCase() || null, serie: $('#nqSerie', m).value.trim().toUpperCase() || null,
            marca: $('#nqMarca', m).value.trim() || null, modelo: $('#nqModelo', m).value.trim() || null };
          const dup = visibles.find(e => (nuevo.codigo && [e.clave, e.codigo, e.codigo_sap].includes(nuevo.codigo)) || (nuevo.serie && e.serie === nuevo.serie));
          if (dup) { $('#ffEq', m).value = etiqueta(dup); resolver(); return show(`Ese equipo ya existe en el inventario (${eqCod(dup)}). Lo seleccioné por usted; revise y vuelva a registrar.`); }
        }
        const desc = $('#ffDesc', m).value.trim();
        if (desc.length < 5) return show('Describa la falla (al menos unas palabras).');
        const costoTxt = $('#ffCosto', m).value.replace(/[L,\s]/gi, '');
        const costo = costoTxt === '' ? NaN : Number(costoTxt);
        if (isNaN(costo) || costo < 0) return show('Escriba el costo aproximado de la reparación (puede ser 0 si no tendrá costo).');
        const f = $('#ffFecha', m).value || hoyISO();
        if (f > hoyISO()) return show('La fecha del reporte no puede ser futura.');
        await accion(ev.submitter, async () => {
          const r = await S.db.crearIncidencia({ equipo_id: eq ? eq.id : null, nuevo_equipo: nuevo, fecha_reporte: f, descripcion: desc, causa: $('#ffCausa', m).value.trim() || null, prioridad: prioSel, fuera_servicio: $('#ffFuera', m).checked, costo_estimado: costo }, files);
          await recargar();
          location.hash = `#/incidencia/${r.id}`;
          toast(nuevo ? `Falla ${r.codigo} registrada y equipo agregado al inventario` : `Falla registrada como ${r.codigo}`);
        });
      };
    }
  };
}

// ================================================================ SEGUIMIENTO
function vSeguimiento() {
  const f = S.filtros.seg || (S.filtros.seg = { tab: 'abiertas', negocio: '', planta: '', prioridad: '', estado: '', mias: false });
  const html = `
  <div class="ph">
    <div><h1>Seguimiento de reparaciones</h1><p>Días desde el reporte · <span class="late-soft">más de ${AVISO_DIAS} días</span> · <span class="late">más de ${ALERTA_DIAS} días</span></p></div>
    <div class="acts"><div class="tabs" role="tablist" id="segTabs"></div>${can('reportar') ? '<a class="btn primary" href="#/falla">+ Reportar falla</a>' : ''}</div>
  </div>
  <div class="card filters">
    <select class="ctl" id="segNeg" aria-label="Negocio">${optNegocios(f.negocio)}</select>
    <select class="ctl" id="segPl" aria-label="Planta">${optPlantas(f.planta, 'Todas las plantas', f.negocio)}</select>
    <select class="ctl" id="segPrio" aria-label="Prioridad">${opts(Object.entries(PRIO).map(([k, v]) => [k, v[0]]), f.prioridad, 'Todas las prioridades')}</select>
    <select class="ctl" id="segEst" aria-label="Estado">${opts(Object.entries(INC).map(([k, v]) => [k, v[0]]), f.estado, 'Todos los estados')}</select>
    ${can('gestionar') ? `<label class="check" style="align-items:center"><input type="checkbox" id="segMias" ${f.mias ? 'checked' : ''}>Solo asignadas a mí</label>` : ''}
    <button class="btn sm" id="segCsv" style="margin-left:auto">${ico('descargar')}CSV</button>
  </div>
  <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Código</th><th>Equipo</th><th class="hm">Problema</th><th class="hm">Prioridad</th><th class="hm">Responsable</th><th>Estado</th><th class="r">Días</th>
    ${can('costos') ? '<th class="r hm">Costo est.</th><th class="r hm">Costo real</th>' : ''}<th class="hm">Fin estimado</th>
  </tr></thead><tbody id="segBody"></tbody></table></div></section>`;

  const base = () => S.D.incidencias.filter(i => {
    const e = S.idx.eq.get(i.equipo_id) || {};
    return filtraNeg(e, f.negocio) && (!f.planta || String(e.planta_id) === f.planta) && (!f.prioridad || i.prioridad === f.prioridad)
      && (!f.estado || i.estado === f.estado) && (!f.mias || i.responsable_id === S.yo.id);
  });
  const TABS = { abiertas: ['Abiertas', i => ABIERTA(i.estado)], reparadas: ['Reparadas', i => i.estado === 'reparada'], cerradas: ['Cerradas', i => i.estado === 'cerrada'], todas: ['Todas', () => true] };
  const pintar = m => {
    const b = base();
    $('#segTabs', m).innerHTML = Object.entries(TABS).map(([k, [l, fn]]) => `<button role="tab" data-t="${k}" aria-selected="${f.tab === k}">${l} · ${b.filter(fn).length}</button>`).join('');
    $$('#segTabs button', m).forEach(x => x.onclick = () => { f.tab = x.dataset.t; pintar(m); });
    const l = b.filter(TABS[f.tab][1]).sort((x, y) => ABIERTA(x.estado) && ABIERTA(y.estado) ? x.fecha_reporte.localeCompare(y.fecha_reporte) : y.id - x.id);
    $('#segBody', m).innerHTML = l.length ? l.map(i => {
      const e = S.idx.eq.get(i.equipo_id);
      const ab = ABIERTA(i.estado), d = ab ? dias(i.fecha_reporte) : dias(i.fecha_reporte, i.fecha_resolucion);
      return `<tr class="click" data-href="#/incidencia/${i.id}">
        <td class="nw"><a class="lk" href="#/incidencia/${i.id}">${i.codigo}</a></td>
        <td><b style="font-weight:600">${esc(eqNom(e))}</b><span class="sub">${esc(eqCod(e))} · ${esc(plantaNom(e?.planta_id))}</span></td>
        <td class="clip hm" title="${esc(i.descripcion)}">${esc(i.descripcion)}</td>
        <td class="hm">${prio(i.prioridad)}</td><td class="nw hm">${i.responsable_id ? esc(perfilNom(i.responsable_id)) : '<span class="cap">Sin asignar</span>'}</td>
        <td>${tsPill(i.estado)}</td>
        <td class="r nw tnum ${ab && d > ALERTA_DIAS ? 'late' : ab && d > AVISO_DIAS ? 'late-soft' : ''}">${ab ? d + ' días' : `<span class="cap">Resuelta en ${d} d</span>`}</td>
        ${can('costos') ? `<td class="r nw tnum hm">${L(i.costo_estimado)}</td><td class="r nw tnum hm">${L(i.costo_real)}</td>` : ''}
        <td class="nw hm">${fecha(i.fecha_estimada)}</td></tr>`;
    }).join('') : `<tr><td colspan="10"><div class="empty"><b>No hay incidencias en esta vista</b>${f.tab === 'abiertas' ? 'Todo al día.' : ''}</div></td></tr>`;
    filasClicables(m);
    return l;
  };
  return {
    titulo: 'Seguimiento', html,
    bind: m => {
      pintar(m);
      $('#segNeg', m).onchange = e => { f.negocio = e.target.value; f.planta = ''; render(); };
      $('#segPl', m).onchange = e => { f.planta = e.target.value; pintar(m); };
      $('#segPrio', m).onchange = e => { f.prioridad = e.target.value; pintar(m); };
      $('#segEst', m).onchange = e => { f.estado = e.target.value; if (f.estado) f.tab = 'todas'; pintar(m); };
      const mi = $('#segMias', m); if (mi) mi.onchange = e => { f.mias = e.target.checked; pintar(m); };
      $('#segCsv', m).onclick = () => {
        const l = pintar(m);
        csv(`incidencias-${hoyISO()}.csv`, ['Código', 'Equipo', 'Código equipo', 'Negocio', 'Planta', 'Fecha reporte', 'Descripción', 'Causa', 'Prioridad', 'Estado', 'Responsable', 'Días', ...(can('costos') ? ['Costo estimado', 'Costo real'] : []), 'Fecha estimada', 'Fecha resolución'],
          l.map(i => { const e = S.idx.eq.get(i.equipo_id); return [i.codigo, eqNom(e), eqCod(e), negNom(e?.negocio_id), plantaNom(e?.planta_id), fecha(i.fecha_reporte), i.descripcion, i.causa, PRIO[i.prioridad][0], INC[i.estado][0], perfilNom(i.responsable_id), ABIERTA(i.estado) ? dias(i.fecha_reporte) : dias(i.fecha_reporte, i.fecha_resolucion), ...(can('costos') ? [i.costo_estimado, i.costo_real] : []), fecha(i.fecha_estimada), fecha(i.fecha_resolucion)]; }));
      };
    }
  };
}

function vIncidencia(id) {
  const i = S.D.incidencias.find(x => String(x.id) === String(id));
  if (!i) return { titulo: 'Incidencia', html: `<a class="back" href="#/seguimiento">${ico('atras', 'width="16" height="16"')}Seguimiento</a><div class="card empty"><b>Incidencia no encontrada</b></div>` };
  const e = S.idx.eq.get(i.equipo_id);
  const ab = ABIERTA(i.estado);
  const d = ab ? dias(i.fecha_reporte) : dias(i.fecha_reporte, i.fecha_resolucion);
  const tecnicos = S.D.perfiles.filter(p => p.activo && ['mantenimiento', 'admin', 'maestro'].includes(p.rol));
  const html = `
  <div><a class="back" href="#/seguimiento">${ico('atras', 'width="16" height="16"')}Seguimiento</a>
  <div class="ph"><div><h1>${i.codigo} · ${esc(eqNom(e))}</h1>
    <p style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${tsPill(i.estado)} ${prio(i.prioridad)} <span class="${ab && d > ALERTA_DIAS ? 'late' : ''}">${ab ? `${d} días abierta` : `Resuelta en ${d} días`}</span></p></div>
    <div class="acts"><a class="btn" href="#/equipo/${e?.id}">Ver ficha del equipo</a></div></div></div>
  <div class="row top">
    <div class="grow" style="display:flex;flex-direction:column;gap:16px">
      <section class="card pad">
        <p style="font-size:15px;margin-bottom:16px">${esc(i.descripcion)}</p>
        <dl class="dl">
          <div><dt>Equipo</dt><dd>${esc(eqCod(e))}</dd></div>
          <div><dt>Negocio</dt><dd>${esc(negNom(e?.negocio_id))}</dd></div>
          <div><dt>Planta</dt><dd>${esc(plantaNom(e?.planta_id))}</dd></div>
          <div><dt>Fecha del reporte</dt><dd>${fecha(i.fecha_reporte)}</dd></div>
          <div><dt>Reportó</dt><dd>${esc(perfilNom(i.reportado_por))}</dd></div>
          <div><dt>Causa</dt><dd>${esc(i.causa || '—')}</dd></div>
          <div><dt>Equipo fuera de servicio</dt><dd>${i.fuera_servicio ? 'Sí' : 'No'}</dd></div>
          <div><dt>Responsable</dt><dd>${i.responsable_id ? esc(perfilNom(i.responsable_id)) : 'Sin asignar'}</dd></div>
          <div><dt>Fin estimado</dt><dd>${fecha(i.fecha_estimada)}</dd></div>
          <div><dt>Fecha de resolución</dt><dd>${fecha(i.fecha_resolucion)}</dd></div>
          ${can('costos') ? `<div><dt>Costo estimado</dt><dd>${L2(i.costo_estimado)}</dd></div><div><dt>Costo real</dt><dd>${L2(i.costo_real)}</dd></div>` : ''}
        </dl>
        ${i.observaciones ? `<div class="note" style="margin-top:14px"><b>Observaciones: </b>${esc(i.observaciones)}</div>` : ''}
        ${(i.adjuntos || []).length ? `<div style="margin-top:14px"><b style="font-size:13px">Adjuntos</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${i.adjuntos.map((a, k) => `<button class="btn sm" data-adj="${k}">${esc(a.nombre)}</button>`).join('')}</div></div>` : ''}
      </section>
      <section class="card pad"><h2 style="margin-bottom:12px">Historial de cambios</h2><div class="tl" id="incHist"><p class="cap">Cargando…</p></div>
        ${can('comentar') ? `<form id="comF" style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap"><label class="sr" for="comT">Comentario</label><input class="ctl" id="comT" placeholder="Agregar un comentario o avance" style="flex:1 1 240px"><button class="btn dark" type="submit">Comentar</button></form>` : ''}
      </section>
    </div>
    ${can('gestionar') ? `
    <form class="card pad side-col form" id="gesF" style="gap:14px;align-self:flex-start">
      <h2>Actualizar incidencia</h2>
      <label class="fld">Estado<select class="ctl" name="estado">${opts(Object.entries(INC).map(([k, v]) => [k, v[0]]), i.estado)}</select></label>
      <label class="fld">Responsable de reparación<select class="ctl" name="responsable_id">${opts(tecnicos.map(p => [p.id, p.nombre || p.username]), i.responsable_id, 'Sin asignar')}</select></label>
      <div class="grid2" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <label class="fld">Costo estimado (L)<input class="ctl" name="costo_estimado" inputmode="decimal" value="${i.costo_estimado ?? ''}"></label>
        <label class="fld">Costo real (L)<input class="ctl" name="costo_real" inputmode="decimal" value="${i.costo_real ?? ''}"></label>
      </div>
      <label class="fld">Fecha estimada de finalización<input class="ctl" type="date" name="fecha_estimada" value="${i.fecha_estimada || ''}"></label>
      <label class="fld">Observaciones<textarea class="ctl" name="observaciones" rows="3">${esc(i.observaciones || '')}</textarea></label>
      ${i.fuera_servicio ? '<p class="cap">Al pasar a «En reparación» el equipo queda «En taller»; al marcarla «Reparada» o «Cerrada» vuelve a «Habilitado».</p>' : ''}
      <button class="btn primary" type="submit" style="align-self:flex-start">Guardar cambios</button>
    </form>` : ''}
  </div>`;
  return {
    titulo: i.codigo, html,
    bind: async m => {
      $$('[data-adj]', m).forEach(b => b.onclick = async () => {
        const ventana = window.open('', '_blank');
        try { const url = await S.db.abrirAdjunto(i.id, +b.dataset.adj); if (ventana) ventana.location = url; else window.location = url; }
        catch (e) { if (ventana) ventana.close(); toast(e.message, true); }
      });
      const pintarHist = async () => {
        const ev = await S.db.eventos(i.id).catch(() => []);
        const h = $('#incHist', m); if (!h) return;
        h.innerHTML = ev.length ? ev.map(x => `<div class="it"><i ${x.tipo === 'comentario' ? 'style="background:var(--ink)"' : ''}></i><div><small>${fechaHora(x.fecha)} · <b>${esc(perfilNom(x.usuario_id))}</b></small><p>${esc(x.detalle)}</p></div></div>`).join('') :'<p class="cap">Sin cambios registrados.</p>';
      };
      pintarHist();
      const cf = $('#comF', m);
      if (cf) cf.onsubmit = async ev => { ev.preventDefault(); const t = $('#comT', m).value.trim(); if (!t) return; await accion(ev.submitter, async () => { await S.db.comentar(i.id, t, S.yo); $('#comT', m).value = ''; await pintarHist(); }); };
      const gf = $('#gesF', m);
      if (gf) gf.onsubmit = async ev => {
        ev.preventDefault();
        const fd = Object.fromEntries(new FormData(gf));
        const ce = numOrNull(fd.costo_estimado), cr = numOrNull(fd.costo_real);
        if ((fd.costo_estimado && ce == null) || (fd.costo_real && cr == null) || ce < 0 || cr < 0) return toast('Los costos deben ser números positivos.', true);
        if (fd.estado === 'cerrada' && cr == null && !confirm('¿Cerrar la incidencia sin costo real registrado? Los reportes de costos no la contarán.')) return;
        await accion(ev.submitter, async () => {
          await S.db.actualizarIncidencia(i.id, { estado: fd.estado, responsable_id: fd.responsable_id || null, costo_estimado: ce, costo_real: cr, fecha_estimada: fd.fecha_estimada || null, observaciones: fd.observaciones.trim() || null });
          await recargar(); toast('Incidencia actualizada'); render();
        });
      };
    }
  };
}

// ================================================================ MANTENIMIENTO
function vMantenimiento() {
  const f = S.filtros.mant || (S.filtros.mant = { tab: 'pendientes', negocio: '', tipo: '' });
  const hoy = hoyISO();
  const en30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const html = `
  <div class="ph"><div><h1>Mantenimiento</h1><p id="mtRes"></p></div>
    <div class="acts"><div class="tabs" role="tablist" id="mtTabs"></div>${can('mantener') ? '<button class="btn primary" id="mtNuevo">+ Registrar mantenimiento</button>' : ''}</div></div>
  <div class="card filters">
    <select class="ctl" id="mtNeg" aria-label="Negocio">${optNegocios(f.negocio)}</select>
    <select class="ctl" id="mtTipo" aria-label="Tipo">${opts([['preventivo', 'Preventivo'], ['correctivo', 'Correctivo']], f.tipo, 'Preventivo y correctivo')}</select>
  </div>
  <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr>
    <th>Equipo</th><th class="hm">Tipo</th><th>Programada</th><th class="hm">Ejecución</th><th class="hm">Responsable</th><th class="hm">Descripción</th>${can('costos') ? '<th class="r hm">Costo</th>' : ''}<th>Estado</th><th class="hm">Próxima</th>
  </tr></thead><tbody id="mtBody"></tbody></table></div></section>`;
  const TABS = { pendientes: ['Pendientes', m => ['programado', 'en_proceso'].includes(m.estado)], ejecutados: ['Ejecutados', m => m.estado === 'ejecutado'], todos: ['Todos', () => true] };
  const pintar = mm => {
    const b = S.D.mantenimientos.filter(m => { const e = S.idx.eq.get(m.equipo_id) || {}; return filtraNeg(e, f.negocio) && (!f.tipo || m.tipo === f.tipo); });
    const venc = b.filter(m => m.estado === 'programado' && m.fecha_programada && m.fecha_programada < hoy).length;
    const prox = b.filter(m => m.estado === 'programado' && m.fecha_programada && m.fecha_programada >= hoy && m.fecha_programada <= en30).length;
    $('#mtRes', mm).innerHTML = `<span class="${venc ? 'late' : ''}">${venc} vencidos</span> · ${prox} programados para los próximos 30 días`;
    $('#mtTabs', mm).innerHTML = Object.entries(TABS).map(([k, [l, fn]]) => `<button role="tab" data-t="${k}" aria-selected="${f.tab === k}">${l} · ${b.filter(fn).length}</button>`).join('');
    $$('#mtTabs button', mm).forEach(x => x.onclick = () => { f.tab = x.dataset.t; pintar(mm); });
    const l = b.filter(TABS[f.tab][1]).sort((x, y) => (x.fecha_programada || x.fecha_ejecucion || '9').localeCompare(y.fecha_programada || y.fecha_ejecucion || '9') * (f.tab === 'ejecutados' ? -1 : 1));
    $('#mtBody', mm).innerHTML = l.length ? l.map(m => {
      const e = S.idx.eq.get(m.equipo_id), vencido = m.estado === 'programado' && m.fecha_programada && m.fecha_programada < hoy;
      return `<tr class="${can('mantener') ? 'click' : ''}" data-id="${m.id}">
        <td><b style="font-weight:600">${esc(eqNom(e))}</b><span class="sub">${esc(eqCod(e))} · ${esc(plantaNom(e?.planta_id))}</span></td>
        <td class="hm">${m.tipo === 'preventivo' ? 'Preventivo' : 'Correctivo'}</td>
        <td class="nw ${vencido ? 'late' : ''}">${fecha(m.fecha_programada)}${vencido ? ' · vencido' : ''}</td><td class="nw hm">${fecha(m.fecha_ejecucion)}</td>
        <td class="hm">${esc(m.responsable || '—')}</td><td class="clip hm" title="${esc(m.descripcion)}">${esc(m.descripcion)}</td>
        ${can('costos') ? `<td class="r tnum nw hm">${L(m.costo)}</td>` : ''}<td><span class="chip">${MANT[m.estado]}</span></td><td class="nw hm">${fecha(m.proxima_fecha)}</td></tr>`;
    }).join('') : '<tr><td colspan="9"><div class="empty"><b>Sin mantenimientos en esta vista</b>Regístrelos desde aquí o desde la ficha de cada equipo.</div></td></tr>';
    if (can('mantener')) $$('tr.click', mm).forEach(tr => tr.onclick = () => formMantenimiento(S.D.mantenimientos.find(x => String(x.id) === tr.dataset.id)));
  };
  return {
    titulo: 'Mantenimiento', html,
    bind: m => {
      pintar(m);
      $('#mtNeg', m).onchange = e => { f.negocio = e.target.value; pintar(m); };
      $('#mtTipo', m).onchange = e => { f.tipo = e.target.value; pintar(m); };
      const nb = $('#mtNuevo', m); if (nb) nb.onclick = () => formMantenimiento({ tipo: 'preventivo', estado: 'programado' });
    }
  };
}

function formMantenimiento(mt) {
  const m = mt || {};
  const visibles = S.D.equipos.filter(e => e.activo !== false).sort((a, b) => eqCod(a).localeCompare(eqCod(b)));
  const etiqueta = e => `${eqCod(e)} · ${e.descripcion}`;
  const pre = m.equipo_id ? S.idx.eq.get(m.equipo_id) : null;
  modal(`
    <h2>${m.id ? 'Mantenimiento' : 'Registrar mantenimiento'}</h2>
    <form class="form" id="fm" novalidate>
      <label class="fld">Equipo<input class="ctl" id="fmEq" list="dlEqM" autocomplete="off" value="${pre ? esc(etiqueta(pre)) : ''}" ${m.id ? 'readonly' : ''} placeholder="Escriba el código o el nombre">
        <datalist id="dlEqM">${visibles.map(e => `<option value="${esc(etiqueta(e))}">`).join('')}</datalist></label>
      <div class="grid2">
        <label class="fld">Tipo<select class="ctl" name="tipo">${opts([['preventivo', 'Preventivo'], ['correctivo', 'Correctivo']], m.tipo)}</select></label>
        <label class="fld">Estado<select class="ctl" name="estado">${opts(Object.entries(MANT), m.estado || 'programado')}</select></label>
        <label class="fld">Responsable<input class="ctl" name="responsable" value="${esc(m.responsable || '')}" placeholder="Persona o taller"></label>
      </div>
      <div class="grid2">
        <label class="fld">Fecha programada<input class="ctl" type="date" name="fecha_programada" value="${m.fecha_programada || ''}"></label>
        <label class="fld">Fecha de ejecución<input class="ctl" type="date" name="fecha_ejecucion" value="${m.fecha_ejecucion || ''}"></label>
        <label class="fld">Próximo mantenimiento<input class="ctl" type="date" name="proxima_fecha" value="${m.proxima_fecha || ''}"></label>
      </div>
      <label class="fld">Descripción del trabajo<textarea class="ctl" name="descripcion" required>${esc(m.descripcion || '')}</textarea></label>
      <label class="fld">Costo (L)<input class="ctl" name="costo" inputmode="decimal" value="${m.costo ?? ''}"></label>
      <label class="check"><input type="checkbox" name="siguiente" checked><span>Si queda ejecutado y tiene próxima fecha, programar el siguiente automáticamente</span></label>
      <div class="err" id="fmErr" hidden></div>
      <div class="form-acts"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`, (bg, cerrar) => {
    $('#fm', bg).onsubmit = async ev => {
      ev.preventDefault();
      const fd = Object.fromEntries(new FormData(ev.target));
      const err = $('#fmErr', bg), show = t => { err.textContent = t; err.hidden = false; };
      const v = $('#fmEq', bg).value.trim();
      const eq = pre && m.id ? pre : (visibles.find(e => etiqueta(e) === v) || visibles.find(e => eqCod(e).toUpperCase() === v.toUpperCase()));
      if (!eq) return show('Elija un equipo de la lista.');
      if (!fd.descripcion.trim()) return show('Describa el trabajo.');
      if (fd.estado === 'ejecutado' && !fd.fecha_ejecucion) return show('Indique la fecha de ejecución.');
      if (fd.estado === 'programado' && !fd.fecha_programada) return show('Indique la fecha programada.');
      const costo = numOrNull(fd.costo);
      if (fd.costo && (costo == null || costo < 0)) return show('El costo debe ser un número positivo.');
      const datos = { equipo_id: eq.id, tipo: fd.tipo, estado: fd.estado, responsable: fd.responsable.trim() || null, fecha_programada: fd.fecha_programada || null, fecha_ejecucion: fd.fecha_ejecucion || null, proxima_fecha: fd.proxima_fecha || null, descripcion: fd.descripcion.trim(), costo };
      if (m.id) datos.id = m.id;
      await accion(ev.submitter, async () => {
        await S.db.guardarMantenimiento(datos);
        const yaProgramado = S.D.mantenimientos.some(x => x.equipo_id === eq.id && x.estado === 'programado' && x.fecha_programada === datos.proxima_fecha);
        if (fd.siguiente && datos.estado === 'ejecutado' && datos.proxima_fecha && !yaProgramado) {
          await S.db.guardarMantenimiento({ equipo_id: eq.id, tipo: 'preventivo', estado: 'programado', responsable: datos.responsable, fecha_programada: datos.proxima_fecha, descripcion: datos.descripcion, costo: null, fecha_ejecucion: null, proxima_fecha: null });
        }
        await recargar(); cerrar(); toast('Mantenimiento guardado'); render();
      });
    };
  });
}

// ================================================================ REPORTES
let charts = [];
function vReportes() {
  const f = S.filtros.rep || (S.filtros.rep = { negocio: '', planta: '', desde: new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10), hasta: hoyISO() });
  const eqs = S.D.equipos.filter(e => e.activo !== false && filtraNeg(e, f.negocio) && (!f.planta || String(e.planta_id) === f.planta));
  const ids = new Set(eqs.map(e => e.id));
  const enRango = d => d && d.slice(0, 10) >= f.desde && d.slice(0, 10) <= f.hasta;
  const incs = S.D.incidencias.filter(i => ids.has(i.equipo_id));
  const incPer = incs.filter(i => enRango(i.fecha_reporte));
  const resueltas = incs.filter(i => !ABIERTA(i.estado) && enRango(i.fecha_resolucion));
  const tProm = resueltas.length ? resueltas.reduce((a, i) => a + dias(i.fecha_reporte, i.fecha_resolucion), 0) / resueltas.length : null;
  const conCosto = resueltas.filter(i => i.costo_real != null);
  const costoRep = conCosto.reduce((a, i) => a + Number(i.costo_real), 0);
  const mantEj = S.D.mantenimientos.filter(m => ids.has(m.equipo_id) && m.estado === 'ejecutado' && enRango(m.fecha_ejecucion));
  const costoMant = mantEj.filter(m => m.costo != null).reduce((a, m) => a + Number(m.costo), 0);
  const conEstado = eqs.filter(e => e.estado !== 'sin_info');
  const disp = pct(eqs.filter(e => e.estado === 'habilitado').length, conEstado.length);
  const inversion = inversionPendiente(eqs);

  const porNeg = S.D.negocios.map(n => ({ n: n.nombre, v: incPer.filter(i => S.idx.eq.get(i.equipo_id)?.negocio_id === n.id).length }));
  const sinNegInc = incPer.filter(i => !S.idx.eq.get(i.equipo_id)?.negocio_id).length;
  if (sinNegInc) porNeg.push({ n: 'Sin asignar', v: sinNegInc });
  const topInc = [...incPer.reduce((m, i) => m.set(i.equipo_id, (m.get(i.equipo_id) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topInact = eqs.filter(e => ['inhabilitado', 'taller'].includes(e.estado) && e.fecha_inhabilitado).sort((a, b) => a.fecha_inhabilitado.localeCompare(b.fecha_inhabilitado)).slice(0, 10);
  const sinFecha = eqs.filter(e => ['inhabilitado', 'taller'].includes(e.estado) && !e.fecha_inhabilitado).length;

  const html = `
  <div class="ph"><div><h1>Reportes y análisis</h1><p>Indicadores calculados solo con la información registrada.</p></div>
    ${can('exportar') ? `<div class="acts"><button class="btn" id="repXlsx">${ico('descargar')}Exportar a Excel</button></div>` : ''}</div>
  <div class="card filters">
    <select class="ctl" id="rNeg" aria-label="Negocio">${optNegocios(f.negocio)}</select>
    <select class="ctl" id="rPl" aria-label="Planta">${optPlantas(f.planta, 'Todas las plantas', f.negocio)}</select>
    <label class="cap" style="display:flex;gap:6px;align-items:center">Desde<input class="ctl" type="date" id="rDesde" value="${f.desde}"></label>
    <label class="cap" style="display:flex;gap:6px;align-items:center">Hasta<input class="ctl" type="date" id="rHasta" value="${f.hasta}"></label>
  </div>
  <section class="kpis">
    <div class="card kpi"><span class="l">Disponibilidad actual</span><span class="v tnum">${disp} %</span><span class="s">${eqs.filter(e => e.estado === 'habilitado').length} de ${conEstado.length} equipos con estado conocido</span></div>
    <div class="card kpi"><span class="l">Fallas reportadas</span><span class="v tnum">${incPer.length}</span><span class="s">en el período</span></div>
    <div class="card kpi"><span class="l">Tiempo promedio de reparación</span><span class="v tnum">${tProm == null ? '—' : tProm.toFixed(1) + ' d'}</span><span class="s">${resueltas.length} incidencias resueltas</span></div>
    ${can('costos') ? `
    <div class="card kpi"><span class="l">Costo de reparaciones</span><span class="v tnum">${L(costoRep)}</span><span class="s">${conCosto.length} de ${resueltas.length} resueltas con costo real</span></div>
    <div class="card kpi"><span class="l">Costo de mantenimiento</span><span class="v tnum">${L(costoMant)}</span><span class="s">${mantEj.length} mantenimientos ejecutados</span></div>
    <div class="card kpi"><span class="l">Inversión estimada pendiente</span><span class="v tnum">${L(inversion)}</span><span class="s">Costos estimados de las fallas abiertas</span></div>` : ''}
  </section>
  <div class="row">
    <section class="card pad grow"><h2>Evolución de la disponibilidad</h2><p class="cap" id="dispCap" style="margin:4px 0 12px"></p><div class="chart-box"><canvas id="chDisp" role="img" aria-label="Disponibilidad semanal por negocio"></canvas></div></section>
    <section class="card pad side-col"><h2>Fallas por negocio</h2><p class="cap" style="margin:4px 0 12px">Reportadas entre ${fecha(f.desde)} y ${fecha(f.hasta)}</p><div class="chart-box"><canvas id="chNeg" role="img" aria-label="Fallas por negocio"></canvas></div>
      <table class="sr"><caption>Fallas por negocio</caption>${porNeg.map(x => `<tr><td>${esc(x.n)}</td><td>${x.v}</td></tr>`).join('')}</table></section>
  </div>
  <div class="row top">
    <section class="card" style="flex:1 1 100%;min-width:0"><div class="card-h"><h2>Equipos con mayor tiempo fuera de servicio</h2>${sinFecha ? `<span class="cap">${sinFecha} sin fecha no se incluyen</span>` : ''}</div>
      ${topInact.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Equipo</th><th>Negocio</th><th>Estado</th><th>Desde</th><th class="r">Días</th>${can('costos') ? '<th class="r">Inversión estimada</th>' : ''}</tr></thead><tbody>
      ${topInact.map(e => `<tr class="click" data-href="#/equipo/${e.id}"><td><a class="lk" href="#/equipo/${e.id}">${esc(eqNom(e))}</a><span class="sub">${esc(eqCod(e))} · ${esc(plantaNom(e.planta_id))}</span></td><td class="nw hm">${esc(negNom(e.negocio_id))}</td><td>${pill(e.estado)}</td><td class="nw">${fecha(e.fecha_inhabilitado)}</td><td class="r tnum ${dias(e.fecha_inhabilitado) > ALERTA_DIAS ? 'late' : ''}">${dias(e.fecha_inhabilitado)}</td>${can('costos') ? `<td class="r tnum nw">${L(e.inversion_reparacion)}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Sin equipos fuera de servicio con fecha registrada.</div>'}
    </section>
    <section class="card" style="flex:1 1 100%;min-width:0"><div class="card-h"><h2>Equipos con más incidencias</h2></div>
      ${topInc.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Equipo</th><th class="r">Fallas</th></tr></thead><tbody>
      ${topInc.map(([id, n]) => { const e = S.idx.eq.get(id); return `<tr class="click" data-href="#/equipo/${id}"><td><a class="lk" href="#/equipo/${id}">${esc(eqNom(e))}</a><span class="sub">${esc(eqCod(e))}</span></td><td class="r tnum"><b>${n}</b></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="empty">Sin fallas reportadas en el período.</div>'}
    </section>
  </div>`;

  return {
    titulo: 'Reportes', html,
    bind: m => {
      charts.forEach(c => c.destroy()); charts = [];
      const set = k => e => { f[k] = e.target.value; if (k === 'negocio') f.planta = ''; render(); };
      $('#rNeg', m).onchange = set('negocio'); $('#rPl', m).onchange = set('planta');
      $('#rDesde', m).onchange = set('desde'); $('#rHasta', m).onchange = set('hasta');
      filasClicables(m);
      if ($('#repXlsx', m)) $('#repXlsx', m).onclick = () => exportarExcel(eqs, incs, f);
      if (!window.Chart) { $$('.chart-box', m).forEach(b => b.innerHTML = '<p class="cap">No se pudo cargar la librería de gráficos (revise la conexión).</p>'); return; }
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      Chart.defaults.color = '#5F5F58';
      charts.push(new Chart($('#chNeg', m), {
        type: 'bar',
        data: { labels: porNeg.map(x => x.n), datasets: [{ label: 'Fallas', data: porNeg.map(x => x.v), backgroundColor: '#11110E', borderRadius: 4, maxBarThickness: 22 }] },
        options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#EEEEE9' } }, y: { grid: { display: false } } } }
      }));
      const serie = serieDisponibilidad(eqs, f);
      $('#dispCap', m).textContent = serie.nota;
      const COLORES = { concreto: '#2a78d6', prefabricados: '#eb6834', trituracion: '#1baf7a', bloques: '#eda100' };
      charts.push(new Chart($('#chDisp', m), {
        type: 'line',
        data: { labels: serie.labels, datasets: serie.sets.map(s => ({ label: s.nombre, data: s.data, borderColor: s.id === 'total' ? '#11110E' : COLORES[s.id], backgroundColor: s.id === 'total' ? '#11110E' : COLORES[s.id], borderWidth: s.id === 'total' ? 2.5 : 2, pointRadius: 3, pointHoverRadius: 5, tension: .2, spanGaps: true })) },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y == null ? '—' : c.parsed.y + ' %'}` } } }, scales: { y: { min: 0, max: 100, ticks: { callback: v => v + ' %' }, grid: { color: '#EEEEE9' } }, x: { grid: { display: false } } } }
      }));
    }
  };
}

// Disponibilidad semanal reconstruida desde la bitácora de cambios de estado
function serieDisponibilidad(eqs, f) {
  const ev = S.D.estados.filter(x => eqs.some(e => e.id === x.equipo_id));
  if (!ev.length) return { labels: [], sets: [], nota: 'Sin historial de estados todavía.' };
  const inicio = ev.reduce((a, x) => x.fecha < a ? x.fecha : a, ev[0].fecha).slice(0, 10);
  const desde = f.desde > inicio ? f.desde : inicio;
  const puntos = [];
  for (let d = new Date(f.hasta); d.toISOString().slice(0, 10) >= desde && puntos.length < 26; d = new Date(d.getTime() - 7 * 864e5)) puntos.unshift(d.toISOString().slice(0, 10));
  if (!puntos.length) puntos.push(f.hasta);
  const porEq = new Map();
  ev.forEach(x => { if (!porEq.has(x.equipo_id)) porEq.set(x.equipo_id, []); porEq.get(x.equipo_id).push(x); });
  const estadoEn = (e, dia) => {
    const l = porEq.get(e.id) || [];
    let st;
    for (const x of l) { if (x.fecha.slice(0, 10) <= dia) st = x.estado_nuevo; else break; }
    return st;
  };
  const grupos = [{ id: 'total', nombre: 'Total' }, ...S.D.negocios.filter(n => !f.negocio || n.id === f.negocio).map(n => ({ id: n.id, nombre: n.nombre }))];
  const sets = grupos.map(g => ({ ...g, data: puntos.map(p => {
    let h = 0, t = 0;
    eqs.forEach(e => { if (g.id !== 'total' && e.negocio_id !== g.id) return; const s = estadoEn(e, p); if (!s || s === 'sin_info') return; t++; if (s === 'habilitado') h++; });
    return t ? pct(h, t) : null;
  }) })).filter(s => s.data.some(v => v != null));
  return { labels: puntos.map(fecha), sets, nota: `Corte semanal. El historial empieza el ${fecha(inicio)}; se completa a medida que se registran cambios.` };
}

function exportarExcel(eqs, incs, f) {
  if (!window.XLSX) return toast('No se pudo cargar el generador de Excel. Revise la conexión.', true);
  const wb = XLSX.utils.book_new();
  const c = can('costos');
  const hoja = (nombre, filas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), nombre);
  hoja('Inventario', eqs.map(e => ({ 'Código': e.codigo || e.clave, 'Código SAP': e.codigo_sap || '', 'Equipo': e.descripcion, 'Tipo': e.tipo || '', 'Negocio': negNom(e.negocio_id), 'Planta': plantaNom(e.planta_id), 'Marca': e.marca || '', 'Modelo': e.modelo || '', 'Año': e.anio || '', 'Estado': ESTADOS[e.estado], 'Inhabilitado desde': fecha(e.fecha_inhabilitado), 'Días fuera': dias(e.fecha_inhabilitado) ?? '', 'Causa': e.causa_inactividad || '', ...(c ? { 'Inversión estimada (L)': e.inversion_reparacion ?? '' } : {}), 'Observaciones': e.observaciones || '' })));
  hoja('Incidencias', incs.filter(i => i.fecha_reporte >= f.desde && i.fecha_reporte <= f.hasta).map(i => { const e = S.idx.eq.get(i.equipo_id); return { 'Código': i.codigo, 'Equipo': eqNom(e), 'Código equipo': eqCod(e), 'Negocio': negNom(e?.negocio_id), 'Planta': plantaNom(e?.planta_id), 'Fecha reporte': fecha(i.fecha_reporte), 'Descripción': i.descripcion, 'Prioridad': PRIO[i.prioridad][0], 'Estado': INC[i.estado][0], 'Responsable': perfilNom(i.responsable_id), 'Días': ABIERTA(i.estado) ? dias(i.fecha_reporte) : dias(i.fecha_reporte, i.fecha_resolucion), ...(c ? { 'Costo estimado (L)': i.costo_estimado ?? '', 'Costo real (L)': i.costo_real ?? '' } : {}), 'Fecha resolución': fecha(i.fecha_resolucion) }; }));
  const ids = new Set(eqs.map(e => e.id));
  hoja('Mantenimientos', S.D.mantenimientos.filter(m => ids.has(m.equipo_id)).map(m => { const e = S.idx.eq.get(m.equipo_id); return { 'Equipo': eqNom(e), 'Código equipo': eqCod(e), 'Tipo': m.tipo, 'Estado': MANT[m.estado], 'Programada': fecha(m.fecha_programada), 'Ejecución': fecha(m.fecha_ejecucion), 'Responsable': m.responsable || '', 'Descripción': m.descripcion, ...(c ? { 'Costo (L)': m.costo ?? '' } : {}), 'Próxima': fecha(m.proxima_fecha) }; }));
  const resumen = S.D.negocios.map(n => { const l = eqs.filter(e => e.negocio_id === n.id); const k = st => l.filter(e => e.estado === st).length; return { 'Negocio': n.nombre, 'Total': l.length, 'Habilitados': k('habilitado'), 'Inhabilitados': k('inhabilitado'), 'En taller': k('taller'), 'Sin información': k('sin_info'), 'Disponibilidad %': pct(k('habilitado'), l.length - k('sin_info')) }; });
  hoja('Resumen por negocio', resumen);
  XLSX.writeFile(wb, `reporte-maquinaria-${hoyISO()}.xlsx`);
}

// ================================================================ IMPORTAR EXCEL
function vImportar() {
  const imp = S.importacion;
  const C = v => v ? String(v).toUpperCase().replace(/\s+/g, '') : null;
  const conocidos = new Set(); S.D.equipos.forEach(e => [e.clave, e.codigo, e.codigo_sap, e.serie].forEach(v => { if (C(v)) conocidos.add(C(v)); }));
  const yaExiste = e => [e.clave, e.codigo, e.codigo_sap, e.serie].some(v => C(v) && conocidos.has(C(v)));
  let cuerpo = '';
  if (imp && imp.res) {
    const r = imp.res, nuevos = r.equipos.filter(e => !yaExiste(e)).length;
    const grupos = r.avisos.reduce((m, a) => { const k = a.aviso.replace(/\s*\(.*\)/, '').replace(/\d+/g, '§'); (m[k] = m[k] || []).push(a); return m; }, {});
    const lista = (titulo, items, cols) => items.length ? `<details class="card" style="padding:0"><summary style="padding:14px 18px;cursor:pointer;font-weight:600;font-size:14px">${esc(titulo)} · ${items.length}</summary><div class="tbl-wrap"><table class="tbl"><tbody>${items.map(x => `<tr>${cols.map(c => `<td class="${c === 'ref' ? 'nw cap' : ''}">${esc(x[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : '';
    cuerpo = `
    <section class="card pad">
      <h2>${esc(imp.archivo)}</h2>
      <p class="cap" style="margin-top:4px">${r.hojas.map(h => h.leida ? `${esc(h.nombre)}: ${h.filas} filas` : `${esc(h.nombre)}: omitida (${esc(h.motivo.toLowerCase())})`).join(' · ')}</p>
      <div class="kpis" style="margin-top:16px">
        <div class="card kpi"><span class="l">Equipos válidos</span><span class="v tnum">${r.equipos.length}</span><span class="s">${nuevos} nuevos · ${r.equipos.length - nuevos} se actualizarán</span></div>
        <div class="card kpi"><span class="l">Duplicados</span><span class="v tnum">${r.duplicados.length}</span><span class="s">Se conserva la primera fila</span></div>
        <div class="card kpi"><span class="l">Rechazados</span><span class="v tnum">${r.rechazados.length}</span><span class="s">Sin código válido</span></div>
        <div class="card kpi"><span class="l">Por revisar</span><span class="v tnum">${new Set(r.avisos.map(a => a.clave)).size}</span><span class="s">Equipos con avisos (se importan igual)</span></div>
      </div>
      <div class="legend" style="margin-top:14px">${ORDEN_ESTADOS.map(s => `<span><span class="dot ${s}"></span>${ESTADOS[s]}: ${r.resumen.porEstado[s] || 0}</span>`).join('')}</div>
      <label class="check" style="margin-top:16px"><input type="checkbox" id="impWym" ${imp.excluirWym ? 'checked' : ''}><span>Excluir equipos cuya ubicación o estatus menciona WyM ${r.excluidos.length ? `(${r.excluidos.length} excluidos)` : ''}</span></label>
      <div class="note" style="margin-top:14px">La importación revisa el código interno, el código SAP y el número de serie: si el equipo ya está, lo actualiza; si no, lo agrega. No borra equipos ni toca fallas, reparaciones o mantenimientos. Marca, modelo, año, observaciones y el negocio asignado a mano se conservan.</div>
      <div class="form-acts" style="margin-top:16px"><button class="btn" id="impOtro">Elegir otro archivo</button><button class="btn primary" id="impGo" ${r.equipos.length ? '' : 'disabled'}>Importar ${r.equipos.length} equipos</button></div>
      ${imp.resultado ? `<div class="okmsg" style="margin-top:14px"><b>Importación terminada.</b> ${imp.resultado.nuevos} nuevos, ${imp.resultado.actualizados} actualizados, ${r.rechazados.length} rechazados, ${r.duplicados.length} duplicados omitidos. <a href="#/panel">Ir al panel</a></div>` : ''}
    </section>
    ${lista('Rechazados', r.rechazados, ['ref', 'desc', 'motivo'])}
    ${lista('Duplicados', r.duplicados, ['ref', 'desc', 'motivo'])}
    ${Object.entries(grupos).map(([k, items]) => lista(k.replace(/§/g, '…'), items, ['ref', 'clave', 'desc', 'aviso'])).join('')}
    ${lista('Excluidos', r.excluidos, ['ref', 'clave', 'desc', 'motivo'])}`;
  } else {
    cuerpo = `
    <section class="card pad">
      ${MODO_DEMO ? '' : `<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div><b style="font-size:14px">Desde la hoja de Google</b><p class="cap" style="margin-top:2px">Lee las pestañas de inventario de la misma hoja donde vive la app (MAQUINARIA Y EQUIPO, CAMIONERÍA…).</p></div>
        <button class="btn primary" id="impHoja">Leer la hoja de Google</button></div>
      <p class="cap" style="margin-bottom:10px">O suba un archivo Excel:</p>`}
      <label class="drop" id="impDrop">${ico('importar', 'width="26" height="26"')}<b style="font-size:14px">Elija o arrastre el Excel de maquinaria</b><span class="cap">Formato .xlsx, como «Maquinaria general DC». Se revisa antes de guardar nada.</span>
        <input type="file" id="impFile" accept=".xlsx,.xls,.xlsm"></label>
      ${imp && imp.error ? `<div class="err" style="margin-top:12px">${esc(imp.error)}</div>` : ''}
    </section>`;
  }
  const html = `
  <div class="ph"><div><h1>Cargar inventario</h1><p>Actualice los equipos desde la hoja de maquinaria o un archivo Excel.</p></div></div>
  ${cuerpo}
  ${S.D.importaciones.length ? `<section class="card"><div class="card-h"><h2>Importaciones anteriores</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Archivo</th><th>Usuario</th><th class="r">Nuevos</th><th class="r">Actualizados</th><th class="r">Rechazados</th></tr></thead><tbody>
    ${S.D.importaciones.map(x => `<tr><td class="nw">${fechaHora(x.fecha)}</td><td>${esc(x.archivo)}</td><td>${esc(perfilNom(x.usuario_id))}</td><td class="r tnum">${x.nuevos}</td><td class="r tnum">${x.actualizados}</td><td class="r tnum">${x.rechazados}</td></tr>`).join('')}
  </tbody></table></div></section>` : ''}`;
  return {
    titulo: 'Inventario: carga', html,
    bind: m => {
      const fi = $('#impFile', m);
      const analizar = (archivo, hojas) => {
        S.importacion = { archivo, hojas, excluirWym: false };
        S.importacion.res = analizarLibro(hojas, { excluirWym: false, hoy: hoyISO() });
        if (!S.importacion.res.equipos.length && !S.importacion.res.rechazados.length) S.importacion = { error: 'No se encontraron equipos. Revise que el archivo tenga las columnas CÓDIGO, DESCRIPCIÓN, Verde y Rojo.' };
      };
      const ih = $('#impHoja', m);
      if (ih) ih.onclick = async () => {
        ih.disabled = true; ih.textContent = 'Leyendo la hoja…';
        try { analizar('Hoja de Google · ' + fecha(hoyISO()), await S.db.leerInventario()); }
        catch (e) { S.importacion = { error: 'No se pudo leer la hoja: ' + e.message }; }
        render();
      };
      const procesar = async file => {
        if (!file) return;
        $('#main').insertAdjacentHTML('beforeend', '<p class="cap" id="impLeyendo">Leyendo el archivo…</p>');
        try {
          const hojas = await leerArchivo(file);
          S.importacion = { archivo: file.name, hojas, excluirWym: false };
          S.importacion.res = analizarLibro(hojas, { excluirWym: false, hoy: hoyISO() });
          if (!S.importacion.res.equipos.length && !S.importacion.res.rechazados.length) S.importacion = { error: 'No se encontraron equipos. Revise que el archivo tenga las columnas CÓDIGO, DESCRIPCIÓN, Verde y Rojo.' };
        } catch (e) { S.importacion = { error: 'No se pudo leer el archivo: ' + e.message }; }
        render();
      };
      if (fi) {
        fi.onchange = e => procesar(e.target.files[0]);
        const d = $('#impDrop', m);
        d.addEventListener('dragover', e => { e.preventDefault(); d.style.borderColor = 'var(--ink)'; });
        d.addEventListener('dragleave', () => { d.style.borderColor = ''; });
        d.addEventListener('drop', e => { e.preventDefault(); procesar(e.dataTransfer.files[0]); });
      }
      const w = $('#impWym', m);
      if (w) w.onchange = () => { S.importacion.excluirWym = w.checked; S.importacion.res = analizarLibro(S.importacion.hojas, { excluirWym: w.checked, hoy: hoyISO() }); S.importacion.resultado = null; render(); };
      const o = $('#impOtro', m); if (o) o.onclick = () => { S.importacion = null; render(); };
      const g = $('#impGo', m);
      if (g) g.onclick = async () => {
        const r = S.importacion.res;
        await accion(g, async () => {
          const out = await S.db.importar(r.equipos, S.importacion.archivo, { rechazados: r.rechazados.length, duplicados: r.duplicados.length, excluidos: r.excluidos.length, avisos: r.avisos.length, hojas: r.hojas });
          S.importacion.resultado = out;
          await recargar(); toast(`Importación lista: ${out.nuevos} nuevos, ${out.actualizados} actualizados`); render();
        });
      };
    }
  };
}

// ================================================================ USUARIOS Y PLANTAS
function vUsuarios() {
  const pp = S.D.perfilPlantas;
  const html = `
  <div class="ph"><div><h1>Usuarios</h1><p>Quién entra y qué puede hacer cada rol.</p></div>
    <div class="acts"><button class="btn primary" id="uNuevo">+ Nuevo usuario</button></div></div>
  <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>
    ${S.D.perfiles.map(p => `<tr><td class="nw"><b>${esc(p.username)}</b></td><td>${esc(p.nombre)}<span class="sub">${esc(p.cargo || '')}</span></td><td class="nw">${ROLES[p.rol] || p.rol}</td>
      <td>${p.activo ? '<span class="pill habilitado">Activo</span>' : '<span class="pill sin_info">Inactivo</span>'}</td>
      <td class="nw r"><button class="btn sm" data-ed="${p.id}">Editar</button> <button class="btn sm" data-pw="${p.id}">Contraseña</button></td></tr>`).join('')}
  </tbody></table></div></section>
  <section class="card"><div class="card-h"><div><h2>Permisos por rol</h2></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Acción</th>${Object.values(ROLES).map(r => `<th>${r}</th>`).join('')}</tr></thead><tbody>
    ${[['Ver panel e inventario', 'all'], ['Ver costos y reportes', 'costos'], ['Reportar fallas', 'reportar'], ['Comentar incidencias', 'comentar'], ['Actualizar reparaciones y cerrar incidencias', 'gestionar'], ['Registrar mantenimientos', 'mantener'], ['Crear y editar equipos', 'editarEquipo'], ['Editar observaciones', 'observaciones'], ['Cargar inventario', 'importar'], ['Gestionar usuarios', 'usuarios']]
      .map(([t, k]) => `<tr><td>${t}</td>${Object.keys(ROLES).map(r => `<td>${k === 'all' || PERM[k].includes(r) ? '✓' : '—'}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div><p class="cap" style="padding:12px 20px">Los permisos se aplican en el servidor, no solo en la pantalla.</p></section>
  <section class="card"><div class="card-h"><h2>Plantas y ubicaciones</h2><span class="cap">Asigne el negocio principal de cada ubicación</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Planta</th><th>Negocio principal</th><th class="r">Equipos</th></tr></thead><tbody>
    ${S.D.plantas.map(p => `<tr><td><b style="font-weight:600">${esc(p.nombre)}</b></td><td><select class="ctl" data-pl="${p.id}" style="width:auto;min-height:36px;font-size:13px">${opts(S.D.negocios.map(n => [n.id, n.nombre]), p.negocio_id, 'Varios / sin asignar')}</select></td><td class="r tnum">${S.D.equipos.filter(e => e.planta_id === p.id).length}</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty">Las plantas se crean al importar el Excel.</div></td></tr>'}
    </tbody></table></div></section>`;
  return {
    titulo: 'Usuarios', html,
    bind: m => {
      $('#uNuevo', m).onclick = () => formUsuario(null);
      $$('[data-ed]', m).forEach(b => b.onclick = () => formUsuario(S.idx.perfil.get(b.dataset.ed)));
      $$('[data-pw]', m).forEach(b => b.onclick = () => {
        const p = S.idx.perfil.get(b.dataset.pw);
        modal(`<h2>Nueva contraseña para ${esc(p.username)}</h2><form class="form" id="pwF"><label class="fld">Contraseña<input class="ctl" type="text" name="pw" autocomplete="off" minlength="8" required><small>8+ caracteres con letras y números. Compártala por un medio privado. La persona podrá cambiarla en «Mi cuenta».</small></label><div class="form-acts"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primary" type="submit">Cambiar</button></div></form>`,
          (bg, cerrar) => { $('#pwF', bg).onsubmit = async ev => { ev.preventDefault(); await accion(ev.submitter, async () => { await S.db.cambiarPassword(p.id, ev.target.pw.value); cerrar(); toast('Contraseña actualizada'); }); }; });
      });
      $$('[data-pl]', m).forEach(s => s.onchange = async () => {
        await accion(null, async () => { await S.db.guardarPlanta({ id: Number(s.dataset.pl), negocio_id: s.value || null }); await recargar(); toast('Planta actualizada'); });
      });
    }
  };
}

function formUsuario(p) {
  const nuevo = !p;
  const u = p || { rol: 'mantenimiento', activo: true };
  const mias = new Set(S.D.perfilPlantas.filter(x => p && x.perfil_id === p.id).map(x => x.planta_id));
  modal(`
    <h2>${nuevo ? 'Nuevo usuario' : 'Editar ' + esc(u.username)}</h2>
    <form class="form" id="uf" novalidate>
      <div class="grid2">
        <label class="fld">Usuario<input class="ctl" name="username" value="${esc(u.username || '')}" autocapitalize="none" autocomplete="off" placeholder="ej. jmartinez"></label>
        ${nuevo ? '<label class="fld">Contraseña<input class="ctl" type="text" name="password" autocomplete="off"><small>8+ caracteres con letras y números. La persona podrá cambiarla luego en «Mi cuenta».</small></label>' : ''}
      </div>
      <div class="grid2">
        <label class="fld">Nombre<input class="ctl" name="nombre" value="${esc(u.nombre || '')}"></label>
        <label class="fld">Cargo<input class="ctl" name="cargo" value="${esc(u.cargo || '')}"></label>
      </div>
      <label class="fld">Rol<select class="ctl" name="rol" id="ufRol">${opts(Object.entries(ROLES), u.rol)}</select></label>

      ${nuevo ? '' : `<label class="check"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''} ${u.id === S.yo.id ? 'disabled' : ''}>Usuario activo (puede iniciar sesión)</label>`}
      <div class="err" id="ufErr" hidden></div>
      <div class="form-acts"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`, (bg, cerrar) => {
    $('#uf', bg).onsubmit = async ev => {
      ev.preventDefault();
      const fm = ev.target;
      const plantas = [];
      const err = $('#ufErr', bg), show = t => { err.textContent = t; err.hidden = false; };
      await accion(ev.submitter, async () => {
        if (nuevo) {
          await S.db.crearUsuario({ username: fm.username.value.trim().toLowerCase(), password: fm.password.value, nombre: fm.nombre.value.trim(), cargo: fm.cargo.value.trim(), rol: fm.rol.value, plantas: [] });
        } else {
          const un = fm.username.value.trim().toLowerCase();
          if (!/^[a-z0-9._-]{3,30}$/.test(un)) throw new Error('Usuario inválido: use de 3 a 30 letras minúsculas, números, punto o guion.');
          await S.db.guardarPerfil({ id: u.id, username: un, nombre: fm.nombre.value.trim(), cargo: fm.cargo.value.trim(), rol: u.id === S.yo.id ? u.rol : fm.rol.value, activo: u.id === S.yo.id ? true : fm.activo.checked }, []);
        }
        await recargar(); cerrar(); toast('Usuario guardado'); render();
      });
    };
  });
}

iniciar();
