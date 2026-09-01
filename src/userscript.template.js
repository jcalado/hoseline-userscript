// ==UserScript==
// @name         Hoseline Redesign
// @namespace    https://github.com/joelcalado/hoseline-redesign
// @version      __VERSION__
// @description  Floating on-air QSO card, cleaner cards, nav and filter bar for hose.brandmeister.network
// @author       Joel Calado
// @match        https://hose.brandmeister.network/*
// @run-at       document-start
// @grant        GM_addStyle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  var CSS = __CSS__;

  /* ---------- 1. styles, as early as possible ---------- */
  function addStyle(css) {
    if (typeof GM_addStyle === 'function') { try { GM_addStyle(css); return; } catch (e) { /* fall through */ } }
    var el = document.createElement('style');
    el.id = 'hl-redesign-style';
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }
  addStyle(CSS);

  /* ---------- helpers ---------- */
  var SEL = {
    playerBtn: 'header .MuiToolbar-root .MuiButton-root',
    themeBtn:  'header button[aria-label="Switch Theme"]',
    popper:    '#topplayer-menu',
    dockPaper: '#topplayer-menu > .MuiPaper-root'
  };
  var root = document.documentElement;
  var $ = function (s) { return document.querySelector(s); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } }
  };

  /* ---------- 2. follow the site's own light/dark toggle ---------- */
  function syncTheme() {
    if (!document.body) return;
    var m = (getComputedStyle(document.body).backgroundColor || '').match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return;
    var lum = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
    var alpha = m.length > 3 ? parseFloat(m[3]) : 1;
    if (alpha === 0) return;                       // transparent → can't tell, keep whatever we have
    var mode = lum < 128 ? 'dark' : 'light';
    if (root.getAttribute('data-hl-theme') !== mode) root.setAttribute('data-hl-theme', mode);
  }

  /* ---------- 3. keep the player mounted ---------- */
  var bypass = false;          // true while WE click the PLAYER button
  var lastOpen = 0, burst = 0; // loop guard
  function ensureDock() {
    if ($(SEL.popper)) { burst = 0; watchDockSize(); return; }
    var btn = $(SEL.playerBtn);
    if (!btn) return;
    var now = Date.now();
    if (now - lastOpen < 300) { if (++burst > 6) return; } else { burst = 0; }
    lastOpen = now;
    bypass = true;
    try { btn.click(); } finally { bypass = false; }
  }

  /* card height → padding-bottom on <main>, so the last row of cards stays
     reachable. We keep the high-water mark: the card grows when a QSO starts
     and we do not want the whole page to re-flow on every over. */
  var ro = null, roTarget = null, maxH = 0;
  function watchDockSize() {
    var paper = $(SEL.dockPaper);
    if (!paper || paper === roTarget) return;
    if (ro) ro.disconnect();
    roTarget = paper;
    if (typeof ResizeObserver === 'undefined') { setDockHeight(paper.offsetHeight); return; }
    ro = new ResizeObserver(function (entries) {
      setDockHeight(entries[0].contentRect.height);
    });
    ro.observe(paper);
  }
  function setDockHeight(h) {
    h = Math.ceil(h);
    if (h <= maxH) return;
    maxH = h;
    root.style.setProperty('--hl-card-h', h + 'px');
  }
  window.addEventListener('resize', function () { maxH = 0; });

  /* ---------- 4. PLAYER button → show / hide the QSO card ---------- */
  function applyHidden(on) {
    root.classList.toggle('hl-player-hidden', !!on);
    store.set('hl-player-hidden', on ? '1' : '0');
    var btn = $(SEL.playerBtn);
    if (btn) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.title = on ? 'Show the player card' : 'Hide the player card'; }
  }
  if (store.get('hl-player-hidden') === '1') root.classList.add('hl-player-hidden');

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest(SEL.playerBtn) : null;
    if (!t || bypass) return;
    // swallow the React toggle so the popper stays mounted
    e.stopPropagation();
    e.preventDefault();
    applyHidden(!root.classList.contains('hl-player-hidden'));
  }, true);

  // theme button: re-read the palette after MUI re-renders
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest(SEL.themeBtn) : null;
    if (!t) return;
    [30, 150, 500, 1200].forEach(function (ms) { setTimeout(syncTheme, ms); });
  }, true);

  /* ---------- 5. QSO state ----------
     The player renders three facts - [0] DMR id, [1] talkgroup, [2] alias -
     and a level caption "-18  peak -18". All four are blank between overs,
     which is exactly our "someone is transmitting" signal. */
  var IDLE_GRACE = 1400;   // ms of silence before the card shrinks back to a pill
  var qsoStart = 0, lastLive = 0, state = '', lastWho = '';
  var tgNames = Object.create(null), tgScan = 0;

  function facts() {
    return document.querySelectorAll('#topplayer-menu .MuiGrid-container > .MuiGrid-root > div > p');
  }
  function txt(el) { return el ? (el.textContent || '').trim() : ''; }
  function cache(el, val) {
    if (el && val && el.getAttribute('data-hl-last') !== val) el.setAttribute('data-hl-last', val);
  }

  /* talkgroup number → name, read out of the cards already on the page */
  function tgName(tg) {
    if (!tg) return '';
    var now = Date.now();
    if (tgNames[tg] === undefined || now - tgScan > 20000) {
      var cards = document.querySelectorAll('main .MuiGrid-grid-sm-6 > .MuiCard-root');
      for (var i = 0; i < cards.length; i++) {
        var id = txt(cards[i].querySelector('.MuiGrid-grid-xs-grow > p'));
        if (id) tgNames[id] = txt(cards[i].querySelector('.MuiCardContent-root > p.MuiTypography-body2'));
      }
      tgScan = now;
      if (tgNames[tg] === undefined) tgNames[tg] = '';
    }
    return tgNames[tg];
  }

  /* ---------- the level meter's needle ----------
     The player reports dBFS and drives its own bar to (81 + dB)%, which tops
     out at 81% and leaves the last fifth of the meter permanently dark. We
     rescale so the floor is at the left edge and 0 dB is hard against the
     right one, publish that as --hl-level, and pick the transition time per
     sample: a meter has to jump to a peak and sag away from it, not glide
     symmetrically. --hl-lvl-t is read by the Paper's transition list, and
     FLOOR_DB is --hl-meter-floor on the stylesheet side - keep them equal. */
  var FLOOR_DB = 81;
  var lastLevel = -1;
  function pct(n) { return Math.max(0, Math.min(100, n)); }
  function scale(db) { return pct((FLOOR_DB + db) * 100 / FLOOR_DB); }
  function setLevel(paper, v) {
    v = pct(v);
    if (v === lastLevel) return;
    paper.style.setProperty('--hl-lvl-t', v > lastLevel ? '55ms' : '300ms');
    paper.style.setProperty('--hl-level', v + '%');
    lastLevel = v;
  }

  function fmtElapsed(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  /* State changes are morphed rather than cut. A *scoped* view transition
     (Element.startViewTransition) snapshots only the popper's own subtree, so
     the grid behind the card is never captured and never stops updating; it
     also gives the morph a coordinate space that does not move, which is why
     the popper is a fixed-size gutter in CSS. document.startViewTransition is
     the fallback for browsers without the scoped form - the stylesheet opts
     the root layer out of that one so, again, only the card animates.

     The guards matter more than the animation: idle <-> live can flip as often
     as the IDLE_GRACE window allows, React re-renders underneath the whole
     time, and a transition that is still running must never be restarted. */
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var morphing = false;

  function morph(apply) {
    var popper = $(SEL.popper);
    var host = popper && typeof popper.startViewTransition === 'function' ? popper
             : typeof document.startViewTransition === 'function' ? document
             : null;
    if (!host || morphing || (reduceMotion && reduceMotion.matches)) { apply(); return; }
    morphing = true;
    root.classList.add('hl-morphing');
    var done = function () { morphing = false; root.classList.remove('hl-morphing'); };
    try {
      host.startViewTransition(apply).finished.then(done, done);
    } catch (e) { apply(); done(); }
  }

  function setState(next) {
    if (state === next) return;
    var first = !state;                    // the boot state must not animate in
    state = next;
    if (first) { root.setAttribute('data-hl-qso', next); return; }
    morph(function () { root.setAttribute('data-hl-qso', next); });
  }

  function updateQso() {
    var paper = $(SEL.dockPaper);
    if (!paper) return;
    var ps = facts();
    var id = txt(ps[0]), tg = txt(ps[1]), alias = txt(ps[2]);
    var cap = txt(paper.querySelector('.MuiTypography-caption'));
    var live = !!(alias || id || /-?\d/.test(cap));
    var now = Date.now();

    /* the needle follows the caption whether or not a talker is on air, so it
       falls away between overs instead of freezing at the last sample */
    var lv = cap.match(/(-?\d+)/);
    setLevel(paper, lv ? scale(parseInt(lv[1], 10)) : 0);

    // blank the icon-only facts so an empty row never leaves a stray chip
    for (var i = 0; i < ps.length; i++) {
      var empty = !txt(ps[i]);
      var cur = ps[i].getAttribute('data-hl-empty');
      if (empty && cur !== '1') ps[i].setAttribute('data-hl-empty', '1');
      else if (!empty && cur) ps[i].removeAttribute('data-hl-empty');
    }

    if (live) {
      // a new over starts on a gap in the audio OR when the talker changes -
      // back-to-back overs on a busy talkgroup leave no gap at all
      var who = id + '|' + tg + '|' + alias;
      if (!qsoStart || who !== lastWho || now - lastLive > IDLE_GRACE) qsoStart = now;
      lastWho = who;
      lastLive = now;
      setState('live');

      var el = fmtElapsed(now - qsoStart);
      if (paper.getAttribute('data-hl-elapsed') !== el) paper.setAttribute('data-hl-elapsed', el);

      var name = tg ? tgName(tg) : '';
      if (ps[1]) {
        var want = name ? '· ' + name : '';
        if (ps[1].getAttribute('data-hl-tgname') !== want) ps[1].setAttribute('data-hl-tgname', want);
      }

      // remember each fact so the card can ride out the gap between overs
      cache(ps[0], id);
      cache(ps[1], tg ? (tg + (name ? ' · ' + name : '')) : '');
      cache(ps[2], alias);

      // peak hold - the site computes the hold itself, we only place the marker
      var pk = cap.match(/peak\s*(-?\d+)/);
      if (pk) paper.style.setProperty('--hl-peak', scale(parseInt(pk[1], 10)) + '%');
    } else if (now - lastLive > IDLE_GRACE) {
      setState('idle');
      qsoStart = 0;
    }

    var input = document.querySelector('#topplayer-menu .MuiAutocomplete-root input');
    if (input && !input.placeholder) input.placeholder = 'Add talkgroup…';
  }

  /* ---------- 6. boot ---------- */
  var scheduled = false;
  function tick() {
    scheduled = false;
    syncTheme();
    ensureDock();
    updateQso();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(tick, 0);
  }

  function start() {
    syncTheme();
    setState('idle');
    applyHidden(root.classList.contains('hl-player-hidden'));
    ensureDock();

    // React re-renders constantly; a cheap querySelector per frame is fine
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

    // the elapsed timer and the idle countdown need their own beat: between
    // overs the DOM goes quiet, so the observer alone would never fire.
    setInterval(updateQso, 500);

    // safety nets: app boot, or a theme swap that leaves no DOM trace
    var n = 0;
    var boot = setInterval(function () { tick(); if (++n > 40 || $(SEL.popper)) clearInterval(boot); }, 250);
    setInterval(syncTheme, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
