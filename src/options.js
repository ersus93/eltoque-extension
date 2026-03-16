// ═══════════════════════════════════════════════
//  ElToque Tasas — Options v3
//  Soporte modo servidor + mostrar cambios
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

const VALIDATION_RULES = {
  updateInterval:     { min: 1,   max: 1440,  default: 15,  field: 'updateInterval' },
  scrollSpeed:        { min: 10,  max: 500,   default: 100, field: 'scrollSpeed' },
  fontSize:           { min: 8,   max: 32,    default: 14,  field: 'fontSize' },
  opacity:            { min: 0.1, max: 1,     default: 1,   field: 'opacity', isFloat: true },
  overlayHeight:      { min: 10,  max: 100,   default: 28,  field: 'overlayHeight' },
  overlayOpacity:     { min: 0.1, max: 1,     default: 0.95, field: 'overlayOpacity', isFloat: true },
  overlayZIndex:      { min: 0,   max: 2147483647, default: 999999, field: 'overlayZIndex' },
  iconRotateInterval: { min: 1,   max: 3600,  default: 2,   field: 'iconRotateInterval' },
  notifyThreshold:    { min: 0.1, max: 100,   default: 5,   field: 'notifyThreshold', isFloat: true },
};

let settings = {};
let currentRates = {};
let defaults = {};

let segmentedListenersAttached = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  initNav();
  initFields();
  renderCurrencies();
  initButtons();
  initDragDrop();
  initIconRotateSection();
  initTestRotation();
  initDataSourceButtons();
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
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.section');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach(i => i.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      const targetSection = document.getElementById(`section-${item.dataset.section}`);
      if (targetSection) {
        targetSection.classList.add('active');
      }
    });
  });
}

// ── Populate fields ───────────────────────────
function initFields() {
  setVal('apiUrl', settings.apiUrl);
  setVal('apiKey', settings.apiKey);
  
  // Modo servidor
  setSegmented('dataSourceGroup', settings.dataSource ?? 'local');
  setVal('serverUrl', settings.serverUrl ?? '');
  setVal('autoServerUrl', settings.autoServerUrl ?? '');
  updateServerUrlVisibility();
  
  // Tipo de cambio
  setSegmented('showChangeTypeGroup', settings.showChangeType ?? 'color');
  
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

// ── Server URL visibility ────────────────────────────
function updateServerUrlVisibility() {
  const mode = getSegmented('dataSourceGroup');
  const serverUrlGroup = document.getElementById('serverUrlGroup');
  const autoServerUrlGroup = document.getElementById('autoServerUrlGroup');
  const hint = document.getElementById('dataSourceHint');
  
  if (!serverUrlGroup || !autoServerUrlGroup || !hint) return;
  
  if (mode === 'server') {
    serverUrlGroup.style.display = 'block';
    autoServerUrlGroup.style.display = 'none';
    hint.textContent = 'Obtiene datos desde tu servidor VPS externo';
  } else if (mode === 'auto') {
    serverUrlGroup.style.display = 'none';
    autoServerUrlGroup.style.display = 'block';
    hint.textContent = 'Usa el servidor predefinido (puente para evitar bloqueos)';
  } else {
    serverUrlGroup.style.display = 'none';
    autoServerUrlGroup.style.display = 'none';
    hint.textContent = 'Obtiene datos directamente de la API de ElToque';
  }
}

function initDataSourceButtons() {
  const group = document.getElementById('dataSourceGroup');
  if (!group) return;
  
  const buttons = group.querySelectorAll('.seg-btn');
  if (!buttons || buttons.length === 0) return;
  
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateServerUrlVisibility();
    });
  });
}

// ── Currencies list ───────────────────────────
function renderCurrencies() {
  const list = document.getElementById('currenciesList');
  if (!list) return;
  
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
  const list = document.getElementById('currenciesList');
  if (!list) return;
  
  let dragging = null;

  list.addEventListener('dragstart', e => {
    dragging = e.target.closest('.currency-row');
    if (dragging) {
      setTimeout(() => dragging.classList.add('dragging'), 0);
    }
  });
  list.addEventListener('dragend', () => {
    if (dragging) {
      dragging.classList.remove('dragging');
    }
    dragging = null;
    updateOrderFromDOM();
  });
  list.addEventListener('dragover', e => {
    e.preventDefault();
    const target = e.target.closest('.currency-row');
    if (!target || target === dragging) return;
    const rect = target.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    after ? target.after(dragging) : target.before(dragging);
  });
}

function updateOrderFromDOM() {
  const rows = document.querySelectorAll('.currency-row');
  settings.currencyOrder = [...rows].map(r => r.dataset.currency);
}

// ── Buttons ───────────────────────────────────
function initButtons() {
  const btnSave = document.getElementById('btnSave');
  if (btnSave) btnSave.addEventListener('click', saveSettings);

  const btnReset = document.getElementById('btnReset');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (!confirm('¿Restaurar todos los valores por defecto?')) return;
      settings = { ...defaults };
      await chrome.runtime.sendMessage({ type: 'RESET_SETTINGS' });
      initFields();
      initIconRotateSection();
      renderCurrencies();
      showToast('Configuración restaurada');
    });
  }

  const btnTestApi = document.getElementById('btnTestApi');
  if (btnTestApi) btnTestApi.addEventListener('click', testApi);

  const btnSelectAll = document.getElementById('btnSelectAll');
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () =>
      document.querySelectorAll('[data-cur]').forEach(c => c.checked = true));
  }
  
  const btnSelectNone = document.getElementById('btnSelectNone');
  if (btnSelectNone) {
    btnSelectNone.addEventListener('click', () =>
      document.querySelectorAll('[data-cur]').forEach(c => c.checked = false));
  }

  const neutralAutoEl = document.getElementById('neutralAuto');
  if (neutralAutoEl) {
    neutralAutoEl.addEventListener('change', e => {
      const colorNeutral = document.getElementById('colorNeutral');
      const colorNeutralHex = document.getElementById('colorNeutralHex');
      if (colorNeutral) colorNeutral.disabled = e.target.checked;
      if (colorNeutralHex) colorNeutralHex.disabled = e.target.checked;
      updateColorPreview();
    });
  }

  ['colorUp', 'colorDown', 'colorNeutral'].forEach(id => {
    const colorInput = document.getElementById(id);
    const hexInput = document.getElementById(id + 'Hex');
    
    if (colorInput) {
      colorInput.addEventListener('input', () => {
        syncColorHex(id, id + 'Hex');
        updateColorPreview();
      });
    }
    
    if (hexInput) {
      hexInput.addEventListener('input', e => {
        if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
          const colorInput = document.getElementById(id);
          if (colorInput) {
            colorInput.value = e.target.value;
            updateColorPreview();
          }
        }
      });
    }
  });
}

async function saveSettings() {
  const validationErrors = validateSettings();
  
  if (validationErrors.length > 0) {
    showToast(`Error: ${validationErrors[0]}`);
    return;
  }
  
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

function validateSettings() {
  const errors = [];
  
  for (const [key, rule] of Object.entries(VALIDATION_RULES)) {
    const el = document.getElementById(rule.field);
    if (!el) continue;
    
    let value = rule.isFloat ? parseFloat(el.value) : parseInt(el.value, 10);
    
    if (isNaN(value)) {
      errors.push(`${rule.field}: valor inválido, usando valor por defecto`);
      value = rule.default;
      el.value = value;
      continue;
    }
    
    if (value < rule.min || value > rule.max) {
      errors.push(`${rule.field}: debe estar entre ${rule.min} y ${rule.max}`);
    }
  }
  
  const dataSource = getSegmented('dataSourceGroup');
  if (dataSource === 'server') {
    const serverUrl = getVal('serverUrl');
    if (!serverUrl || serverUrl.trim() === '') {
      errors.push('URL del servidor es requerida cuando el modo es "server"');
    }
  }
  
  return errors;
}

function collectSettings() {
  settings.apiUrl         = getVal('apiUrl');
  settings.apiKey         = getVal('apiKey');
  settings.dataSource     = getSegmented('dataSourceGroup');
  settings.serverUrl      = getVal('serverUrl');
  settings.autoServerUrl  = getVal('autoServerUrl');
  settings.showChangeType = getSegmented('showChangeTypeGroup');
  settings.updateInterval = getNum('updateInterval', VALIDATION_RULES.updateInterval);

  settings.scrollDirection  = getSegmented('scrollDirectionGroup');
  settings.scrollSpeed      = getNum('scrollSpeed', VALIDATION_RULES.scrollSpeed);
  settings.fontSize         = getNum('fontSize', VALIDATION_RULES.fontSize);
  settings.showTimestamp    = getCheck('showTimestamp');
  settings.showCurrencyFlag = getCheck('showCurrencyFlag');
  settings.compactMode      = getCheck('compactMode');

  settings.colorUp      = getVal('colorUp');
  settings.colorDown    = getVal('colorDown');
  settings.colorNeutral = getCheck('neutralAuto') ? 'auto' : getVal('colorNeutral');
  settings.colorBg      = getSegmented('themeGroup');
  
  const opacityEl = document.getElementById('opacity');
  settings.opacity      = opacityEl ? parseFloat(opacityEl.value) || 1 : 1;

  settings.iconRotateEnabled  = getCheck('iconRotateEnabled');
  settings.iconRotateInterval = getNum('iconRotateInterval', VALIDATION_RULES.iconRotateInterval);

  const checks = document.querySelectorAll('[data-cur]');
  settings.selectedCurrencies = [...checks].filter(c => c.checked).map(c => c.dataset.cur);
  updateOrderFromDOM();

  settings.overlayEnabled  = getCheck('overlayEnabled');
  settings.overlayPosition = getSegmented('overlayPositionGroup');
  settings.overlayHeight   = getNum('overlayHeight', VALIDATION_RULES.overlayHeight);
  
  const overlayOpacityEl = document.getElementById('overlayOpacity');
  settings.overlayOpacity  = overlayOpacityEl ? parseFloat(overlayOpacityEl.value) || 0.95 : 0.95;
  
  settings.overlayZIndex   = getNum('overlayZIndex', VALIDATION_RULES.overlayZIndex);

  settings.newTabEnabled     = getCheck('newTabEnabled');
  settings.badgeEnabled      = getCheck('badgeEnabled');
  settings.badgeCurrency     = getVal('badgeCurrency');
  settings.notifyOnChange    = getCheck('notifyOnChange');
  settings.notifyThreshold   = getNum('notifyThreshold', VALIDATION_RULES.notifyThreshold);
}

// ── Test rotation button ──────────────────────
function initTestRotation() {
  const btn = document.getElementById('btnTestRotation');
  if (!btn) return;
  
  if (btn.hasAttribute('data-listener-attached')) return;
  btn.setAttribute('data-listener-attached', 'true');
  
  btn.addEventListener('click', async () => {
    btn.textContent = '⏳ Reiniciando...';
    btn.disabled = true;
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
  
  if (!dot || !text) {
    showToast('Elementos de estado no encontrados');
    return;
  }
  
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
  const up  = document.getElementById('colorUp');
  const dn  = document.getElementById('colorDown');
  const neu = document.getElementById('colorNeutral');
  
  if (!up || !dn || !neu) return;
  
  const upVal = up.value;
  const dnVal = dn.value;
  const neuVal = getCheck('neutralAuto') ? '#7070a0' : neu.value;
  
  const previewUp = document.querySelector('.preview-item.up');
  const previewDown = document.querySelector('.preview-item.down');
  const previewNeutral = document.querySelector('.preview-item.neutral');
  
  if (previewUp) previewUp.style.color = upVal;
  if (previewDown) previewDown.style.color = dnVal;
  if (previewNeutral) previewNeutral.style.color = neuVal;
}

// ── Helpers ───────────────────────────────────
function setVal(id, v)   { const e = document.getElementById(id); if (e && v != null) e.value = v; }
function getVal(id)      { return document.getElementById(id)?.value ?? ''; }
function getNum(id, rule) {
  const el = document.getElementById(id);
  if (!el) return rule?.default ?? 0;
  const val = parseFloat(el.value);
  if (isNaN(val)) return rule?.default ?? 0;
  if (rule) {
    const clamped = Math.max(rule.min, Math.min(rule.max, val));
    return clamped;
  }
  return val;
}
function setCheck(id, v) { const e = document.getElementById(id); if (e) e.checked = !!v; }
function getCheck(id)    { return !!document.getElementById(id)?.checked; }

function setRange(id, val, fmt) {
  const el    = document.getElementById(id);
  const label = document.getElementById(id + 'Val');
  if (!el || val == null) return;
  el.value = val;
  if (label && fmt) label.textContent = fmt(val);
  
  if (el.hasAttribute('data-listener-attached')) return;
  el.setAttribute('data-listener-attached', 'true');
  
  el.addEventListener('input', () => {
    if (label && fmt) label.textContent = fmt(parseFloat(el.value));
  });
}

function setSegmented(groupId, val) {
  const g = document.getElementById(groupId);
  if (!g) return;
  
  const buttons = g.querySelectorAll('.seg-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === val);
    
    if (!segmentedListenersAttached.has(`${groupId}-${btn.dataset.val}`)) {
      segmentedListenersAttached.add(`${groupId}-${btn.dataset.val}`);
      
      btn.addEventListener('click', () => {
        g.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }
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
  if (!t) return;
  const lastNode = t.childNodes[t.childNodes.length - 1];
  if (lastNode) {
    lastNode.textContent = ' ' + msg;
  }
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
