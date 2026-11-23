/**
 * Duracreto · Control de maquinaria — servidor (Google Apps Script)
 *
 * Va pegado en la hoja de Google de maquinaria: Extensiones > Apps Script.
 * La app (GitHub Pages) le habla a este script; el script lee y escribe la hoja.
 * La hoja NO necesita compartirse con nadie: el script trabaja con la cuenta de su dueño.
 *
 * Instalación (una sola vez): ejecute la función `instalar` desde el editor y
 * lea en el registro la contraseña temporal del usuario "admin".
 * Luego: Implementar > Nueva implementación > Aplicación web
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.
 */

// ------------------------------------------------------------------ configuración
var PREFIJO = 'app_';                     // pestañas que crea la app (no tocar a mano)
var DIAS_SESION = 30;                     // una sesión dura 30 días o hasta "Cerrar sesión"
var ITER_HASH = 250;                      // vueltas de cifrado de contraseñas
var MAX_ADJUNTO = 8 * 1024 * 1024;        // 8 MB por archivo

var NEGOCIOS = [
  { id: 'concreto', nombre: 'Concreto premezclado', orden: 1 },
  { id: 'prefabricados', nombre: 'Prefabricados', orden: 2 },
  { id: 'trituracion', nombre: 'Trituración', orden: 3 },
  { id: 'bloques', nombre: 'Bloques', orden: 4 }
];
// Roles: maestro = Administrador general (todo, único que maneja usuarios), admin = Jefe de planta, gerencia = consulta ejecutiva, mantenimiento = operación de reparaciones
var ROLES = ['maestro', 'admin', 'gerencia', 'mantenimiento'];
var PERM = {
  importar: ['maestro', 'admin'], editarEquipo: ['maestro', 'admin', 'mantenimiento'], reportar: ['maestro', 'admin', 'mantenimiento'],
  gestionar: ['maestro', 'admin', 'mantenimiento'], comentar: ['maestro', 'admin', 'mantenimiento'], mantener: ['maestro', 'admin', 'mantenimiento'],
  costos: ['maestro', 'admin', 'gerencia', 'mantenimiento'], usuarios: ['maestro'], observaciones: ['maestro', 'admin', 'mantenimiento']
};
var ESTADOS_EQ = ['habilitado', 'inhabilitado', 'taller', 'sin_info'];
var ESTADOS_INC = ['reportada', 'pendiente_diagnostico', 'pendiente_repuestos', 'en_reparacion', 'en_espera', 'reparada', 'cerrada'];
var ETQ_INC = { reportada: 'Reportada', pendiente_diagnostico: 'Pendiente de diagnóstico', pendiente_repuestos: 'Pendiente de repuestos', en_reparacion: 'En reparación', en_espera: 'En espera', reparada: 'Reparada', cerrada: 'Cerrada' };
var PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
var ESTADOS_MANT = ['programado', 'en_proceso', 'ejecutado', 'cancelado'];

var TABLAS = {
  usuarios: ['id', 'username', 'nombre', 'cargo', 'rol', 'plantas', 'activo', 'debe_cambiar', 'salt', 'hash', 'creado', 'ultimo_acceso'],
  plantas: ['id', 'nombre', 'negocio_id'],
  equipos: ['id', 'clave', 'codigo', 'codigo_sap', 'descripcion', 'tipo', 'negocio_id', 'planta_id', 'ubicacion_excel', 'marca', 'modelo', 'anio',
    'estado', 'condicion_pct', 'consumo_combustible', 'plazo_reparacion', 'causa_inactividad', 'fecha_inhabilitado', 'inversion_reparacion',
    'observaciones', 'origen', 'hoja_origen', 'fila_origen', 'activo', 'created_at', 'updated_at', 'updated_by', 'serie'],
  incidencias: ['id', 'codigo', 'equipo_id', 'fecha_reporte', 'descripcion', 'causa', 'prioridad', 'estado', 'fuera_servicio', 'reportado_por',
    'responsable_id', 'costo_estimado', 'costo_real', 'fecha_estimada', 'fecha_resolucion', 'observaciones', 'adjuntos', 'created_at', 'updated_at'],
  eventos: ['id', 'incidencia_id', 'fecha', 'usuario_id', 'tipo', 'detalle'],
  mantenimientos: ['id', 'equipo_id', 'tipo', 'fecha_programada', 'fecha_ejecucion', 'responsable', 'descripcion', 'costo', 'estado', 'proxima_fecha',
    'created_at', 'created_by', 'updated_at'],
  estados: ['id', 'equipo_id', 'estado_anterior', 'estado_nuevo', 'fecha', 'usuario_id', 'origen'],
  importaciones: ['id', 'archivo', 'fecha', 'usuario_id', 'nuevos', 'actualizados', 'rechazados', 'detalle'],
  auditoria: ['fecha', 'usuario_id', 'accion', 'tabla', 'registro', 'detalle']
};
var NUM = { id: 1, planta_id: 1, anio: 1, condicion_pct: 1, inversion_reparacion: 1, fila_origen: 1, incidencia_id: 1, costo_estimado: 1, costo_real: 1, costo: 1, nuevos: 1, actualizados: 1, rechazados: 1 };
var BOOL = { activo: 1, debe_cambiar: 1, fuera_servicio: 1 };
var JSONC = { plantas: 1, adjuntos: 1, detalle: 1 };
// Tablas cuyo id es texto (uuid); en las demás es numérico consecutivo
var ID_TEXTO = { usuarios: 1, equipos: 1 };

// ------------------------------------------------------------------ entrada web
function doGet() {
  return ContentService.createTextOutput('API de Duracreto · Control de maquinaria: activa.');
}

var SOLO_LECTURA = { login: 1, sesion: 1, cargar: 1, eventos: 1, adjunto: 1, leerInventario: 1, logout: 1 };

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return salida({ ok: false, error: 'Solicitud inválida' }); }
  var escribe = !SOLO_LECTURA[req.action];
  var lock = LockService.getScriptLock();
  try {
    if (escribe && !lock.tryLock(25000)) return salida({ ok: false, error: 'El servidor está ocupado. Intente de nuevo en unos segundos.' });
    var r = manejar(req) || {};
    r.ok = true;
    return salida(r);
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    if (!/^(sesion|Debe cambiar|Sin permiso|Usuario|La contraseña|Ya existe|No|El |La |Escriba|Elija|Indique|Su usuario|Demasiados|Equipo|Incidencia|Archivo)/.test(msg)) console.error(err && err.stack ? err.stack : err);
    return salida({ ok: false, error: msg });
  } finally {
    if (escribe) { try { lock.releaseLock(); } catch (x) { /* nada */ } }
  }
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function manejar(req) {
  var a = req.action;
  if (a === 'login') return login(String(req.u || ''), String(req.p || ''));
  var yo = usuarioDeToken(req.token);
  if (a === 'sesion') return { user: publico(yo) };
  if (a === 'logout') { PropertiesService.getScriptProperties().deleteProperty('ses_' + req.token); return {}; }
  if (a === 'cambiarPassword') return cambiarPassword(yo, String(req.actual || ''), String(req.nueva || ''));
  if (yo.debe_cambiar) throw new Error('Debe cambiar su contraseña antes de continuar.');
  switch (a) {
    case 'cargar': return cargar(yo);
    case 'guardarEquipo': return { equipo: guardarEquipo(yo, req.equipo || {}) };
    case 'observaciones': return observaciones(yo, req.id, req.texto);
    case 'estadoRapido': return estadoRapido(yo, req || {});
    case 'crearIncidencia': return { incidencia: crearIncidencia(yo, req.inc || {}, req.adjuntos || []) };
    case 'actualizarIncidencia': return { incidencia: actualizarIncidencia(yo, Number(req.id), req.cambios || {}) };
    case 'comentar': return comentar(yo, Number(req.id), req.texto);
    case 'eventos': return { eventos: eventosDe(yo, Number(req.id)) };
    case 'adjunto': return adjunto(yo, Number(req.incidencia), Number(req.indice));
    case 'guardarMantenimiento': return { mantenimiento: guardarMantenimiento(yo, req.m || {}) };
    case 'leerInventario': exigir(yo, 'importar'); return { hojas: leerInventario() };
    case 'importar': return importar(yo, req.equipos || [], String(req.archivo || ''), req.detalle || {});
    case 'guardarPlanta': return guardarPlanta(yo, req.planta || {});
    case 'guardarPerfil': return guardarPerfil(yo, req.perfil || {}, req.plantas || []);
    case 'crearUsuario': return crearUsuario(yo, req.usuario || {});
    case 'resetPassword': return resetPassword(yo, String(req.id || ''), String(req.password || ''));
    case 'sincronizar': exigir(yo, 'importar'); return cargarInventarioDeLaHoja();
  }
  throw new Error('Acción no reconocida: ' + a);
}

// ------------------------------------------------------------------ hoja como tablas
var CACHE_T = {};
function libro() { return SpreadsheetApp.getActiveSpreadsheet(); }

function hoja(nombre) {
  var sh = libro().getSheetByName(PREFIJO + nombre);
  if (!sh) throw new Error('No existe la pestaña ' + PREFIJO + nombre + '. Ejecute la función instalar.');
  return sh;
}

function desde(v, c) {
  if (v === '' || v === null || v === undefined) return BOOL[c] ? false : null;
  if (BOOL[c]) return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
  if (NUM[c] && !(c === 'id' && false)) { var n = Number(v); return isNaN(n) ? String(v) : n; }
  if (JSONC[c]) { try { return JSON.parse(v); } catch (e) { return null; } }
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? null : Utilities.formatDate(v, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  return String(v);
}
function hacia(v, c) {
  if (v === null || v === undefined) return '';
  if (BOOL[c]) return v ? 'TRUE' : 'FALSE';
  if (JSONC[c]) return JSON.stringify(v);
  if (typeof v === 'number') return v;
  return String(v);
}

function tabla(nombre) {
  if (CACHE_T[nombre]) return CACHE_T[nombre];
  var sh = hoja(nombre), cols = TABLAS[nombre];
  var n = sh.getLastRow() - 1;
  var vals = n > 0 ? sh.getRange(2, 1, n, cols.length).getValues() : [];
  var rows = [];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i].join('') === '') continue;
    var o = { _fila: i + 2 };
    for (var j = 0; j < cols.length; j++) o[cols[j]] = desde(vals[i][j], cols[j]);
    if (NUM.id && !ID_TEXTO[nombre] && o.id !== null && nombre !== 'auditoria') o.id = Number(o.id);
    rows.push(o);
  }
  CACHE_T[nombre] = { sh: sh, cols: cols, rows: rows };
  return CACHE_T[nombre];
}
function filaDe(t, o) { return t.cols.map(function (c) { return hacia(o[c], c); }); }

function insertar(nombre, o) {
  var t = tabla(nombre);
  if (o.id === undefined || o.id === null) o.id = ID_TEXTO[nombre] ? Utilities.getUuid() : siguienteId(nombre);
  t.sh.appendRow(filaDe(t, o));
  o._fila = t.sh.getLastRow();
  t.rows.push(o);
  return o;
}
function insertarVarios(nombre, lista) {
  if (!lista.length) return;
  var t = tabla(nombre);
  var inicio = Math.max(t.sh.getLastRow(), 1) + 1;
  lista.forEach(function (o, k) {
    if (o.id === undefined || o.id === null) o.id = ID_TEXTO[nombre] ? Utilities.getUuid() : siguienteId(nombre);
    o._fila = inicio + k; t.rows.push(o);
  });
  t.sh.getRange(inicio, 1, lista.length, t.cols.length).setValues(lista.map(function (o) { return filaDe(t, o); }));
}
function guardar(nombre, o) {
  var t = tabla(nombre);
  t.sh.getRange(o._fila, 1, 1, t.cols.length).setValues([filaDe(t, o)]);
}
function guardarVarios(nombre, lista) {
  if (!lista.length) return;
  var t = tabla(nombre);
  // agrupa filas consecutivas para escribir en bloques
  var orden = lista.slice().sort(function (a, b) { return a._fila - b._fila; });
  var bloque = [orden[0]];
  function vaciar() { t.sh.getRange(bloque[0]._fila, 1, bloque.length, t.cols.length).setValues(bloque.map(function (o) { return filaDe(t, o); })); }
  for (var i = 1; i < orden.length; i++) {
    if (orden[i]._fila === bloque[bloque.length - 1]._fila + 1) bloque.push(orden[i]); else { vaciar(); bloque = [orden[i]]; }
  }
  vaciar();
}
function siguienteId(nombre) {
  var max = 0;
  tabla(nombre).rows.forEach(function (r) { if (typeof r.id === 'number' && r.id > max) max = r.id; });
  return max + 1;
}
function buscar(nombre, campo, valor) {
  var rows = tabla(nombre).rows;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][campo]) === String(valor)) return rows[i];
  return null;
}
function limpio(o) { var r = {}; for (var k in o) if (k !== '_fila') r[k] = o[k]; return r; }
function ahora() { return new Date().toISOString(); }
function hoy() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Tegucigalpa', 'yyyy-MM-dd'); }
function auditar(yo, accion, nombreTabla, registro, detalle) {
  insertar('auditoria', { fecha: ahora(), usuario_id: yo ? yo.id : '', accion: accion, tabla: nombreTabla, registro: String(registro), detalle: detalle || null });
}

// ------------------------------------------------------------------ usuarios y sesiones
function hex(bytes) { return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''); }
function cifrar(pw, salt) {
  var h = salt + '|' + pw;
  for (var i = 0; i < ITER_HASH; i++) h = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + salt, Utilities.Charset.UTF_8));
  return h;
}
function publico(u) {
  return { id: u.id, username: u.username, nombre: u.nombre || '', cargo: u.cargo || '', rol: u.rol, activo: !!u.activo, debe_cambiar: !!u.debe_cambiar, plantas: u.plantas || [] };
}
function validarPassword(pw, username) {
  if (pw.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new Error('La contraseña debe combinar letras y números.');
  if (username && pw.toLowerCase().indexOf(username.toLowerCase()) >= 0) throw new Error('La contraseña no puede contener el nombre de usuario.');
}

function login(u, p) {
  u = u.trim().toLowerCase();
  if (!u || !p) throw new Error('Escriba su usuario y contraseña.');
  var cache = CacheService.getScriptCache();
  var intentos = Number(cache.get('fail_' + u) || 0);
  if (intentos >= 5) throw new Error('Demasiados intentos fallidos. Espere 10 minutos o pida al administrador que restablezca su contraseña.');
  var usr = buscar('usuarios', 'username', u);
  if (!usr || cifrar(p, usr.salt) !== usr.hash) {
    cache.put('fail_' + u, String(intentos + 1), 600);
    throw new Error('Usuario o contraseña incorrectos.');
  }
  if (!usr.activo) throw new Error('Su usuario está desactivado. Consulte con el administrador.');
  cache.remove('fail_' + u);
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var props = PropertiesService.getScriptProperties();
  limpiarSesiones(props);
  props.setProperty('ses_' + token, JSON.stringify({ uid: usr.id, exp: Date.now() + DIAS_SESION * 864e5 }));
  usr.ultimo_acceso = ahora(); guardar('usuarios', usr);
  return { token: token, user: publico(usr) };
}
function limpiarSesiones(props) {
  var all = props.getProperties(), t = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('ses_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < t) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}
function usuarioDeToken(token) {
  if (!token) throw new Error('sesion');
  var raw = PropertiesService.getScriptProperties().getProperty('ses_' + token);
  if (!raw) throw new Error('sesion');
  var s = JSON.parse(raw);
  if (s.exp < Date.now()) { PropertiesService.getScriptProperties().deleteProperty('ses_' + token); throw new Error('sesion'); }
  var u = buscar('usuarios', 'id', s.uid);
  if (!u || !u.activo) throw new Error('sesion');
  return u;
}
function cerrarSesionesDe(uid, excepto) {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('ses_') !== 0 || k === 'ses_' + excepto) return;
    try { if (JSON.parse(all[k]).uid === uid) props.deleteProperty(k); } catch (e) { /* nada */ }
  });
}
function cambiarPassword(yo, actual, nueva) {
  if (cifrar(actual, yo.salt) !== yo.hash) throw new Error('La contraseña actual no es correcta.');
  if (actual === nueva) throw new Error('La contraseña nueva debe ser distinta de la actual.');
  validarPassword(nueva, yo.username);
  yo.salt = Utilities.getUuid(); yo.hash = cifrar(nueva, yo.salt); yo.debe_cambiar = false;
  guardar('usuarios', yo);
  auditar(yo, 'cambiar_password', 'usuarios', yo.id, null);
  return { user: publico(yo) };
}

function puede(yo, accion) { return PERM[accion].indexOf(yo.rol) >= 0; }
function exigir(yo, accion) { if (!puede(yo, accion)) throw new Error('Sin permiso para esta acción.'); }
function vePlanta(yo, plantaId) { return ROLES.indexOf(yo.rol) >= 0; }

// ------------------------------------------------------------------ lectura general
function cargar(yo) {
  var eqs = tabla('equipos').rows.filter(function (e) { return vePlanta(yo, e.planta_id); });
  var ids = {}; eqs.forEach(function (e) { ids[e.id] = 1; });
  var verCostos = puede(yo, 'costos');
  var sinCostos = function (o) { var r = limpio(o); if (!verCostos) { delete r.costo_estimado; delete r.costo_real; delete r.costo; delete r.inversion_reparacion; } return r; };
  var desdeEst = new Date(Date.now() - 400 * 864e5).toISOString();
  var usuarios = tabla('usuarios').rows;
  return {
    negocios: NEGOCIOS,
    plantas: tabla('plantas').rows.map(limpio).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); }),
    perfiles: usuarios.map(publico),
    perfilPlantas: [].concat.apply([], usuarios.map(function (u) { return (u.plantas || []).map(function (p) { return { perfil_id: u.id, planta_id: Number(p) }; }); })),
    equipos: eqs.map(sinCostos),
    incidencias: tabla('incidencias').rows.filter(function (i) { return ids[i.equipo_id]; }).map(function (i) {
      var r = sinCostos(i); r.adjuntos = (i.adjuntos || []).map(function (a) { return { nombre: a.nombre, tipo: a.tipo, path: a.fileId ? 'drive' : null }; }); return r;
    }).sort(function (a, b) { return b.id - a.id; }),
    mantenimientos: tabla('mantenimientos').rows.filter(function (m) { return ids[m.equipo_id]; }).map(sinCostos),
    estados: tabla('estados').rows.filter(function (s) { return ids[s.equipo_id] && s.fecha >= desdeEst; }).map(limpio),
    importaciones: (yo.rol === 'maestro' || yo.rol === 'admin' || yo.rol === 'gerencia') ? tabla('importaciones').rows.map(limpio).reverse().slice(0, 20) : []
  };
}

// ------------------------------------------------------------------ equipos
function registrarEstado(yo, eq, anterior, origen) {
  insertar('estados', { equipo_id: eq.id, estado_anterior: anterior, estado_nuevo: eq.estado, fecha: ahora(), usuario_id: yo ? yo.id : '', origen: origen });
}
function cambiarEstado(yo, eq, nuevo, origen, fecha) {
  var ant = eq.estado;
  if (ant === nuevo) return false;
  eq.estado = nuevo;
  if (nuevo === 'habilitado') eq.fecha_inhabilitado = null;
  else if ((nuevo === 'inhabilitado' || nuevo === 'taller') && ant !== 'inhabilitado' && ant !== 'taller' && origen !== 'excel') eq.fecha_inhabilitado = fecha || eq.fecha_inhabilitado || hoy();
  registrarEstado(yo, eq, ant, origen);
  return true;
}
function texto(v, max) { if (v === null || v === undefined) return null; var s = String(v).trim(); return s ? s.slice(0, max || 2000) : null; }
function fechaValida(v) { if (!v) return null; var s = String(v).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Fecha inválida: ' + v); return s; }
function numero(v, nombre) { if (v === null || v === undefined || v === '') return null; var n = Number(v); if (isNaN(n) || n < 0) throw new Error('El ' + nombre + ' debe ser un número positivo.'); return n; }


// Busca un equipo existente por código interno, SAP o número de serie (para no duplicar)
function equipoPorCodigos(codigo, sap, serie) {
  var C = function (v) { return v ? String(v).toUpperCase().replace(/\s+/g, '') : null; };
  var c = C(codigo), s = C(sap), se = C(serie);
  if (!c && !s && !se) return null;
  return tabla('equipos').rows.filter(function (e) {
    return (c && (C(e.clave) === c || C(e.codigo) === c || C(e.codigo_sap) === c)) ||
      (s && (C(e.clave) === s || C(e.codigo) === s || C(e.codigo_sap) === s)) ||
      (se && (C(e.serie) === se || C(e.clave) === se));
  })[0] || null;
}
function siguienteClaveNueva() {
  var max = 0;
  tabla('equipos').rows.forEach(function (e) { var m = /^NUEVO-(\d+)$/.exec(e.clave || ''); if (m) max = Math.max(max, Number(m[1])); });
  return 'NUEVO-' + ('00' + (max + 1)).slice(-3);
}
function guardarEquipo(yo, d) {
  exigir(yo, 'editarEquipo');
  if (!texto(d.descripcion)) throw new Error('Escriba la descripción del equipo.');
  if (d.estado && ESTADOS_EQ.indexOf(d.estado) < 0) throw new Error('Estado no válido.');
  if (d.negocio_id && !NEGOCIOS.some(function (n) { return n.id === d.negocio_id; })) throw new Error('Negocio no válido.');
  if (d.planta_id && !buscar('plantas', 'id', d.planta_id)) throw new Error('Planta no válida.');
  var anio = d.anio === null || d.anio === undefined || d.anio === '' ? null : Number(d.anio);
  if (anio !== null && (!(anio >= 1950 && anio <= 2100) || Math.round(anio) !== anio)) throw new Error('El año debe estar entre 1950 y 2100.');
  var campos = {
    descripcion: texto(d.descripcion, 300), tipo: texto(d.tipo, 80), negocio_id: d.negocio_id || null, planta_id: d.planta_id ? Number(d.planta_id) : null,
    marca: texto(d.marca, 80), modelo: texto(d.modelo, 80), anio: anio, causa_inactividad: texto(d.causa_inactividad, 500), observaciones: texto(d.observaciones, 2000),
    serie: d.serie ? String(texto(d.serie, 80)).toUpperCase() : null
  };
  if (campos.serie) {
    var otroSerie = buscar('equipos', 'serie', campos.serie);
    if (otroSerie && otroSerie.id !== d.id) throw new Error('Ya existe un equipo con la serie ' + campos.serie + ' (' + otroSerie.clave + ').');
  }
  var t = ahora();
  if (d.id) {
    var eq = buscar('equipos', 'id', d.id);
    if (!eq) throw new Error('Equipo no encontrado.');
    var antes = limpio(eq);
    if (eq.origen !== 'excel') { campos.codigo = texto(d.codigo, 40); campos.codigo_sap = texto(d.codigo_sap, 40); }
    for (var k in campos) eq[k] = campos[k];
    if (d.estado) cambiarEstado(yo, eq, d.estado, 'app', fechaValida(d.fecha_inhabilitado));
    if (d.fecha_inhabilitado !== undefined && eq.estado !== 'habilitado') eq.fecha_inhabilitado = fechaValida(d.fecha_inhabilitado) || eq.fecha_inhabilitado;
    eq.updated_at = t; eq.updated_by = yo.id;
    guardar('equipos', eq);
    auditar(yo, 'editar', 'equipos', eq.id, { antes: antes, despues: limpio(eq) });
    return limpio(eq);
  }
  var codigo = texto(d.codigo, 40), sap = texto(d.codigo_sap, 40);
  if (!codigo && !sap && !campos.serie && !d.permitirSinCodigo) throw new Error('Indique el código interno, el código SAP o el número de serie.');
  var clave = codigo || sap || campos.serie ? String(codigo || sap || campos.serie).toUpperCase() : siguienteClaveNueva();
  if (buscar('equipos', 'clave', clave)) throw new Error('Ya existe un equipo con el código ' + clave + '.');
  var nuevo = { clave: clave, codigo: codigo ? codigo.toUpperCase() : null, codigo_sap: sap ? sap.toUpperCase() : null, estado: d.estado || 'habilitado', origen: 'manual', activo: true, created_at: t, updated_at: t, updated_by: yo.id };
  for (var c in campos) nuevo[c] = campos[c];
  if (nuevo.estado === 'inhabilitado' || nuevo.estado === 'taller') nuevo.fecha_inhabilitado = fechaValida(d.fecha_inhabilitado) || hoy();
  insertar('equipos', nuevo);
  registrarEstado(yo, nuevo, null, 'app');
  auditar(yo, 'crear', 'equipos', nuevo.id, limpio(nuevo));
  return limpio(nuevo);
}

function observaciones(yo, id, txt) {
  exigir(yo, 'observaciones');
  var eq = buscar('equipos', 'id', id);
  if (!eq) throw new Error('Equipo no encontrado.');
  if (!vePlanta(yo, eq.planta_id)) throw new Error('Sin permiso para este equipo.');
  var antes = eq.observaciones;
  eq.observaciones = texto(txt, 2000); eq.updated_at = ahora(); eq.updated_by = yo.id;
  guardar('equipos', eq);
  auditar(yo, 'observaciones', 'equipos', eq.id, { antes: antes, despues: eq.observaciones });
  return {};
}

// ------------------------------------------------------------------ incidencias
function evento(yo, incId, tipo, detalle) {
  insertar('eventos', { incidencia_id: incId, fecha: ahora(), usuario_id: yo ? yo.id : '', tipo: tipo, detalle: detalle });
}
function lempiras(n) { return n === null || n === undefined ? '—' : 'L ' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function carpetaAdjuntos() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARPETA_ADJUNTOS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se volvió a crear abajo */ } }
  var f = DriveApp.createFolder('Duracreto maquinaria · adjuntos');
  props.setProperty('CARPETA_ADJUNTOS', f.getId());
  return f;
}

function crearIncidencia(yo, d, adjuntos) {
  exigir(yo, 'reportar');
  var desc0 = texto(d.descripcion, 2000);
  if (!desc0 || desc0.length < 5) throw new Error('Describa la falla (al menos unas palabras).');
  var costoEst = d.costo_estimado === null || d.costo_estimado === undefined || d.costo_estimado === '' ? null : Number(d.costo_estimado);
  if (costoEst === null || isNaN(costoEst) || costoEst < 0) throw new Error('Escriba el costo aproximado de la reparación.');
  var eq = d.equipo_id ? buscar('equipos', 'id', d.equipo_id) : null;
  if (!eq && d.nuevo_equipo) {
    var ne = d.nuevo_equipo;
    var ya = equipoPorCodigos(texto(ne.codigo, 40), null, texto(ne.serie, 80));
    eq = ya || buscar('equipos', 'id', guardarEquipo(yo, { descripcion: ne.descripcion, negocio_id: ne.negocio_id, planta_id: ne.planta_id, codigo: ne.codigo, serie: ne.serie, marca: ne.marca, modelo: ne.modelo, estado: 'habilitado', permitirSinCodigo: true }).id);
  }
  if (!eq) throw new Error('Equipo no encontrado.');
  if (!vePlanta(yo, eq.planta_id)) throw new Error('Sin permiso para este equipo.');
  var desc = texto(d.descripcion, 2000);
  if (!desc || desc.length < 5) throw new Error('Describa la falla (al menos unas palabras).');
  var prioridad = PRIORIDADES.indexOf(d.prioridad) >= 0 ? d.prioridad : 'media';
  var f = fechaValida(d.fecha_reporte) || hoy();
  if (f > hoy()) throw new Error('La fecha del reporte no puede ser futura.');
  var guardados = [];
  if (adjuntos.length) {
    var carpeta = carpetaAdjuntos();
    adjuntos.slice(0, 6).forEach(function (a) {
      var bytes = Utilities.base64Decode(String(a.base64 || ''));
      if (!bytes.length) return;
      if (bytes.length > MAX_ADJUNTO) throw new Error('Archivo demasiado grande: ' + a.nombre);
      var tipo = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(a.tipo) ? a.tipo : 'application/octet-stream';
      var file = carpeta.createFile(Utilities.newBlob(bytes, tipo, String(a.nombre || 'adjunto').slice(0, 120)));
      guardados.push({ nombre: String(a.nombre || 'adjunto').slice(0, 120), tipo: tipo, fileId: file.getId() });
    });
  }
  var t = ahora();
  var inc = {
    equipo_id: eq.id, fecha_reporte: f, descripcion: desc, causa: texto(d.causa, 500), prioridad: prioridad, estado: 'reportada',
    fuera_servicio: !!d.fuera_servicio, reportado_por: yo.id, responsable_id: null, costo_estimado: costoEst, costo_real: null,
    fecha_estimada: null, fecha_resolucion: null, observaciones: null, adjuntos: guardados, created_at: t, updated_at: t
  };
  inc.id = siguienteId('incidencias');
  inc.codigo = 'INC-' + ('000' + inc.id).slice(-Math.max(4, String(inc.id).length));
  insertar('incidencias', inc);
  evento(yo, inc.id, 'creacion', 'Falla reportada con prioridad ' + prioridad.charAt(0).toUpperCase() + prioridad.slice(1) + (inc.fuera_servicio ? '. Equipo fuera de servicio.' : '.'));
  if (inc.fuera_servicio && eq.estado !== 'inhabilitado') {
    cambiarEstado(yo, eq, 'inhabilitado', 'app', f);
    eq.causa_inactividad = inc.causa || desc; eq.updated_at = t; eq.updated_by = yo.id;
    guardar('equipos', eq);
  }
  auditar(yo, 'crear', 'incidencias', inc.codigo, { equipo: eq.clave, prioridad: prioridad, fuera_servicio: inc.fuera_servicio });
  var r = limpio(inc); r.adjuntos = guardados.map(function (a) { return { nombre: a.nombre, tipo: a.tipo, path: 'drive' }; });
  return r;
}

function actualizarIncidencia(yo, id, c) {
  exigir(yo, 'gestionar');
  var inc = buscar('incidencias', 'id', id);
  if (!inc) throw new Error('Incidencia no encontrada.');
  var ant = limpio(inc);
  if (c.estado !== undefined) { if (ESTADOS_INC.indexOf(c.estado) < 0) throw new Error('Estado no válido.'); inc.estado = c.estado; }
  if (c.responsable_id !== undefined) {
    if (c.responsable_id && !buscar('usuarios', 'id', c.responsable_id)) throw new Error('Responsable no válido.');
    inc.responsable_id = c.responsable_id || null;
  }
  if (c.costo_estimado !== undefined) inc.costo_estimado = numero(c.costo_estimado, 'costo estimado');
  if (c.costo_real !== undefined) inc.costo_real = numero(c.costo_real, 'costo real');
  if (c.fecha_estimada !== undefined) inc.fecha_estimada = fechaValida(c.fecha_estimada);
  if (c.observaciones !== undefined) inc.observaciones = texto(c.observaciones, 2000);
  if (inc.estado === 'reparada' || inc.estado === 'cerrada') inc.fecha_resolucion = inc.fecha_resolucion || hoy(); else inc.fecha_resolucion = null;
  inc.updated_at = ahora();
  guardar('incidencias', inc);

  var eq = buscar('equipos', 'id', inc.equipo_id);
  if (inc.estado !== ant.estado) {
    evento(yo, id, 'estado', 'Estado: ' + ETQ_INC[ant.estado] + ' → ' + ETQ_INC[inc.estado]);
    if (inc.fuera_servicio && eq) {
      var cambio = false;
      if (inc.estado === 'en_reparacion' && eq.estado === 'inhabilitado') cambio = cambiarEstado(yo, eq, 'taller', 'app');
      if (inc.estado === 'reparada' || inc.estado === 'cerrada') {
        var otras = tabla('incidencias').rows.some(function (i) { return i.equipo_id === eq.id && i.id !== id && i.fuera_servicio && i.estado !== 'reparada' && i.estado !== 'cerrada'; });
        if (!otras && (eq.estado === 'inhabilitado' || eq.estado === 'taller')) { cambio = cambiarEstado(yo, eq, 'habilitado', 'app'); eq.causa_inactividad = null; eq.plazo_reparacion = null; }
      }
      if (cambio) { eq.updated_at = ahora(); eq.updated_by = yo.id; guardar('equipos', eq); }
    }
  }
  if (inc.responsable_id !== ant.responsable_id) {
    var p = inc.responsable_id ? buscar('usuarios', 'id', inc.responsable_id) : null;
    evento(yo, id, 'asignacion', 'Responsable: ' + (p ? (p.nombre || p.username) : 'sin asignar'));
  }
  if (inc.costo_estimado !== ant.costo_estimado || inc.costo_real !== ant.costo_real) evento(yo, id, 'costo', 'Costos: estimado ' + lempiras(inc.costo_estimado) + ' · real ' + lempiras(inc.costo_real));
  if (inc.fecha_estimada !== ant.fecha_estimada) evento(yo, id, 'fecha', 'Fecha estimada de finalización: ' + (inc.fecha_estimada ? inc.fecha_estimada.split('-').reverse().join('/') : '—'));
  auditar(yo, 'editar', 'incidencias', inc.codigo, { antes: ant, despues: limpio(inc) });
  var r = limpio(inc); r.adjuntos = (inc.adjuntos || []).map(function (a) { return { nombre: a.nombre, tipo: a.tipo, path: 'drive' }; });
  return r;
}

// Cambio rápido de estado desde la app (pensado para el taller): un toque y listo.
// Operativo -> cierra como "Reparada" las fallas abiertas del equipo. En taller -> las pasa a "En reparación".
function estadoRapido(yo, d) {
  exigir(yo, 'editarEquipo');
  var eq = buscar('equipos', 'id', d.id);
  if (!eq) throw new Error('Equipo no encontrado.');
  var nuevo = String(d.estado || '');
  if (['habilitado', 'taller', 'inhabilitado'].indexOf(nuevo) < 0) throw new Error('Estado no válido.');
  var nota = texto(d.nota, 500);
  var antes = eq.estado;
  cambiarEstado(yo, eq, nuevo, 'app');
  if (nuevo === 'habilitado') { eq.causa_inactividad = null; eq.plazo_reparacion = null; }
  else if (nota) eq.causa_inactividad = nota;
  eq.updated_at = ahora(); eq.updated_by = yo.id;
  guardar('equipos', eq);
  var etq = { habilitado: 'Operativo', taller: 'En taller', inhabilitado: 'Inhabilitado' };
  var tocadas = 0;
  tabla('incidencias').rows.filter(function (i) { return i.equipo_id === eq.id && i.estado !== 'reparada' && i.estado !== 'cerrada'; }).forEach(function (i) {
    var ant = i.estado;
    if (nuevo === 'habilitado') { i.estado = 'reparada'; i.fecha_resolucion = i.fecha_resolucion || hoy(); }
    else if (nuevo === 'taller' && i.estado !== 'en_reparacion') i.estado = 'en_reparacion';
    if (i.estado === ant) return;
    i.updated_at = ahora(); guardar('incidencias', i); tocadas++;
    evento(yo, i.id, 'estado', 'Estado: ' + ETQ_INC[ant] + ' → ' + ETQ_INC[i.estado] + ' (equipo marcado como ' + etq[nuevo] + ')' + (nota ? ' · ' + nota : ''));
  });
  auditar(yo, 'estado', 'equipos', eq.clave, { antes: antes, despues: nuevo, nota: nota });
  return { equipo: limpio(eq), incidencias: tocadas };
}

function incVisible(yo, id) {
  var inc = buscar('incidencias', 'id', id);
  if (!inc) throw new Error('Incidencia no encontrada.');
  var eq = buscar('equipos', 'id', inc.equipo_id);
  if (!eq || !vePlanta(yo, eq.planta_id)) throw new Error('Sin permiso para esta incidencia.');
  return inc;
}
function comentar(yo, id, txt) {
  exigir(yo, 'comentar');
  incVisible(yo, id);
  var t = texto(txt, 1000);
  if (!t) throw new Error('Escriba el comentario.');
  evento(yo, id, 'comentario', t);
  return {};
}
function eventosDe(yo, id) {
  incVisible(yo, id);
  return tabla('eventos').rows.filter(function (e) { return e.incidencia_id === id; }).map(limpio).reverse();
}
function adjunto(yo, incId, indice) {
  var inc = incVisible(yo, incId);
  var a = (inc.adjuntos || [])[indice];
  if (!a || !a.fileId) throw new Error('Archivo no encontrado.');
  var blob = DriveApp.getFileById(a.fileId).getBlob();
  return { nombre: a.nombre, tipo: a.tipo, base64: Utilities.base64Encode(blob.getBytes()) };
}

// ------------------------------------------------------------------ mantenimiento
function guardarMantenimiento(yo, d) {
  exigir(yo, 'mantener');
  var eq = buscar('equipos', 'id', d.equipo_id);
  if (!eq) throw new Error('Equipo no encontrado.');
  if (['preventivo', 'correctivo'].indexOf(d.tipo) < 0) throw new Error('Tipo de mantenimiento no válido.');
  if (ESTADOS_MANT.indexOf(d.estado) < 0) throw new Error('Estado no válido.');
  var desc = texto(d.descripcion, 1000);
  if (!desc) throw new Error('Describa el trabajo.');
  var campos = {
    equipo_id: eq.id, tipo: d.tipo, estado: d.estado, responsable: texto(d.responsable, 120), descripcion: desc, costo: numero(d.costo, 'costo'),
    fecha_programada: fechaValida(d.fecha_programada), fecha_ejecucion: fechaValida(d.fecha_ejecucion), proxima_fecha: fechaValida(d.proxima_fecha)
  };
  if (campos.estado === 'ejecutado' && !campos.fecha_ejecucion) throw new Error('Indique la fecha de ejecución.');
  if (campos.estado === 'programado' && !campos.fecha_programada) throw new Error('Indique la fecha programada.');
  var t = ahora();
  if (d.id) {
    var m = buscar('mantenimientos', 'id', d.id);
    if (!m) throw new Error('Mantenimiento no encontrado.');
    var antes = limpio(m);
    for (var k in campos) m[k] = campos[k];
    m.updated_at = t;
    guardar('mantenimientos', m);
    auditar(yo, 'editar', 'mantenimientos', m.id, { antes: antes, despues: limpio(m) });
    return limpio(m);
  }
  var n = campos; n.created_at = t; n.created_by = yo.id; n.updated_at = t;
  insertar('mantenimientos', n);
  auditar(yo, 'crear', 'mantenimientos', n.id, limpio(n));
  return limpio(n);
}

// ------------------------------------------------------------------ importación
function leerInventario() {
  return libro().getSheets().filter(function (sh) { return sh.getName().indexOf(PREFIJO) !== 0; }).map(function (sh) {
    var rango = sh.getDataRange();
    var vals = sh.isSheetHidden() ? [] : rango.getValues().map(function (r) {
      return r.map(function (v) { return Object.prototype.toString.call(v) === '[object Date]' ? (isNaN(v) ? null : Utilities.formatDate(v, Session.getScriptTimeZone() || 'America/Tegucigalpa', 'yyyy-MM-dd')) : (v === '' ? null : v); });
    });
    return { name: sh.getName(), hidden: sh.isSheetHidden(), rowOffset: rango.getRow() - 1, rows: vals };
  });
}

function importar(yo, equipos, archivo, detalle) {
  exigir(yo, 'importar');
  if (!equipos.length) throw new Error('No hay equipos para importar.');
  var t = ahora();
  var plantasT = tabla('plantas');
  var porNombre = {}; plantasT.rows.forEach(function (p) { porNombre[p.nombre] = p; });
  var nuevasPlantas = [];
  var eqT = tabla('equipos');
  var porClave = {}; eqT.rows.forEach(function (e) { porClave[e.clave] = e; });
  var nuevos = [], actualizados = [], estadosNuevos = [];
  equipos.forEach(function (e) {
    if (!e.clave || !e.descripcion) return;
    var pid = null;
    if (e.planta) {
      var p = porNombre[e.planta];
      if (!p) { p = { id: siguienteId('plantas') + nuevasPlantas.length, nombre: String(e.planta).slice(0, 80), negocio_id: null }; porNombre[p.nombre] = p; nuevasPlantas.push(p); }
      pid = p.id;
    }
    var estado = ESTADOS_EQ.indexOf(e.estado) >= 0 ? e.estado : 'sin_info';
    var campos = {
      codigo: e.codigo || null, codigo_sap: e.codigo_sap || null, descripcion: String(e.descripcion).slice(0, 300), tipo: e.tipo || null,
      ubicacion_excel: e.ubicacion_excel || null, condicion_pct: e.condicion_pct, consumo_combustible: e.consumo_combustible || null,
      plazo_reparacion: e.plazo_reparacion || null, causa_inactividad: e.causa_inactividad || null, inversion_reparacion: e.inversion_reparacion,
      hoja_origen: e.hoja_origen || null, fila_origen: e.fila_origen || null
    };
    var cur = porClave[e.clave] || equipoPorCodigos(e.codigo, e.codigo_sap, e.serie);
    if (cur && nuevos.indexOf(cur) >= 0) cur = null;
    if (cur && actualizados.indexOf(cur) >= 0) return;
    if (cur) {
      if (e.serie && !cur.serie) cur.serie = e.serie;
      for (var k in campos) cur[k] = campos[k];
      cur.negocio_id = cur.negocio_id || e.negocio || null;
      cur.planta_id = pid || cur.planta_id; cur.activo = true; cur.updated_at = t; cur.updated_by = yo.id;
      if (e.fecha_inhabilitado) cur.fecha_inhabilitado = e.fecha_inhabilitado;
      if (cur.estado !== estado) {
        var ant = cur.estado; cur.estado = estado;
        if (estado === 'habilitado') cur.fecha_inhabilitado = null;
        estadosNuevos.push({ equipo_id: cur.id, estado_anterior: ant, estado_nuevo: estado, fecha: t, usuario_id: yo.id, origen: 'excel' });
      }
      actualizados.push(cur);
    } else {
      var n = { id: Utilities.getUuid(), clave: e.clave, negocio_id: e.negocio || null, planta_id: pid, estado: estado, fecha_inhabilitado: e.fecha_inhabilitado || null,
        marca: null, modelo: null, anio: null, observaciones: null, origen: 'excel', activo: true, created_at: t, updated_at: t, updated_by: yo.id, serie: e.serie || null };
      for (var c in campos) n[c] = campos[c];
      porClave[n.clave] = n;
      nuevos.push(n);
      estadosNuevos.push({ equipo_id: n.id, estado_anterior: null, estado_nuevo: estado, fecha: t, usuario_id: yo.id, origen: 'excel' });
    }
  });
  // Una planta nueva recibe negocio solo si todos sus equipos son del mismo negocio
  nuevasPlantas.forEach(function (p) {
    var negs = {};
    nuevos.concat(actualizados).forEach(function (e) { if (e.planta_id === p.id) negs[e.negocio_id || '-'] = 1; });
    var k = Object.keys(negs);
    p.negocio_id = k.length === 1 && k[0] !== '-' ? k[0] : null;
  });
  insertarVarios('plantas', nuevasPlantas);
  guardarVarios('equipos', actualizados);
  insertarVarios('equipos', nuevos);
  var base = siguienteId('estados');
  estadosNuevos.forEach(function (s, i) { s.id = base + i; });
  insertarVarios('estados', estadosNuevos);
  var imp = { archivo: archivo.slice(0, 200), fecha: t, usuario_id: yo.id, nuevos: nuevos.length, actualizados: actualizados.length, rechazados: Number(detalle.rechazados) || 0, detalle: detalle };
  insertar('importaciones', imp);
  auditar(yo, 'importar', 'equipos', archivo, { nuevos: nuevos.length, actualizados: actualizados.length });
  return { nuevos: nuevos.length, actualizados: actualizados.length };
}

// ------------------------------------------------------------------ administración
function guardarPlanta(yo, d) {
  exigir(yo, 'usuarios');
  var p = buscar('plantas', 'id', d.id);
  if (!p) throw new Error('Planta no encontrada.');
  if (d.negocio_id && !NEGOCIOS.some(function (n) { return n.id === d.negocio_id; })) throw new Error('Negocio no válido.');
  p.negocio_id = d.negocio_id || null;
  if (d.nombre) p.nombre = texto(d.nombre, 80);
  guardar('plantas', p);
  auditar(yo, 'editar', 'plantas', p.id, limpio(p));
  return {};
}
function guardarPerfil(yo, d, plantas) {
  exigir(yo, 'usuarios');
  var u = buscar('usuarios', 'id', d.id);
  if (!u) throw new Error('Usuario no encontrado.');
  if (ROLES.indexOf(d.rol) < 0) throw new Error('Rol no válido.');
  var esYo = u.id === yo.id;
  if (!esYo && u.rol === 'maestro' && (d.rol !== 'maestro' || d.activo === false)) {
    var maestros = tabla('usuarios').rows.filter(function (x) { return x.rol === 'maestro' && x.activo; });
    if (maestros.length <= 1) throw new Error('Debe quedar al menos un Administrador general activo.');
  }
  var antes = publico(u);
  if (d.username !== undefined && d.username !== null) {
    var nuevoUser = String(d.username).trim().toLowerCase();
    if (nuevoUser !== u.username) {
      if (!/^[a-z0-9._-]{3,30}$/.test(nuevoUser)) throw new Error('Usuario inválido: use de 3 a 30 letras minúsculas, números, punto o guion.');
      if (buscar('usuarios', 'username', nuevoUser)) throw new Error('Ya existe el usuario ' + nuevoUser + '.');
      CacheService.getScriptCache().remove('fail_' + u.username);
      u.username = nuevoUser;
    }
  }
  u.nombre = texto(d.nombre, 120) || ''; u.cargo = texto(d.cargo, 120) || '';
  if (!esYo) { u.rol = d.rol; u.activo = d.activo !== false; }
  u.plantas = u.rol === 'planta' ? plantas.map(Number).filter(function (p) { return buscar('plantas', 'id', p); }) : [];
  guardar('usuarios', u);
  if (!u.activo) cerrarSesionesDe(u.id);
  auditar(yo, 'editar', 'usuarios', u.username, { antes: antes, despues: publico(u) });
  return {};
}
function crearUsuario(yo, d) {
  exigir(yo, 'usuarios');
  var username = String(d.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Usuario inválido: use de 3 a 30 letras minúsculas, números, punto o guion.');
  if (buscar('usuarios', 'username', username)) throw new Error('Ya existe el usuario ' + username + '.');
  if (ROLES.indexOf(d.rol) < 0) throw new Error('Rol no válido.');
  validarPassword(String(d.password || ''), username);
  var salt = Utilities.getUuid();
  var u = { username: username, nombre: texto(d.nombre, 120) || '', cargo: texto(d.cargo, 120) || '', rol: d.rol,
    plantas: d.rol === 'planta' ? (d.plantas || []).map(Number) : [], activo: true, debe_cambiar: false, salt: salt, hash: cifrar(String(d.password), salt), creado: ahora(), ultimo_acceso: null };
  insertar('usuarios', u);
  auditar(yo, 'crear', 'usuarios', username, publico(u));
  return { id: u.id };
}
function resetPassword(yo, id, pw) {
  exigir(yo, 'usuarios');
  var u = buscar('usuarios', 'id', id);
  if (!u) throw new Error('Usuario no encontrado.');
  validarPassword(pw, u.username);
  u.salt = Utilities.getUuid(); u.hash = cifrar(pw, u.salt); u.debe_cambiar = false;
  guardar('usuarios', u);
  cerrarSesionesDe(u.id);
  CacheService.getScriptCache().remove('fail_' + u.username);
  auditar(yo, 'reset_password', 'usuarios', u.username, null);
  return {};
}

// ------------------------------------------------------------------ instalación (ejecutar a mano una vez)
function instalar() {
  var ss = libro();
  Object.keys(TABLAS).forEach(function (nombre) {
    var sh = ss.getSheetByName(PREFIJO + nombre);
    if (!sh) sh = ss.insertSheet(PREFIJO + nombre);
    var cols = TABLAS[nombre];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#11110E').setFontColor('#F9D600');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');   // todo como texto: evita que Sheets cambie fechas o códigos
    if (sh.getMaxColumns() > cols.length) sh.deleteColumns(cols.length + 1, sh.getMaxColumns() - cols.length);
  });
  var p = ss.getSheetByName(PREFIJO + 'usuarios');
  p.getRange(1, TABLAS.usuarios.indexOf('salt') + 1, p.getMaxRows(), 2).setFontColor('#999999');
  carpetaAdjuntos();
  CACHE_T = {};
  if (!buscar('usuarios', 'username', 'admin')) {
    var temporal = 'Dc' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89);
    var salt = Utilities.getUuid();
    insertar('usuarios', { username: 'admin', nombre: 'Jefe de planta', cargo: 'Administrador', rol: 'admin', plantas: [], activo: true, debe_cambiar: true, salt: salt, hash: cifrar(temporal, salt), creado: ahora(), ultimo_acceso: null });
    PropertiesService.getScriptProperties().setProperty('ADMIN_TEMPORAL', temporal);
    Logger.log('Usuario: admin   Contraseña temporal: ' + temporal + '   (se pedirá cambiarla al entrar)');
  } else {
    Logger.log('Las pestañas están listas. El usuario admin ya existía.');
  }
  CACHE_T = {};
  if (!buscar('usuarios', 'rol', 'maestro')) crearMaestro();
  // Carga inicial: si todavía no hay equipos, se importa el inventario de la propia hoja
  CACHE_T = {};
  if (!tabla('equipos').rows.length) {
    var r = cargarInventarioDeLaHoja();
    Logger.log('Inventario cargado: ' + r.nuevos + ' equipos nuevos, ' + r.actualizados + ' actualizados.');
  }
}

// Lee las pestañas de inventario de esta misma hoja y las importa (también disponible desde la app)
function cargarInventarioDeLaHoja() {
  CACHE_T = {};
  var admin = buscar('usuarios', 'rol', 'maestro') || buscar('usuarios', 'rol', 'admin');
  var res = Importador.analizarLibro(leerInventario(), { hoy: hoy() });
  return importar(admin, res.equipos, 'Hoja de Google (carga automática)', { rechazados: res.rechazados.length, duplicados: res.duplicados.length, avisos: res.avisos.length, hojas: res.hojas });
}

// Administrador general (usuario maestro): el único que crea y administra usuarios.
var USUARIO_MAESTRO = 'dc.maestro';
function crearMaestro() {
  CACHE_T = {};
  var temporal = 'Dm' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89);
  var salt = Utilities.getUuid();
  var u = buscar('usuarios', 'rol', 'maestro') || buscar('usuarios', 'username', USUARIO_MAESTRO);
  if (u) { u.salt = salt; u.hash = cifrar(temporal, salt); u.rol = 'maestro'; u.activo = true; u.debe_cambiar = true; guardar('usuarios', u); cerrarSesionesDe(u.id); }
  else insertar('usuarios', { username: USUARIO_MAESTRO, nombre: 'Administrador general', cargo: 'Administración del sistema', rol: 'maestro', plantas: [], activo: true, debe_cambiar: true, salt: salt, hash: cifrar(temporal, salt), creado: ahora(), ultimo_acceso: null });
  PropertiesService.getScriptProperties().setProperty('MAESTRO_TEMPORAL', temporal);
  Logger.log('Administrador general -> Usuario: ' + (u ? u.username : USUARIO_MAESTRO) + '   Contraseña temporal: ' + temporal + '   (se pedirá cambiarla al entrar)');
}
// Emergencia: si se pierde la contraseña del Administrador general, ejecutar desde el editor.
function restablecerMaestro() { crearMaestro(); }

// Emergencia: si se pierde la contraseña del admin, ejecutar desde el editor.
function restablecerAdmin() {
  CACHE_T = {};
  var u = buscar('usuarios', 'username', 'admin') || buscar('usuarios', 'rol', 'admin');
  if (!u) return instalar();
  var temporal = 'Dc' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89);
  u.salt = Utilities.getUuid(); u.hash = cifrar(temporal, u.salt); u.debe_cambiar = true; u.activo = true;
  guardar('usuarios', u);
  cerrarSesionesDe(u.id);
  Logger.log('Usuario: admin   Contraseña temporal: ' + temporal);
}

// ------------------------------------------------------------------ importador (misma lógica que js/importer.js)
var Importador = (function () {
// Lectura del Excel de maquinaria ("Maquinaria general DC").
// Recibe las hojas ya convertidas a filas (SheetJS sheet_to_json con header:1)
// y devuelve los equipos listos para importar, más rechazados, duplicados y avisos.
// No toca la base de datos: eso lo hace la acción «importar» del servidor (apps-script/Code.gs).

const NEGOCIOS = {
  concreto: 'Concreto premezclado',
  prefabricados: 'Prefabricados',
  trituracion: 'Trituración',
  bloques: 'Bloques'
};

const norm = s => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();

const limpio = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function codigoValido(v) {
  const c = norm(v);
  if (!c || c === 'S/C' || /^\*+$/.test(c) || c === 'N/A') return null;
  return c;
}

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = String(v).replace(/lps?\.?|l\.|,/gi, '').trim();
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}

function fechaISO(v) {
  if (v === null || v === undefined || v === '') return null;
  let d = null;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400000)); // serial de Excel
  else {
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return null;
  }
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

const FAMILIAS = [
  'CAMION CONCRETERO', 'CAMION GRUA', 'CAMION PLATAFORMA', 'CAMION CUARTO FRIO', 'CAMION TRASLADO AGUA', 'PICK UP', 'CAMION',
  'BOMBA DE CONCRETO', 'BOMBA ACHICADORA', 'BOMBA SUMERGIBLE', 'BOMBA LAVADO', 'DOSIFICADORA', 'PLANTA DE BLOQUES',
  'MONTACARGA', 'GRUA', 'RETROEXCAVADORA', 'EXCAVADORA', 'CARGADORA', 'TRITURADORA', 'GATO HIDRAULICO',
  'MOTOSOLDADORA', 'SOLDADORA', 'COMPRESOR', 'MAQUINA DE HIELO', 'MAQUINA DE COMPRESION', 'GENERADOR', 'VIBRADOR',
  'CONCRETERA', 'CONTENEDOR', 'MARTILLO', 'CHILLER', 'TALADRO', 'TORNO', 'LAVADORA', 'PALET', 'TORNILLO',
  'PLATAFORMAS', 'RIEL', 'PINZA'
];

const titulo = s => s.toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());

function familia(desc) {
  const d = norm(desc);
  const f = FAMILIAS.find(k => d.startsWith(k) || d.includes(k));
  if (f) return titulo(f === 'MONTACARGA' ? 'MONTACARGAS' : f);
  return titulo(d.split(/[-(\/0-9]/)[0].trim().split(' ').slice(0, 2).join(' ')) || 'Otro';
}

function negocioDe(desc, ubic) {
  const d = norm(desc), u = norm(ubic);
  if (/BOMBA DE CONCRETO|DOSIFICADORA|CAMION CONCRETERO|MAQUINA DE HIELO|CHILLER|TORNILLO DE DC|TRASLADO AGUA|CUARTO FRIO|CISTERNA/.test(d)) return 'concreto';
  if (/TRITURADORA/.test(d)) return 'trituracion';
  if (/BLOQUES|LOQUES|MAQUINA DE COMPRESION/.test(d)) return 'bloques';
  if (/PRETENSADO|HINCAR PILOTE|GATO HIDRAULICO|VIBRADOR|GRUA PORTICO|GRUA POLIPASTO/.test(d)) return 'prefabricados';
  if (/FESIT|BLOQUES/.test(u)) return 'bloques';
  if (/PRETENSAD|PREFABRICAD/.test(u)) return 'prefabricados';
  if (/TRITURA|SAN JORGE|BIJAGUAL|METSO/.test(u)) return 'trituracion';
  if (/CONCRETO|CEIBA|PUERTO CORTES|CHOLOMA/.test(u)) return 'concreto';
  return null;
}

function plantaDe(ubic) {
  const u = norm(ubic);
  if (!u || /^\*+$/.test(u) || u === 'SIN UBICACION') return 'Sin ubicación';
  if (/W\s?Y\s?M/.test(u)) return 'Taller WyM';
  if (/TALLER/.test(u)) return 'Taller DC';
  if (/FESIT/.test(u)) return 'Fesitranh';
  if (/PUERTO CORTES|\bPCO?\b/.test(u)) return 'Puerto Cortés';
  if (/CEIBA/.test(u)) return 'La Ceiba';
  if (/\bTGA\b/.test(u)) return 'Tegucigalpa';
  if (/CHOLOMA/.test(u)) return 'Choloma';
  if (/SAN JORGE/.test(u)) return 'San Jorge';
  if (/BIJAGUAL/.test(u)) return 'Bijagual';
  if (/SANTA ELENA/.test(u)) return 'Santa Elena';
  if (/PRETENSAD|PREFABRICAD/.test(u)) return 'Pretensados';
  if (/PLANTA (DE )?BLOQUES/.test(u)) return 'Planta de bloques';
  if (/\bSPS\b|PLANTEL|PANTEL/.test(u)) return 'San Pedro Sula';
  return titulo(u);
}

function columnas(rows, h) {
  const header = rows[h] || [];
  const ancho = Math.max(...rows.slice(h, h + 40).map(r => (r || []).length), header.length);
  const nombres = [];
  for (let c = 0; c < ancho; c++) {
    let n = norm(header[c]);
    for (let k = 1; !n && k <= 3 && h - k >= 0; k++) n = norm((rows[h - k] || [])[c]);
    nombres.push(n);
  }
  const map = {};
  let codigos = 0, descs = 0;
  nombres.forEach((n, c) => {
    if (!n) return;
    if (n.startsWith('ITEM')) { if (map.item == null) map.item = c; }
    else if (n.includes('SAP')) { if (map.sap == null) map.sap = c; }
    else if (n === 'CODIGO') { if (codigos === 0) map.codigo = c; else { if (map.sap == null) map.sap = c; } codigos++; }
    else if (n.startsWith('DESCRIPCION')) { if (descs === 0) map.desc = c; else { if (map.estatus == null) map.estatus = c; } descs++; }
    else if (n.startsWith('ESTATUS')) { if (map.estatus == null) map.estatus = c; }
    else if (n.includes('SERIE') || n === 'VIN' || n.includes('CHASIS')) { if (map.serie == null) map.serie = c; }
    else if (n === 'VERDE') map.verde = c;
    else if (n === 'ROJO') map.rojo = c;
    else if (n.includes('% ESTADO')) map.condicion = c;
    else if (n.includes('MENOR A UNA SEMANA')) map.menor = c;
    else if (n.includes('MAYOR A UNA SEMANA')) map.mayor = c;
    else if (n.startsWith('UBICACION') || n.startsWith('LOCALIZACION')) { if (map.ubic == null) map.ubic = c; }
    else if (n.includes('INHABILIT')) map.fecha = c;
    else if (n.includes('INVERSION')) map.inversion = c;
    else if (n.includes('COMBUSTIBLE')) map.consumo = c;
  });
  return map;
}

function filaEncabezado(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] || []).map(norm);
    if (cells.some(c => c.startsWith('DESCRIPCION')) && cells.some(c => c.startsWith('CODIGO'))) return i;
  }
  return -1;
}

/**
 * @param {{name:string, hidden?:boolean, rows:any[][]}[]} hojas
 * @param {{excluirWym?:boolean, hoy?:string}} opciones
 */
function analizarLibro(hojas, opciones = {}) {
  const hoy = opciones.hoy || new Date().toISOString().slice(0, 10);
  const res = { equipos: [], rechazados: [], duplicados: [], excluidos: [], avisos: [], hojas: [] };
  const crudos = [];

  for (const hoja of hojas) {
    const nombre = hoja.name.trim();
    if (hoja.hidden) { res.hojas.push({ nombre, leida: false, motivo: 'Hoja oculta (no es inventario)' }); continue; }
    const rows = hoja.rows || [];
    const h = filaEncabezado(rows);
    if (h < 0) { res.hojas.push({ nombre, leida: false, motivo: 'No tiene encabezados de inventario' }); continue; }
    const col = columnas(rows, h);
    if (col.verde === undefined && col.rojo === undefined) { res.hojas.push({ nombre, leida: false, motivo: 'No tiene columnas de estado (Verde/Rojo)' }); continue; }
    if (col.desc === undefined) { res.hojas.push({ nombre, leida: false, motivo: 'No se encontró la columna Descripción' }); continue; }

    let n = 0;
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const textoFila = r.map(norm).filter(Boolean);
      if (!textoFila.length) continue;
      if (textoFila.some(t => /^(TOTAL|RESUMEN|INDICADOR)/.test(t))) break;
      const get = k => (col[k] === undefined ? null : r[col[k]]);
      const desc = limpio(get('desc'));
      if (!desc) continue;
      n++;
      crudos.push({ hoja: nombre, fila: i + 1 + (hoja.rowOffset || 0), item: limpio(get('item')), desc, get });
    }
    res.hojas.push({ nombre, leida: true, filas: n });
  }

  // Claves: código interno; si no hay, código SAP. Si un SAP se repite entre filas sin código interno
  // (piezas de una misma planta), se diferencia con la descripción.
  for (const c of crudos) {
    c.codigo = codigoValido(c.get('codigo'));
    c.sap = codigoValido(c.get('sap'));
    c.clave = c.codigo || c.sap;
    c.origenClave = c.codigo ? 'codigo' : (c.sap ? 'sap' : null);
  }
  const grupos = new Map();
  crudos.forEach(c => { if (c.clave) { if (!grupos.has(c.clave)) grupos.set(c.clave, []); grupos.get(c.clave).push(c); } });

  for (const [clave, filas] of grupos) {
    if (filas.length < 2) continue;
    const primera = filas[0];
    for (const f of filas.slice(1)) {
      if (norm(f.desc) === norm(primera.desc)) {
        f.duplicadoDe = primera;
      } else if (f.origenClave === 'sap') {
        f.clave = `${clave}·${norm(f.desc).slice(0, 40)}`;
        f.avisoClave = true;
      } else {
        f.choque = primera;
      }
    }
    if (primera.origenClave === 'sap' && filas.some(f => f.avisoClave)) {
      primera.clave = `${clave}·${norm(primera.desc).slice(0, 40)}`;
      primera.avisoClave = true;
    }
  }

  const ref = c => `${c.hoja} · fila ${c.fila}`;
  for (const c of crudos) {
    if (!c.clave) { res.rechazados.push({ ref: ref(c), desc: c.desc, motivo: 'Sin código interno ni código SAP' }); continue; }
    if (c.duplicadoDe) { res.duplicados.push({ ref: ref(c), desc: c.desc, clave: c.duplicadoDe.clave, motivo: `Repite ${ref(c.duplicadoDe)}; se conserva la primera` }); continue; }
    if (c.choque) { res.rechazados.push({ ref: ref(c), desc: c.desc, motivo: `El código ${c.clave} ya lo usa "${c.choque.desc}" (${ref(c.choque)})` }); continue; }

    const ubic = limpio(c.get('ubic'));
    const estatus = limpio(c.get('estatus'));
    if (opciones.excluirWym && /W\s?Y\s?M/i.test(`${ubic} ${estatus}`)) { res.excluidos.push({ ref: ref(c), desc: c.desc, clave: c.clave, motivo: 'Menciona WyM' }); continue; }

    const verde = numero(c.get('verde')) || 0, rojo = numero(c.get('rojo')) || 0;
    let estado = 'sin_info';
    if (rojo > 0) estado = /TALLER/i.test(norm(ubic)) && !/DESCARTAD/i.test(norm(estatus)) ? 'taller' : 'inhabilitado';
    else if (verde > 0) estado = 'habilitado';

    const avisos = [];
    if (verde > 0 && rojo > 0) avisos.push('Marcado en verde y en rojo a la vez; se tomó rojo');
    if (verde > 1 || rojo > 1) avisos.push(`Cantidad ${Math.max(verde, rojo)} en una sola fila; puede agrupar varios equipos`);
    if (estado === 'sin_info') avisos.push('Sin marca de estado (ni verde ni rojo)');
    if (c.avisoClave) avisos.push('Sin código interno; se identificó por código SAP y descripción');
    else if (c.origenClave === 'sap') avisos.push('Sin código interno; se identificó por código SAP');

    let fecha = fechaISO(c.get('fecha'));
    if (fecha && fecha > hoy) { avisos.push(`Fecha de inhabilitación en el futuro (${fecha}); se dejó vacía`); fecha = null; }
    if (estado !== 'habilitado' && estado !== 'sin_info' && !fecha) avisos.push('Fuera de servicio sin fecha de inhabilitación');

    const negocio = negocioDe(c.desc, ubic);
    if (!negocio) avisos.push('No se pudo asignar negocio');
    const mayor = numero(c.get('mayor')), menor = numero(c.get('menor'));
    const cond = numero(c.get('condicion'));

    const eq = {
      clave: c.clave,
      codigo: c.codigo,
      codigo_sap: c.sap,
      serie: (limpio(c.get('serie')) || '').toUpperCase() || null,
      descripcion: c.desc,
      tipo: familia(c.desc),
      negocio,
      planta: plantaDe(ubic),
      ubicacion_excel: ubic || null,
      estado,
      condicion_pct: cond === null ? null : Math.round((cond <= 1 ? cond * 100 : cond)),
      consumo_combustible: limpio(c.get('consumo')) || null,
      plazo_reparacion: mayor > 0 ? 'mayor_semana' : (menor > 0 ? 'menor_semana' : null),
      causa_inactividad: estatus || null,
      fecha_inhabilitado: fecha,
      inversion_reparacion: numero(c.get('inversion')),
      hoja_origen: c.hoja,
      fila_origen: c.fila
    };
    res.equipos.push(eq);
    avisos.forEach(a => res.avisos.push({ ref: ref(c), clave: c.clave, desc: c.desc, aviso: a }));
  }

  res.resumen = {
    leidos: crudos.length,
    validos: res.equipos.length,
    rechazados: res.rechazados.length,
    duplicados: res.duplicados.length,
    excluidos: res.excluidos.length,
    porEstado: res.equipos.reduce((a, e) => (a[e.estado] = (a[e.estado] || 0) + 1, a), {}),
    sinNegocio: res.equipos.filter(e => !e.negocio).length
  };
  return res;
}


  return { analizarLibro: analizarLibro };
})();
