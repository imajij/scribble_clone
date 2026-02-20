// ========================================
// Shared Navbar Component
// ========================================

import { getPlayerName } from './identity.js';

const NAV_GAMES = [
  { path: '/scribble',      icon: '\u{1F3A8}', label: 'Scribble' },
  { path: '/truth-live',    icon: '\u{1F48B}', label: 'Truth' },
  { path: '/roulette',      icon: '\u{1F3B0}', label: 'Roulette' },
  { path: '/story-builder', icon: '\u{1F4DD}', label: 'Story' },
  { path: '/this-or-that',  icon: '\u{1F914}', label: 'This/That' },
  { path: '/scenario',      icon: '\u{1F3AD}', label: 'Scenario' },
  { path: '/confessions',   icon: '\u{1F92B}', label: 'Confess' },
];

export function render(container, activePath) {
  const linksHtml = NAV_GAMES.map(g => {
    const cls = g.path === activePath ? 'nav-link active' : 'nav-link';
    return '<a href="' + g.path + '" class="' + cls + '" data-spa>' + g.icon + ' ' + g.label + '</a>';
  }).join('');

  const name = getPlayerName();
  const userHtml = name
    ? '<span class="nav-user-name">' + escapeHtml(name) + '</span>'
    : '';

  container.innerHTML =
    '<a href="/" class="nav-logo" data-spa>\u{1F319} After Dark</a>' +
    '<div class="nav-links">' + linksHtml + '</div>' +
    '<div class="nav-user" id="navUser">' + userHtml + '</div>';
}

export function updateActive(container, activePath) {
  container.querySelectorAll('.nav-link').forEach(function(link) {
    if (link.getAttribute('href') === activePath) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

export function updateUser(container) {
  var userEl = container.querySelector('#navUser');
  if (!userEl) return;
  var name = getPlayerName();
  userEl.innerHTML = name
    ? '<span class="nav-user-name">' + escapeHtml(name) + '</span>'
    : '';
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
