// ========================================
// CHAOS METER — Global meta system
// ========================================
// Tracks and visualises cumulative chaos across a game session.
// Games import this and call update() on chaos triggers.
//
// Tiers:
//   calm   (0–33)  → no effects
//   heated (34–66) → screen shake
//   chaos  (67–100) → neon glow + fake alert overlay

export class ChaosMeter {
  constructor(containerId) {
    this.score = 0;
    this.tier = 'calm';
    this.container = document.getElementById(containerId) || document.getElementById('game-container');
    this._fakeAlertShown = false;
    this._el = null;
    this._init();
  }

  _init() {
    // Create HUD bar
    const bar = document.createElement('div');
    bar.className = 'chaos-hud';
    bar.innerHTML =
      '<span class="chaos-label">🔥 Chaos</span>' +
      '<div class="chaos-track"><div class="chaos-fill" id="chaosFill"></div></div>' +
      '<span class="chaos-tier" id="chaosTierLabel">Calm</span>';
    this.container.insertAdjacentElement('afterbegin', bar);
    this._el = bar;
  }

  update(newScore) {
    this.score = Math.max(0, Math.min(100, newScore));
    const fill = document.getElementById('chaosFill');
    const label = document.getElementById('chaosTierLabel');
    if (fill) fill.style.width = this.score + '%';

    const prevTier = this.tier;
    if (this.score > 66) {
      this.tier = 'chaos';
      if (label) label.textContent = '💀 CHAOS';
      fill && (fill.style.background = 'linear-gradient(90deg,#f97316,#f43f5e,#a855f7)');
    } else if (this.score > 33) {
      this.tier = 'heated';
      if (label) label.textContent = '🌶️ Heated';
      fill && (fill.style.background = 'linear-gradient(90deg,#f59e0b,#ef4444)');
    } else {
      this.tier = 'calm';
      if (label) label.textContent = 'Calm';
      fill && (fill.style.background = '#22c55e');
    }

    this._applyEffects(prevTier);
  }

  _applyEffects(prevTier) {
    const gc = this.container;
    if (this.tier === 'heated' && prevTier === 'calm') {
      gc.classList.add('chaos-shake');
      setTimeout(() => gc.classList.remove('chaos-shake'), 800);
    }

    if (this.tier === 'chaos') {
      gc.classList.add('neon-chaos');
      if (!this._fakeAlertShown) {
        this._fakeAlertShown = true;
        this._showFakeAlert();
      }
    } else {
      gc.classList.remove('neon-chaos');
    }
  }

  _showFakeAlert() {
    const overlay = document.createElement('div');
    overlay.className = 'chaos-fake-alert';
    overlay.innerHTML =
      '<div class="cfa-box">' +
      '<div class="cfa-header">⚠️ Warning</div>' +
      '<div class="cfa-body">This lobby has reached critical chaos levels.<br>Authorities have been notified.</div>' +
      '<button class="cfa-btn" onclick="this.parentElement.parentElement.remove()">Dismiss 💀</button>' +
      '</div>';
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 5000);
  }

  bump(amount = 15) {
    this.update(this.score + amount);
  }

  reset() {
    this.score = 0;
    this._fakeAlertShown = false;
    this.tier = 'calm';
    this.update(0);
  }

  destroy() {
    if (this._el) this._el.remove();
    this.container.classList.remove('neon-chaos');
  }
}
