// ═══════════════════════════════════════════════
//  ElToque Tasas — Content Script v2
//  Overlay flotante en páginas web
// ═══════════════════════════════════════════════

(function () {
  'use strict';
  if (document.getElementById('eltoque-overlay-root')) return;

  const PREFERRED_ORDER = ['EUR', 'USD', 'MLC', 'BTC', 'USDT', 'TRX'];

  let overlayEl = null;
  let settings  = {};
  let rates     = {};
  let changes   = {};
  let changesAbs = {};

  async function init() {
    const data = await chrome.storage.local.get(['settings', 'currentRates', 'rateChanges', 'rateChangesAbs']);
    settings    = data.settings ?? {};
    rates       = data.currentRates ?? {};
    changes     = data.rateChanges ?? {};
    changesAbs  = data.rateChangesAbs ?? {};
    if (settings.overlayEnabled) createOverlay();
  }

  function getSorted() {
    const order    = settings.currencyOrder?.length ? settings.currencyOrder : PREFERRED_ORDER;
    const selected = settings.selectedCurrencies ?? [];
    const all      = Object.keys(rates);
    const sorted   = [...all].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return selected.length > 0 ? sorted.filter(c => selected.includes(c)) : sorted;
  }

  function fmtCUP(val) {
    if (val === undefined || val === null || isNaN(val)) return '0';
    if (Math.abs(val) >= 1000) return val.toLocaleString('es-CU', { maximumFractionDigits: 0 });
    return val.toFixed(1);
  }

  function createOverlay() {
    if (overlayEl) return;

    try {
      const pos     = settings.overlayPosition ?? 'top';
      const h       = settings.overlayHeight   ?? 28;
      const opacity = settings.overlayOpacity  ?? 0.95;
      const zIndex  = settings.overlayZIndex   ?? 999999;
      const isDark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const bg      = isDark ? `rgba(10,10,24,${opacity})` : `rgba(240,240,250,${opacity})`;
      const border  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

      // Inject keyframes once
      if (!document.getElementById('eltoque-kf')) {
        const style = document.createElement('style');
        style.id = 'eltoque-kf';
        style.textContent = `
          @keyframes eltoque-h{from{transform:translateX(0)}to{transform:translateX(-50%)}}
          @keyframes eltoque-v{from{transform:translateY(0)}to{transform:translateY(-50%)}}
          #eltoque-overlay-root *{box-sizing:border-box;margin:0;padding:0}
          .et-ticker{display:inline-flex;align-items:center;animation:eltoque-h var(--et-dur,20s) linear infinite;will-change:transform}
          .et-ticker-v{flex-direction:column;animation:eltoque-v var(--et-dur,20s) linear infinite}
          .et-clone{animation-delay:calc(var(--et-dur,20s) * -0.5)}
        `;
        document.head.appendChild(style);
      }

      overlayEl = document.createElement('div');
      overlayEl.id = 'eltoque-overlay-root';
      overlayEl.style.cssText = `
        position:fixed;${pos==='top'?'top:0':'bottom:0'};left:0;right:0;
        height:${h}px;z-index:${zIndex};
        background:${bg};
        backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
        border-${pos==='top'?'bottom':'top'}:1px solid ${border};
        font-family:'JetBrains Mono',monospace;overflow:hidden;
      `;

      const inner = document.createElement('div');
      inner.style.cssText = 'display:flex;align-items:center;height:100%;overflow:hidden;position:relative;';

      const track = document.createElement('div');
      track.id = 'et-track';
      track.style.cssText = 'display:flex;align-items:center;height:100%;white-space:nowrap;';

      const c1 = document.createElement('div');
      c1.id = 'et-c1';
      c1.className = 'et-ticker';

      const c2 = document.createElement('div');
      c2.id = 'et-c2';
      c2.className = 'et-ticker et-clone';
      c2.setAttribute('aria-hidden', 'true');

      // Fades
      const fade = document.createElement('div');
      fade.style.cssText = `
        position:absolute;inset:0;pointer-events:none;z-index:1;
        background:linear-gradient(to right,${bg} 0%,transparent 48px,transparent calc(100% - 48px),${bg} 100%);
      `;

      // Boton cerrar
      const x = document.createElement('button');
      x.innerHTML = '×';
      x.title = 'Cerrar (temporal)';
      x.style.cssText = `
        position:absolute;right:4px;top:50%;transform:translateY(-50%);
        background:transparent;border:none;color:rgba(128,128,160,0.5);
        font-size:15px;cursor:pointer;z-index:2;padding:0 5px;line-height:1;
        transition:color 0.15s;
      `;
      x.onmouseover = () => x.style.color = 'rgba(200,200,220,0.9)';
      x.onmouseout  = () => x.style.color = 'rgba(128,128,160,0.5)';
      x.onclick = destroyOverlay;

      track.appendChild(c1);
      track.appendChild(c2);
      inner.appendChild(track);
      inner.appendChild(fade);
      inner.appendChild(x);
      overlayEl.appendChild(inner);
      document.body.appendChild(overlayEl);

      // Margen para no tapar contenido
      adjustMargin(pos, h, 1);
      updateContent();
    } catch (err) {
      console.error('[ElToque] Error creating overlay:', err);
      overlayEl?.remove();
      overlayEl = null;
    }
  }

  function updateContent() {
    const c1 = document.getElementById('et-c1');
    const c2 = document.getElementById('et-c2');
    if (!c1) return;

    try {
      const currencies = getSorted();
      const colorUp    = settings.colorUp   ?? '#ef4444';
      const colorDown  = settings.colorDown ?? '#22c55e';
      const colorN     = (settings.colorNeutral && settings.colorNeutral !== 'auto')
        ? settings.colorNeutral : '#7070a0';
      const h     = settings.overlayHeight ?? 28;
      const fSize = Math.max(9, h - 16);
      const speed = settings.scrollSpeed ?? 45;
      
      // Tipo de cambio a mostrar
      const showChangeType = settings.showChangeType || 'color';

      const items = currencies.map(cur => {
        const val = rates[cur];
        if (val === undefined) return '';
        const ch    = changes[cur] ?? 'neutral';
        const abs   = changesAbs[cur] ?? { diff: 0, pctChange: 0 };
        const color = ch === 'up' ? colorUp : ch === 'down' ? colorDown : colorN;
        const arrow = ch === 'up' ? '▲' : ch === 'down' ? '▼' : '—';
        const fmtVal = val >= 1000
          ? val.toLocaleString('es-CU', { maximumFractionDigits: 0 })
          : val.toFixed(val % 1 === 0 ? 0 : 1);

        // Determinar qué mostrar según configuración
        let changeDisplay = '';
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

        return `<span style="display:inline-flex;align-items:center;gap:3px;padding:0 10px;color:${color};font-size:${fSize}px;font-weight:600;">`
          + `<span style="color:rgba(160,160,190,0.55);font-size:${fSize-1}px;letter-spacing:0.08em;">${cur}</span>`
          + `<span style="font-weight:700;">${fmtVal}</span>`
          + `<span style="font-size:${fSize-2}px;">${changeDisplay}</span>`
          + `</span>`
          + `<span style="color:rgba(100,100,140,0.35);font-size:9px;padding:0 1px;">|</span>`;
      }).join('');

      // Duplicar para loop continuo
      const doubled = items + items;
      c1.innerHTML = doubled;
      if (c2) c2.innerHTML = doubled;

      const dur = Math.max(6, (currencies.length * 90) / (speed / 30));
      overlayEl?.style.setProperty('--et-dur', `${dur}s`);
      c1.style.animationDuration = `${dur}s`;
      if (c2) {
        c2.style.animationDuration = `${dur}s`;
        c2.style.animationDelay = `-${dur / 2}s`;
      }
    } catch (err) {
      console.error('[ElToque] Error updating content:', err);
    }
  }

  function renderIcon(canvas, rate, change) {
    try {
      if (!canvas || !canvas.getContext) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      const size = canvas.width || 24;
      const isUp = change === 'up';
      const isDown = change === 'down';
      
      ctx.clearRect(0, 0, size, size);
      
      if (isUp) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(size / 2, size * 0.2);
        ctx.lineTo(size * 0.8, size * 0.7);
        ctx.lineTo(size * 0.2, size * 0.7);
        ctx.closePath();
        ctx.fill();
      } else if (isDown) {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.moveTo(size / 2, size * 0.8);
        ctx.lineTo(size * 0.8, size * 0.3);
        ctx.lineTo(size * 0.2, size * 0.3);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#7070a0';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      
      return canvas;
    } catch (err) {
      console.error('[ElToque] Error rendering icon:', err);
      return null;
    }
  }

  function adjustMargin(pos, h, dir) {
    const prop = pos === 'top' ? 'paddingTop' : 'paddingBottom';
    const curr = parseInt(document.body.style[prop] || '0');
    const newValue = Math.max(0, curr + h * dir);
    document.body.style[prop] = newValue + 'px';
    if (newValue <= 0) {
      delete document.body.dataset.etProp;
      delete document.body.dataset.etH;
    } else if (dir > 0) {
      document.body.dataset.etProp = prop;
      document.body.dataset.etH = h;
    }
  }

  function destroyOverlay() {
    const prop = document.body.dataset.etProp;
    const h    = parseInt(document.body.dataset.etH || '0');
    if (prop && h > 0) { 
      adjustMargin(prop === 'paddingTop' ? 'top' : 'bottom', h, -1); 
    }
    
    if (overlayEl) {
      const xBtn = overlayEl.querySelector('button');
      if (xBtn) {
        xBtn.onclick = null;
        xBtn.onmouseover = null;
        xBtn.onmouseout = null;
      }
      overlayEl.remove();
    }
    overlayEl = null;
    
    const styleEl = document.getElementById('eltoque-kf');
    if (styleEl) styleEl.remove();
    
    delete document.body.dataset.etProp;
    delete document.body.dataset.etH;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'RATES_UPDATED') {
      rates   = msg.rates   ?? rates;
      changes = msg.changes ?? changes;
      if (msg.changesAbs) changesAbs = msg.changesAbs;
      if (settings.overlayEnabled) {
        if (!overlayEl) createOverlay();
        else updateContent();
      }
    }
    if (msg.type === 'SETTINGS_UPDATED') {
      settings = msg.settings ?? settings;
      if (settings.overlayEnabled) {
        destroyOverlay();
        createOverlay();
      } else {
        destroyOverlay();
      }
    }
  });

  chrome.storage.onChanged.addListener((ch) => {
    if (ch.settings)      settings = ch.settings.newValue ?? settings;
    if (ch.currentRates)   rates    = ch.currentRates.newValue ?? rates;
    if (ch.rateChanges)   changes  = ch.rateChanges.newValue  ?? changes;
    if (ch.rateChangesAbs) changesAbs = ch.rateChangesAbs.newValue ?? changesAbs;
    if ((ch.currentRates || ch.rateChanges) && settings.overlayEnabled && overlayEl) {
      updateContent();
    }
  });

  window.addEventListener('unload', function() {
    destroyOverlay();
  });

  init();
})();
