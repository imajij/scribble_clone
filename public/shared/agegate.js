// ========================================
// Shared Age Gate — 18+ verification
// ========================================

const AGE_KEY = 'afterdark_age_verified';

export function isVerified() {
  return localStorage.getItem(AGE_KEY) === 'true';
}

export function verify() {
  localStorage.setItem(AGE_KEY, 'true');
}

export function bindGate(overlayEl, confirmBtn, denyBtn, onVerified) {
  if (isVerified()) {
    overlayEl.classList.add('hidden');
    onVerified();
    return;
  }

  overlayEl.classList.remove('hidden');

  confirmBtn.addEventListener('click', () => {
    verify();
    overlayEl.classList.add('hidden');
    onVerified();
  });

  denyBtn.addEventListener('click', () => {
    window.location.href = 'https://www.google.com';
  });
}
