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
  INTERVAL: 5 * 60 * 1000
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
// FETCH ELTOQUE
// ============================================
async function fetchElToque() {
  log('Consultando API de ElToque...');
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
    
    const headers = { 'Accept': 'application/json' };
    
    // Añadir API Key si está configurada
    if (CONFIG.ELTOQUE_API_KEY) {
      headers['Authorization'] = `Bearer ${CONFIG.ELTOQUE_API_KEY}`;
      log('Usando API Key de ElToque');
    }
    
    const response = await fetch(CONFIG.ELTOQUE_API, {
      signal: controller.signal,
      headers
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
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
    
  } catch (error) {
    log(`Error consultando ElToque: ${error.message}`, 'ERROR');
    return null;
  }
}

// ============================================
// FETCH BINANCE
// ============================================
async function fetchBinance() {
  log('Consultando API de Binance...');
  
  const errors = [];
  
  for (let i = 0; i < CONFIG.BINANCE_APIS.length; i++) {
    const apiUrl = CONFIG.BINANCE_APIS[i];
    
    try {
      const symbolsParam = encodeURIComponent(JSON.stringify(CONFIG.BINANCE_SYMBOLS));
      const url = `${apiUrl}?symbols=${symbolsParam}`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
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
      errors.push(`${apiUrl.split('/')[2]}: ${error.message}`);
      continue;
    }
  }
  
  log(`Error consultando Binance: ${errors.join('; ')}`, 'ERROR');
  return null;
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

// Ejecutar inmediatamente
run();

// También exportar para testing
module.exports = { fetchElToque, fetchBinance, generateRatesData, CONFIG };
