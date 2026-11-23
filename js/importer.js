// Lectura del Excel de maquinaria ("Maquinaria general DC").
// Recibe las hojas ya convertidas a filas (SheetJS sheet_to_json con header:1)
// y devuelve los equipos listos para importar, más rechazados, duplicados y avisos.
// No toca la base de datos: eso lo hace la acción «importar» del servidor (apps-script/Code.gs).

export const NEGOCIOS = {
  concreto: 'Concreto premezclado',
  prefabricados: 'Prefabricados',
  trituracion: 'Trituración',
  bloques: 'Bloques'
};

export const norm = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();

const limpio = s => String(s ?? '').replace(/\s+/g, ' ').trim();

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

export function familia(desc) {
  const d = norm(desc);
  const f = FAMILIAS.find(k => d.startsWith(k) || d.includes(k));
  if (f) return titulo(f === 'MONTACARGA' ? 'MONTACARGAS' : f);
  return titulo(d.split(/[-(\/0-9]/)[0].trim().split(' ').slice(0, 2).join(' ')) || 'Otro';
}

export function negocioDe(desc, ubic) {
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

export function plantaDe(ubic) {
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
    if (n.startsWith('ITEM')) map.item ??= c;
    else if (n.includes('SAP')) map.sap ??= c;
    else if (n === 'CODIGO') { if (codigos === 0) map.codigo = c; else map.sap ??= c; codigos++; }
    else if (n.startsWith('DESCRIPCION')) { if (descs === 0) map.desc = c; else map.estatus ??= c; descs++; }
    else if (n.startsWith('ESTATUS')) map.estatus ??= c;
    else if (n.includes('SERIE') || n === 'VIN' || n.includes('CHASIS')) map.serie ??= c;
    else if (n === 'VERDE') map.verde = c;
    else if (n === 'ROJO') map.rojo = c;
    else if (n.includes('% ESTADO')) map.condicion = c;
    else if (n.includes('MENOR A UNA SEMANA')) map.menor = c;
    else if (n.includes('MAYOR A UNA SEMANA')) map.mayor = c;
    else if (n.startsWith('UBICACION') || n.startsWith('LOCALIZACION')) map.ubic ??= c;
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
export function analizarLibro(hojas, opciones = {}) {
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

// Navegador: convierte un archivo con SheetJS (window.XLSX) a la forma que espera analizarLibro.
export async function leerArchivo(file) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error('No se pudo cargar el lector de Excel. Revise la conexión a internet.');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return wb.SheetNames.map((name, i) => {
    const ws = wb.Sheets[name];
    const rowOffset = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
    return {
      name,
      rowOffset,
      hidden: !!(wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i] && wb.Workbook.Sheets[i].Hidden),
      rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true })
    };
  });
}
