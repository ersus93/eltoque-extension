/**
 * ElToque Rate Fetcher
 * Consulta tasas de ElToque y Binance y genera JSON unificado
 * Ejecución: cada 5 minutos via systemd timer
 * 
 * Configuración:
 * - Copia .env.example a .env y configura tus valores
 * - La API key de ElToque es opcional pero recomendada para mayor límite
 */

// Cargar variables de entorno desde .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURACIÓN
// ============================================
const CONFIG = {
  // URLs de APIs
  ELTOQUE_API: process.env.ELTOQUE_API_URL || 'https://tasas.eltoque.com/v1/trmi',
  // API Key de ElToque (opcional - desde .env)
  ELTOQUE_API_KEY: process.env.ELTOQUE_API_KEY || '',
  BINANCE_APIS: [
    'https://api.binance.us/api/v3/ticker/24hr',
    'https://api.binance.com/api/v3/ticker/24hr',
    'https://api1.binance.com/api/v3/ticker/24hr',
    'https://api2.binance.com/api/v3/ticker/24hr',
    'https://api3.binance.com/api/v3/ticker/24hr'
  ],
  BINANCE_SYMBOLS: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'],
  
  // Archivo de salida
  OUTPUT_FILE: process.env.OUTPUT_FILE || '/var/www/rates.json',
  
  // Timeout para requests (ms)
  TIMEOUT: 10000,
  
  // Intervalo de actualización (ms) - 5 minutos
  INTERVAL: 5 * 60 * 1000,

  // Retry configuration
  MAX_RETRIES: 3,
  INITIAL_BACKOFF_MS: 1000,
  BACKOFF_MULTIPLIER: 2,

  // Circuit breaker configuration
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 60000
};

// Símbolos a monitorear en Binance
const BINANCE_SYMBOL_MAP = {
  'BTCUSDT': 'BTC',
  'ETHUSDT': 'ETH',
  'BNBUSDT': 'BNB',
  'SOLUSDT': 'SOL',
  'XRPUSDT': 'XRP',
  'ADAUSDT': 'ADA'
};

// ============================================
// ERROR TYPES
// ============================================
class NetworkError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

class HttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

// ============================================
// CIRCUIT BREAKER
// ============================================
class CircuitBreaker {
  constructor(name, failureThreshold, resetTimeout) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED';
  }

  canExecute() {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (this.lastFailureTime && (now - this.lastFailureTime) >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        log(`[CIRCUIT BREAKER ${this.name}] State: HALF_OPEN`, 'INFO');
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      log(`[CIRCUIT BREAKER ${this.name}] State: CLOSED`, 'INFO');
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      log(`[CIRCUIT BREAKER ${this.name}] State: OPEN (failures: ${this.failureCount})`, 'WARN');
    }
  }

  getState() {
    return this.state;
  }
}

// Circuit breakers for each API
const circuitBreakers = {
  eltoque: new CircuitBreaker(
    'ElToque',
    CONFIG.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CONFIG.CIRCUIT_BREAKER_RESET_TIMEOUT_MS
  ),
  binance: new CircuitBreaker(
    'Binance',
    CONFIG.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CONFIG.CIRCUIT_BREAKER_RESET_TIMEOUT_MS
  )
};

// ============================================
// UTILIDADES
// ============================================
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
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

// ============================================
// RETRY WITH EXPONENTIAL BACKOFF
// ============================================
async function fetchWithRetry(fetchFn, circuitBreakerName) {
  const circuitBreaker = circuitBreakers[circuitBreakerName];
  let lastError;
  
  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    if (!circuitBreaker.canExecute()) {
      log(`[RETRY] Circuit breaker OPEN for ${circuitBreakerName}, skipping request`, 'WARN');
      throw new Error(`Circuit breaker OPEN for ${circuitBreakerName}`);
    }

    try {
      const result = await fetchFn();
      circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      lastError = error;
      
      // Determine error type
      const isNetworkError = error instanceof NetworkError || 
        error.name === 'AbortError' ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('socket hang up');
      
      const isHttpError = error instanceof HttpError;
      
      log(`[RETRY] Attempt ${attempt}/${CONFIG.MAX_RETRIES} failed for ${circuitBreakerName}: ${error.message} (${isNetworkError ? 'NETWORK' : isHttpError ? 'HTTP' : 'UNKNOWN'})`, 'WARN');
      
      if (isNetworkError || isHttpError) {
        circuitBreaker.recordFailure();
      }
      
      if (attempt < CONFIG.MAX_RETRIES) {
        const backoffMs = CONFIG.INITIAL_BACKOFF_MS * Math.pow(CONFIG.BACKOFF_MULTIPLIER, attempt - 1);
        log(`[RETRY] Waiting ${backoffMs}ms before retry...`, 'INFO');
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  throw lastError;
}

// ============================================
// FETCH ELTOQUE
// ============================================
async function fetchElToqueRaw() {
  log('Consultando API de ElToque...');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
  
  const headers = { 'Accept': 'application/json' };
  
  // Añadir API Key si está configurada
  if (CONFIG.ELTOQUE_API_KEY) {
    headers['Authorization'] = `Bearer ${CONFIG.ELTOQUE_API_KEY}`;
    log('Usando API Key de ElToque');
  }
  
  let response;
  try {
    response = await fetch(CONFIG.ELTOQUE_API, {
      signal: controller.signal,
      headers
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new NetworkError('Request timeout', error);
    }
    throw new NetworkError(`Network error: ${error.message}`, error);
  }
  
  clearTimeout(timeout);
  
  if (!response.ok) {
    throw new HttpError(`HTTP ${response.status}`, response.status);
  }
  
  const raw = await response.json();
  const rates = {};
  
  // Procesar respuesta
  if (raw.tasas && typeof raw.tasas === 'object') {
    for (const [key, value] of Object.entries(raw.tasas)) {
      const num = extractNumber(value);
      if (num !== null) {
        // Normalizar claves
        let normalizedKey = key.toUpperCase();
        if (normalizedKey === 'ECU') normalizedKey = 'EUR';
        if (normalizedKey.startsWith('USDT_')) normalizedKey = 'USDT';
        rates[normalizedKey] = num;
      }
    }
  } else if (raw.rates && typeof raw.rates === 'object') {
    for (const [key, value] of Object.entries(raw.rates)) {
      const num = extractNumber(value);
      if (num !== null) {
        rates[key.toUpperCase()] = num;
      }
    }
  }
  
  log(`ElToque: ${Object.keys(rates).length} tasas obtenidas`);
  return rates;
}

async function fetchElToque() {
  try {
    return await fetchWithRetry(fetchElToqueRaw, 'eltoque');
  } catch (error) {
    const errorType = error instanceof NetworkError ? 'NETWORK' : error instanceof HttpError ? 'HTTP' : 'UNKNOWN';
    log(`Error consultando ElToque (${errorType}): ${error.message}`, 'ERROR');
    return null;
  }
}

// ============================================
// FETCH BINANCE
// ============================================
async function fetchBinanceRaw() {
  log('Consultando API de Binance...');
  
  const errors = [];
  
  for (let i = 0; i < CONFIG.BINANCE_APIS.length; i++) {
    const apiUrl = CONFIG.BINANCE_APIS[i];
    
    try {
      const symbolsParam = encodeURIComponent(JSON.stringify(CONFIG.BINANCE_SYMBOLS));
      const url = `${apiUrl}?symbols=${symbolsParam}`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
      
      let response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
          throw new NetworkError('Request timeout', error);
        }
        throw new NetworkError(`Network error: ${error.message}`, error);
      }
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new HttpError(`HTTP ${response.status}`, response.status);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        throw new Error('Respuesta inválida');
      }
      
      // Procesar datos
      const rates = {};
      const changes = {};
      
      for (const item of data) {
        const symbol = item.symbol;
        const baseAsset = BINANCE_SYMBOL_MAP[symbol];
        
        if (baseAsset) {
          rates[baseAsset] = parseFloat(item.lastPrice);
          changes[baseAsset] = {
            priceChange: parseFloat(item.priceChange),
            priceChangePercent: parseFloat(item.priceChangePercent),
            high24h: parseFloat(item.highPrice),
            low24h: parseFloat(item.lowPrice),
            volume: parseFloat(item.volume),
            quoteVolume: parseFloat(item.quoteVolume)
          };
        }
      }
      
      log(`Binance: ${Object.keys(rates).length} precios obtenidos`);
      return { rates, changes };
      
    } catch (error) {
      const isNetworkError = error instanceof NetworkError || error instanceof HttpError;
      errors.push(`${apiUrl.split('/')[2]}: ${error.message}${isNetworkError ? '' : ' (non-HTTP/non-network)'}`);
      continue;
    }
  }
  
  throw new NetworkError(`All Binance APIs failed: ${errors.join('; ')}`, new Error(errors.join('; ')));
}

async function fetchBinance() {
  try {
    return await fetchWithRetry(fetchBinanceRaw, 'binance');
  } catch (error) {
    const errorType = error instanceof NetworkError ? 'NETWORK' : error instanceof HttpError ? 'HTTP' : 'UNKNOWN';
    log(`Error consultando Binance (${errorType}): ${error.message}`, 'ERROR');
    return null;
  }
}

// ============================================
// GENERAR JSON UNIFICADO
// ============================================
async function generateRatesData() {
  log('Generando datos de tasas...');
  
  const [eltoqueData, binanceData] = await Promise.all([
    fetchElToque(),
    fetchBinance()
  ]);
  
  const now = new Date().toISOString();
  
  const result = {
    // Metadatos
    updated: now,
    source: 'server-fetcher',
    version: '1.0.0',
    
    // Tasas de ElToque (mercado informal cubano)
    eltoque: {
      rates: eltoqueData || {},
      // Calcular cambios comparando con archivo anterior
      changes: {}
    },
    
    // Tasas de Binance (criptomonedas)
    binance: {
      rates: binanceData?.rates || {},
      changes: binanceData?.changes || {}
    },
    
    // Tasas combinadas para compatibilidad con extensión
    rates: {
      ...(eltoqueData || {}),
      ...(binanceData?.rates || {})
    },
    
    // Cambios combinados
    changes: {}
  };
  
  // Cargar datos anteriores para calcular cambios
  try {
    if (fs.existsSync(CONFIG.OUTPUT_FILE)) {
      const previousData = JSON.parse(fs.readFileSync(CONFIG.OUTPUT_FILE, 'utf8'));
      
      // Calcular cambios para ElToque
      if (eltoqueData && previousData.eltoque?.rates) {
        for (const [currency, value] of Object.entries(eltoqueData)) {
          const prevValue = previousData.eltoque.rates[currency];
          if (prevValue !== undefined) {
            if (value > prevValue) {
              result.eltoque.changes[currency] = 'up';
              result.changes[currency] = 'up';
            } else if (value < prevValue) {
              result.eltoque.changes[currency] = 'down';
              result.changes[currency] = 'down';
            } else {
              result.eltoque.changes[currency] = 'neutral';
              result.changes[currency] = 'neutral';
            }
          } else {
            result.eltoque.changes[currency] = 'new';
            result.changes[currency] = 'new';
          }
        }
      }
      
      // Para Binance, los cambios ya vienen de la API
      if (binanceData?.rates && previousData.binance?.rates) {
        for (const [currency, value] of Object.entries(binanceData.rates)) {
          const prevValue = previousData.binance.rates[currency];
          if (prevValue !== undefined) {
            const change = binanceData.changes?.[currency];
            if (change?.priceChangePercent > 0.1) {
              result.binance.changes[currency] = 'up';
              result.changes[currency] = 'up';
            } else if (change?.priceChangePercent < -0.1) {
              result.binance.changes[currency] = 'down';
              result.changes[currency] = 'down';
            } else {
              result.binance.changes[currency] = 'neutral';
              result.changes[currency] = 'neutral';
            }
          } else {
            result.binance.changes[currency] = 'new';
            result.changes[currency] = 'new';
          }
        }
      }
    }
  } catch (error) {
    log(`Error leyendo datos anteriores: ${error.message}`, 'WARN');
  }
  
  return result;
}

// ============================================
// GUARDAR DATOS
// ============================================
async function saveRatesData(data) {
  try {
    // Crear directorio si no existe
    const dir = path.dirname(CONFIG.OUTPUT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Escribir archivo
    const jsonContent = JSON.stringify(data, null, 2);
    fs.writeFileSync(CONFIG.OUTPUT_FILE, jsonContent, 'utf8');
    
    log(`Datos guardados en: ${CONFIG.OUTPUT_FILE}`);
    return true;
    
  } catch (error) {
    log(`Error guardando datos: ${error.message}`, 'ERROR');
    return false;
  }
}

// ============================================
// CICLO PRINCIPAL
// ============================================
async function run() {
  log('=== Iniciando Rate Fetcher ===');
  
  try {
    const data = await generateRatesData();
    const saved = await saveRatesData(data);
    
    if (saved) {
      log('Ciclo completado exitosamente');
    } else {
      log('Error en el ciclo', 'ERROR');
      process.exit(1);
    }
    
  } catch (error) {
    log(`Error fatal: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

// Handle uncaught errors in async operations
process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Promise Rejection: ${reason}`, 'ERROR');
  process.exit(1);
});

// Ejecutar inmediatamente
run().catch(error => {
  log(`Error en run(): ${error.message}`, 'ERROR');
  process.exit(1);
});

// También exportar para testing
module.exports = { fetchElToque, fetchBinance, generateRatesData, saveRatesData, run, CONFIG, CircuitBreaker, NetworkError, HttpError };
