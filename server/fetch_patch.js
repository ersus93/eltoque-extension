// ═══════════════════════════════════════════════
//  FETCH API
// ═══════════════════════════════════════════════

// Fetch desde servidor VPS (JSON externo)
async function fetchFromServer(serverUrl) {
  console.log('[DEBUG BG] fetchFromServer called, URL:', serverUrl);
  
  if (!serverUrl) {
    throw new Error('URL del servidor no configurada');
  }
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  
  try {
    const res = await fetch(serverUrl, { 
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    console.log('[DEBUG BG] Server data received');
    
    // Extraer tasas del formato del servidor
    const rates = data.rates || {};
    
    // Calcular cambios desde los datos del servidor
    const storageData = await chrome.storage.local.get('currentRates');
    const prevSnap = storageData.currentRates || {};
    const changes = {};
    
    for (const [cur, val] of Object.entries(rates)) {
      const prev = prevSnap[cur];
      changes[cur] = prev === undefined ? 'new'
        : val > prev ? 'up' : val < prev ? 'down' : 'neutral';
    }
    
    // También guardar datos de binance si existen
    if (data.binance) {
      await chrome.storage.local.set({ 
        binanceRates: data.binance.rates || {},
        binanceChanges: data.binance.changes || {}
      });
    }
    
    return { rates, changes, prevSnap };
    
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function fetchRates() {
  console.log('[DEBUG BG] fetchRates called');
  try {
    const { settings } = await chrome.storage.local.get('settings');
    const cfg = settings ?? DEFAULT_SETTINGS;
    cachedCfg = cfg;

    // Determinar modo de obtención de datos
    if (cfg.dataSource === 'server' && cfg.serverUrl) {
      console.log('[DEBUG BG] Using SERVER mode, URL:', cfg.serverUrl);
      try {
        const serverData = await fetchFromServer(cfg.serverUrl);
        const { rates, changes, prevSnap } = serverData;
        
        const now = new Date().toISOString();
        await chrome.storage.local.set({
          currentRates:  rates,
          previousRates: prevSnap,
          rateChanges:   changes,
          lastUpdated:   now,
          fetchError:    null,
          dataSource:    'server',
        });
        
        cachedRates   = rates;
        cachedChanges = changes;
        
        // Reiniciar rotación
        await resetRotation();
        kickInternalTimer();
        
        broadcastToTabs({ type: 'RATES_UPDATED', rates, changes, lastUpdated: now });
        return;
      } catch (serverErr) {
        console.error('[ElToque Server Mode]', serverErr.message);
        // Si falla el servidor, intentar modo local como fallback
        console.log('[DEBUG BG] Server failed, falling back to local mode');
      }
    }

    // Modo LOCAL (original)
    console.log('[DEBUG BG] Using LOCAL mode');
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
