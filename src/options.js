// ═══════════════════════════════════════════════
//  ElToque Tasas — Options v2
// ═══════════════════════════════════════════════

const PREFERRED_ORDER = ['EUR', 'USD', 'MLC', 'BTC', 'USDT', 'TRX'];

const CURRENCY_META = {
  EUR:  { label: 'Euro',                    flag: '🇪🇺' },
  USD:  { label: 'Dólar Estadounidense',    flag: '🇺🇸' },
  MLC:  { label: 'Moneda Libremente Conv.', flag: '🇨🇺' },
  BTC:  { label: 'Bitcoin',                flag: '₿'   },
  USDT: { label: 'Tether (USDT)',           flag: '💵'  },
  TRX:  { label: 'TRON',                   flag: '⚡'  },
  ECU:  { label: 'Euro (ECU)',              flag: '🇪🇺' },
  CAD:  { label: 'Dólar Canadiense',        flag: '🇨🇦' },
  GBP:  { label: 'Libra Esterlina',         flag: '🇬🇧' },
};

let settings = {};
let currentRates = {};
let defaults = {};

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  initNav();
  initFields();
  renderCurrencies();
  initButtons();
  initDragDrop();
  initIconRotateSection();
  initTestRotation();
});

async function loadAll() {
  const data = await chrome.storage.local.get(['settings', 'currentRates']);
  const resp = await chrome.runtime.sendMessage({ type: 'GET_DEFAULTS' });
  defaults      = resp?.defaults ?? {};
  settings      = { ...defaults, ...(data.settings ?? {}) };
  currentRates  = data.currentRates ?? {};
}

// ── Navigation ────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`section-${item.dataset.section}`)?.classList.add('active');
    });
  });
}

// ── Populate fields ───────────────────────────
function initFields() {
  setVal('apiUrl', settings.apiUrl);
  setVal('apiKey', settings.apiKey);
  setRange('updateInterval', settings.updateInterval, v => v < 60 ? `${v} min` : `${(v/60).toFixed(1)} h`);

  setSegmented('scrollDirectionGroup', settings.scrollDirection ?? 'horizontal');
  setRange('scrollSpeed', settings.scrollSpeed, v => `${v} px/s`);
  setRange('fontSize', settings.fontSize, v => `${v} px`);
  setCheck('showTimestamp',    settings.showTimestamp !== false);
  setCheck('showCurrencyFlag', settings.showCurrencyFlag !== false);
  setCheck('compactMode',      !!settings.compactMode);

  setColor('colorUp',   settings.colorUp);
  setColor('colorDown', settings.colorDown);
  const neutralAuto = !settings.colorNeutral || settings.colorNeutral === 'auto';
  setCheck('neutralAuto', neutralAuto);
  if (!neutralAuto) setColor('colorNeutral', settings.colorNeutral);
  setSegmented('themeGroup', settings.colorBg ?? 'auto');
  setRange('opacity', settings.opacity ?? 1, v => `${Math.round(v * 100)}%`);

  syncColorHex('colorUp',      'colorUpHex');
  syncColorHex('colorDown',    'colorDownHex');
  syncColorHex('colorNeutral', 'colorNeutralHex');
  updateColorPreview();

  setCheck('overlayEnabled', settings.overlayEnabled !== false);
  setSegmented('overlayPositionGroup', settings.overlayPosition ?? 'top');
  setRange('overlayHeight',  settings.overlayHeight  ?? 28, v => `${v} px`);
  setRange('overlayOpacity', settings.overlayOpacity ?? 0.95, v => `${Math.round(v * 100)}%`);
  setVal('overlayZIndex', settings.overlayZIndex ?? 999999);

  setCheck('newTabEnabled', settings.newTabEnabled !== false);
  setCheck('badgeEnabled', settings.badgeEnabled !== false);
  setVal('badgeCurrency', settings.badgeCurrency ?? 'USD');
  setCheck('notifyOnChange', !!settings.notifyOnChange);
  setRange('notifyThreshold', settings.notifyThreshold ?? 5, v => `${v}%`);
}

function initIconRotateSection() {
  setCheck('iconRotateEnabled', settings.iconRotateEnabled !== false);
  setRange('iconRotateInterval', settings.iconRotateInterval ?? 2, v => `${v} seg`);
}

// ── Currencies list ───────────────────────────
function renderCurrencies() {
  const list     = document.getElementById('currenciesList');
  const order    = settings.currencyOrder ?? PREFERRED_ORDER;
  const selected = settings.selectedCurrencies ?? [];

  const allCurs  = Object.keys(currentRates).length > 0
    ? Object.keys(currentRates)
    : PREFERRED_ORDER;

  const sorted = [...allCurs].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  list.innerHTML = '';
  for (const cur of sorted) {
    const meta  = CURRENCY_META[cur] ?? { label: cur, flag: '💱' };
    const isSel = selected.length === 0 || selected.includes(cur);
    const val   = currentRates[cur];

    const row = document.createElement('div');
    row.className = 'currency-row';
    row.dataset.currency = cur;
    row.draggable = true;

    row.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span class="cur-flag">${meta.flag}</span>
      <span class="cur-code">${cur}</span>
      <span class="cur-name">${meta.label}</span>
      ${val !== undefined ? `<span class="cur-value">${fmtVal(val)} CUP</span>` : ''}
      <label class="toggle small" style="margin-left:auto">
        <input type="checkbox" data-cur="${cur}" ${isSel ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;
    list.appendChild(row);
  }

  if (sorted.length === 0) {
    list.innerHTML = '<div class="empty-currencies">Sin datos. Conecta la API y actualiza.</div>';
  }
}

function fmtVal(v) {
  return v >= 1000
    ? v.toLocaleString('es-CU', { maximumFractionDigits: 0 })
    : v.toFixed(v % 1 === 0 ? 0 : 1);
}

// ── Drag & Drop ───────────────────────────────
function initDragDrop() {
  let dragging = null;
  const list = document.getElementById('currenciesList');

  list.addEventListener('dragstart', e => {
    dragging = e.target.closest('.currency-row');
    setTimeout(() => dragging?.classList.add('dragging'), 0);
  });
  list.addEventListener('dragend', () => {
    dragging?.classList.remove('dragging');
    dragging = null;
    updateOrderFromDOM();
  });
  list.addEventListener('dragover', e => {
    e.preventDefault();
    const target = e.target.closest('.currency-row');
    if (!target || target === dragging) return;
    const after = e.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    after ? target.after(dragging) : target.before(dragging);
  });
}

function updateOrderFromDOM() {
  settings.currencyOrder = [...document.querySelectorAll('.currency-row')]
    .map(r => r.dataset.currency);
}

// ── Buttons ───────────────────────────────────
function initButtons() {
  document.getElementById('btnSave').addEventListener('click', saveSettings);

  document.getElementById('btnReset').addEventListener('click', async () => {
    if (!confirm('¿Restaurar todos los valores por defecto?')) return;
    settings = { ...defaults };
    await chrome.runtime.sendMessage({ type: 'RESET_SETTINGS' });
    initFields();
    initIconRotateSection();
    renderCurrencies();
    showToast('Configuración restaurada');
  });

  document.getElementById('btnTestApi').addEventListener('click', testApi);

  document.getElementById('btnSelectAll').addEventListener('click', () =>
    document.querySelectorAll('[data-cur]').forEach(c => c.checked = true));
  document.getElementById('btnSelectNone').addEventListener('click', () =>
    document.querySelectorAll('[data-cur]').forEach(c => c.checked = false));

  document.getElementById('neutralAuto').addEventListener('change', e => {
    document.getElementById('colorNeutral').disabled    = e.target.checked;
    document.getElementById('colorNeutralHex').disabled = e.target.checked;
    updateColorPreview();
  });

  ['colorUp', 'colorDown', 'colorNeutral'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      syncColorHex(id, id + 'Hex');
      updateColorPreview();
    });
    document.getElementById(id + 'Hex').addEventListener('input', e => {
      if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
        document.getElementById(id).value = e.target.value;
        updateColorPreview();
      }
    });
  });
}

async function saveSettings() {
  collectSettings();
  await chrome.storage.local.set({ settings });
  await chrome.runtime.sendMessage({ type: 'UPDATE_INTERVAL' });

  // Notificar content scripts
  chrome.tabs?.query({}).then(tabs => {
    tabs.forEach(tab => {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('brave://')) {
        chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
      }
    });
  }).catch(() => {});

  showToast('Configuración guardada');
}

function collectSettings() {
  settings.apiUrl         = getVal('apiUrl');
  settings.apiKey         = getVal('apiKey');
  settings.updateInterval = getNum('updateInterval');

  settings.scrollDirection  = getSegmented('scrollDirectionGroup');
  settings.scrollSpeed      = getNum('scrollSpeed');
  settings.fontSize         = getNum('fontSize');
  settings.showTimestamp    = getCheck('showTimestamp');
  settings.showCurrencyFlag = getCheck('showCurrencyFlag');
  settings.compactMode      = getCheck('compactMode');

  settings.colorUp      = getVal('colorUp');
  settings.colorDown    = getVal('colorDown');
  settings.colorNeutral = getCheck('neutralAuto') ? 'auto' : getVal('colorNeutral');
  settings.colorBg      = getSegmented('themeGroup');
  settings.opacity      = parseFloat(document.getElementById('opacity').value);

  settings.iconRotateEnabled  = getCheck('iconRotateEnabled');
  settings.iconRotateInterval = getNum('iconRotateInterval');

  const checks = document.querySelectorAll('[data-cur]');
  settings.selectedCurrencies = [...checks].filter(c => c.checked).map(c => c.dataset.cur);
  updateOrderFromDOM();

  settings.overlayEnabled  = getCheck('overlayEnabled');
  settings.overlayPosition = getSegmented('overlayPositionGroup');
  settings.overlayHeight   = getNum('overlayHeight');
  settings.overlayOpacity  = parseFloat(document.getElementById('overlayOpacity').value);
  settings.overlayZIndex   = getNum('overlayZIndex');

  settings.newTabEnabled     = getCheck('newTabEnabled');
  settings.badgeEnabled      = getCheck('badgeEnabled');
  settings.badgeCurrency     = getVal('badgeCurrency');
  settings.notifyOnChange    = getCheck('notifyOnChange');
  settings.notifyThreshold   = getNum('notifyThreshold');
}

// ── Test rotation button ──────────────────────
function initTestRotation() {
  const btn = document.getElementById('btnTestRotation');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.textContent = '⏳ Reiniciando...';
    btn.disabled = true;
    // Save current settings first so interval is applied
    collectSettings();
    await chrome.storage.local.set({ settings });
    await chrome.runtime.sendMessage({ type: 'UPDATE_INTERVAL' });
    setTimeout(() => {
      btn.textContent = '✓ Rotación reiniciada';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = '▶ Probar rotación ahora'; }, 2000);
    }, 800);
  });
}

async function testApi() {
  const dot  = document.querySelector('.status-dot');
  const text = document.querySelector('.status-text');
  dot.className = 'status-dot loading';
  text.textContent = 'Probando...';
  try {
    const url     = getVal('apiUrl') || 'https://tasas.eltoque.com/v1/trmi';
    const apiKey  = getVal('apiKey');
    const headers = { Accept: 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    dot.className = 'status-dot ok';
    text.textContent = `✓ OK — ${Object.keys(raw).length} campo(s)`;
    currentRates = normalizeForDisplay(raw);
    renderCurrencies();
  } catch (e) {
    dot.className = 'status-dot error';
    text.textContent = `✗ ${e.message}`;
  }
}

function normalizeForDisplay(raw) {
  const NORM = { 'ECU': 'EUR', 'USDT_TRC20': 'USDT', 'USDT_ERC20': 'USDT' };
  const base = raw.tasas || raw.rates || raw;
  const r = {};
  for (const [k, v] of Object.entries(base)) {
    const key = NORM[k.toUpperCase()] ?? k.toUpperCase();
    const num = typeof v === 'number' ? v : parseFloat(v);
    if (!isNaN(num)) r[key] = num;
  }
  return r;
}

// ── Preview ───────────────────────────────────
function updateColorPreview() {
  const up  = document.getElementById('colorUp').value;
  const dn  = document.getElementById('colorDown').value;
  const neu = getCheck('neutralAuto') ? '#7070a0' : document.getElementById('colorNeutral').value;
  document.querySelector('.preview-item.up').style.color      = up;
  document.querySelector('.preview-item.down').style.color    = dn;
  document.querySelector('.preview-item.neutral').style.color = neu;
}

// ── Helpers ───────────────────────────────────
function setVal(id, v)   { const e = document.getElementById(id); if (e && v != null) e.value = v; }
function getVal(id)      { return document.getElementById(id)?.value ?? ''; }
function getNum(id)      { return parseFloat(document.getElementById(id)?.value) || 0; }
function setCheck(id, v) { const e = document.getElementById(id); if (e) e.checked = !!v; }
function getCheck(id)    { return !!document.getElementById(id)?.checked; }

function setRange(id, val, fmt) {
  const el    = document.getElementById(id);
  const label = document.getElementById(id + 'Val');
  if (!el || val == null) return;
  el.value = val;
  if (label && fmt) label.textContent = fmt(val);
  el.addEventListener('input', () => {
    if (label && fmt) label.textContent = fmt(parseFloat(el.value));
  });
}

function setSegmented(groupId, val) {
  const g = document.getElementById(groupId);
  if (!g) return;
  g.querySelectorAll('.seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === val);
    btn.addEventListener('click', () => {
      g.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function getSegmented(groupId) {
  return document.getElementById(groupId)?.querySelector('.seg-btn.active')?.dataset.val ?? '';
}

function setColor(id, v) {
  const e = document.getElementById(id);
  if (e && v && v !== 'auto') e.value = v;
}

function syncColorHex(pickId, hexId) {
  const p = document.getElementById(pickId);
  const h = document.getElementById(hexId);
  if (p && h) h.value = p.value;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.childNodes[t.childNodes.length - 1].textContent = ' ' + msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
