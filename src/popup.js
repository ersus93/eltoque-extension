// ═══════════════════════════════════════════════
//  ElToque Tasas — Popup v2
// ═══════════════════════════════════════════════

const PREFERRED_ORDER = ['EUR', 'USD', 'MLC', 'BTC', 'USDT', 'TRX'];

const CURRENCY_META = {
  EUR:  { name: 'Euro',     flag: '🇪🇺' },
  USD:  { name: 'Dólar',    flag: '🇺🇸' },
  MLC:  { name: 'MLC',      flag: '💳' },
  BTC:  { name: 'Bitcoin',  flag: '₿' },
  USDT: { name: 'Tether',   flag: '💵' },
  TRX:  { name: 'TRON',     flag: '⚡' },
  CAD:  { name: 'Canadiense', flag: '🇨🇦' },
  GBP:  { name: 'Libra',    flag: '🇬🇧' },
  ECU:  { name: 'Euro',     flag: '🇪🇺' },
};

let settings = {};
let currentRates  = {};
let rateChanges   = {};
let previousRates = {};
let tickerOpen = false;
let listenersAttached = false;

// ── Debounce utility ───────────────────────────
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (listenersAttached) return;
  listenersAttached = true;

  // Leer preferencia de ticker abierto/cerrado
  const uiState = await chrome.storage.local.get('popupUiState');
  tickerOpen = (uiState.popupUiState && uiState.popupUiState.tickerOpen) ?? false;

  await loadData();
  applyTheme();
  applyColors();
  renderAll();
  attachListeners();
});

async function loadData() {
  const data = await chrome.storage.local.get([
    'settings', 'currentRates', 'previousRates',
    'rateChanges', 'lastUpdated', 'fetchError'
  ]);
  settings      = data.settings      ?? {};
  currentRates  = data.currentRates  ?? {};
  previousRates = data.previousRates ?? {};
  rateChanges   = data.rateChanges   ?? {};

  const errorBanner = document.getElementById('errorBanner');
  const errorMsg = document.getElementById('errorMsg');

  if (data.fetchError) {
    setDot('error');
    if (errorBanner) errorBanner.style.display = 'flex';
    if (errorMsg) errorMsg.textContent = data.fetchError;
  } else if (Object.keys(currentRates).length > 0) {
    setDot('ok');
    if (errorBanner) errorBanner.style.display = 'none';
  } else {
    setDot('loading');
  }

  const updateInfo = document.getElementById('updateInfo');
  if (data.lastUpdated && updateInfo) {
    updateInfo.textContent = fmtTime(data.lastUpdated);
  }

  const iv = settings.updateInterval ?? 30;
  const footerInterval = document.getElementById('footerInterval');
  if (footerInterval) {
    footerInterval.textContent =
      `cada ${iv < 60 ? iv + ' min' : (iv / 60).toFixed(1) + ' h'}`;
  }
}

function setDot(state) {
  const dot = document.getElementById('updateDot');
  if (dot) dot.className = 'update-dot ' + state;
}

// ── Render principal ──────────────────────────
function renderAll() {
  const hasRates = Object.keys(currentRates).length > 0;
  const ratesLoading = document.getElementById('ratesLoading');
  const ratesGrid = document.getElementById('ratesGrid');
  
  if (ratesLoading) ratesLoading.style.display = hasRates ? 'none' : 'flex';
  if (ratesGrid) ratesGrid.style.display = hasRates ? 'grid' : 'none';

  if (hasRates) {
    renderGrid();
    renderTicker();
  }

  // Aplicar estado ticker
  applyTickerState();
}

// ── Ordenar monedas ───────────────────────────
function getSortedCurrencies() {
  const order    = settings.currencyOrder?.length ? settings.currencyOrder : PREFERRED_ORDER;
  const selected = settings.selectedCurrencies ?? [];
  const all      = Object.keys(currentRates);

  const sorted = [...all].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return selected.length > 0 ? sorted.filter(c => selected.includes(c)) : sorted;
}

// ── Grid de tarjetas ──────────────────────────
function renderGrid() {
  const grid = document.getElementById('ratesGrid');
  if (!grid) return;
  
  const currencies = getSortedCurrencies();
  const showFlags = settings.showCurrencyFlag !== false;
  const fontSize  = settings.fontSize ?? 13;

  // Ajustar columnas
  const cols = currencies.length <= 2 ? 'cols-2'
    : currencies.length === 4 ? 'cols-4' : '';
  grid.className = 'rates-grid ' + cols;

  grid.innerHTML = '';

  for (const cur of currencies) {
    const val    = currentRates[cur];
    if (val === undefined) continue;
    const change = rateChanges[cur] ?? 'neutral';
    const prev   = previousRates[cur];
    const meta   = CURRENCY_META[cur] ?? { name: cur, flag: '💱' };
    const diff   = prev !== undefined ? val - prev : null;
    const arrow  = change === 'up' ? '▲' : change === 'down' ? '▼' : '—';

    const card = document.createElement('div');
    card.className = `rate-card ${change}`;
    card.title = `${meta.name} · ${cur} en pesos cubanos`;

    card.innerHTML = `
      <div class="rate-top">
        <span class="rate-cur">${cur}</span>
        ${showFlags ? `<span class="rate-flag">${meta.flag}</span>` : ''}
      </div>
      <div class="rate-val" style="font-size:${fontSize + 4}px">${fmtRate(val)}</div>
      <div class="rate-bot">
        <span class="rate-name">${meta.name}</span>
        <span class="rate-diff">${arrow}${diff !== null && diff !== 0 ? (diff > 0 ? '+' : '') + diff.toFixed(1) : ''}</span>
      </div>
    `;
    grid.appendChild(card);
  }
}

// ── Ticker ────────────────────────────────────
function renderTicker() {
  const currencies = getSortedCurrencies();
  const speed      = settings.scrollSpeed ?? 40;
  const strip      = document.getElementById('tickerStrip');
  if (!strip) return;

  const itemsHtml = currencies.map(cur => {
    const val    = currentRates[cur];
    if (val === undefined) return '';
    const change = rateChanges[cur] ?? 'neutral';
    const arrow  = change === 'up' ? '▲' : change === 'down' ? '▼' : '—';
    const fmted  = fmtRate(val);
    return '<span class="t-item ' + change + '">'
      + '<span class="t-cur">' + cur + '</span>'
      + '<span class="t-val">' + fmted + '</span>'
      + '<span class="t-arr">' + arrow + '</span>'
      + '</span><span class="t-sep">·</span>';
  }).join('');

  if (!itemsHtml.trim()) return;
  strip.innerHTML = itemsHtml + itemsHtml;

  const totalChars = currencies.reduce((acc, c) => acc + c.length + fmtRate(currentRates[c] ?? 0).length + 4, 0);
  const dur = Math.max(6, (totalChars * 9) / (speed / 20));
  strip.style.animationDuration = dur + 's';
  document.documentElement.style.setProperty('--ticker-dur', dur + 's');
}

// ── Toggle ticker ─────────────────────────────
function applyTickerState() {
  const body    = document.getElementById('tickerBody');
  const chevron = document.getElementById('tickerChevron');
  if (body) body.classList.toggle('open', tickerOpen);
  if (chevron) chevron.classList.toggle('open', tickerOpen);
}

// ── Utilidades ────────────────────────────────
function fmtRate(val) {
  if (val >= 10000) return val.toLocaleString('es-CU', { maximumFractionDigits: 0 });
  if (val >= 1000)  return val.toLocaleString('es-CU', { maximumFractionDigits: 0 });
  return val.toFixed(val % 1 === 0 ? 0 : 1);
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function applyTheme() {
  const t = settings.colorBg;
  if (t === 'dark')  document.body.classList.add('theme-dark');
  if (t === 'light') document.body.classList.add('theme-light');
}

function applyColors() {
  const root = document.documentElement;
  if (settings.colorUp)   root.style.setProperty('--up',   settings.colorUp);
  if (settings.colorDown) root.style.setProperty('--down', settings.colorDown);
  if (settings.colorNeutral && settings.colorNeutral !== 'auto')
    root.style.setProperty('--neutral', settings.colorNeutral);
}

// ── Listeners ─────────────────────────────────
function attachListeners() {
  const btnRefresh = document.getElementById('btnRefresh');
  const btnSettings = document.getElementById('btnSettings');
  const tickerToggle = document.getElementById('tickerToggle');

  // Refresh
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.classList.add('spinning'); 
      btnRefresh.disabled = true;
      setDot('loading');
      await chrome.runtime.sendMessage({ type: 'FETCH_NOW' });
      await loadData();
      renderAll();
      btnRefresh.classList.remove('spinning'); 
      btnRefresh.disabled = false;
    });
  }

  // Settings
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Toggle ticker
  if (tickerToggle) {
    tickerToggle.addEventListener('click', () => {
      tickerOpen = !tickerOpen;
      applyTickerState();
      chrome.storage.local.set({ popupUiState: { tickerOpen } });
    });
  }
}

// Actualizaciones en tiempo real (debounced)
const debouncedStorageUpdate = debounce(async (changes) => {
  if (changes.currentRates || changes.rateChanges || changes.lastUpdated || changes.fetchError) {
    await loadData();
    renderAll();
  }
}, 100);

chrome.storage.onChanged.addListener((changes) => {
  debouncedStorageUpdate(changes);
});
