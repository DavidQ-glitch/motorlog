'use strict';
/* MotorLog 2.0 - app offline para Android (Capacitor) */

// ---------------- Estado ----------------
const OLD_KEY = 'motorlog_pro_data';
let vehicles = [];
let currentId = null;
let editingVehicleId = null;
let editingServiceId = null;
let selClase = 'auto';
let selCat = 'general';
let lastAutoLabel = '';
let pendingPhoto;            // undefined = sin cambios, null = quitar, string = nueva foto
let filterCat = 'all';
let activeSheet = null;
let currentAtt = null;

// ---------------- Utilidades ----------------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const z2 = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
const parseDate = s => new Date(s + 'T00:00:00');
const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const todayMid = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const nf = n => Number(n || 0).toLocaleString('es-AR');
const money = n => '$ ' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const Cap = window.Capacitor;
const isNative = () => !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const plug = n => (Cap && Cap.Plugins && Cap.Plugins[n]) || null;
const vibrate = () => { try { navigator.vibrate && navigator.vibrate(30); } catch (e) {} };

// ---------------- Base de datos local (IndexedDB) ----------------
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('motorlog', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('vehicles', { keyPath: 'id' });
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  _tx(mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction('vehicles', mode);
      const req = fn(tx.objectStore('vehicles'));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  all() { return this._tx('readonly', s => s.getAll()); },
  put(v) { return this._tx('readwrite', s => s.put(v)); },
  del(id) { return this._tx('readwrite', s => s.delete(id)); },
  clear() { return this._tx('readwrite', s => s.clear()); },
};

async function persist(v) {
  try { await DB.put(v); }
  catch (e) { showDialog('Error', 'No se pudo guardar en el teléfono. ¿Poco espacio libre?'); throw e; }
}

// ---- Validación estricta de datos ----
// Todo lo que entra (base de datos, respaldo importado, versión vieja) se reconstruye campo por campo.
// Así un respaldo armado a propósito no puede meter código en la app.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATA_IMG = /^data:image\/[a-z0-9.+-]{1,40};base64,[A-Za-z0-9+/=]+$/i;
const DATA_FILE = /^data:(image\/[a-z0-9.+-]{1,40}|application\/pdf);base64,[A-Za-z0-9+/=]+$/i;
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const str = (x, max) => (x == null ? '' : String(x)).slice(0, max);
const int0 = x => { const n = Math.round(Number(x)); return Number.isFinite(n) && n > 0 ? n : 0; };
const money0 = x => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
const isoOr = (x, d) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) ? x : d;
const safeId = (x, p) => (x != null && SAFE_ID.test(String(x))) ? String(x) : uid(p);

function cleanRecord(h) {
  h = (h && typeof h === 'object') ? h : {};
  const tipo = str(h.tipo, 200).trim() || 'Service';
  let adj = null;
  if (h.adjunto && typeof h.adjunto === 'object' && typeof h.adjunto.data === 'string' && DATA_FILE.test(h.adjunto.data)) {
    adj = { nombre: str(h.adjunto.nombre, 120) || 'comprobante', tipo: h.adjunto.data.slice(5, h.adjunto.data.indexOf(';')), data: h.adjunto.data };
  }
  const kmP = int0(h.kmProximo);
  return {
    id: safeId(h.id, 'm_'),
    cat: CATEGORIES.some(c => c.id === h.cat) ? h.cat : detectCat(tipo),
    tipo, kmRealizado: int0(h.kmRealizado), fecha: isoOr(h.fecha, ''),
    kmProximo: kmP || null, fechaProxima: isoOr(h.fechaProxima, null), costo: money0(h.costo),
    taller: str(h.taller, 120), direccion: str(h.direccion, 200), telefono: str(h.telefono, 40).replace(/[^\d+()\-\s.#*]/g, ''),
    enlaceMaps: str(h.enlaceMaps, 600), notas: str(h.notas, 2000), adjunto: adj,
  };
}
function normalize(v) {
  v = (v && typeof v === 'object') ? v : {};
  const ids = new Set();
  const historial = (Array.isArray(v.historial) ? v.historial : []).slice(0, 5000).map(cleanRecord).map(h => {
    while (ids.has(h.id)) h.id = uid('m_');
    ids.add(h.id); return h;
  });
  return {
    id: safeId(v.id, 'v_'),
    clase: VEHICLE_TYPES.some(t => t.id === v.clase) ? v.clase : 'auto',
    marca: str(v.marca, 60).trim() || 'Vehículo', modelo: str(v.modelo, 60).trim(),
    anio: str(v.anio, 10).replace(/[^\d]/g, ''), dominio: str(v.dominio, 12).toUpperCase().replace(/[^A-Z0-9 -]/g, ''),
    detalle: str(v.detalle, 80), foto: (typeof v.foto === 'string' && DATA_IMG.test(v.foto)) ? v.foto : null,
    kmActual: int0(v.kmActual), observaciones: str(v.observaciones, 5000), historial,
  };
}

async function migrateOld() {
  const raw = localStorage.getItem(OLD_KEY);
  if (!raw) return;
  try {
    const old = JSON.parse(raw);
    for (const raw of old) { const v = normalize(raw); if (!vehicles.find(x => x.id === v.id)) { await DB.put(v); vehicles.push(v); } }
    localStorage.removeItem(OLD_KEY);
  } catch (e) {}
}

// ---------------- Lógica de vencimientos ----------------
const groupKey = h => (h.cat || 'otro') + '|' + (h.tipo || '').trim().toLowerCase();
const cmpRec = (a, b) => (a.fecha || '').localeCompare(b.fecha || '') || ((a.kmRealizado || 0) - (b.kmRealizado || 0));
function latestPerGroup(v) {
  const m = new Map();
  v.historial.forEach(h => { const k = groupKey(h); const c = m.get(k); if (!c || cmpRec(h, c) > 0) m.set(k, h); });
  return [...m.values()];
}
function getDue(v) {
  const today = todayMid(), out = [];
  latestPerGroup(v).forEach(h => {
    let lvl = 0; const causes = [];
    if (h.kmProximo) {
      const d = h.kmProximo - v.kmActual;
      if (d <= 0) { lvl = 2; causes.push(`por KM (${nf(h.kmProximo)})`); }
      else if (d <= 1500) { lvl = Math.max(lvl, 1); causes.push(`en ${nf(d)} KM`); }
    }
    if (h.fechaProxima) {
      const d = Math.ceil((parseDate(h.fechaProxima) - today) / 86400000);
      if (d <= 0) { lvl = 2; causes.push(`por fecha (${fmtDate(h.fechaProxima)})`); }
      else if (d <= 30) { lvl = Math.max(lvl, 1); causes.push(`en ${d} días`); }
    }
    if (lvl) out.push({ h, lvl, causes });
  });
  return out.sort((a, b) => b.lvl - a.lvl);
}
const counts = v => { const d = getDue(v); return { red: d.filter(x => x.lvl === 2).length, amb: d.filter(x => x.lvl === 1).length }; };

// ---------------- UI helpers ----------------
function showToast(msg, type = 'info') {
  vibrate();
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'success' ? 'ok' : type === 'error' ? 'err' : 'info');
  t.textContent = msg;
  $('app').appendChild(t);
  setTimeout(() => { t.classList.add('leave'); setTimeout(() => t.remove(), 300); }, 2400);
}
// Diálogo único de la app: aviso, confirmación, o pedido de un dato (con campo de texto).
let dlgTimer = null;
function askDialog(o) {
  vibrate();
  clearTimeout(dlgTimer);
  const d = $('dialog'), ok = $('dlg-ok'), cancel = $('dlg-cancel'), alt = $('dlg-alt'), inp = $('dlg-input'), msg = $('dlg-msg');
  $('dlg-title').textContent = o.title || 'Atención';
  msg.textContent = o.msg || ''; msg.classList.toggle('left', !!o.left);
  ok.textContent = o.okLabel || 'Aceptar';
  ok.className = 'btn ' + (o.danger ? 'red' : 'dark');
  cancel.textContent = o.cancelLabel || 'Cancelar';
  cancel.classList.toggle('hidden', !o.cancel);
  alt.classList.toggle('hidden', !o.alt);
  if (o.alt) { alt.textContent = o.alt.label; alt.onclick = () => { closeDialog(); o.alt.fn(); }; }
  const need = o.input || null;
  inp.classList.toggle('hidden', !need);
  const valid = () => !need || (need.match ? inp.value.trim().toUpperCase() === need.match : (!need.required || inp.value.trim().length > 0));
  if (need) {
    inp.value = need.value || ''; inp.placeholder = need.placeholder || ''; inp.maxLength = need.maxlength || 40;
    inp.setAttribute('autocapitalize', need.match ? 'characters' : 'words');
    inp.oninput = () => { ok.disabled = !valid(); };
    inp.onkeydown = e => { if (e.key === 'Enter' && valid()) ok.click(); };
  }
  ok.disabled = !valid();
  ok.onclick = () => { if (!valid()) return; const val = need ? inp.value.trim() : undefined; closeDialog(); if (o.onOk) o.onOk(val); };
  cancel.onclick = () => { closeDialog(); if (o.onCancel) o.onCancel(); };
  d.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('on')));
  if (need) setTimeout(() => inp.focus(), 320);
}
function showDialog(title, msg, onConfirm, okLabel) {
  askDialog({ title, msg, okLabel: okLabel || (onConfirm ? 'Confirmar' : 'Aceptar'), cancel: !!onConfirm,
    danger: /^(Eliminar|Borrar)/.test(okLabel || ''), onOk: onConfirm ? () => onConfirm() : null });
}
function closeDialog() {
  $('dialog').classList.remove('on');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  clearTimeout(dlgTimer);
  dlgTimer = setTimeout(() => $('dialog').classList.add('hidden'), 250);
}
const dialogOpen = () => !$('dialog').classList.contains('hidden');

// ---------------- Nombre y saludo ----------------
const getName = () => { try { return (localStorage.getItem('ml_nombre') || '').trim(); } catch (e) { return ''; } };
function setName(n) {
  n = str(n, 30).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
  try { n ? localStorage.setItem('ml_nombre', n) : localStorage.removeItem('ml_nombre'); } catch (e) {}
  renderGreeting(); updNameRow();
}
function renderGreeting() {
  const t = $('home-title'); if (!t) return;
  const n = getName();
  t.textContent = ''; t.classList.toggle('greet', !!n);
  if (n) { t.append('Bienvenido a tu garage,'); const sp = document.createElement('span'); sp.className = 'hname'; sp.textContent = n; t.append(sp); }
  else t.textContent = 'Mi Garage';
}
function updNameRow() { const el = $('name-status'); if (el) el.textContent = getName() || 'Sin nombre'; }
function askName(first) {
  askDialog({
    title: first ? '¡Bienvenido a MotorLog! 👋' : 'Tu nombre',
    msg: first ? '¿Cómo te llamás? Lo usamos para saludarte en tu garage.' : 'Así te saluda la app en la pantalla principal. Dejalo vacío para quitarlo.',
    input: { placeholder: 'Tu nombre', value: getName(), maxlength: 30, required: first },
    okLabel: first ? 'Empezar' : 'Guardar', cancel: true, cancelLabel: first ? 'Ahora no' : 'Cancelar',
    onOk: v => { setName(v); if (v) showToast(`¡Hola, ${v}!`, 'success'); },
    onCancel: () => { if (first) { try { localStorage.setItem('ml_nombre_omitido', '1'); } catch (e) {} } },
  });
}

function navigate(view) {
  vibrate();
  const home = $('view-home'), veh = $('view-vehicle');
  if (view === 'home') {
    currentId = null;
    veh.className = 'view right'; home.className = 'view active';
    renderGarage();
  } else {
    home.className = 'view left'; veh.className = 'view active';
    filterCat = 'all';
    updateDashboard();
    veh.querySelector('main').scrollTop = 0;
  }
}

function openSheet(id) {
  vibrate();
  if (activeSheet && activeSheet !== id) $(activeSheet).classList.remove('open');
  $('backdrop').classList.add('on');
  // Cada formulario se abre siempre desde arriba (si no, recuerda dónde quedó la última vez).
  const inner = $(id).querySelector('.sheet-in');
  if (inner) inner.scrollTop = 0;
  $(id).classList.add('open');
  requestAnimationFrame(() => { if (inner) inner.scrollTop = 0; });
  activeSheet = id;
  if (id === 'sheet-settings') updNameRow();
  if (id === 'sheet-settings') $('sw-notif').classList.toggle('on', localStorage.getItem('ml_notif') === '1');
}
function closeSheet() {
  if (!activeSheet) return;
  const id = activeSheet;
  $(id).classList.remove('open');
  $('backdrop').classList.remove('on');
  activeSheet = null;
  if (document.activeElement) document.activeElement.blur();
  setTimeout(() => resetForm(id), 380);
}
function resetForm(id) {
  if (id === 'sheet-vehicle') {
    editingVehicleId = null; pendingPhoto = undefined;
    ['v-marca', 'v-modelo', 'v-anio', 'v-dominio', 'v-detalle', 'v-foto'].forEach(i => $(i).value = '');
    $('sv-title').textContent = 'Nuevo vehículo'; $('btn-save-v').textContent = 'Guardar vehículo';
    $('btn-del-v').classList.add('hidden'); $('v-foto-prev').classList.add('hidden');
    selClase = 'auto'; renderTypeGrid();
  } else if (id === 'sheet-service') {
    editingServiceId = null;
    ['s-tipo', 's-km', 's-costo', 's-nextkm', 's-nextdate', 's-adjunto', 's-taller', 's-dir', 's-tel', 's-maps', 's-notas'].forEach(i => $(i).value = '');
    $('ss-title').textContent = 'Registrar service'; $('s-btn-text').textContent = 'Guardar service';
    lastAutoLabel = '';
  }
}

// ---------------- Render: Garage ----------------
function thumbHtml(v) { return v.foto && DATA_IMG.test(v.foto) ? `<img src="${esc(v.foto)}" alt="">` : typeSvg(v.clase); }

function renderGarage() {
  renderGreeting();
  const list = $('vehicle-list');
  let red = 0, amb = 0;
  vehicles.forEach(v => { const c = counts(v); red += c.red; amb += c.amb; });
  $('home-sub').textContent = vehicles.length ? 'Tocá un vehículo para ver su historial' : 'Sin vehículos todavía';
  $('home-pills').innerHTML =
    `<span class="pill">🚘 ${vehicles.length} vehículo${vehicles.length !== 1 ? 's' : ''}</span>` +
    (red ? `<span class="pill red">⚠️ ${red} vencido${red > 1 ? 's' : ''}</span>` : '') +
    (amb ? `<span class="pill amb">⏰ ${amb} próximo${amb > 1 ? 's' : ''}</span>` : '') +
    (!red && !amb && vehicles.length ? `<span class="pill">✅ Todo al día</span>` : '');
  list.innerHTML = '';
  $('empty').classList.toggle('hidden', vehicles.length > 0);
  vehicles.forEach(v => {
    const c = counts(v);
    const badge = c.red ? `<div class="badge red">${c.red}</div>` : c.amb ? `<div class="badge amb">${c.amb}</div>` : '';
    const last = [...v.historial].sort(cmpRec).pop();
    const lastHtml = last ? `<p class="last">${catById(last.cat).icon} ${esc(last.tipo)} · ${fmtDate(last.fecha)}</p>` : `<p class="last">Sin services registrados</p>`;
    const card = document.createElement('div');
    card.className = 'vcard' + (c.red ? ' danger' : c.amb ? ' warn' : '');
    card.onclick = () => { currentId = v.id; navigate('vehicle'); };
    card.innerHTML = `${badge}
      <div class="thumb">${thumbHtml(v)}</div>
      <div class="vinfo">
        <h3>${esc(v.marca)} ${esc(v.modelo)}</h3>
        <p class="sub">${[v.anio, v.detalle].filter(Boolean).map(esc).join(' • ') || '&nbsp;'}${v.dominio ? `<span class="plate-mini">${esc(v.dominio)}</span>` : ''}</p>
        <span class="kmtag">${nf(v.kmActual)} KM</span>
        ${lastHtml}
      </div>`;
    list.appendChild(card);
  });
}

// ---------------- Render: Vehículo ----------------
const curV = () => vehicles.find(v => v.id === currentId);

function updateDashboard() {
  const v = curV(); if (!v) return;
  $('det-name').textContent = `${v.marca} ${v.modelo}`;
  $('det-sub').textContent = [v.anio, v.detalle].filter(Boolean).join(' • ');
  $('det-thumb').innerHTML = thumbHtml(v);
  $('det-plate-wrap').classList.toggle('hidden', !v.dominio);
  $('det-plate').textContent = v.dominio || '';
  $('det-km').textContent = String(v.kmActual || 0).padStart(6, '0');

  const total = v.historial.reduce((s, h) => s + (h.costo || 0), 0);
  const last = [...v.historial].sort(cmpRec).pop();
  $('det-stats').innerHTML =
    `<div class="stat"><b>${v.historial.length}</b><span>Services</span></div>
     <div class="stat"><b>${total ? money(total) : '—'}</b><span>Gastado</span></div>
     <div class="stat"><b>${last ? fmtDate(last.fecha) : '—'}</b><span>Último</span></div>`;

  // Alertas
  $('alerts').innerHTML = getDue(v).map(({ h, lvl, causes }) => lvl === 2
    ? `<div class="alert red"><span class="ic">${catById(h.cat).icon}</span><div><h4>Service vencido</h4><p>Te pasaste para <b>${esc(h.tipo)}</b> ${causes.join(' y ')}.</p></div></div>`
    : `<div class="alert amb"><span class="ic">${catById(h.cat).icon}</span><div><h4>Próximo service</h4><p>Pronto toca <b>${esc(h.tipo)}</b> ${causes.join(' o ')}.</p></div></div>`
  ).join('');

  // Notas
  $('notes-box').innerHTML = v.observaciones.trim()
    ? `<div class="notes"><h3>📝 Observaciones técnicas <button onclick="openNotes()">Editar</button></h3><p>${esc(v.observaciones)}</p></div>`
    : `<div class="notes-empty" onclick="openNotes()">📝 Agregar observaciones<br><span style="font-weight:500;font-size:12px">Aceite que lleva, filtros, medidas, presión de neumáticos…</span></div>`;

  renderFilters(v);
  renderTimeline(v);
}

function renderFilters(v) {
  const cats = [...new Set(v.historial.map(h => h.cat))];
  if (cats.length < 2) { $('filters').innerHTML = ''; filterCat = 'all'; return; }
  $('filters').innerHTML =
    `<button class="fchip ${filterCat === 'all' ? 'on' : ''}" onclick="setFilter('all')">Todos</button>` +
    cats.map(c => `<button class="fchip ${filterCat === c ? 'on' : ''}" onclick="setFilter('${c}')">${catById(c).icon} ${esc(catById(c).label)}</button>`).join('');
}
function setFilter(c) { filterCat = c; const v = curV(); renderFilters(v); renderTimeline(v); }

function renderTimeline(v) {
  const box = $('timeline');
  const items = [...v.historial].filter(h => filterCat === 'all' || h.cat === filterCat).sort((a, b) => cmpRec(b, a));
  if (!items.length) { box.innerHTML = '<p class="tl-empty">Aún no hay historial registrado.</p>'; return; }
  box.innerHTML = items.map(h => {
    const c = catById(h.cat);
    const nextParts = [h.kmProximo ? nf(h.kmProximo) + ' KM' : null, h.fechaProxima ? fmtDate(h.fechaProxima) : null].filter(Boolean);
    let taller = '';
    if (h.taller || h.telefono || h.enlaceMaps || h.direccion) {
      taller = `<div class="tl-taller">${h.taller ? `<p>🏭 ${esc(h.taller)}</p>` : ''}` +
        (h.direccion ? `<p class="tl-addr">📍 ${esc(h.direccion)}</p>` : '') + `<div class="mini-links">` +
        (h.telefono ? `<a href="tel:${esc(h.telefono)}">📞 Llamar</a>` : '') +
        (mapsTarget(h) ? `<button class="map" onclick="openMaps('${h.id}')">🗺️ Maps</button>` : '') + `</div></div>`;
    }
    return `<div class="tl"><div class="tl-card">
      <div class="tl-act">
        <button onclick="openEditService('${h.id}')" aria-label="Editar"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2 2 0 112.8 2.8L11.8 15H9v-2.8l8.6-8.6z"/></svg></button>
        <button class="del" onclick="deleteRecord('${h.id}')" aria-label="Eliminar"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
      </div>
      <div class="tl-top"><div class="tl-ic">${c.icon}</div><div style="min-width:0"><h4>${esc(h.tipo)}</h4>
        <div class="tl-tags"><span class="tag">🗓️ ${fmtDate(h.fecha)}</span><span class="tag km">⚙️ ${nf(h.kmRealizado)} KM</span>${h.costo ? `<span class="tag cost">${money(h.costo)}</span>` : ''}</div></div></div>
      ${nextParts.length ? `<p class="tl-next">Próximo: ${nextParts.join(' o ')}</p>` : ''}
      ${h.notas ? `<p class="tl-note">${esc(h.notas)}</p>` : ''}
      ${taller}
      ${h.adjunto ? `<div class="mini-links" style="margin-top:10px"><button class="att" onclick="viewAttachment('${h.id}')">📎 Ver comprobante</button></div>` : ''}
    </div></div>`;
  }).join('');
}

// ---------------- Vehículo: alta / edición ----------------
function renderTypeGrid() {
  $('type-grid').innerHTML = VEHICLE_TYPES.map(t =>
    `<button class="typeopt ${t.id === selClase ? 'on' : ''}" onclick="pickType('${t.id}')">${typeSvg(t.id)}<span>${t.label}</span></button>`).join('');
}
function pickType(id) { selClase = id; vibrate(); renderTypeGrid(); }

function openAddVehicle() { resetForm('sheet-vehicle'); openSheet('sheet-vehicle'); }
function openEditVehicle() {
  const v = curV(); if (!v) return;
  editingVehicleId = v.id; selClase = v.clase; pendingPhoto = undefined;
  $('v-marca').value = v.marca || ''; $('v-modelo').value = v.modelo || ''; $('v-anio').value = v.anio || '';
  $('v-dominio').value = v.dominio || ''; $('v-detalle').value = v.detalle || '';
  $('sv-title').textContent = 'Editar vehículo'; $('btn-save-v').textContent = 'Guardar cambios';
  $('btn-del-v').classList.remove('hidden'); $('v-foto-prev').classList.toggle('hidden', !v.foto);
  fillModelos(v.marca); renderTypeGrid(); openSheet('sheet-vehicle');
}
function fillModelos(marca) {
  const key = Object.keys(MODELOS).find(k => k.toLowerCase() === (marca || '').trim().toLowerCase());
  $('dl-modelos').innerHTML = (MODELOS[key] || []).map(m => `<option value="${esc(m)}">`).join('');
}
function clearVehiclePhoto() { pendingPhoto = null; $('v-foto').value = ''; $('v-foto-prev').classList.add('hidden'); showToast('Foto quitada (se aplica al guardar)', 'info'); }

async function saveVehicle() {
  const marca = $('v-marca').value.trim(), modelo = $('v-modelo').value.trim();
  if (!marca || !modelo) return showToast('Marca y modelo requeridos', 'error');
  const data = { clase: selClase, marca, modelo, anio: $('v-anio').value.trim(), dominio: $('v-dominio').value.trim().toUpperCase(), detalle: $('v-detalle').value.trim() };
  const f = $('v-foto').files[0];
  if (f) { try { pendingPhoto = await compressImage(f, 700, 0.75); } catch (e) { return showToast('No se pudo leer la foto', 'error'); } }
  if (editingVehicleId) {
    const v = vehicles.find(x => x.id === editingVehicleId);
    Object.assign(v, data);
    if (pendingPhoto !== undefined) v.foto = pendingPhoto;
    await persist(v); showToast('Vehículo actualizado', 'success');
    if (currentId === v.id) updateDashboard();
  } else {
    const v = normalize({ id: 'v_' + Date.now(), ...data, foto: pendingPhoto || null, kmActual: 0, observaciones: '', historial: [] });
    vehicles.push(v); await persist(v); showToast('Vehículo agregado', 'success');
  }
  closeSheet(); renderGarage();
}
function deleteVehicle() {
  const v = curV(); if (!v) return;
  showDialog('Eliminar vehículo', `Se borrará ${v.marca} ${v.modelo} con todo su historial. No se puede deshacer.`, async () => {
    closeSheet();
    await DB.del(v.id); vehicles = vehicles.filter(x => x.id !== v.id);
    navigate('home'); showToast('Vehículo eliminado', 'info'); scheduleNotifications();
  }, 'Eliminar');
}

// ---------------- KM y notas ----------------
function openKm() { const v = curV(); $('input-km').value = v.kmActual || ''; openSheet('sheet-km'); }
async function saveKm() {
  const n = parseInt($('input-km').value);
  if (isNaN(n) || n < 0) return showToast('Ingresá un KM válido', 'error');
  const v = curV(); v.kmActual = n; await persist(v);
  closeSheet(); showToast('Kilometraje actualizado', 'success'); updateDashboard();
}
function openNotes() { $('input-notes').value = curV().observaciones || ''; openSheet('sheet-notes'); setTimeout(() => $('input-notes').focus(), 350); }
async function saveNotes() {
  const v = curV(); v.observaciones = $('input-notes').value; await persist(v);
  closeSheet(); showToast('Observaciones guardadas', 'success'); updateDashboard();
}

// ---------------- Services ----------------
function renderCatGrid() {
  $('cat-grid').innerHTML = CATEGORIES.map(c =>
    `<button class="catopt ${c.id === selCat ? 'on' : ''}" onclick="pickCat('${c.id}')"><i>${c.icon}</i>${esc(c.label)}</button>`).join('');
}
function pickCat(id) {
  vibrate();
  selCat = id;
  const inp = $('s-tipo'), label = catById(id).label;
  if (!inp.value.trim() || inp.value === lastAutoLabel) { inp.value = id === 'otro' ? '' : label; lastAutoLabel = inp.value; }
  renderCatGrid();
}
function openAddService() {
  resetForm('sheet-service');
  selCat = 'general'; lastAutoLabel = '';
  $('s-fecha').value = isoDate(new Date());
  $('s-km').value = curV().kmActual || '';
  renderCatGrid(); openSheet('sheet-service');
}
function openEditService(id) {
  const v = curV(); const h = v.historial.find(x => x.id === id); if (!h) return;
  editingServiceId = id; selCat = h.cat; lastAutoLabel = '';
  $('s-tipo').value = h.tipo || ''; $('s-km').value = h.kmRealizado || ''; $('s-fecha').value = h.fecha || '';
  $('s-costo').value = h.costo || ''; $('s-nextkm').value = h.kmProximo || ''; $('s-nextdate').value = h.fechaProxima || '';
  $('s-taller').value = h.taller || ''; $('s-dir').value = h.direccion || ''; $('s-tel').value = h.telefono || ''; $('s-maps').value = h.enlaceMaps || ''; $('s-notas').value = h.notas || '';
  $('ss-title').textContent = 'Editar service'; $('s-btn-text').textContent = 'Guardar cambios';
  renderCatGrid(); openSheet('sheet-service');
}
function suggestNext() {
  const c = catById(selCat), km = parseInt($('s-km').value), f = $('s-fecha').value;
  let done = false;
  if (c.km && !isNaN(km)) { $('s-nextkm').value = km + c.km; done = true; }
  if (c.meses && f) { const d = parseDate(f); d.setMonth(d.getMonth() + c.meses); $('s-nextdate').value = isoDate(d); done = true; }
  showToast(done ? 'Sugerencia cargada, ajustala si querés' : 'Completá KM y fecha primero', done ? 'success' : 'error');
}

async function saveService() {
  const tipo = $('s-tipo').value.trim(), km = parseInt($('s-km').value), fecha = $('s-fecha').value;
  if (!tipo || isNaN(km) || !fecha) return showToast('Faltan datos obligatorios', 'error');
  const nextKm = parseInt($('s-nextkm').value);
  const btn = $('btn-save-s'); const txt = $('s-btn-text'); const orig = txt.textContent;
  txt.textContent = 'Procesando…'; btn.disabled = true;
  try {
    const v = curV();
    let adj; // undefined = conservar
    const f = $('s-adjunto').files[0];
    if (f) {
      if (f.size > 3 * 1024 * 1024) throw new Error('El archivo supera 3 MB.');
      const isImg = f.type.startsWith('image/'), isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (!isImg && !isPdf) throw new Error('El comprobante tiene que ser una foto o un PDF.');
      const data = isImg ? await compressImage(f, 1400, 0.72) : 'data:application/pdf;base64,' + (await readAsDataURL(f)).split(',')[1];
      adj = { nombre: str(f.name, 120), tipo: isImg ? 'image/jpeg' : 'application/pdf', data };
    }
    const base = {
      cat: selCat, tipo, kmRealizado: km, fecha,
      kmProximo: isNaN(nextKm) ? null : nextKm, fechaProxima: $('s-nextdate').value || null,
      costo: parseFloat($('s-costo').value) || 0,
      taller: $('s-taller').value.trim(), direccion: $('s-dir').value.trim(), telefono: $('s-tel').value.trim(), enlaceMaps: $('s-maps').value.trim(), notas: $('s-notas').value.trim(),
    };
    if (editingServiceId) {
      const h = v.historial.find(x => x.id === editingServiceId);
      Object.assign(h, base); if (adj !== undefined) h.adjunto = adj;
    } else {
      v.historial.push({ id: 'm_' + Date.now(), ...base, adjunto: adj || null });
    }
    if (km > (v.kmActual || 0)) v.kmActual = km;
    await persist(v);
    const wasEdit = !!editingServiceId;
    closeSheet(); showToast(wasEdit ? 'Service actualizado' : 'Service guardado', 'success');
    updateDashboard(); scheduleNotifications();
    if (base.fechaProxima) askNotifOnce();
  } catch (e) {
    showDialog('Error', e.message || 'No se pudo guardar.');
  } finally { txt.textContent = orig; btn.disabled = false; }
}
function deleteRecord(id) {
  showDialog('Eliminar registro', '¿Seguro que querés eliminar este service?', async () => {
    const v = curV(); v.historial = v.historial.filter(h => h.id !== id);
    await persist(v); showToast('Eliminado', 'info'); updateDashboard(); scheduleNotifications();
  }, 'Eliminar');
}

// ---------------- Archivos / imágenes ----------------
function readAsDataURL(file) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
}
function compressImage(file, max, q) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * s), h = Math.round(img.height * s);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = rej; img.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

// Guardar/compartir un archivo: en el celular abre el menú "Compartir", en PC descarga.
async function shareFile(name, payload, mime, isDataUrl) {
  const FS = plug('Filesystem'), SH = plug('Share');
  if (isNative() && FS && SH) {
    try {
      const opts = { path: name, directory: 'CACHE' };
      if (isDataUrl) opts.data = payload.split(',')[1]; else { opts.data = payload; opts.encoding = 'utf8'; }
      const r = await FS.writeFile(opts);
      await SH.share({ title: name, url: r.uri, dialogTitle: name });
      return true;
    } catch (e) {
      if (!/cancel/i.test(String(e && (e.message || e)))) showToast('No se pudo compartir el archivo', 'error');
      return false;
    }
  }
  const a = document.createElement('a');
  a.href = isDataUrl ? payload : URL.createObjectURL(new Blob([payload], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  return true;
}

function viewAttachment(id) {
  const h = curV().historial.find(x => x.id === id); if (!h || !h.adjunto) return;
  currentAtt = h.adjunto;
  $('att-title').textContent = h.tipo;
  $('att-body').innerHTML = h.adjunto.tipo.startsWith('image/')
    ? `<img src="${esc(h.adjunto.data)}" alt="Comprobante">`
    : `<div><p style="font-size:22px;font-weight:800;margin:0 0 6px">📄 Documento PDF</p><p style="opacity:.7;font-size:13px;margin:0">${esc(h.adjunto.nombre)}</p></div>`;
  const m = $('modal-att'); m.classList.remove('hidden'); requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('on')));
}
function closeAttachment() { const m = $('modal-att'); m.classList.remove('on'); setTimeout(() => m.classList.add('hidden'), 300); }

// ---------------- Respaldo ----------------
async function exportData() {
  if (!vehicles.length) return showToast('No hay datos para respaldar', 'error');
  const backup = { app: 'MotorLog', formato: 2, exportado: new Date().toISOString(), perfil: { nombre: getName() }, vehicles };
  const ok = await shareFile(`MotorLog_respaldo_${isoDate(new Date())}.json`, JSON.stringify(backup), 'application/json');
  if (ok) showToast('Respaldo listo', 'success');
}
function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 80 * 1024 * 1024) { e.target.value = ''; return showDialog('Error', 'El archivo es demasiado grande para ser un respaldo de MotorLog.'); }
  const fr = new FileReader();
  fr.onload = async ev => {
    try {
      let data = JSON.parse(ev.target.result);
      let perfil = null;
      if (data && Array.isArray(data.vehicles)) { perfil = data.perfil; data = data.vehicles; }
      if (!Array.isArray(data)) throw new Error('formato');
      for (const raw of data.slice(0, 500)) {
        if (!raw || typeof raw !== 'object') continue;
        const v = normalize(raw); await DB.put(v);
        const i = vehicles.findIndex(x => x.id === v.id); if (i >= 0) vehicles[i] = v; else vehicles.push(v);
      }
      if (perfil && typeof perfil.nombre === 'string' && perfil.nombre.trim() && !getName()) setName(perfil.nombre);
      closeSheet(); navigate('home'); showToast('Datos restaurados', 'success'); scheduleNotifications();
    } catch (err) { showDialog('Error', 'El archivo no es un respaldo válido de MotorLog.'); }
    e.target.value = '';
  };
  fr.readAsText(file);
}
function confirmClear() {
  const nv = vehicles.length, ns = vehicles.reduce((a, v) => a + v.historial.length, 0);
  if (!nv && !getName()) return showToast('No hay datos para borrar', 'info');
  askDialog({
    title: '⚠️ ¿Borrar todos los datos?',
    msg: `Se van a eliminar de este teléfono:\n• ${nv} vehículo${nv !== 1 ? 's' : ''} y ${ns} service${ns !== 1 ? 's' : ''}\n• fotos, comprobantes y observaciones\n• tu nombre\n\nNo se puede deshacer. Te recomendamos crear un respaldo antes.`,
    left: true, okLabel: 'Continuar', danger: true, cancel: true,
    alt: nv ? { label: '⬇️ Crear respaldo primero', fn: () => exportData() } : null,
    onOk: () => setTimeout(() => askDialog({
      title: 'Última confirmación',
      msg: 'Para borrar todo, escribí BORRAR en el recuadro.',
      input: { placeholder: 'BORRAR', match: 'BORRAR', maxlength: 10 },
      okLabel: 'Borrar todo definitivamente', danger: true, cancel: true,
      onOk: async () => {
        await DB.clear(); vehicles = [];
        setName(''); try { localStorage.removeItem('ml_nombre_omitido'); } catch (e) {}
        closeSheet(); navigate('home'); showToast('Datos borrados', 'info'); scheduleNotifications();
      },
    }), 300),
  });
}

// ---------------- Reporte en PDF ----------------
const PC = { dark: [15, 23, 42], brand: [37, 99, 235], mute: [100, 116, 139], soft: [148, 163, 184], line: [226, 232, 240], bg: [248, 250, 252],
             blueBg: [239, 246, 255], red: [220, 38, 38], amb: [217, 119, 6] };
const fmtDateLong = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
// El PDF usa fuentes estándar: se quitan los caracteres que no tienen (emojis, símbolos raros).
const pdfSafe = s => String(s == null ? '' : s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/•/g, '·')
  .replace(/[^\x20-\x7E -ÿ\n]/g, '').replace(/[ \t]+/g, ' ').trim();

// Dibuja un emoji en un cuadradito PNG (para ponerlo como ícono en el PDF). Si el teléfono no puede, devuelve null.
function emojiPng(ch) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const x = c.getContext('2d'); if (!x) return null;
    x.font = '70px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 48, 52);
    return c.toDataURL('image/png');
  } catch (e) { return null; }
}
function loadImg(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
// Miniatura del vehículo: su foto (recortada) o el dibujo de su tipo.
async function vehicleThumb(v) {
  try {
    const W = 440, H = 320;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); if (!x) return null;
    x.fillStyle = '#dbeafe'; x.fillRect(0, 0, W, H);
    if (v.foto) {
      const im = await loadImg(v.foto); if (!im) return null;
      const k = Math.max(W / im.width, H / im.height), w = im.width * k, h = im.height * k;
      x.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      const svg = typeSvg(v.clase).replace(/currentColor/g, '#2563eb').replace('<svg ', '<svg width="480" height="240" ');
      const im = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)); if (!im) return null;
      x.drawImage(im, (W - 400) / 2, (H - 200) / 2, 400, 200);
    }
    return c.toDataURL('image/jpeg', 0.85);
  } catch (e) { return null; }
}

async function buildReportPdf(v) {
  const JS = window.jspdf && window.jspdf.jsPDF;
  if (!JS) throw new Error('No se encontró la librería de PDF.');
  const doc = new JS({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, H = 297, M = 14, CW = W - 2 * M, BOTTOM = H - 18;
  const fill = c => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
  const color = c => doc.setTextColor(c[0], c[1], c[2]);
  const font = (st, size) => { doc.setFont('helvetica', st); doc.setFontSize(size); };
  const lh = size => size * 0.3528 * 1.3;
  const wrap = (t, w) => doc.splitTextToSize(pdfSafe(t), w);

  const total = v.historial.reduce((a, h) => a + (h.costo || 0), 0);
  const last = [...v.historial].sort(cmpRec).pop();
  const dueMap = new Map(getDue(v).map(d => [d.h.id, d.lvl]));
  const thumb = await vehicleThumb(v);
  const icons = {}; let hasIcons = false;
  CATEGORIES.forEach(c => { const p = emojiPng(c.icon); if (p) { icons[c.id] = p; hasIcons = true; } });

  // ---- Encabezado
  fill(PC.dark); doc.rect(0, 0, W, 30, 'F');
  fill(PC.brand); doc.rect(0, 30, W, 1.6, 'F');
  color([255, 255, 255]); font('bold', 21); doc.text('MotorLog', M, 15);
  color([147, 197, 253]); font('normal', 10); doc.text('Historial de mantenimiento', M, 22);
  color([203, 213, 225]); font('normal', 8.5); doc.text('Generado el ' + new Date().toLocaleDateString('es-AR'), W - M, 15, { align: 'right' });
  if (getName()) doc.text('Titular: ' + pdfSafe(getName()), W - M, 21, { align: 'right' });

  // ---- Vehículo
  let y = 40;
  fill(PC.blueBg); stroke(PC.line); doc.setLineWidth(0.3); doc.roundedRect(M, y, 46, 33.5, 3, 3, 'FD');
  if (thumb) { try { doc.addImage(thumb, 'JPEG', M + 0.6, y + 0.6, 44.8, 32.3); } catch (e) {} }
  const tx = M + 53;
  color(PC.dark); font('bold', 18);
  const nameLines = wrap(`${v.marca} ${v.modelo}`, CW - 53).slice(0, 2);
  doc.text(nameLines, tx, y + 8);
  let ty = y + 8 + nameLines.length * lh(18) - 1;
  const sub = [v.anio, v.detalle].filter(Boolean).join('  ·  ');
  if (sub) { color(PC.mute); font('normal', 10.5); doc.text(pdfSafe(sub), tx, ty + 2); ty += 8; }
  if (v.dominio) {
    font('bold', 13); doc.setFont('courier', 'bold');
    const pw = doc.getTextWidth(pdfSafe(v.dominio)) + 10;
    fill([255, 255, 255]); stroke(PC.dark); doc.setLineWidth(0.5); doc.roundedRect(tx, ty + 1, pw, 9, 1.5, 1.5, 'FD');
    fill(PC.brand); doc.rect(tx + 0.25, ty + 1.25, pw - 0.5, 2, 'F');
    color(PC.dark); doc.text(pdfSafe(v.dominio), tx + pw / 2, ty + 8.2, { align: 'center' });
  }
  y += 33.5 + 7;

  // ---- Resumen
  const stats = [['Kilometraje', nf(v.kmActual) + ' km'], ['Services', String(v.historial.length)], ['Gasto total', total ? money(total) : '-'], ['Ultimo service', last ? fmtDateLong(last.fecha) : '-']];
  stats[3][0] = 'Último service';
  const bw = (CW - 3 * 4) / 4;
  stats.forEach((st, i) => {
    const bx = M + i * (bw + 4);
    fill(PC.bg); stroke(PC.line); doc.setLineWidth(0.3); doc.roundedRect(bx, y, bw, 15.5, 2.5, 2.5, 'FD');
    color(PC.soft); font('bold', 7); doc.text(pdfSafe(st[0]).toUpperCase(), bx + 3.5, y + 5.5);
    color(PC.dark); font('bold', 11); doc.text(pdfSafe(st[1]), bx + 3.5, y + 12);
  });
  y += 15.5 + 8;

  const need = h => { if (y + h > BOTTOM) { doc.addPage(); y = M + 2; return true; } return false; };

  // ---- Vencimientos
  const due = getDue(v);
  if (due.length) {
    need(14 + due.length * 6);
    color(PC.dark); font('bold', 12); doc.text('Vencimientos', M, y + 3); y += 8;
    due.forEach(({ h, lvl, causes }) => {
      need(7);
      fill(lvl === 2 ? PC.red : PC.amb); doc.circle(M + 2, y - 1, 1.4, 'F');
      color(PC.dark); font('bold', 9.5);
      const t1 = pdfSafe(h.tipo) + ': ', w1 = doc.getTextWidth(t1);   // se mide en negrita, antes de cambiar de letra
      doc.text(t1, M + 6, y);
      font('normal', 9.5); color(lvl === 2 ? PC.red : PC.amb);
      const t2 = (lvl === 2 ? 'vencido ' : 'próximo ') + pdfSafe(causes.join(' y '));
      if (M + 6 + w1 + doc.getTextWidth(t2) > W - M) { y += 4.6; need(5); doc.text(t2, M + 6, y); }  // no entra: sigue abajo
      else doc.text(t2, M + 6 + w1, y);
      y += 6;
    });
    y += 3;
  }

  // ---- Observaciones técnicas
  if ((v.observaciones || '').trim()) {
    const lines = v.observaciones.split('\n').flatMap(l => wrap(l || ' ', CW - 10));
    const lineH = lh(9.5);
    need(22);
    color(PC.dark); font('bold', 12); doc.text('Observaciones técnicas', M, y + 3); y += 7;
    let i = 0;
    while (i < lines.length) {
      let maxLines = Math.floor((BOTTOM - y - 8) / lineH);
      if (maxLines < 3) { doc.addPage(); y = M + 2; maxLines = Math.floor((BOTTOM - y - 8) / lineH); }
      const chunk = lines.slice(i, i + maxLines), hh = chunk.length * lineH + 7;
      fill([255, 251, 235]); stroke([253, 230, 138]); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, hh, 2.5, 2.5, 'FD');
      fill([245, 158, 11]); doc.rect(M, y + 2, 1.2, hh - 4, 'F');
      color([146, 64, 14]); font('normal', 9.5); doc.text(chunk, M + 5, y + 5.4, { lineHeightFactor: 1.3 });
      y += hh + 3; i += chunk.length;
    }
    y += 3;
  }

  // ---- Historial (tabla)
  const cols = [{ x: M, w: 22 }, { x: M + 22, w: 86 }, { x: M + 108, w: 24 }, { x: M + 132, w: 24 }, { x: M + 156, w: 26 }];
  const head = ['FECHA', 'SERVICE', 'KM', 'COSTO', 'PRÓXIMO'];
  const drawHead = () => {
    fill(PC.dark); doc.roundedRect(M, y, CW, 8, 1.5, 1.5, 'F');
    color([255, 255, 255]); font('bold', 7.5);
    head.forEach((t, i) => doc.text(t, cols[i].x + 2.5, y + 5.3));
    y += 8;
  };
  need(30);
  color(PC.dark); font('bold', 12); doc.text('Historial de services', M, y + 3); y += 7;
  if (!v.historial.length) {
    color(PC.soft); font('normal', 10); doc.text('Todavía no hay services registrados.', M, y + 6); y += 10;
  } else {
    drawHead();
    const items = [...v.historial].sort((a, b) => cmpRec(b, a));
    const iconW = hasIcons ? 9 : 0, dW = cols[1].w - 5 - iconW;
    items.forEach((h, idx) => {
      const c = catById(h.cat);
      font('bold', 9.5); const tl = wrap(h.tipo, dW);
      font('normal', 8);
      const extra = [];
      if (pdfSafe(c.label).toLowerCase() !== pdfSafe(h.tipo).toLowerCase()) extra.push({ t: c.label, c: PC.soft });
      if (h.taller || h.telefono) wrap('Taller: ' + [h.taller, h.telefono].filter(Boolean).join(' · '), dW).forEach(t => extra.push({ t, c: PC.mute }));
      if (h.direccion) wrap('Dirección: ' + h.direccion, dW).forEach(t => extra.push({ t, c: PC.mute }));
      if (h.notas) wrap(h.notas, dW).forEach(t => extra.push({ t, c: PC.mute }));
      const nxt = [];
      if (h.kmProximo) nxt.push(nf(h.kmProximo) + ' km');
      if (h.fechaProxima) nxt.push(fmtDateLong(h.fechaProxima));
      const dh = tl.length * lh(9.5) + extra.length * lh(8);
      const rh = Math.max(11, dh + 5.5, nxt.length * 4.4 + 5.5);
      if (y + rh > BOTTOM) { doc.addPage(); y = M + 2; drawHead(); }
      if (idx % 2 === 0) { fill(PC.bg); doc.rect(M, y, CW, rh, 'F'); }
      stroke(PC.line); doc.setLineWidth(0.2); doc.line(M, y + rh, M + CW, y + rh);
      const base = y + 5.4;
      color(PC.dark); font('normal', 8.5); doc.text(fmtDateLong(h.fecha), cols[0].x + 2.5, base);
      if (hasIcons && icons[h.cat]) { try { doc.addImage(icons[h.cat], 'PNG', cols[1].x + 2.5, y + 2.2, 6.4, 6.4); } catch (e) {} }
      const dx = cols[1].x + 2.5 + iconW;
      color(PC.dark); font('bold', 9.5); doc.text(tl, dx, base, { lineHeightFactor: 1.3 });
      let ey = base + (tl.length - 1) * lh(9.5) + lh(8) + 0.3;
      font('normal', 8);
      extra.forEach(e => { color(e.c); doc.text(e.t, dx, ey); ey += lh(8); });
      color(PC.dark); font('bold', 8.5); doc.text(nf(h.kmRealizado) + ' km', cols[2].x + 2.5, base);
      font('normal', 8.5); color(h.costo ? PC.dark : PC.soft); doc.text(h.costo ? money(h.costo) : '-', cols[3].x + 2.5, base);
      const lvl = dueMap.get(h.id);
      color(lvl === 2 ? PC.red : lvl === 1 ? PC.amb : PC.mute); font(lvl ? 'bold' : 'normal', 8.5);
      if (nxt.length) nxt.forEach((t, i) => doc.text(t, cols[4].x + 2.5, base + i * 4.4)); else { color(PC.soft); doc.text('-', cols[4].x + 2.5, base); }
      y += rh;
    });
    if (total) {
      need(12); y += 4;
      color(PC.mute); font('normal', 9); doc.text('Total gastado', W - M - 40, y + 1, { align: 'right' });
      color(PC.dark); font('bold', 12); doc.text(money(total), W - M, y + 1.2, { align: 'right' });
    }
  }

  // ---- Pie de página en todas las hojas
  const n = doc.getNumberOfPages();
  const foot = pdfSafe(`MotorLog  ·  ${v.marca} ${v.modelo}${v.dominio ? '  ·  ' + v.dominio : ''}`);
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); stroke(PC.line); doc.setLineWidth(0.3); doc.line(M, H - 12, W - M, H - 12);
    color(PC.soft); font('normal', 8); doc.text(foot, M, H - 7.5); doc.text(`Página ${i} de ${n}`, W - M, H - 7.5, { align: 'right' });
  }
  return doc.output('datauristring');
}

async function shareReport() {
  const v = curV(); if (!v) return;
  showToast('Generando PDF…', 'info');
  try {
    const uri = await buildReportPdf(v);
    const base = (v.dominio || (v.marca + '_' + v.modelo)).replace(/[^\w-]+/g, '_');
    const ok = await shareFile(`Reporte_${base}_${isoDate(new Date())}.pdf`, uri, 'application/pdf', true);
    if (ok) showToast(isNative() ? 'PDF listo para compartir' : 'PDF descargado', 'success');
  } catch (e) {
    console.error(e);
    showDialog('No se pudo crear el PDF', (e && e.message) || 'Probá de nuevo.');
  }
}

// ---------------- Avisos (notificaciones locales) ----------------
const notifOn = () => localStorage.getItem('ml_notif') === '1';
async function enableNotif() {
  const LN = plug('LocalNotifications');
  if (!isNative() || !LN) { showToast('Los avisos funcionan en la app instalada', 'info'); return false; }
  try {
    const p = await LN.requestPermissions();
    if (p.display !== 'granted') { showToast('Permiso de notificaciones denegado', 'error'); return false; }
    localStorage.setItem('ml_notif', '1'); $('sw-notif').classList.add('on');
    await scheduleNotifications(); return true;
  } catch (e) { showToast('No se pudieron activar los avisos', 'error'); return false; }
}
async function toggleNotif() {
  if (notifOn()) {
    localStorage.setItem('ml_notif', '0'); $('sw-notif').classList.remove('on');
    const LN = plug('LocalNotifications');
    try { const p = await LN.getPending(); if (p.notifications.length) await LN.cancel({ notifications: p.notifications }); } catch (e) {}
    showToast('Avisos desactivados', 'info');
  } else if (await enableNotif()) showToast('Avisos activados', 'success');
}
function askNotifOnce() {
  if (!isNative() || notifOn() || localStorage.getItem('ml_notif_asked')) return;
  localStorage.setItem('ml_notif_asked', '1');
  setTimeout(() => showDialog('¿Querés avisos?', 'Te mandamos una notificación 3 días antes y el mismo día de cada vencimiento por fecha.', () => enableNotif(), 'Activar avisos'), 600);
}
async function scheduleNotifications() {
  const LN = plug('LocalNotifications');
  if (!isNative() || !LN || !notifOn()) return;
  try {
    const p = await LN.getPending();
    if (p.notifications.length) await LN.cancel({ notifications: p.notifications });
    const list = []; let id = 1; const now = new Date();
    vehicles.forEach(v => latestPerGroup(v).forEach(h => {
      if (!h.fechaProxima) return;
      [[3, 'en 3 días'], [0, 'hoy']].forEach(([back, txt]) => {
        const at = parseDate(h.fechaProxima); at.setDate(at.getDate() - back); at.setHours(9, 0, 0, 0);
        if (at > now && id < 400) list.push({ id: id++, title: `${catById(h.cat).icon} ${v.marca} ${v.modelo}`, body: `${h.tipo} vence ${txt} (${fmtDate(h.fechaProxima)})`, schedule: { at } });
      });
    }));
    if (list.length) await LN.schedule({ notifications: list });
  } catch (e) { console.warn('notif', e); }
}

// ---------------- Actualizaciones ----------------
const CFG = window.ML_CONFIG || { REPO: '__REPO__', BUILD: 0, VERSION: '0', NATIVE_API: 1 };
const updEnabled = () => isNative() && CFG.REPO && CFG.REPO.indexOf('__') !== 0;
const setUpdStatus = t => { const el = $('upd-status'); if (el) el.textContent = t; };

async function httpGetJson(url) {
  const H = plug('CapacitorHttp');
  if (H) {
    const r = await H.get({ url, responseType: 'text', connectTimeout: 10000, readTimeout: 10000, headers: { 'Cache-Control': 'no-cache' } });
    if (r.status >= 400) throw new Error('HTTP ' + r.status);
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  }
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
// Abre un enlace FUERA de la app (Maps, navegador, descarga del APK).
// Nunca navega dentro de MotorLog: eso era lo que reiniciaba la app.
async function openExternal(url) {
  const AP = plug('App');
  if (isNative()) {
    try {
      if (!AP || !AP.openUrl) throw new Error('sin plugin');
      const r = await AP.openUrl({ url });
      if (r && r.completed === false) throw new Error('nadie puede abrirlo');
      return true;
    } catch (e) { showToast('No se pudo abrir el enlace', 'error'); return false; }
  }
  window.open(url, '_blank', 'noopener');
  return true;
}

// Arma el destino de "Maps" con lo que haya cargado: un enlace, un código de Google (Plus Code) o una dirección escrita a mano.
function mapsTarget(h) {
  const link = (h.enlaceMaps || '').trim(), dir = (h.direccion || '').trim();
  if (/^https?:\/\//i.test(link)) return link;
  if (/^(www\.|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.|google\.[a-z.]+\/maps)/i.test(link)) return 'https://' + link;
  const q = dir || link;
  return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
}
function openMaps(id) {
  const v = curV(); const h = v && v.historial.find(x => x.id === id);
  const url = h && mapsTarget(h);
  if (url) openExternal(url);
}

// ---- Seguridad de actualizaciones ----
// Solo se acepta un version.json firmado con TU clave (la misma que firma el APK).
// Además el plugin comprueba el paquete con esa clave pública (SHA-256 + RSA) antes de instalarlo.
const b64bytes = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
async function verifyUpdate(info) {
  try {
    if (!info || !info.signed || info.signed.alg !== 'RS256' || !info.signed.payload || !info.signed.sig || !CFG.UPDATE_KEY) return null;
    const S = window.crypto && window.crypto.subtle; if (!S) return null;
    const key = await S.importKey('spki', b64bytes(CFG.UPDATE_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const data = b64bytes(info.signed.payload);
    if (!(await S.verify('RSASSA-PKCS1-v1_5', key, b64bytes(info.signed.sig), data))) return null;
    const p = JSON.parse(new TextDecoder().decode(data));
    const base = `https://github.com/${CFG.REPO}/releases/download/v${p.build}/`;
    if (p.app !== 'com.motorlog.app' || p.repo !== CFG.REPO) return null;              // de esta app y de tu repositorio
    if (!Number.isInteger(p.build) || p.build < 1) return null;
    if (String(p.apk) !== base + 'MotorLog.apk' || String(p.bundle) !== base + 'bundle.enc') return null;  // solo descargas desde tu repositorio
    if (!/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(p.sessionKey || '') || !/^[A-Za-z0-9+/=]+$/.test(p.checksum || '')) return null;
    return p;
  } catch (e) { return null; }
}

async function checkUpdate(manual) {
  if (!updEnabled()) {
    if (manual) showToast('Las actualizaciones funcionan en la app instalada', 'info');
    return;
  }
  if (manual) setUpdStatus('Buscando…');
  try {
    const raw = await httpGetJson(`https://github.com/${CFG.REPO}/releases/latest/download/version.json?t=${Date.now()}`);
    const info = await verifyUpdate(raw);
    if (!info) {
      // Sin firma válida no se ofrece nada (ni actualización en vivo ni APK).
      setUpdStatus(`Versión ${CFG.VERSION} · no hay actualizaciones verificadas`);
      if (manual) showToast(raw && Number(raw.build) > Number(CFG.BUILD) ? 'Se ignoró una actualización sin firma válida' : 'Ya tenés la última versión', raw && Number(raw.build) > Number(CFG.BUILD) ? 'error' : 'success');
      return;
    }
    if (!(info.build > Number(CFG.BUILD))) {
      setUpdStatus(`Versión ${CFG.VERSION} · estás al día ✓`);
      if (manual) showToast('Ya tenés la última versión', 'success');
      return;
    }
    setUpdStatus(`Hay una versión nueva: ${info.version}`);
    // En el chequeo automático no se vuelve a insistir con una versión que ya se rechazó.
    if (!manual && localStorage.getItem('ml_upd_skip') === String(info.build)) return;
    if (!manual && (activeSheet || dialogOpen())) return;
    const live = !!(Number(info.minNative || 1) <= Number(CFG.NATIVE_API) && plug('CapacitorUpdater'));
    const body = (info.notes ? info.notes + '\n\n' : '') + '🔒 Actualización verificada con tu firma.\n' +
      (live ? 'Se descarga en unos segundos y la app se reinicia sola. Tus datos no se tocan.'
            : 'Esta actualización necesita instalar un APK nuevo. Se abre la descarga; después abrí el archivo para instalarlo encima.');
    showDialog(`Versión ${info.version} disponible`, body, () => applyUpdate(info, live), live ? 'Actualizar ahora' : 'Descargar APK');
    $('dlg-cancel').onclick = () => { localStorage.setItem('ml_upd_skip', String(info.build)); closeDialog(); };
  } catch (e) {
    setUpdStatus(`Versión ${CFG.VERSION}`);
    if (manual) showToast('No se pudo buscar (¿sin conexión?)', 'error');
  }
}

async function applyUpdate(info, live) {
  if (!live) { openExternal(info.apk); return; }
  const U = plug('CapacitorUpdater');
  try {
    showToast('Descargando actualización…', 'info');
    // sessionKey + checksum: el plugin descifra el paquete y comprueba su SHA-256 con tu clave pública.
    const b = await U.download({ url: info.bundle, version: String(info.version), sessionKey: info.sessionKey, checksum: info.checksum });
    showToast('Listo, reiniciando…', 'success');
    setTimeout(() => U.set({ id: b.id }), 600);
  } catch (e) {
    showDialog('No se pudo actualizar', 'El paquete no pasó la verificación o no se pudo descargar. Podés instalar el APK nuevo encima: no se pierden tus datos.', () => openExternal(info.apk), 'Descargar APK');
  }
}

// ---------------- Arranque ----------------
async function init() {
  // Le avisa al actualizador que esta versión arrancó bien (si no, vuelve a la anterior sola).
  try { const U = plug('CapacitorUpdater'); if (U) U.notifyAppReady(); } catch (e) {}
  setUpdStatus(`Versión ${CFG.VERSION}`);
  { const ab = $('about-ver'); if (ab) ab.textContent = `MotorLog ${CFG.VERSION} · Tus datos quedan solo en este teléfono`; }
  $('empty-ico').innerHTML = typeSvg('auto');
  $('dl-marcas').innerHTML = MARCAS.map(m => `<option value="${esc(m)}">`).join('');
  $('v-marca').addEventListener('input', e => fillModelos(e.target.value));
  $('v-foto').addEventListener('change', () => { pendingPhoto = undefined; });
  $('att-dl').onclick = e => {
    e.preventDefault();
    if (currentAtt) shareFile(currentAtt.nombre || 'comprobante', currentAtt.data, currentAtt.tipo, true);
  };
  $('att-dl').textContent = isNative() ? 'Compartir / guardar comprobante' : 'Descargar comprobante';
  renderTypeGrid();

  try {
    await DB.open();
    vehicles = [];
    for (const raw of await DB.all()) {
      const v = normalize(raw);
      if (!raw || raw.id !== v.id) { try { if (raw && raw.id != null) await DB.del(raw.id); await DB.put(v); } catch (e) {} }
      vehicles.push(v);
    }
    await migrateOld();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) {
    showDialog('Error', 'No se pudo abrir la base de datos del teléfono.');
  }
  renderGarage();

  // Plugins nativos
  try {
    const SS = plug('SplashScreen'); if (SS) SS.hide();
    const SB = plug('StatusBar'); if (SB) { SB.setBackgroundColor({ color: '#0f172a' }); SB.setStyle({ style: 'DARK' }); }
    const AP = plug('App');
    if (AP) AP.addListener('backButton', () => {
      if (!$('dialog').classList.contains('hidden')) closeDialog();
      else if (!$('modal-att').classList.contains('hidden')) closeAttachment();
      else if (activeSheet) closeSheet();
      else if (currentId) navigate('home');
      else AP.exitApp();
    });
  } catch (e) {}

  setTimeout(() => {
    $('splash').classList.add('out'); setTimeout(() => $('splash').remove(), 750);
    let omitted = false; try { omitted = localStorage.getItem('ml_nombre_omitido') === '1'; } catch (e) {}
    if (!getName() && !omitted) setTimeout(() => { if (!dialogOpen()) askName(true); }, 450);
  }, 2500);
  scheduleNotifications();
  setTimeout(() => checkUpdate(false), 4500);
}
document.addEventListener('DOMContentLoaded', init);
