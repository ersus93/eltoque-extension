// ═══════════════════════════════════════════════
//  ElToque Tasas — New Tab Page
// ═══════════════════════════════════════════════

'use strict';

/* ═══════════════════════════════════════════
   UTILS
═════════════════════════════════════════════ */
function $(id){ return document.getElementById(id); }

function fmtCUP(v) {
  if (v == null || isNaN(v)) return '—';
  if (v >= 1000000) return (v/1000000).toFixed(1)+'M';
  if (v >= 100000)  return Math.round(v/1000)+'k';
  if (v >= 10000)   return (v/1000).toFixed(1)+'k';
  if (v >= 1000)    return v.toLocaleString('es',{maximumFractionDigits:0});
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

function fmtUSD(v) {
  if (v == null || isNaN(v)) return '—';
  if (v >= 100000) return '$'+Math.round(v/1000)+'k';
  if (v >= 10000)  return '$'+(v/1000).toFixed(1)+'k';
  if (v >= 1000)   return '$'+v.toLocaleString('en',{maximumFractionDigits:0});
  if (v >= 1)      return '$'+v.toFixed(2);
  return '$'+v.toFixed(4);
}

function szClass(s){
  var l = String(s).length;
  return l >= 7 ? 'sz7' : l >= 6 ? 'sz6' : l >= 5 ? 'sz5' : 'sz4';
}

function timeFmt(d) {
  return d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
}

/* ═══════════════════════════════════════════
   CLOCK
═════════════════════════════════════════════ */
var DAYS   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
var MFULL  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
var MSHRT  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function tickClock() {
  var now = new Date();
  $('clock').textContent    = now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
  $('dateStr').textContent  = DAYS[now.getDay()]+', '+now.getDate()+' de '+MFULL[now.getMonth()]+' de '+now.getFullYear();
  $('footUpd').textContent  = 'actualizado '+now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(tickClock, 1000);
tickClock();

/* ═══════════════════════════════════════════
   YEAR PROGRESS
═════════════════════════════════════════════ */
function renderYear() {
  var now   = new Date();
  var yr    = now.getFullYear();
  var start = new Date(yr,0,1);
  var end   = new Date(yr+1,0,1);
  var total = (end - start) / 86400000;
  var past  = (now - start)  / 86400000;
  var pct   = (past / total) * 100;

  $('ywYear').textContent    = yr;
  $('ywPct').innerHTML       = pct.toFixed(1)+'%';
  $('pfill').style.width     = pct.toFixed(3)+'%';
  $('yDaysPast').textContent = Math.floor(past);
  $('yDaysLeft').textContent = Math.ceil(total - past);
  $('yWeeks').textContent    = Math.ceil((total - past)/7);

  var ticks = $('mticks'); ticks.innerHTML = '';
  var curM  = now.getMonth();
  for (var i = 0; i < 12; i++) {
    var d = document.createElement('div');
    d.className = 'mtick' + (i < curM ? ' past' : i === curM ? ' now' : '');
    d.textContent = MSHRT[i];
    ticks.appendChild(d);
  }
}
renderYear();
setInterval(renderYear, 60000);

/* ═══════════════════════════════════════════
   SEARCH
═════════════════════════════════════════════ */
function doSearch(q) {
  if (!q || !q.trim()) return;
  location.href = 'https://www.google.com/search?q=' + encodeURIComponent(q.trim());
}

$('searchInput').addEventListener('keydown', function(e){
  if (e.key === 'Enter') doSearch(this.value);
});
$('searchBtn').addEventListener('click', function(){
  doSearch($('searchInput').value);
});
document.querySelectorAll('.hint').forEach(function(b){
  b.addEventListener('click', function(){ doSearch(b.dataset.q); });
});

/* ═══════════════════════════════════════════
   ELTOQUE DATA
═════════════════════════════════════════════ */
var ET_ORDER = ['EUR','USD','MLC','BTC','USDT','TRX'];
var ET_META  = {
  EUR: { name:'Euro',    ico:'🇪🇺' },
  USD: { name:'Dólar',   ico:'🇺🇸' },
  MLC: { name:'MLC',     ico:'🇨🇺' },
  BTC: { name:'Bitcoin', ico:'₿'   },
  USDT:{ name:'Tether',  ico:'💵'  },
  TRX: { name:'TRON',    ico:'⚡'  },
};

var etRates={}, etChanges={}, etChangesAbs={}, etSettings={};

// Fallback: direct fetch from API if storage is empty
async function fetchDirectFromAPI() {
  console.log('[DEBUG] fetchDirectFromAPI called');
  try {
    var API_URL = 'https://tasas.eltoque.com/v1/trmi';
    var res = await fetch(API_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var raw = await res.json();
    
    // Parse rates
    var rates = {};
    if (raw.tasas) {
      for (var k in raw.tasas) {
        var v = raw.tasas[k];
        if (typeof v === 'number') rates[k.toUpperCase()] = v;
        else if (typeof v === 'object' && v !== null) {
          var vals = Object.values(v).filter(function(x){ return typeof x === 'number'; });
          if (vals.length) rates[k.toUpperCase()] = vals.reduce(function(a,b){ return a+b; }, 0) / vals.length;
        }
      }
    }
    
    console.log('[DEBUG] Direct fetch rates:', rates);
    return rates;
  } catch(e) {
    console.log('[DEBUG] Direct fetch error:', e);
    return null;
  }
}

function loadEtData() {
  console.log('[DEBUG] loadEtData called');
  if (!window.chrome || !chrome.storage) {
    console.log('[DEBUG] No chrome.storage - trying direct fetch');
    fetchDirectFromAPI().then(function(rates){
      if (rates && Object.keys(rates).length > 0) {
        etRates = rates;
        etChanges = {};
        Object.keys(rates).forEach(function(k){ etChanges[k] = 'new'; });
        renderEtGrid();
        renderTicker();
      } else {
        showEtErr('No se pudieron cargar los datos');
      }
    });
    return;
  }
  chrome.storage.local.get(
    ['currentRates','rateChanges','rateChangesAbs','settings','lastUpdated','fetchError'],
    function(data){
      console.log('[DEBUG] Storage data received:', data);
      if (chrome.runtime.lastError) {
        console.log('[DEBUG] Chrome runtime error:', chrome.runtime.lastError);
        showEtErr(chrome.runtime.lastError.message);
        return;
      }
      etSettings     = data.settings      || {};
      etRates        = data.currentRates  || {};
      etChanges      = data.rateChanges   || {};
      etChangesAbs   = data.rateChangesAbs || {};

      console.log('[DEBUG] etRates:', etRates, 'etChanges:', etChanges);

      if (Object.keys(etRates).length === 0) {
        console.log('[DEBUG] No rates, sending FETCH_NOW message');
        try { chrome.runtime.sendMessage({type:'FETCH_NOW'}, function(){}); } catch(e){
          console.log('[DEBUG] Error sending message:', e);
        }
        showEtErr('Cargando datos…');
      } else {
        renderEtGrid();
      }

      if (data.lastUpdated) {
        $('etUpd').textContent = timeFmt(new Date(data.lastUpdated));
      }

      if (data.fetchError) {
        console.log('[DEBUG] Fetch error:', data.fetchError);
      }

      applyTheme();
      renderTicker();
    }
  );
}

function showEtErr(msg) {
  $('etGrid').innerHTML = '<div class="pnl-err">'+msg+'</div>';
}

function applyTheme() {
  var r = document.documentElement;
  if (etSettings.colorUp)   r.style.setProperty('--up',   etSettings.colorUp);
  if (etSettings.colorDown) r.style.setProperty('--dn',   etSettings.colorDown);
}

function renderEtGrid() {
  var grid = $('etGrid');
  var order = (etSettings.currencyOrder && etSettings.currencyOrder.length)
    ? etSettings.currencyOrder : ET_ORDER;
  var sel = etSettings.selectedCurrencies || [];
  
  // Obtener tipo de cambio a mostrar
  var showChangeType = etSettings.showChangeType || 'color';

  var keys = Object.keys(etRates).sort(function(a,b){
    var ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia<0&&ib<0) return a.localeCompare(b);
    if (ia<0) return 1; if (ib<0) return -1;
    return ia-ib;
  });
  if (sel.length) keys = keys.filter(function(k){return sel.indexOf(k)>=0;});
  keys = keys.slice(0,6);

  if (keys.length === 0) { showEtErr('Sin datos de tasas'); return; }

  grid.innerHTML = '';
  keys.forEach(function(cur) {
    var val    = etRates[cur];
    var ch     = etChanges[cur] || 'neutral';
    var abs    = etChangesAbs[cur] || { diff: 0, pctChange: 0 };
    var cls    = ch==='up'?'up':ch==='down'?'dn':'neu';
    var meta   = ET_META[cur] || {name:cur, ico:'💱'};
    var price  = fmtCUP(val);
    var arrow  = ch==='up'?'▲':ch==='down'?'▼':'—';
    
    // Determinar qué mostrar según configuración
    var changeDisplay = '';
    if (showChangeType === 'amount') {
      // Mostrar cantidad absoluta
      if (ch === 'up') changeDisplay = '+' + fmtCUP(abs.diff);
      else if (ch === 'down') changeDisplay = '-' + fmtCUP(Math.abs(abs.diff));
      else changeDisplay = '—';
    } else if (showChangeType === 'percentage') {
      // Mostrar porcentaje
      if (ch === 'up') changeDisplay = '+' + abs.pctChange.toFixed(2) + '%';
      else if (ch === 'down') changeDisplay = abs.pctChange.toFixed(2) + '%';
      else changeDisplay = '—';
    } else {
      // Solo color/flecha (original)
      changeDisplay = arrow;
    }
    
    var card   = document.createElement('div');
    card.className = 'rcard '+cls;
    card.dataset.cur = cur;
    card.innerHTML   =
      '<div class="rcard-top">' +
        '<span class="rcard-sym">'+cur+'</span>' +
        '<span class="rcard-ico">'+meta.ico+'</span>' +
      '</div>' +
      '<div class="rcard-val '+szClass(price)+'">'+price+'</div>' +
      '<div class="rcard-unit">CUP</div>' +
      '<div class="rcard-bot">' +
        '<span class="rcard-name">'+meta.name+'</span>' +
        '<span class="rcard-pct">'+changeDisplay+'</span>' +
      '</div>';
    grid.appendChild(card);
  });
}

/* ═══════════════════════════════════════════
   BINANCE — multi-API fallback
═════════════════════════════════════════════ */
var BN_APIS = [
  'https://api.binance.us/api/v3/ticker/24hr',
  'https://api.binance.com/api/v3/ticker/24hr',
  'https://api1.binance.com/api/v3/ticker/24hr',
  'https://api2.binance.com/api/v3/ticker/24hr',
  'https://api3.binance.com/api/v3/ticker/24hr'
];
var BN_SYMBOLS = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT'];
var BN_META = {
  BTC: { name:'Bitcoin',  ico:'₿'  },
  ETH: { name:'Ethereum', ico:'Ξ'  },
  BNB: { name:'BNB',      ico:'🟡' },
  SOL: { name:'Solana',   ico:'◎'  },
  XRP: { name:'XRP',      ico:'✕'  },
  ADA: { name:'Cardano',  ico:'₳'  },
};
var bnData  = [];
var bnApiIdx = 0;

async function fetchBinance() {
  var symsParam = encodeURIComponent(JSON.stringify(BN_SYMBOLS));
  var errors = [];

  var order = [];
  for (var i = 0; i < BN_APIS.length; i++) {
    order.push((bnApiIdx + i) % BN_APIS.length);
  }

  for (var j = 0; j < order.length; j++) {
    var idx = order[j];
    var url = BN_APIS[idx] + '?symbols=' + symsParam;
    try {
      var controller = new AbortController();
      var tid = setTimeout(function(){ controller.abort(); }, 5000);
      var res = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) throw new Error('HTTP '+res.status);
      var data = await res.json();
      if (!Array.isArray(data)) throw new Error('bad response');
      bnApiIdx = idx;
      $('bnSource').textContent = 'live · api'+(idx+1);
      return data;
    } catch(e) {
      errors.push(BN_APIS[idx].split('/')[2]+': '+e.message);
    }
  }
  throw new Error('Todos los endpoints fallaron: '+errors.join('; '));
}

async function loadBinance() {
  try {
    var raw = await fetchBinance();
    bnData = raw.map(function(item){
      var sym = item.symbol.replace('USDT','');
      return {
        sym:   sym,
        price: parseFloat(item.lastPrice),
        pct:   parseFloat(item.priceChangePercent),
      };
    });
    $('bnUpd').textContent = timeFmt(new Date());
    renderBnGrid();
    renderTicker();
  } catch(e) {
    $('bnGrid').innerHTML = '<div class="pnl-err">'+e.message+'<br><small>Reintentando en 30s…</small></div>';
  }
}

function renderBnGrid() {
  var grid = $('bnGrid');
  if (!bnData.length) { grid.innerHTML='<div class="pnl-err">Sin datos</div>'; return; }
  grid.innerHTML = '';
  bnData.slice(0,6).forEach(function(item){
    var meta  = BN_META[item.sym] || {name:item.sym, ico:'🪙'};
    var cls   = item.pct > 0.1 ? 'up' : item.pct < -0.1 ? 'dn' : 'neu';
    var price = fmtUSD(item.price);
    var sign  = item.pct > 0 ? '+' : '';
    var card  = document.createElement('div');
    card.className = 'rcard '+cls;
    card.innerHTML =
      '<div class="rcard-top">' +
        '<span class="rcard-sym">'+item.sym+'</span>' +
        '<span class="rcard-ico">'+meta.ico+'</span>' +
      '</div>' +
      '<div class="rcard-val '+szClass(price)+'">'+price+'</div>' +
      '<div class="rcard-unit" style="color:var(--binance)">USDT</div>' +
      '<div class="rcard-bot">' +
        '<span class="rcard-name">'+meta.name+'</span>' +
        '<span class="rcard-pct">'+sign+item.pct.toFixed(2)+'%</span>' +
      '</div>';
    grid.appendChild(card);
  });
}

/* ═══════════════════════════════════════════
   TICKER — ElToque + Binance combined
═════════════════════════════════════════════ */
function renderTicker() {
  var strip = $('tickerStrip');
  if (!strip) return; // Safety check - element might not exist
  var items  = [];
  var order  = (etSettings.currencyOrder && etSettings.currencyOrder.length)
    ? etSettings.currencyOrder : ET_ORDER;

  var etKeys = Object.keys(etRates).sort(function(a,b){
    var ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia<0&&ib<0) return a.localeCompare(b);
    if (ia<0) return 1; if (ib<0) return -1;
    return ia-ib;
  });
  etKeys.forEach(function(cur){
    var val = etRates[cur]; if (val==null) return;
    var ch  = etChanges[cur]||'neutral';
    var cls = ch==='up'?'up':ch==='down'?'dn':'neu';
    var arr = ch==='up'?'▲':ch==='down'?'▼':'—';
    items.push(
      '<span class="ti '+cls+'">' +
        '<span class="tsrc">CUP</span>' +
        '<span class="tcur">'+cur+'</span>' +
        '<span class="tval">'+fmtCUP(val)+'</span>' +
        '<span class="tunit">CUP</span>' +
        '<span class="tarr">'+arr+'</span>' +
      '</span><span class="tsep">·</span>'
    );
  });

  if (items.length && bnData.length) {
    items.push('<span class="tsep" style="padding:0 18px;opacity:.35;font-size:9px;letter-spacing:.15em">BINANCE</span>');
  }

  bnData.forEach(function(item){
    var cls = item.pct>0.1?'up':item.pct<-0.1?'dn':'neu';
    var arr = item.pct>0.1?'▲':item.pct<-0.1?'▼':'—';
    items.push(
      '<span class="ti '+cls+' bnc">' +
        '<span class="tsrc">BNC</span>' +
        '<span class="tcur">'+item.sym+'</span>' +
        '<span class="tval">'+fmtUSD(item.price)+'</span>' +
        '<span class="tunit">$</span>' +
        '<span class="tarr">'+arr+'</span>' +
      '</span><span class="tsep">·</span>'
    );
  });

  if (!items.length) return;

  var html = items.join('');
  strip.innerHTML = html + html;

  var dur = Math.max(20, items.length * 3.2);
  strip.style.animationDuration = dur+'s';
  document.documentElement.style.setProperty('--td', dur+'s');
}

/* ═══════════════════════════════════════════
   BUTTONS
═════════════════════════════════════════════ */
$('btnRefresh').addEventListener('click', function(){
  $('btnRefresh').textContent = '⏳';
  $('btnRefresh').disabled = true;
  var btn = $('btnRefresh');
  try {
    chrome.runtime.sendMessage({type:'FETCH_NOW'}, function(){});
  } catch(e){}
  loadBinance().finally(function(){
    setTimeout(function(){
      loadEtData();
      btn.textContent = '↻ Actualizar';
      btn.disabled    = false;
    }, 1200);
  });
});

$('btnSettings').addEventListener('click', function(){
  try { chrome.runtime.openOptionsPage(); } catch(e){}
});

/* ═══════════════════════════════════════════
   THEME TOGGLE
════════════════════════════════════════════ */
function applyStoredTheme() {
  if (!window.chrome || !chrome.storage) return;
  chrome.storage.local.get(['settings'], function(data) {
    var theme = data.settings?.pageTheme || 'auto';
    setTheme(theme);
  });
}

function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
  var r = document.documentElement;
  document.querySelectorAll('.theme-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  
  if (theme === 'auto') {
    // Usar tema del sistema
    var systemTheme = getSystemTheme();
    if (systemTheme === 'light') {
      r.classList.add('light');
    } else {
      r.classList.remove('light');
    }
  } else if (theme === 'light') {
    r.classList.add('light');
  } else {
    r.classList.remove('light');
  }
  
  // Guardar preferencia
  if (window.chrome && chrome.storage) {
    chrome.storage.local.get(['settings'], function(data) {
      var settings = data.settings || {};
      settings.pageTheme = theme;
      chrome.storage.local.set({ settings: settings });
    });
  }
}

document.querySelectorAll('.theme-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var theme = btn.dataset.theme;
    setTheme(theme);
    if (window.chrome && chrome.storage) {
      chrome.storage.local.get(['settings'], function(data) {
        var settings = data.settings || {};
        settings.pageTheme = theme;
        chrome.storage.local.set({ settings: settings });
      });
    }
  });
});

applyStoredTheme();

// Listener para cambios del tema del sistema cuando está en modo automático
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    chrome.storage.local.get(['settings'], function(data) {
      var theme = data.settings?.pageTheme || 'auto';
      if (theme === 'auto') {
        setTheme('auto');
      }
    });
  });
}

/* ═══════════════════════════════════════════
   LIVE UPDATES from storage
═════════════════════════════════════════════ */
if (window.chrome && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener(function(changes){
    if (changes.currentRates || changes.rateChanges || changes.lastUpdated) {
      loadEtData();
    }
  });
}

/* ═══════════════════════════════════════════
   INIT
═════════════════════════════════════════════ */
loadEtData();
loadBinance();

// Refresh Binance every 30 seconds
setInterval(loadBinance, 30000);

// Handle hash from omnibox
var hash = location.hash.slice(1).toUpperCase();
if (hash) {
  setTimeout(function(){
    var el = document.querySelector('[data-cur="'+hash+'"]');
    if (el) {
      el.scrollIntoView({behavior:'smooth',block:'center'});
      el.style.outline = '2px solid var(--accent)';
      setTimeout(function(){ el.style.outline=''; }, 2500);
    }
  }, 700);
}

/* ═══════════════════════════════════════════
   BOOKMARKS BAR - Barra de favoritos
═══════════════════════════════════════════ */
var bookmarksData = {}; // Cache for bookmark children

function getFavicon(url) {
  try {
    var parsed = new URL(url);
    return 'https://www.google.com/s2/favicons?domain=' + parsed.hostname + '&sz=32';
  } catch(e) {
    return '';
  }
}

function renderBookmarkItem(item) {
  if (item.url) {
    var favicon = getFavicon(item.url);
    var title = item.title.length > 18 ? item.title.substring(0, 18) + '...' : item.title;
    return '<a class="bm-item" href="' + item.url + '" target="_blank" rel="noopener" title="' + item.title + '">' +
      (favicon ? '<img src="' + favicon + '" width="14" height="14" style="border-radius:2px">' : '') +
      '<span>' + title + '</span></a>';
  }
  return '';
}

function renderBookmarkFolder(item) {
  if (!item.children || item.children.length === 0) return '';
  
  // Store children in cache
  bookmarksData[item.id] = item.children;
  
  var title = item.title.length > 12 ? item.title.substring(0, 12) + '...' : item.title;
  var count = item.children.length;
  
  return '<div class="bm-folder-wrapper">' +
    '<div class="bm-item bm-folder" data-folder="' + item.id + '" title="' + item.title + ' (' + count + ' elementos)">' +
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>' +
      '<span>' + title + '</span>' +
    '</div>' +
    '<div class="bm-dropdown" id="bm-drop-' + item.id + '"></div>' +
  '</div>';
}

function loadBookmarks() {
  var container = document.getElementById('bookmarksContent');
  if (!container) {
    console.log('[Bookmarks] Container not found');
    return;
  }
  
  // Check if chrome.bookmarks is available
  if (!window.chrome || !chrome.bookmarks) {
    container.innerHTML = '<span class="bm-empty">Favoritos no disponibles</span>';
    return;
  }
  
  chrome.bookmarks.getTree(function(nodes) {
    if (chrome.runtime.lastError) {
      container.innerHTML = '<span class="bm-empty">Error: ' + chrome.runtime.lastError.message + '</span>';
      return;
    }
    
    if (!nodes || !nodes[0] || !nodes[0].children) {
      container.innerHTML = '<span class="bm-empty">Sin favoritos</span>';
      return;
    }
    
    var root = nodes[0];
    var children = root.children;
    
    // Find Bookmark Bar folder
    var bookmarkBar = null;
    for (var i = 0; i < children.length; i++) {
      if (children[i].title === 'Bookmark Bar' || children[i].title === 'Barra de favoritos') {
        bookmarkBar = children[i];
        break;
      }
    }
    
    var items = bookmarkBar && bookmarkBar.children ? bookmarkBar.children : children;
    
    if (!items || items.length === 0) {
      container.innerHTML = '<span class="bm-empty">Sin favoritos</span>';
      return;
    }
    
    // Render bookmarks and folders
    var html = '';
    var maxItems = 25;
    var count = 0;
    
    for (var j = 0; j < items.length && count < maxItems; j++) {
      var item = items[j];
      
      if (item.url) {
        html += renderBookmarkItem(item);
        count++;
      } else if (item.children && item.children.length > 0) {
        html += renderBookmarkFolder(item);
        count++;
      }
    }
    
    if (!html) {
      container.innerHTML = '<span class="bm-empty">Sin favoritos</span>';
      return;
    }
    
    container.innerHTML = html;
    
    // Mover todos los dropdowns al body para evitar el clipping del overflow del bookmarksBar
    container.querySelectorAll('.bm-dropdown').forEach(function(dd) {
      document.body.appendChild(dd);
    });
    
    // Attach click events to folders
    var folders = container.querySelectorAll('.bm-folder');
    
    for (var f = 0; f < folders.length; f++) {
      (function(folder) {
        folder.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          
          var folderId = folder.getAttribute('data-folder');
          var dropdown = document.getElementById('bm-drop-' + folderId);
          if (!dropdown) return;
          
          // Close other dropdowns
          document.querySelectorAll('.bm-dropdown.show').forEach(function(d) {
            if (d !== dropdown) d.classList.remove('show');
          });
          
          // Toggle current
          if (dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
          } else {
            // Populate dropdown if empty
            if (dropdown.innerHTML.trim() === '') {
              var childs = bookmarksData[folderId];
              if (childs && childs.length > 0) {
                var dropHtml = '';
                for (var c = 0; c < childs.length; c++) {
                  var child = childs[c];
                  if (child.url) {
                    var fav = getFavicon(child.url);
                    dropHtml += '<a class="bm-dropdown-item" href="' + child.url + '" target="_blank" rel="noopener">';
                    if (fav) dropHtml += '<img src="' + fav + '">';
                    dropHtml += '<span>' + child.title + '</span></a>';
                  } else if (child.children) {
                    // Sub-carpeta: mostrar como título de sección
                    dropHtml += '<div class="bm-dropdown-sep">' + child.title + '</div>';
                  }
                }
                dropdown.innerHTML = dropHtml || '<div style="padding:8px 14px;color:var(--text3);font-size:11px">Carpeta vacía</div>';
              }
            }
            
            // Posicionar el dropdown usando coordenadas fijas (evita el clipping del overflow)
            var rect = folder.getBoundingClientRect();
            dropdown.style.top  = (rect.bottom + 4) + 'px';
            dropdown.style.left = rect.left + 'px';
            
            // Ajustar si se sale por la derecha de la ventana
            dropdown.classList.add('show');
            var ddRect = dropdown.getBoundingClientRect();
            if (ddRect.right > window.innerWidth - 8) {
              dropdown.style.left = (window.innerWidth - ddRect.width - 8) + 'px';
            }
            // Ajustar si se sale por abajo de la ventana
            ddRect = dropdown.getBoundingClientRect();
            if (ddRect.bottom > window.innerHeight - 8) {
              // Mostrarlo hacia arriba del botón
              dropdown.style.top = (rect.top - ddRect.height - 4) + 'px';
            }
          }
        };
      })(folders[f]);
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.bm-folder-wrapper') && !e.target.closest('.bm-dropdown')) {
        document.querySelectorAll('.bm-dropdown.show').forEach(function(d) {
          d.classList.remove('show');
        });
      }
    });
    
    console.log('[Bookmarks] Loaded successfully');
  });
}

// Load bookmarks when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadBookmarks);
} else {
  loadBookmarks();
}

/* ═══════════════════════════════════════════
   LIQUID GLASS — Animación de turbulencia
   Solo anima baseFrequency — la estructura del filtro (erode/rim)
   permanece estática. Efecto: vidrio vivo, respirando lentamente.
═══════════════════════════════════════════ */
(function() {
  var turb   = document.getElementById('lg-turb');
  var turbSm = document.getElementById('lg-turb-sm');
  if (!turb && !turbSm) return;
  var t = 0;
  function animLiquid() {
    t += 0.0018; // muy lento — como vidrio real moviéndose con calor
    if (turb) {
      var f1 = (0.016 + Math.sin(t * 0.50) * 0.0015).toFixed(5);
      var f2 = (0.012 + Math.cos(t * 0.38) * 0.0012).toFixed(5);
      turb.setAttribute('baseFrequency', f1 + ' ' + f2);
    }
    if (turbSm) {
      var s1 = (0.018 + Math.sin(t * 0.60 + 1.0) * 0.0014).toFixed(5);
      var s2 = (0.014 + Math.cos(t * 0.70 + 2.0) * 0.0012).toFixed(5);
      turbSm.setAttribute('baseFrequency', s1 + ' ' + s2);
    }
    requestAnimationFrame(animLiquid);
  }
  animLiquid();
})();
