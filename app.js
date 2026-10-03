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

function normalize(v) {
  v.clase = v.clase || 'auto';
  v.kmActual = v.kmActual || 0;
  v.observaciones = v.observaciones || '';
  v.historial = Array.isArray(v.historial) ? v.historial : [];
  v.historial.forEach(h => {
    h.cat = h.cat || detectCat(h.tipo);
    h.kmProximo = h.kmProximo ? Number(h.kmProximo) : null;
    h.fechaProxima = h.fechaProxima || null;
    h.costo = h.costo ? Number(h.costo) : 0;
  });
  return v;
}

async function migrateOld() {
  const raw = localStorage.getItem(OLD_KEY);
  if (!raw) return;
  try {
    const old = JSON.parse(raw);
    for (const v of old) { if (!vehicles.find(x => x.id === v.id)) { normalize(v); await DB.put(v); vehicles.push(v); } }
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
let dlgOnClose = null;
function showDialog(title, msg, onConfirm, okLabel) {
  vibrate();
  $('dlg-title').textContent = title; $('dlg-msg').textContent = msg;
  const ok = $('dlg-ok'), cancel = $('dlg-cancel');
  ok.textContent = okLabel || (onConfirm ? 'Confirmar' : 'Aceptar');
  ok.onclick = () => { closeDialog(); if (onConfirm) onConfirm(); };
  cancel.classList.toggle('hidden', !onConfirm);
  cancel.onclick = closeDialog;
  $('dialog').classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => $('dialog').classList.add('on')));
}
function closeDialog() {
  $('dialog').classList.remove('on');
  setTimeout(() => $('dialog').classList.add('hidden'), 250);
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
  $(id).classList.add('open');
  activeSheet = id;
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
    ['s-tipo', 's-km', 's-costo', 's-nextkm', 's-nextdate', 's-adjunto', 's-taller', 's-tel', 's-maps', 's-notas'].forEach(i => $(i).value = '');
    $('ss-title').textContent = 'Registrar service'; $('s-btn-text').textContent = 'Guardar service';
    lastAutoLabel = '';
  }
}

// ---------------- Render: Garage ----------------
function thumbHtml(v) { return v.foto ? `<img src="${v.foto}" alt="">` : typeSvg(v.clase); }

function renderGarage() {
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
    if (h.taller || h.telefono || h.enlaceMaps) {
      taller = `<div class="tl-taller">${h.taller ? `<p>🏭 ${esc(h.taller)}</p>` : ''}<div class="mini-links">` +
        (h.telefono ? `<a href="tel:${esc(h.telefono)}">📞 Llamar</a>` : '') +
        (h.enlaceMaps ? `<a class="map" href="${esc(h.enlaceMaps)}" target="_blank" rel="noopener">📍 Maps</a>` : '') + `</div></div>`;
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
  $('s-taller').value = h.taller || ''; $('s-tel').value = h.telefono || ''; $('s-maps').value = h.enlaceMaps || ''; $('s-notas').value = h.notas || '';
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
      const data = f.type.startsWith('image/') ? await compressImage(f, 1400, 0.72) : await readAsDataURL(f);
      adj = { nombre: f.name, tipo: f.type.startsWith('image/') ? 'image/jpeg' : f.type, data };
    }
    const base = {
      cat: selCat, tipo, kmRealizado: km, fecha,
      kmProximo: isNaN(nextKm) ? null : nextKm, fechaProxima: $('s-nextdate').value || null,
      costo: parseFloat($('s-costo').value) || 0,
      taller: $('s-taller').value.trim(), telefono: $('s-tel').value.trim(), enlaceMaps: $('s-maps').value.trim(), notas: $('s-notas').value.trim(),
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
    ? `<img src="${h.adjunto.data}" alt="Comprobante">`
    : `<div><p style="font-size:22px;font-weight:800;margin:0 0 6px">📄 Documento PDF</p><p style="opacity:.7;font-size:13px;margin:0">${esc(h.adjunto.nombre)}</p></div>`;
  const m = $('modal-att'); m.classList.remove('hidden'); requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('on')));
}
function closeAttachment() { const m = $('modal-att'); m.classList.remove('on'); setTimeout(() => m.classList.add('hidden'), 300); }

// ---------------- Respaldo ----------------
async function exportData() {
  if (!vehicles.length) return showToast('No hay datos para respaldar', 'error');
  const ok = await shareFile(`MotorLog_respaldo_${isoDate(new Date())}.json`, JSON.stringify(vehicles), 'application/json');
  if (ok) showToast('Respaldo listo', 'success');
}
function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const fr = new FileReader();
  fr.onload = async ev => {
    try {
      let data = JSON.parse(ev.target.result);
      if (data && Array.isArray(data.vehicles)) data = data.vehicles;
      if (!Array.isArray(data)) throw new Error('formato');
      for (const v of data) {
        if (!v || !v.id) continue;
        normalize(v); await DB.put(v);
        const i = vehicles.findIndex(x => x.id === v.id); if (i >= 0) vehicles[i] = v; else vehicles.push(v);
      }
      closeSheet(); navigate('home'); showToast('Datos restaurados', 'success'); scheduleNotifications();
    } catch (err) { showDialog('Error', 'El archivo no es un respaldo válido de MotorLog.'); }
    e.target.value = '';
  };
  fr.readAsText(file);
}
function confirmClear() {
  showDialog('Borrar TODO', 'Se eliminarán todos los vehículos y services de este teléfono. Es irreversible.', async () => {
    await DB.clear(); vehicles = []; closeSheet(); navigate('home'); showToast('Datos borrados', 'info'); scheduleNotifications();
  }, 'Borrar todo');
}

// ---------------- Reporte ----------------
function buildReport(v) {
  const total = v.historial.reduce((s, h) => s + (h.costo || 0), 0);
  const rows = [...v.historial].sort((a, b) => cmpRec(b, a)).map(h => {
    const nx = [h.kmProximo ? nf(h.kmProximo) + ' KM' : null, h.fechaProxima ? fmtDate(h.fechaProxima) : null].filter(Boolean).join(' o el ');
    return `<tr><td>${fmtDate(h.fecha)}</td><td><b>${catById(h.cat).icon} ${esc(h.tipo)}</b><br><span class="b">${nf(h.kmRealizado)} KM</span>${h.taller ? `<br><small>Taller: ${esc(h.taller)}${h.telefono ? ' · ' + esc(h.telefono) : ''}</small>` : ''}${h.notas ? `<br><small>${esc(h.notas)}</small>` : ''}</td><td>${h.costo ? money(h.costo) : '-'}</td><td>${nx ? 'A los ' + nx : '-'}</td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte ${esc(v.marca)} ${esc(v.modelo)}</title>
<style>body{font-family:Arial,sans-serif;color:#0f172a;max-width:900px;margin:0 auto;padding:24px}h1{margin:0;color:#1d4ed8}.sub{color:#64748b;margin:2px 0 18px}
.info{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:16px}.info span{display:block;font-size:11px;text-transform:uppercase;color:#64748b;font-weight:700}.info b{font-size:16px}
.obs{background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 14px;margin-bottom:16px;border-radius:6px;white-space:pre-line}
table{width:100%;border-collapse:collapse}th{background:#f8fafc;text-align:left;padding:8px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0}td{padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top}
.b{background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700}small{color:#64748b}.foot{text-align:center;color:#94a3b8;font-size:11px;margin-top:30px}</style></head><body>
<h1>MotorLog</h1><p class="sub">Historial de mantenimiento</p>
<div class="info"><div><span>Vehículo</span><b>${esc(v.marca)} ${esc(v.modelo)}</b></div><div><span>Año / Versión</span><b>${esc([v.anio, v.detalle].filter(Boolean).join(' • ') || '-')}</b></div><div><span>Patente</span><b>${esc(v.dominio || '-')}</b></div><div><span>Kilometraje</span><b>${nf(v.kmActual)} KM</b></div><div><span>Gasto total</span><b>${money(total)}</b></div></div>
${v.observaciones ? `<div class="obs"><b>Observaciones técnicas</b><br>${esc(v.observaciones)}</div>` : ''}
<table><thead><tr><th>Fecha</th><th>Tarea</th><th>Costo</th><th>Próximo</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sin registros</td></tr>'}</tbody></table>
<div class="foot">Generado por MotorLog el ${new Date().toLocaleDateString('es-AR')}</div></body></html>`;
}
async function shareReport() {
  const v = curV(); if (!v) return;
  const html = buildReport(v);
  const name = `Reporte_${(v.dominio || v.modelo || 'vehiculo').replace(/[^\w-]+/g, '_')}.html`;
  if (isNative()) {
    const ok = await shareFile(name, html, 'text/html');
    if (ok) showToast('Abrilo en el navegador para imprimir o guardar PDF', 'info');
  } else {
    let f = $('print-frame');
    if (!f) { f = document.createElement('iframe'); f.id = 'print-frame'; f.style.display = 'none'; document.body.appendChild(f); }
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); }, 250);
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
function openExternal(url) {
  const AP = plug('App');
  try { if (AP && AP.openUrl) { AP.openUrl({ url }); return; } } catch (e) {}
  window.open(url, '_blank');
}

async function checkUpdate(manual) {
  if (!updEnabled()) {
    if (manual) showToast('Las actualizaciones funcionan en la app instalada', 'info');
    return;
  }
  if (manual) setUpdStatus('Buscando…');
  try {
    const info = await httpGetJson(`https://github.com/${CFG.REPO}/releases/latest/download/version.json?t=${Date.now()}`);
    if (!info || !(Number(info.build) > Number(CFG.BUILD))) {
      setUpdStatus(`Versión ${CFG.VERSION} · estás al día ✓`);
      if (manual) showToast('Ya tenés la última versión', 'success');
      return;
    }
    setUpdStatus(`Hay una versión nueva: ${info.version}`);
    // En el chequeo automático no se vuelve a insistir con una versión que ya se rechazó.
    if (!manual && localStorage.getItem('ml_upd_skip') === String(info.build)) return;
    if (!manual && activeSheet) return;
    const live = !!(info.bundle && Number(info.minNative || 1) <= Number(CFG.NATIVE_API) && plug('CapacitorUpdater'));
    const body = (info.notes ? info.notes + '\n\n' : '') +
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
    const b = await U.download({ url: info.bundle, version: String(info.version) });
    showToast('Listo, reiniciando…', 'success');
    setTimeout(() => U.set({ id: b.id }), 600);
  } catch (e) {
    showDialog('No se pudo actualizar', 'Podés descargar el APK nuevo e instalarlo encima: no se pierden tus datos.', () => openExternal(info.apk), 'Descargar APK');
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
    vehicles = (await DB.all()).map(normalize);
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

  setTimeout(() => { $('splash').classList.add('out'); setTimeout(() => $('splash').remove(), 750); }, 2500);
  scheduleNotifications();
  setTimeout(() => checkUpdate(false), 4500);
}
document.addEventListener('DOMContentLoaded', init);
