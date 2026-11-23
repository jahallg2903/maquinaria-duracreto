// Capa de datos. Dos modos con la misma interfaz:
//  - SheetsDB: base central en Google Sheets vía Apps Script (producción). Se activa al llenar API_URL en js/config.js.
//  - DemoDB: solo para probar en este navegador, sin servidor. No es para uso real.
const CFG = window.APP_CONFIG || {};
export const MODO_DEMO = !CFG.API_URL;
const hoyISO = () => new Date().toISOString().slice(0, 10);

function mensajeError(e) {
  const m = String((e && (e.message || e.error_description || e.error)) || e || '');
  if (/row-level security|permission denied|42501/i.test(m)) return 'No tiene permiso para esta acción.';
  if (/Invalid login credentials/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No hay conexión con el servidor. Revise el internet.';
  if (/duplicate key.*clave/i.test(m)) return 'Ya existe un equipo con ese código.';
  return m || 'Ocurrió un error inesperado.';
}

// =====================================================================
// Google Sheets (Apps Script)
// =====================================================================
const CLAVE_TOKEN = 'dc-maquinaria-token';

async function aBase64(file) {
  // Las fotos se reducen a 1600 px para que suban rápido desde el teléfono
  if (/^image\/(jpeg|png|webp)$/.test(file.type)) {
    try {
      const img = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.82);
      return { nombre: file.name.replace(/\.\w+$/, '') + '.jpg', tipo: 'image/jpeg', base64: url.split(',')[1] };
    } catch (_) { /* si no se puede reducir, se sube tal cual */ }
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { nombre: file.name, tipo: file.type || 'application/octet-stream', base64: btoa(bin) };
}

class SheetsDB {
  async init() { this.token = localStorage.getItem(CLAVE_TOKEN); }
  async api(action, payload = {}) {
    let r;
    try { r = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ action, token: this.token, ...payload }) }); }
    catch (e) { throw new Error('No hay conexión con el servidor. Revise el internet.'); }
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('El servidor respondió algo inesperado. Revise que la implementación de Apps Script esté activa.'); }
    if (!j.ok) {
      if (j.error === 'sesion') { this.token = null; localStorage.removeItem(CLAVE_TOKEN); window.dispatchEvent(new Event('dc-sesion-expirada')); throw new Error('Su sesión terminó. Inicie sesión de nuevo.'); }
      throw new Error(j.error || 'Error del servidor');
    }
    return j;
  }
  async sesion() {
    if (!this.token) return null;
    try { return (await this.api('sesion')).user; } catch (_) { return null; }
  }
  async login(usuario, password) {
    const j = await this.api('login', { u: usuario, p: password });
    this.token = j.token; localStorage.setItem(CLAVE_TOKEN, j.token);
    return j.user;
  }
  async logout() { try { await this.api('logout'); } catch (_) { /* igual se cierra */ } this.token = null; localStorage.removeItem(CLAVE_TOKEN); }
  async cambiarMiPassword(actual, nueva) { return (await this.api('cambiarPassword', { actual, nueva })).user; }
  async cargarTodo() { const j = await this.api('cargar'); delete j.ok; return j; }
  async guardarEquipo(eq) { return (await this.api('guardarEquipo', { equipo: eq })).equipo; }
  async actualizarObservaciones(id, texto) { await this.api('observaciones', { id, texto }); }
  async crearIncidencia(inc, files = []) {
    const adjuntos = [];
    for (const f of files) adjuntos.push(await aBase64(f));
    return (await this.api('crearIncidencia', { inc, adjuntos })).incidencia;
  }
  async actualizarIncidencia(id, cambios) { return (await this.api('actualizarIncidencia', { id, cambios })).incidencia; }
  async comentar(id, texto) { await this.api('comentar', { id, texto }); }
  async eventos(id) { return (await this.api('eventos', { id })).eventos; }
  async abrirAdjunto(incidencia, indice) {
    const j = await this.api('adjunto', { incidencia, indice });
    const bin = atob(j.base64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: j.tipo }));
  }
  async guardarMantenimiento(m) { return (await this.api('guardarMantenimiento', { m })).mantenimiento; }
  async leerInventario() { return (await this.api('leerInventario')).hojas; }
  async importar(equipos, archivo, detalle) { const j = await this.api('importar', { equipos, archivo, detalle }); return { nuevos: j.nuevos, actualizados: j.actualizados }; }
  async guardarPlanta(p) { await this.api('guardarPlanta', { planta: p }); }
  async guardarPerfil(p, plantas) { await this.api('guardarPerfil', { perfil: p, plantas }); }
  async crearUsuario(u) { return this.api('crearUsuario', { usuario: u }); }
  async cambiarPassword(id, password) { await this.api('resetPassword', { id, password }); }
  suscribir(cb) {
    // Google Sheets no avisa cambios: se revisa cada 60 s mientras la app está abierta y visible
    setInterval(() => { if (document.visibilityState === 'visible' && this.token) cb(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.token) cb(); });
  }
}

// =====================================================================
// Demo (solo en este navegador)
// =====================================================================
const CLAVE_DEMO = 'dc-maquinaria-demo-v2';
const ETQ_INC = { reportada: 'Reportada', pendiente_diagnostico: 'Pendiente de diagnóstico', pendiente_repuestos: 'Pendiente de repuestos', en_reparacion: 'En reparación', en_espera: 'En espera', reparada: 'Reparada', cerrada: 'Cerrada' };
const L = n => n == null ? '—' : 'L ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

class DemoDB {
  async init() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(CLAVE_DEMO)); } catch (_) { s = null; }
    if (!s) s = this.semilla();
    this.s = s;
  }
  semilla() {
    const u = (id, username, nombre, rol, cargo) => ({ id, username, nombre, rol, cargo, activo: true, password: 'Duracreto2026' });
    return {
      seq: { planta: 0, inc: 0, ev: 0, mant: 0, est: 0, imp: 0 },
      negocios: [
        { id: 'concreto', nombre: 'Concreto premezclado', orden: 1 }, { id: 'prefabricados', nombre: 'Prefabricados', orden: 2 },
        { id: 'trituracion', nombre: 'Trituración', orden: 3 }, { id: 'bloques', nombre: 'Bloques', orden: 4 }],
      plantas: [],
      perfiles: [
        u('u-admin', 'admin', 'Jefe de planta', 'admin', 'Administrador'),
        u('u-gerencia', 'gerencia', 'Gerencia general', 'gerencia', 'Gerente'),
        u('u-mant', 'mantenimiento', 'Jefe de mantenimiento', 'mantenimiento', 'Mantenimiento')],
      perfilPlantas: [], plantasDemo: {},
      equipos: [], incidencias: [], eventos: [], mantenimientos: [], estados: [], importaciones: [], sesion: null
    };
  }
  guardar() { try { localStorage.setItem(CLAVE_DEMO, JSON.stringify(this.s)); } catch (_) { /* almacenamiento lleno o bloqueado */ } }
  reiniciar() { localStorage.removeItem(CLAVE_DEMO); this.s = this.semilla(); }
  perfilPublico(p) { if (!p) return null; const { password, ...r } = p; return r; }

  async sesion() { return this.perfilPublico(this.s.perfiles.find(p => p.id === this.s.sesion && p.activo)); }
  async login(usuario, password) {
    const p = this.s.perfiles.find(x => x.username === usuario.toLowerCase());
    if (!p || p.password !== password) throw new Error('Usuario o contraseña incorrectos.');
    if (!p.activo) throw new Error('Su usuario está desactivado.');
    this.s.sesion = p.id; this.uid = p.id; this.guardar();
    return this.perfilPublico(p);
  }
  async logout() { this.s.sesion = null; this.guardar(); }
  async cambiarMiPassword(actual, nueva) {
    const p = this.yo;
    if (p.password !== actual) throw new Error('La contraseña actual no es correcta.');
    if (nueva.length < 8 || !/[A-Za-z]/.test(nueva) || !/[0-9]/.test(nueva)) throw new Error('La contraseña debe tener al menos 8 caracteres y combinar letras y números.');
    p.password = nueva; p.debe_cambiar = false; this.guardar(); return this.perfilPublico(p);
  }
  async leerInventario() { throw new Error('En modo de prueba no hay hoja de Google conectada; suba el archivo Excel.'); }
  async abrirAdjunto() { throw new Error('En modo de prueba los archivos no se guardan.'); }
  get yo() { return this.s.perfiles.find(p => p.id === this.s.sesion); }
  exigir(roles) { if (!this.yo || !roles.includes(this.yo.rol)) throw new Error('No tiene permiso para esta acción.'); }

  misPlantas(p) {
    const ids = this.s.perfilPlantas.filter(x => x.perfil_id === p.id).map(x => x.planta_id);
    const nombres = (this.s.plantasDemo || {})[p.id] || [];
    this.s.plantas.filter(pl => nombres.includes(pl.nombre)).forEach(pl => ids.push(pl.id));
    return [...new Set(ids)];
  }
  ve(p, plantaId) { return p.rol !== 'planta' || this.misPlantas(p).includes(plantaId); }

  async cargarTodo(perfil) {
    const p = this.s.perfiles.find(x => x.id === perfil.id);
    const eqs = this.s.equipos.filter(e => this.ve(p, e.planta_id));
    const ids = new Set(eqs.map(e => e.id));
    const pp = [...this.s.perfilPlantas];
    for (const [pid, nombres] of Object.entries(this.s.plantasDemo || {})) {
      this.s.plantas.filter(pl => nombres.includes(pl.nombre)).forEach(pl => { if (!pp.some(x => x.perfil_id === pid && x.planta_id === pl.id)) pp.push({ perfil_id: pid, planta_id: pl.id }); });
    }
    const c = x => JSON.parse(JSON.stringify(x));
    return c({
      negocios: this.s.negocios, plantas: this.s.plantas, perfiles: this.s.perfiles.map(x => this.perfilPublico(x)), perfilPlantas: pp,
      equipos: eqs, incidencias: this.s.incidencias.filter(i => ids.has(i.equipo_id)).sort((a, b) => b.id - a.id),
      mantenimientos: this.s.mantenimientos.filter(m => ids.has(m.equipo_id)),
      estados: this.s.estados.filter(x => ids.has(x.equipo_id)),
      importaciones: ['admin', 'gerencia'].includes(p.rol) ? [...this.s.importaciones].reverse() : []
    });
  }

  logEstado(eq, anterior, origen) {
    this.s.estados.push({ id: ++this.s.seq.est, equipo_id: eq.id, estado_anterior: anterior, estado_nuevo: eq.estado, fecha: new Date().toISOString(), usuario_id: this.s.sesion, origen });
  }
  cambiarEstado(eq, nuevo, origen = 'app', fecha = undefined) {
    const ant = eq.estado;
    if (ant === nuevo) return;
    eq.estado = nuevo;
    if (nuevo === 'habilitado') eq.fecha_inhabilitado = null;
    else if (['inhabilitado', 'taller'].includes(nuevo) && !['inhabilitado', 'taller'].includes(ant) && origen !== 'excel') eq.fecha_inhabilitado = fecha || eq.fecha_inhabilitado || hoyISO();
    this.logEstado(eq, ant, origen);
  }
  plantaId(nombre, negocio) {
    if (!nombre) return null;
    let p = this.s.plantas.find(x => x.nombre === nombre);
    if (!p) { p = { id: ++this.s.seq.planta, nombre, negocio_id: null, activa: true, nueva: true }; this.s.plantas.push(p); this.s.plantas.sort((a, b) => a.nombre.localeCompare(b.nombre)); }
    return p.id;
  }

  async guardarEquipo(eq) {
    this.exigir(['admin', 'mantenimiento']);
    const ahora = new Date().toISOString();
    if (eq.id) {
      const cur = this.s.equipos.find(e => e.id === eq.id);
      if (!cur) throw new Error('Equipo no encontrado');
      const { estado, ...resto } = eq;
      Object.assign(cur, resto, { updated_at: ahora, updated_by: this.s.sesion });
      if (estado) this.cambiarEstado(cur, estado, 'app', eq.fecha_inhabilitado);
      this.guardar(); return cur;
    }
    if (this.s.equipos.some(e => e.clave === eq.clave)) throw new Error('Ya existe un equipo con ese código.');
    const nuevo = { ...eq, id: crypto.randomUUID(), origen: 'manual', activo: true, created_at: ahora, updated_at: ahora, created_by: this.s.sesion, updated_by: this.s.sesion };
    if (['inhabilitado', 'taller'].includes(nuevo.estado)) nuevo.fecha_inhabilitado = nuevo.fecha_inhabilitado || hoyISO();
    this.s.equipos.push(nuevo); this.logEstado(nuevo, null, 'app'); this.guardar(); return nuevo;
  }
  async actualizarObservaciones(id, texto) {
    const e = this.s.equipos.find(x => x.id === id);
    if (!this.yo || !(['admin', 'mantenimiento'].includes(this.yo.rol) || (this.yo.rol === 'planta' && this.ve(this.yo, e.planta_id)))) throw new Error('No tiene permiso para esta acción.');
    e.observaciones = texto; e.updated_at = new Date().toISOString(); this.guardar();
  }

  evento(incId, tipo, detalle, usuario = this.s.sesion) {
    this.s.eventos.push({ id: ++this.s.seq.ev, incidencia_id: incId, fecha: new Date().toISOString(), usuario_id: usuario, tipo, detalle });
  }
  porCodigos(codigo, sap, serie) {
    const C = v => v ? String(v).toUpperCase().replace(/\s+/g, '') : null;
    const c = C(codigo), s = C(sap), se = C(serie);
    if (!c && !s && !se) return null;
    return this.s.equipos.find(e => (c && [e.clave, e.codigo, e.codigo_sap].some(v => C(v) === c)) || (s && [e.clave, e.codigo, e.codigo_sap].some(v => C(v) === s)) || (se && [e.serie, e.clave].some(v => C(v) === se))) || null;
  }
  async crearIncidencia(inc, files = []) {
    if (inc.costo_estimado == null || isNaN(Number(inc.costo_estimado)) || Number(inc.costo_estimado) < 0) throw new Error('Escriba el costo aproximado de la reparación.');
    let eq = this.s.equipos.find(e => e.id === inc.equipo_id);
    if (!eq && inc.nuevo_equipo) {
      const ne = inc.nuevo_equipo;
      eq = this.porCodigos(ne.codigo, null, ne.serie);
      if (!eq) {
        let clave = ne.codigo || ne.serie;
        if (!clave) { const max = Math.max(0, ...this.s.equipos.map(e => Number((/^NUEVO-(\d+)$/.exec(e.clave || '') || [])[1] || 0))); clave = 'NUEVO-' + String(max + 1).padStart(3, '0'); }
        eq = await this.guardarEquipo({ clave, codigo: ne.codigo, codigo_sap: null, serie: ne.serie, descripcion: ne.descripcion, tipo: null, negocio_id: ne.negocio_id, planta_id: ne.planta_id, marca: ne.marca, modelo: ne.modelo, anio: null, estado: 'habilitado' });
      }
    }
    if (!eq) throw new Error('Equipo no encontrado');
    const { nuevo_equipo, ...incLimpia } = inc; inc = { ...incLimpia, equipo_id: eq.id, costo_estimado: Number(inc.costo_estimado) };
    if (!this.yo || !(['admin', 'mantenimiento'].includes(this.yo.rol) || (this.yo.rol === 'planta' && this.ve(this.yo, eq.planta_id)))) throw new Error('No tiene permiso para esta acción.');
    const id = ++this.s.seq.inc;
    const ahora = new Date().toISOString();
    const r = {
      id, codigo: 'INC-' + String(id).padStart(4, '0'), estado: 'reportada', responsable_id: null, costo_estimado: null, costo_real: null,
      fecha_estimada: null, fecha_resolucion: null, observaciones: null, fecha_reporte: hoyISO(), ...inc,
      reportado_por: this.s.sesion, adjuntos: files.map(f => ({ path: null, nombre: f.name, tipo: f.type })), created_at: ahora, updated_at: ahora
    };
    this.s.incidencias.push(r);
    this.evento(id, 'creacion', `Falla reportada con prioridad ${r.prioridad[0].toUpperCase() + r.prioridad.slice(1)}${r.fuera_servicio ? '. Equipo fuera de servicio.' : '.'}`);
    if (r.fuera_servicio && eq.estado !== 'inhabilitado') {
      this.cambiarEstado(eq, 'inhabilitado', 'app', r.fecha_reporte);
      eq.causa_inactividad = r.causa || r.descripcion;
    }
    this.guardar(); return r;
  }
  async actualizarIncidencia(id, c) {
    this.exigir(['admin', 'mantenimiento']);
    const r = this.s.incidencias.find(x => x.id === id);
    const ant = { ...r };
    Object.assign(r, c, { updated_at: new Date().toISOString() });
    if (['reparada', 'cerrada'].includes(r.estado)) r.fecha_resolucion = r.fecha_resolucion || hoyISO(); else r.fecha_resolucion = null;
    const eq = this.s.equipos.find(e => e.id === r.equipo_id);
    if (r.estado !== ant.estado) {
      this.evento(id, 'estado', `Estado: ${ETQ_INC[ant.estado]} → ${ETQ_INC[r.estado]}`);
      if (r.fuera_servicio && eq) {
        if (r.estado === 'en_reparacion' && eq.estado === 'inhabilitado') this.cambiarEstado(eq, 'taller');
        if (['reparada', 'cerrada'].includes(r.estado)) {
          const otras = this.s.incidencias.some(i => i.equipo_id === eq.id && i.id !== id && i.fuera_servicio && !['reparada', 'cerrada'].includes(i.estado));
          if (!otras && ['inhabilitado', 'taller'].includes(eq.estado)) { this.cambiarEstado(eq, 'habilitado'); eq.causa_inactividad = null; eq.plazo_reparacion = null; }
        }
      }
    }
    if (r.responsable_id !== ant.responsable_id) {
      const p = this.s.perfiles.find(x => x.id === r.responsable_id);
      this.evento(id, 'asignacion', 'Responsable: ' + (p ? (p.nombre || p.username) : 'sin asignar'));
    }
    if (r.costo_estimado !== ant.costo_estimado || r.costo_real !== ant.costo_real) this.evento(id, 'costo', `Costos: estimado ${L(r.costo_estimado)} · real ${L(r.costo_real)}`);
    if (r.fecha_estimada !== ant.fecha_estimada) this.evento(id, 'fecha', 'Fecha estimada de finalización: ' + (r.fecha_estimada ? r.fecha_estimada.split('-').reverse().join('/') : '—'));
    this.guardar(); return r;
  }
  async comentar(id, texto) {
    if (!this.yo || this.yo.rol === 'gerencia') throw new Error('No tiene permiso para esta acción.');
    this.evento(id, 'comentario', texto); this.guardar();
  }
  async eventos(id) { return this.s.eventos.filter(e => e.incidencia_id === id).sort((a, b) => b.id - a.id); }

  async guardarMantenimiento(m) {
    this.exigir(['admin', 'mantenimiento']);
    const ahora = new Date().toISOString();
    if (m.id) { const cur = this.s.mantenimientos.find(x => x.id === m.id); Object.assign(cur, m, { updated_at: ahora }); this.guardar(); return cur; }
    const n = { ...m, id: ++this.s.seq.mant, created_at: ahora, updated_at: ahora, created_by: this.s.sesion };
    this.s.mantenimientos.push(n); this.guardar(); return n;
  }

  async importar(equipos, archivo, detalle) {
    this.exigir(['admin']);
    let nuevos = 0, actualizados = 0;
    const ahora = new Date().toISOString();
    for (const e of equipos) {
      const planta_id = this.plantaId(e.planta, e.negocio);
      const cur = this.s.equipos.find(x => x.clave === e.clave) || this.porCodigos(e.codigo, e.codigo_sap, e.serie);
      const campos = {
        codigo: e.codigo, codigo_sap: e.codigo_sap, descripcion: e.descripcion, tipo: e.tipo, ubicacion_excel: e.ubicacion_excel,
        condicion_pct: e.condicion_pct, consumo_combustible: e.consumo_combustible, plazo_reparacion: e.plazo_reparacion,
        causa_inactividad: e.causa_inactividad, inversion_reparacion: e.inversion_reparacion, hoja_origen: e.hoja_origen, fila_origen: e.fila_origen
      };
      if (cur) {
        Object.assign(cur, campos, { serie: cur.serie || e.serie || null, negocio_id: cur.negocio_id || e.negocio, planta_id: planta_id || cur.planta_id, activo: true, updated_at: ahora });
        if (e.fecha_inhabilitado) cur.fecha_inhabilitado = e.fecha_inhabilitado;
        this.cambiarEstado(cur, e.estado, 'excel');
        actualizados++;
      } else {
        const n = { id: crypto.randomUUID(), clave: e.clave, serie: e.serie || null, ...campos, negocio_id: e.negocio, planta_id, estado: e.estado, fecha_inhabilitado: e.fecha_inhabilitado,
          marca: null, modelo: null, anio: null, observaciones: null, origen: 'excel', activo: true, created_at: ahora, updated_at: ahora };
        this.s.equipos.push(n); this.logEstado(n, null, 'excel'); nuevos++;
      }
    }
    this.s.plantas.filter(p => p.nueva).forEach(p => {
      const negs = [...new Set(this.s.equipos.filter(e => e.planta_id === p.id).map(e => e.negocio_id || '-'))];
      p.negocio_id = negs.length === 1 && negs[0] !== '-' ? negs[0] : null; delete p.nueva;
    });
    this.s.importaciones.push({ id: ++this.s.seq.imp, archivo, fecha: ahora, usuario_id: this.s.sesion, nuevos, actualizados, rechazados: detalle.rechazados || 0, detalle });
    this.guardar();
    return { nuevos, actualizados };
  }
  async guardarPlanta(p) { this.exigir(['admin']); Object.assign(this.s.plantas.find(x => x.id === p.id), p); this.guardar(); }
  async guardarPerfil(p, plantas) {
    this.exigir(['admin']);
    Object.assign(this.s.perfiles.find(x => x.id === p.id), { nombre: p.nombre, cargo: p.cargo, rol: p.rol, activo: p.activo });
    this.s.perfilPlantas = this.s.perfilPlantas.filter(x => x.perfil_id !== p.id).concat(plantas.map(planta_id => ({ perfil_id: p.id, planta_id })));
    if (this.s.plantasDemo) delete this.s.plantasDemo[p.id];
    this.guardar();
  }
  async crearUsuario(u) {
    this.exigir(['admin']);
    const username = String(u.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Usuario inválido: use 3 a 30 letras, números, punto o guion');
    if (String(u.password || '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    if (this.s.perfiles.some(p => p.username === username)) throw new Error('Ese usuario ya existe');
    const id = 'u-' + crypto.randomUUID().slice(0, 8);
    this.s.perfiles.push({ id, username, nombre: u.nombre || '', cargo: u.cargo || '', rol: u.rol, activo: true, debe_cambiar: true, password: u.password });
    (u.plantas || []).forEach(planta_id => this.s.perfilPlantas.push({ perfil_id: id, planta_id }));
    this.guardar(); return { ok: true, id };
  }
  async cambiarPassword(id, password) {
    this.exigir(['admin']);
    if (String(password || '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    const p = this.s.perfiles.find(x => x.id === id); p.password = password; p.debe_cambiar = id !== this.s.sesion; this.guardar();
  }
  suscribir(cb) { window.addEventListener('storage', e => { if (e.key === CLAVE_DEMO) { this.init().then(cb); } }); }
}

export async function crearDB() {
  const db = MODO_DEMO ? new DemoDB() : new SheetsDB();
  await db.init();
  return db;
}
export { mensajeError };
