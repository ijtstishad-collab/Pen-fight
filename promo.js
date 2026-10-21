// Start banner: a doodled sticky-note "pen fight" shown when the game opens. Any tap, click or key starts.
(function () {
  'use strict';

  const promo = document.getElementById('promo');
  if (!promo) return;
  if (/[?&]nopromo\b/.test(location.search)) {
    promo.remove();
    return;
  }

  function start() {
    if (promo.classList.contains('leaving')) return;
    promo.classList.add('leaving');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => promo.remove(), 450);
    // Focus whatever is next: the create-player form, or the menu's Play button.
    setTimeout(() => {
      const next =
        document.querySelector('.sheet:not([hidden]) input') ||
        document.querySelector('.sheet:not([hidden]) button') ||
        document.getElementById('start');
      if (next) next.focus();
    }, 460);
  }

  function onKey(e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      start();
    }
  }

  promo.addEventListener('click', start);
  document.addEventListener('keydown', onKey, true);
  document.getElementById('promo-play').focus();
})();
