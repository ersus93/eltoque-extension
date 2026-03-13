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
  $('ywPct').innerHTML       = pct.toFixed(1)+'<small>%</small>';
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

var etRates={}, etChanges={}, etSettings={};

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
    ['currentRates','rateChanges','settings','lastUpdated','fetchError'],
    function(data){
      console.log('[DEBUG] Storage data received:', data);
      if (chrome.runtime.lastError) {
        console.log('[DEBUG] Chrome runtime error:', chrome.runtime.lastError);
        showEtErr(chrome.runtime.lastError.message);
        return;
      }
      etSettings = data.settings     || {};
      etRates    = data.currentRates || {};
      etChanges  = data.rateChanges  || {};

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
    var cls    = ch==='up'?'up':ch==='down'?'dn':'neu';
    var meta   = ET_META[cur] || {name:cur, ico:'💱'};
    var price  = fmtCUP(val);
    var arrow  = ch==='up'?'▲':ch==='down'?'▼':'—';
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
        '<span class="rcard-pct">'+arrow+'</span>' +
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
  var strip  = $('tickerStrip');
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
