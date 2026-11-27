// The slide viewer. Scales every 1920 × 1080 slide to fit its frame, draws the few icons the
// slides use, and runs Present mode (one slide at a time, with the arrow keys).
(function () {
  'use strict';

  // The icons the slides use, as plain SVG (outline style).
  const ICONS = {
    ThumbsUp:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>',
  };
  for (const el of document.querySelectorAll('x-icon')) {
    const svg = ICONS[el.getAttribute('name')];
    if (svg) el.innerHTML = svg;
  }

  function fit(frame) {
    const section = frame.querySelector('section');
    if (section) section.style.setProperty('--dv-k', String(frame.clientWidth / 1920));
  }

  const frames = Array.from(document.querySelectorAll('.dv-deck .dv-frame'));
  const ro = 'ResizeObserver' in window ? new ResizeObserver((entries) => entries.forEach((e) => fit(e.target))) : null;
  for (const f of frames) {
    fit(f);
    if (ro) ro.observe(f);
  }
  window.addEventListener('resize', () => frames.forEach(fit));

  // Present mode
  const startBtn = document.getElementById('dv-present');
  if (!startBtn || !frames.length) return;
  let overlay = null;
  let index = 0;
  let returnFocus = null;

  function showSlide(i) {
    index = Math.max(0, Math.min(frames.length - 1, i));
    const stage = overlay.querySelector('.dv-present-stage');
    stage.textContent = '';
    const frame = frames[index].cloneNode(true); // a fresh copy restarts the slide's animations
    stage.appendChild(frame);
    fit(frame);
    overlay.querySelector('.dv-count').textContent = `Slide ${index + 1} of ${frames.length}`;
    overlay.querySelector('.dv-prev').disabled = index === 0;
    overlay.querySelector('.dv-next').disabled = index === frames.length - 1;
  }

  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      showSlide(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      showSlide(index - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      stop();
    } else if (e.key === 'Home') {
      showSlide(0);
    } else if (e.key === 'End') {
      showSlide(frames.length - 1);
    }
  }

  function onResize() {
    if (overlay) fit(overlay.querySelector('.dv-frame'));
  }

  function start() {
    returnFocus = document.activeElement;
    overlay = document.createElement('div');
    overlay.className = 'dv-present';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Present the slides');
    overlay.innerHTML =
      '<div class="dv-present-stage"></div>' +
      '<div class="dv-present-bar">' +
      '<button class="dv-btn dv-prev" type="button">Previous</button>' +
      '<span class="dv-count" aria-live="polite"></span>' +
      '<button class="dv-btn dv-next" type="button">Next</button>' +
      '<button class="dv-btn dv-stop" type="button">Stop presenting</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.dv-prev').addEventListener('click', () => showSlide(index - 1));
    overlay.querySelector('.dv-next').addEventListener('click', () => showSlide(index + 1));
    overlay.querySelector('.dv-stop').addEventListener('click', stop);
    overlay.querySelector('.dv-present-stage').addEventListener('click', () => showSlide(index + 1));
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    showSlide(0);
    overlay.querySelector('.dv-next').focus();
  }

  function stop() {
    if (!overlay) return;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    overlay.remove();
    overlay = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (returnFocus) returnFocus.focus();
  }

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && overlay) onResize();
  });
  startBtn.addEventListener('click', start);
})();
