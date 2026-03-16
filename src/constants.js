// ═══════════════════════════════════════════════
//  ElToque Tasas — Centralized Constants
//  Single source of truth for all shared constants
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
//  API Configuration
// ═══════════════════════════════════════════════
const API_URL = 'https://tasas.eltoque.com/v1/trmi';

const ALARMS = {
  FETCH:     'eltoque-fetch',
  ROTATE:    'eltoque-rotate',
  KEEPALIVE: 'eltoque-keepalive',
};

// ═══════════════════════════════════════════════
//  Currency Configuration
// ═══════════════════════════════════════════════
const PREFERRED_ORDER = ['EUR', 'USD', 'MLC', 'BTC', 'USDT', 'TRX'];

const CURRENCY_META = {
  EUR:  { name: 'Euro',              label: 'Euro',              symbol: '€', flag: '🇪🇺' },
  USD:  { name: 'Dólar',             label: 'Dólar Estadounidense', symbol: '$', flag: '🇺🇸' },
  MLC:  { name: 'MLC',               label: 'Moneda Libremente Conv.', symbol: '₱', flag: '💳' },
  BTC:  { name: 'Bitcoin',           label: 'Bitcoin',           symbol: '₿', flag: '₿' },
  USDT: { name: 'Tether',            label: 'Tether (USDT)',    symbol: 'T',  flag: '💵' },
  TRX:  { name: 'TRON',              label: 'TRON',             symbol: '⚡', flag: '⚡' },
  CAD:  { name: 'Canadiense',        label: 'Dólar Canadiense', symbol: 'C',  flag: '🇨🇦' },
  GBP:  { name: 'Libra',             label: 'Libra Esterlina',  symbol: '£',  flag: '🇬🇧' },
  ECU:  { name: 'Euro',              label: 'Euro (ECU)',       symbol: '€',  flag: '🇪🇺' },
};

const CURRENCY_NORMALIZE = {
  'ECU':        'EUR',
  'USDT_TRC20': 'USDT',
  'USDT_ERC20': 'USDT',
};

// ═══════════════════════════════════════════════
//  Default Settings
// ═══════════════════════════════════════════════
const DEFAULT_SETTINGS = {
  apiUrl:             API_URL,
  apiKey:             '',
  updateInterval:     30,
  dataSource:         'local',
  serverUrl:          '',
  autoServerUrl:      '',
  showChangeType:     'color',
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

// ═══════════════════════════════════════════════
//  Utility Functions
// ═══════════════════════════════════════════════
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function extractNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  if (typeof value === 'object' && value !== null) {
    const vals = Object.values(value).filter(x => typeof x === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return null;
}

function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_URL,
    ALARMS,
    PREFERRED_ORDER,
    CURRENCY_META,
    CURRENCY_NORMALIZE,
    DEFAULT_SETTINGS,
    deepClone,
    extractNumber,
    log,
  };
}
