// ═══════════════════════════════════════════════
//  ElToque Tasas — Background Service Worker v5
//  Rotación basada en storage+timestamps (MV3/Brave safe)
// ═══════════════════════════════════════════════

const API_URL         = 'https://tasas.eltoque.com/v1/trmi';
const ALARM_FETCH     = 'eltoque-fetch';
const ALARM_ROTATE    = 'eltoque-rotate';   // Alarma de rotación (mínimo 1 min en Chrome)
const ALARM_KEEPALIVE = 'eltoque-keepalive';

const CURRENCY_NORMALIZE = {
  'ECU':        'EUR',
  'USDT_TRC20': 'USDT',
  'USDT_ERC20': 'USDT',
};

const PREFERRED_ORDER = ['EUR', 'USD', 'MLC', 'BTC', 'USDT', 'TRX'];

const CURRENCY_META = {
  EUR:  { name: 'Euro',    symbol: '€' },
  USD:  { name: 'Dólar',   symbol: '$' },
  MLC:  { name: 'MLC',     symbol: '₱' },
  BTC:  { name: 'Bitcoin', symbol: '₿' },
  USDT: { name: 'Tether',  symbol: 'T' },
  TRX:  { name: 'TRON',    symbol: '⚡' },
};

const DEFAULT_SETTINGS = {
  apiUrl:             API_URL,
  apiKey:             '',
  updateInterval:     30,
  scrollDirection:    'horizontal',
  scrollSpeed:        40,
  fontSize:           13,
  showTimestamp:      true,
  showCurrencyFlag:   true,
  compactMode:        false,
  colorUp:            '#ef4444',
  colorDown:          '#22c55e',
  colorNeutral:       'auto',
  colorBg:            'auto',
  opacity:            1.0,
  selectedCurrencies: [],
  currencyOrder:      [...PREFERRED_ORDER],
  overlayEnabled:     true,
  overlayPosition:    'top',
  overlayHeight:      28,
  overlayOpacity:     0.95,
  overlayZIndex:      999999,
  badgeCurrency:      'USD',
  badgeEnabled:       true,
  iconRotateEnabled:  true,
  iconRotateInterval: 2,
  newTabEnabled:      true,
  omniboxEnabled:     true,
  notifyOnChange:     false,
  notifyThreshold:    5,
};

// ── Estado en memoria (se repuebla desde storage al despertar) ──
let cachedRates    = {};
let cachedChanges  = {};
let cachedCfg      = { ...DEFAULT_SETTINGS };
let swTimer        = null;   // timer dentro del SW mientras está activo

// ══════════════════════════════════════════════
//  LIFECYCLE
// ══════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  await setupAlarms();
  await fetchRates();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarms();
  await hydrateCache();
  kickInternalTimer();
});

// Cada vez que el SW despierta por una alarma
chrome.alarms.onAlarm.addListener(async (alarm) => {
  await hydrateCache();

  if (alarm.name === ALARM_FETCH) {
    await fetchRates();
    return;
  }

  if (alarm.name === ALARM_ROTATE || alarm.name === ALARM_KEEPALIVE) {
    // Avanzar un paso de rotación
    await advanceRotation();
    // Reiniciar timer interno para los próximos pasos sub-minuto
    kickInternalTimer();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[DEBUG BG] Message received:', msg);
  if (msg.type === 'FETCH_NOW') {
    console.log('[DEBUG BG] FETCH_NOW received, calling fetchRates');
    fetchRates().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'RESET_SETTINGS') {
    chrome.storage.local.set({ settings: DEFAULT_SETTINGS }).then(async () => {
      cachedCfg = { ...DEFAULT_SETTINGS };
      await setupAlarms();
      await resetRotation();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'UPDATE_INTERVAL') {
    // Settings cambiaron — recargar config y reiniciar todo
    chrome.storage.local.get('settings').then(async ({ settings }) => {
      cachedCfg = settings ?? DEFAULT_SETTINGS;
      await setupAlarms();
      await resetRotation();  // ← esto es lo que faltaba antes
      kickInternalTimer();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'GET_DEFAULTS') {
    sendResponse({ defaults: DEFAULT_SETTINGS });
  }
  if (msg.type === 'GET_RATES') {
    sendResponse({ rates: cachedRates, changes: cachedChanges });
  }
});

// ── Repoblar cache desde storage ──────────────
async function hydrateCache() {
  const data = await chrome.storage.local.get(['currentRates', 'rateChanges', 'settings']);
  if (data.currentRates) cachedRates   = data.currentRates;
  if (data.rateChanges)  cachedChanges = data.rateChanges;
  if (data.settings)     cachedCfg     = data.settings;
}

// ══════════════════════════════════════════════
//  ALARMAS
// ══════════════════════════════════════════════

async function setupAlarms() {
  await chrome.alarms.clearAll();
  const cfg      = cachedCfg.apiUrl ? cachedCfg : (await chrome.storage.local.get('settings')).settings ?? DEFAULT_SETTINGS;
  const interval = cfg.updateInterval ?? 30;

  // Fetch de API
  chrome.alarms.create(ALARM_FETCH, {
    delayInMinutes:  interval,
    periodInMinutes: interval,
  });

  // Keepalive cada 1 minuto (mínimo Chrome)
  // También sirve para avanzar rotación cuando SW estaba dormido
  chrome.alarms.create(ALARM_KEEPALIVE, {
    delayInMinutes:  1,
    periodInMinutes: 1,
  });
}

// ══════════════════════════════════════════════
//  ROTACIÓN — basada en storage + timestamps
//  Funciona aunque el SW se duerma en Brave
// ══════════════════════════════════════════════

function getOrderedCurrencies() {
  const order    = cachedCfg.currencyOrder?.length > 0 ? cachedCfg.currencyOrder : PREFERRED_ORDER;
  const selected = cachedCfg.selectedCurrencies ?? [];
  const all      = Object.keys(cachedRates);
  const sorted   = [...all].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1; if (ib === -1) return -1;
    return ia - ib;
  });
  return selected.length > 0 ? sorted.filter(c => selected.includes(c)) : sorted;
}

// Reinicia la rotación desde el inicio (cuando cambia config o se reciben nuevos datos)
async function resetRotation() {
  const currencies = getOrderedCurrencies();
  if (currencies.length === 0) return;

  await chrome.storage.local.set({
    rotateState: {
      index:    0,
      lastTime: Date.now(),
    }
  });

  await displayCurrency(currencies[0]);
}

// Avanza UN paso de rotación, calculando cuántos pasos debieron pasar
async function advanceRotation() {
  if (!cachedCfg.iconRotateEnabled) {
    await displayCurrency(cachedCfg.badgeCurrency ?? 'USD');
    return;
  }

  const currencies = getOrderedCurrencies();
  if (currencies.length === 0) return;

  const data     = await chrome.storage.local.get('rotateState');
  const state    = data.rotateState ?? { index: 0, lastTime: Date.now() };
  const interval = Math.max(1, cachedCfg.iconRotateInterval ?? 2) * 1000; // ms
  const elapsed  = Date.now() - state.lastTime;

  // Calcular cuántos pasos debieron avanzar (al menos 1)
  const steps  = Math.max(1, Math.floor(elapsed / interval));
  const newIdx = (state.index + steps) % currencies.length;

  await chrome.storage.local.set({
    rotateState: { index: newIdx, lastTime: Date.now() }
  });

  await displayCurrency(currencies[newIdx]);
}

// Timer interno del SW — corre mientras el SW está vivo (hasta 30s sin eventos)
// Esto permite rotación sub-minuto cuando el usuario está activo
function kickInternalTimer() {
  if (swTimer) { clearInterval(swTimer); swTimer = null; }
  if (!cachedCfg.iconRotateEnabled) return;

  const intervalSec = Math.max(1, cachedCfg.iconRotateInterval ?? 2);
  const intervalMs  = intervalSec * 1000;

  swTimer = setInterval(async () => {
    // Solo si el SW sigue activo
    await advanceRotation();
  }, intervalMs);

  // Auto-limpiar después de 25 segundos para no bloquear el ciclo de vida del SW
  // El keepalive alarm lo reiniciará cuando sea necesario
  setTimeout(() => {
    if (swTimer) { clearInterval(swTimer); swTimer = null; }
  }, 25000);
}

// ── Mostrar una moneda en el ícono ────────────
async function displayCurrency(currency) {
  const val = cachedRates[currency];
  if (val === undefined) {
    // Moneda no disponible, mostrar la primera disponible
    const first = getOrderedCurrencies()[0];
    if (first && first !== currency) return displayCurrency(first);
    return;
  }

  const change  = cachedChanges[currency] ?? 'neutral';
  const colorUp = cachedCfg.colorUp   ?? '#ef4444';
  const colorDn = cachedCfg.colorDown ?? '#22c55e';
  const accent  = change === 'up' ? colorUp : change === 'down' ? colorDn : null;
  const arrow   = change === 'up' ? '▲' : change === 'down' ? '▼' : '—';
  const price   = fmtPrice(val);

  // Badge (siempre funciona, es el fallback más confiable)
  setBadge(price, change === 'up' ? colorUp : change === 'down' ? colorDn : '#1e1e38');

  // Tooltip
  try {
    chrome.action.setTitle({
      title: `${currency}: ${price} CUP ${arrow}\nElToque — clic para ver todas`
    });
  } catch (_) {}

  // Ícono canvas
  await renderIcon(currency, price, change, accent, colorUp, colorDn);
}

// ── Canvas: ícono con logo + texto ───────────
async function renderIcon(currency, price, change, accent, colorUp, colorDn) {
  const S = 128;
  try {
    const canvas = new OffscreenCanvas(S, S);
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;

    const bg      = '#0b0b1c';
    const border  = accent ? hexRgba(accent, 0.7) : 'rgba(70,100,200,0.4)';
    const neutral = '#9090b8';

    // ── Fondo oscuro redondeado ──
    ctx.fillStyle = bg;
    rr(ctx, 0, 0, S, S, 16);
    ctx.fill();

    // ── Borde de color según cambio ──
    ctx.strokeStyle = border;
    ctx.lineWidth   = 6;
    rr(ctx, 3, 3, S - 6, S - 6, 14);
    ctx.stroke();

    // ── Zona nombre (arriba, 40% del ícono) ──
    const zoneH = Math.floor(S * 0.40);

    // Fondo tenue para el nombre
    ctx.fillStyle = accent ? hexRgba(accent, 0.15) : 'rgba(60,70,140,0.2)';
    rr(ctx, 8, 8, S - 16, zoneH, 8);
    ctx.fill();

    // Nombre de la moneda — grande y legible
    const label = currency;  // EUR, USD, MLC, BTC, USDT, TRX (máx 4 chars)
    const lLen  = label.length;
    const lSize = lLen >= 5 ? 22 : lLen === 4 ? 26 : lLen === 3 ? 32 : 36;
    ctx.font         = `900 ${lSize}px sans-serif`;
    ctx.fillStyle    = accent ?? '#c8c8e8';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, S / 2, zoneH / 2 + 10);

    // ── Línea divisoria ──
    ctx.strokeStyle = accent ? hexRgba(accent, 0.25) : 'rgba(80,80,160,0.2)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(10, zoneH + 10);
    ctx.lineTo(S - 10, zoneH + 10);
    ctx.stroke();

    // ── Precio ──
    const pLen  = price.length;
    const pSize = pLen >= 7 ? 18 : pLen >= 6 ? 20 : pLen >= 5 ? 23 : pLen >= 4 ? 26 : 29;
    ctx.font         = `bold ${pSize}px monospace`;
    ctx.fillStyle    = accent ?? neutral;
    ctx.textBaseline = 'middle';
    ctx.fillText(price, S / 2, S * 0.67);

    // ── Flecha ──
    if (change !== 'neutral') {
      const arrow = change === 'up' ? '▲' : '▼';
      // Medimos el precio para posicionar la flecha
      const pw = ctx.measureText(price).width;
      ctx.font         = `bold 13px sans-serif`;
      ctx.fillStyle    = accent ?? neutral;
      ctx.globalAlpha  = 0.85;
      ctx.textBaseline = 'middle';
      ctx.fillText(arrow, S / 2 + pw / 2 + 9, S * 0.67);
      ctx.globalAlpha  = 1;
    }

    // ── "CUP" debajo ──
    ctx.font      = `400 10px sans-serif`;
    ctx.fillStyle = 'rgba(120,120,180,0.55)';
    ctx.textBaseline = 'middle';
    ctx.fillText('CUP', S / 2, S * 0.84);

    // ── Dot de estado (esquina) ──
    const dotC = change === 'up' ? colorUp : change === 'down' ? colorDn : '#252540';
    ctx.fillStyle = dotC;
    ctx.beginPath();
    ctx.arc(S - 12, 12, 8, 0, Math.PI * 2);
    ctx.fill();

    const imageData = ctx.getImageData(0, 0, S, S);
    await chrome.action.setIcon({ imageData });

  } catch (e) {
    console.warn('[ElToque icon]', e.message);
  }
}

function hexRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function setBadge(text, bg) {
  try {
    chrome.action.setBadgeText({ text: String(text) });
    chrome.action.setBadgeBackgroundColor({ color: bg ?? '#1a1a3a' });
  } catch (_) {}
}

function fmtPrice(val) {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
  if (val >= 100000)  return Math.round(val / 1000) + 'k';
  if (val >= 10000)   return (val / 1000).toFixed(1) + 'k';
  if (val >= 1000)    return String(Math.round(val));
  return val % 1 === 0 ? String(val) : val.toFixed(1);
}

// ══════════════════════════════════════════════
//  FETCH API
// ══════════════════════════════════════════════

async function fetchRates() {
  console.log('[DEBUG BG] fetchRates called');
  try {
    const { settings } = await chrome.storage.local.get('settings');
    const cfg = settings ?? DEFAULT_SETTINGS;
    cachedCfg = cfg;

    const headers = { 'Accept': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

    console.log('[DEBUG BG] Fetching from:', cfg.apiUrl || API_URL);
    const res = await fetch(cfg.apiUrl || API_URL, { headers });
    console.log('[DEBUG BG] Response status:', res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw      = await res.json();
    console.log('[DEBUG BG] Raw data:', raw);
    const rawRates = parseRates(raw);
    if (!rawRates || Object.keys(rawRates).length === 0)
      throw new Error('Respuesta vacía');

    const rates = normalizeCurrencyKeys(rawRates);
    console.log('[DEBUG BG] Parsed rates:', rates);

    const { currentRates } = await chrome.storage.local.get('currentRates');
    const prevSnap = currentRates ?? {};

    const changes = {};
    for (const [cur, val] of Object.entries(rates)) {
      const prev = prevSnap[cur];
      changes[cur] = prev === undefined ? 'new'
        : val > prev ? 'up' : val < prev ? 'down' : 'neutral';
    }

    const now = new Date().toISOString();
    await chrome.storage.local.set({
      currentRates:  rates,
      previousRates: prevSnap,
      rateChanges:   changes,
      lastUpdated:   now,
      fetchError:    null,
    });

    cachedRates   = rates;
    cachedChanges = changes;

    // Reiniciar rotación con nuevos datos
    await resetRotation();
    kickInternalTimer();

    if (cfg.notifyOnChange)
      checkNotifications(rates, prevSnap, changes, cfg);

    broadcastToTabs({ type: 'RATES_UPDATED', rates, changes, lastUpdated: now });

  } catch (err) {
    await chrome.storage.local.set({ fetchError: err.message });
    setBadge('ERR', '#c00');
    try { chrome.action.setTitle({ title: `ElToque: Error — ${err.message}` }); } catch (_) {}
    console.error('[ElToque]', err);
  }
}

// ══════════════════════════════════════════════
//  OMNIBOX
// ══════════════════════════════════════════════

chrome.omnibox.onInputStarted.addListener(() => {
  chrome.omnibox.setDefaultSuggestion({
    description: 'ElToque Tasas — escribe una moneda (USD, EUR, BTC...) o Enter para ver todo'
  });
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const q    = text.trim().toUpperCase();
  const currencies = getOrderedCurrencies();
  const suggestions = [];

  for (const cur of currencies) {
    const val    = cachedRates[cur];
    if (!val) continue;
    const change = cachedChanges[cur] ?? 'neutral';
    const arrow  = change === 'up' ? '↑' : change === 'down' ? '↓' : '-';
    const meta   = CURRENCY_META[cur] ?? { name: cur };
    const price  = fmtPrice(val);

    if (q && !cur.startsWith(q) && !meta.name.toUpperCase().includes(q)) continue;

    const label = change === 'up' ? 'subió' : change === 'down' ? 'bajó' : 'estable';
    suggestions.push({
      content:     cur,
      description: `${cur} ${arrow} ${price} CUP — ${meta.name} (${label})`
    });
  }

  if (suggestions.length === 0 && q) {
    suggestions.push({
      content:     '',
      description: `No encontrado: "${text}" — prueba EUR, USD, MLC, BTC, USDT, TRX`
    });
  }

  suggest(suggestions);
});

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  const url = chrome.runtime.getURL('newtab.html') + (text ? `#${text.toUpperCase()}` : '');
  if (disposition === 'currentTab') chrome.tabs.update({ url });
  else chrome.tabs.create({ url });
});

// ══════════════════════════════════════════════
//  PARSEO / NORMALIZACIÓN
// ══════════════════════════════════════════════

function normalizeCurrencyKeys(raw) {
  const result = {};
  for (const [key, val] of Object.entries(raw)) {
    const nk = CURRENCY_NORMALIZE[key.toUpperCase()] ?? key.toUpperCase();
    result[nk] = result[nk] !== undefined ? Math.max(result[nk], val) : val;
  }
  return result;
}

function parseRates(raw) {
  if (!raw) return null;
  if (raw.tasas && typeof raw.tasas === 'object') return normP(raw.tasas);
  if (raw.rates && typeof raw.rates === 'object') return normP(raw.rates);
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const d = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = extractNum(v);
      if (n !== null && k.length >= 2) d[k] = n;
    }
    if (Object.keys(d).length > 0) return d;
  }
  if (Array.isArray(raw)) {
    const a = {};
    for (const item of raw) {
      const cur = item.currency || item.moneda || item.code;
      const val = item.rate || item.tasa || item.value || item.precio;
      if (cur && val !== undefined) a[cur.toUpperCase()] = extractNum(val);
    }
    if (Object.keys(a).length > 0) return a;
  }
  return null;
}

function normP(obj) {
  const r = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = extractNum(v);
    if (n !== null) r[k.toUpperCase()] = n;
  }
  return r;
}

function extractNum(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val !== null) {
    const vals = Object.values(val).filter(x => typeof x === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  return null;
}

// ══════════════════════════════════════════════
//  NOTIFICACIONES + BROADCAST
// ══════════════════════════════════════════════

function checkNotifications(current, previous, changes, cfg) {
  const threshold = cfg.notifyThreshold || 5;
  for (const [cur, change] of Object.entries(changes)) {
    if (change === 'neutral' || change === 'new') continue;
    const prev = previous[cur], curr = current[cur];
    if (!prev) continue;
    const pct = Math.abs((curr - prev) / prev) * 100;
    if (pct >= threshold) {
      chrome.notifications?.create(`et-${cur}-${Date.now()}`, {
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: `ElToque: ${cur} ${change === 'up' ? '⬆️' : '⬇️'}`,
        message: `${prev.toFixed(2)} → ${curr.toFixed(2)} CUP (${pct.toFixed(1)}%)`,
      }).catch(() => {});
    }
  }
}

async function broadcastToTabs(msg) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url &&
          !tab.url.startsWith('chrome://') &&
          !tab.url.startsWith('chrome-extension://') &&
          !tab.url.startsWith('brave://')) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    }
  } catch (_) {}
}
