// ========================================
// AFTER DARK GAMES — SPA Router
// ========================================
// Client-side router that:
//   1. Intercepts [data-spa] link clicks (pushState)
//   2. Matches path → game config
//   3. Fetches game fragment HTML → injects into #game-container
//   4. Lazy-loads game CSS + JS
//   5. Cleans up previous game on navigate
//   6. Shared: age gate, identity pre-fill, navbar

import { isVerified, verify, bindGate } from './shared/agegate.js';
import { getPlayerName, setPlayerName } from './shared/identity.js';
import { render as renderNav, updateActive, updateUser } from './shared/navbar.js';

// ── Route map ──
const ROUTES = {
  '/scribble': {
    gameId: 'scribble',
    assetBase: '/scribble',
    scripts: ['canvas.js', 'app.js'],
    icon: '\u{1F3A8}',
    color: '#a855f7',
  },
  '/truth-live': {
    gameId: 'truth-or-tease',
    assetBase: '/truth-or-tease',
    scripts: ['app.js'],
    icon: '\u{1F48B}',
    color: '#ec4899',
  },
  '/roulette': {
    gameId: 'dare-roulette',
    assetBase: '/dare-roulette',
    scripts: ['app.js'],
    icon: '\u{1F3B0}',
    color: '#f59e0b',
  },
  '/story-builder': {
    gameId: 'story-builder',
    assetBase: '/story-builder',
    scripts: ['app.js'],
    icon: '\u{1F4DD}',
    color: '#7f5af0',
  },
};

// ── Map game-id → SPA route (for home page card links) ──
const ID_TO_ROUTE = {};
Object.keys(ROUTES).forEach(function(path) {
  ID_TO_ROUTE[ROUTES[path].gameId] = path;
});

// ── DOM refs ──
const container = document.getElementById('game-container');
const navbarEl  = document.getElementById('navbar');
const ageGateEl = document.getElementById('age-gate');

// ── Active game state ──
let activeStylesheet = null;
let activeScripts    = [];
let pendingNavigate  = null; // path deferred until age-verified

// ============================================================
// Public: navigate
// ============================================================

function navigate(path, pushState) {
  if (pushState === undefined) pushState = true;
  if (pushState) history.pushState(null, '', path);

  // Age gate check
  if (!isVerified()) {
    pendingNavigate = path;
    showAgeGate();
    return;
  }

  cleanup();

  if (path === '/') {
    loadHome();
  } else if (ROUTES[path]) {
    loadGame(path);
  } else {
    show404();
  }

  updateActive(navbarEl, path);
  updateUser(navbarEl);
}

// ============================================================
// Cleanup previous game
// ============================================================

function cleanup() {
  // Call game-defined cleanup
  if (typeof window.__gameCleanup === 'function') {
    try { window.__gameCleanup(); } catch (e) { console.warn('[router] cleanup error', e); }
    window.__gameCleanup = null;
  }

  // Remove game stylesheet
  if (activeStylesheet) {
    activeStylesheet.remove();
    activeStylesheet = null;
  }

  // Remove game scripts
  activeScripts.forEach(function(s) { s.remove(); });
  activeScripts = [];

  // Clear container
  container.innerHTML = '';
}

// ============================================================
// Load game
// ============================================================

function loadGame(path) {
  var route = ROUTES[path];

  // Show loading state
  container.innerHTML = '<div class="spa-loading">Loading ' + (route.icon || '') + '</div>';

  // 1. Fetch fragment HTML
  fetch(route.assetBase + '/fragment.html')
    .then(function(res) {
      if (!res.ok) throw new Error('Fragment not found');
      return res.text();
    })
    .then(function(html) {
      container.innerHTML = html;

      // 2. Load game CSS
      activeStylesheet = document.createElement('link');
      activeStylesheet.rel = 'stylesheet';
      activeStylesheet.href = route.assetBase + '/style.css';
      document.head.appendChild(activeStylesheet);

      // 3. Pre-fill player name from shared identity
      var nameInput = container.querySelector('#playerName');
      var savedName = getPlayerName();
      if (nameInput && savedName) nameInput.value = savedName;

      // Track name changes for shared identity
      if (nameInput) {
        nameInput.addEventListener('blur', function() {
          var val = nameInput.value.trim();
          if (val) {
            setPlayerName(val);
            updateUser(navbarEl);
          }
        });
      }

      // 4. Load scripts sequentially (order matters — e.g., canvas.js before app.js)
      return loadScriptsSequential(route.assetBase, route.scripts);
    })
    .then(function() {
      // Update document title
      var titleEl = container.querySelector('.logo, .lobby-header h1');
      if (titleEl) document.title = titleEl.textContent.trim() + ' | After Dark Games';
    })
    .catch(function(err) {
      console.error('[router] loadGame error:', err);
      show404();
    });
}

function loadScriptsSequential(base, scripts) {
  var idx = 0;
  function next() {
    if (idx >= scripts.length) return Promise.resolve();
    var src = base + '/' + scripts[idx];
    idx++;
    return loadScript(src).then(next);
  }
  return next();
}

function loadScript(src) {
  return new Promise(function(resolve, reject) {
    var script = document.createElement('script');
    script.src = src + '?v=' + Date.now(); // cache-bust to allow re-execution
    script.onload = function() { resolve(script); };
    script.onerror = function() { reject(new Error('Failed to load ' + src)); };
    document.body.appendChild(script);
    activeScripts.push(script);
  });
}

// ============================================================
// Load home page
// ============================================================

var ICONS = {
  'scribble':       '\u{1F3A8}',
  'truth-or-tease': '\u{1F48B}',
  'this-or-that':   '\u{1F914}',
  'scenario':       '\u{1F3AD}',
  'confessions':    '\u{1F92B}',
  'dare-roulette':  '\u{1F3B0}',
  'story-builder':  '\u{1F4DD}',
};

var COLORS = {
  'scribble':       '#a855f7',
  'truth-or-tease': '#ec4899',
  'this-or-that':   '#8b5cf6',
  'scenario':       '#fbbf24',
  'confessions':    '#22c55e',
  'dare-roulette':  '#f59e0b',
  'story-builder':  '#7f5af0',
};

function loadHome() {
  document.title = 'After Dark Games \u{1F319}';

  container.innerHTML =
    '<div class="home-hero">' +
      '<h1 class="logo">\u{1F319} After Dark Games</h1>' +
      '<p class="tagline">Party games for grown-ups \u2014 no kids allowed.</p>' +
    '</div>' +
    '<div class="home-grid" id="homeGrid">' +
      '<div class="spa-loading">Loading games\u2026</div>' +
    '</div>' +
    '<div class="home-footer">18+ only \u00B7 Built with \u2764\uFE0F and poor life choices</div>';

  fetch('/api/games')
    .then(function(res) { return res.json(); })
    .then(function(games) {
      var grid = document.getElementById('homeGrid');
      if (!grid) return;
      grid.innerHTML = '';

      games.forEach(function(game) {
        var icon  = ICONS[game.id] || '\u{1F3AE}';
        var color = COLORS[game.id] || '#a855f7';
        var spaRoute = ID_TO_ROUTE[game.id];

        var card = document.createElement('a');
        if (spaRoute) {
          card.href = spaRoute;
          card.setAttribute('data-spa', '');
        } else {
          card.href = game.route;
        }
        card.className = 'game-card';
        card.style.setProperty('--card-accent', color);
        card.innerHTML =
          '<div class="card-icon">' + icon + '</div>' +
          '<h2 class="card-title">' + escapeHtml(game.name) + '</h2>' +
          '<p class="card-desc">' + escapeHtml(game.description) + '</p>' +
          '<div class="card-meta">' +
            '<span class="meta-badge">' + game.type + '</span>' +
            '<span class="meta-players">' + game.minPlayers + '\u2013' + game.maxPlayers + ' players</span>' +
          '</div>';

        grid.appendChild(card);
      });
    })
    .catch(function() {
      var grid = document.getElementById('homeGrid');
      if (grid) grid.innerHTML = '<p class="spa-loading">Could not load games. Try refreshing.</p>';
    });
}

// ============================================================
// Age gate
// ============================================================

function showAgeGate() {
  if (!ageGateEl) return;
  bindGate(
    ageGateEl,
    document.getElementById('age-confirm-btn'),
    document.getElementById('age-deny-btn'),
    function() {
      // On verified — continue to deferred path
      if (pendingNavigate) {
        var path = pendingNavigate;
        pendingNavigate = null;
        navigate(path, false);
      }
    }
  );
}

// ============================================================
// 404
// ============================================================

function show404() {
  document.title = 'Not Found | After Dark Games';
  container.innerHTML =
    '<div class="spa-404">' +
      '<h2>404</h2>' +
      '<p>This page does not exist (yet).</p>' +
      '<a href="/" data-spa>\u{1F3E0} Back Home</a>' +
    '</div>';
}

// ============================================================
// SPA link interception
// ============================================================

document.addEventListener('click', function(e) {
  var link = e.target.closest('a[data-spa]');
  if (!link) return;
  e.preventDefault();
  var href = link.getAttribute('href');
  if (href && href !== location.pathname) {
    navigate(href);
  }
});

// ── Popstate (back/forward) ──
window.addEventListener('popstate', function() {
  navigate(location.pathname, false);
});

// ============================================================
// Init navbar & first route
// ============================================================

renderNav(navbarEl, location.pathname);
navigate(location.pathname, false);

// ============================================================
// Helpers
// ============================================================

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
