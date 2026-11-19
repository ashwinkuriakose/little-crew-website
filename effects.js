// =====================================================================
// Scroll effects for the Little Crew site.
// Everything here is decoration: the page works fully without it, and
// all motion is skipped for visitors who prefer reduced motion.
// =====================================================================
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = sel => document.querySelector(sel);
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const loadTime = performance.now();

  // ------------------------------------------------------------------
  // 1. Smooth scrolling (Lenis)
  // ------------------------------------------------------------------
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true });
    document.addEventListener('lc:lock', () => lenis.stop());
    document.addEventListener('lc:unlock', () => lenis.start());

    // In-page links glide instead of jumping
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href^="#"]');
      if (!link || e.defaultPrevented) return;
      const id = link.getAttribute('href');
      const target = id.length > 1 && document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.start();
      lenis.scrollTo(target, { offset: id === '#hero' ? 0 : -10, duration: 1.2 });
      history.pushState(null, '', id);
    });
  }

  // ------------------------------------------------------------------
  // 2. Hero headline: split into lines for the entrance animation
  // ------------------------------------------------------------------
  const heroTitle = $('#heroTitle');

  function wrapHeroLines() {
    if (!heroTitle || heroTitle.querySelector('.line')) return; // already split
    const lines = heroTitle.innerHTML.split(/<br\s*\/?>/i).map(l => l.trim()).filter(Boolean);
    heroTitle.innerHTML = lines
      .map((l, i) => `<span class="line"><span class="line-inner" style="--i:${i}">${l}</span></span>`)
      .join('');
    // Content arriving after the entrance has played shouldn't replay it
    if (performance.now() - loadTime > 1400) heroTitle.classList.add('settled');
    heroTitle.classList.add('wrapped');
  }
  wrapHeroLines();

  // ------------------------------------------------------------------
  // 3. Ticker under the hero
  // ------------------------------------------------------------------
  const tickerTrack = $('#tickerTrack');
  const tickerSource = $('#tickerSource');
  let tickerX = 0;
  let tickerHalf = 0;

  function buildTicker() {
    if (!tickerTrack || !tickerSource) return;
    const items = tickerSource.textContent.split('/').map(s => s.trim()).filter(Boolean);
    if (!items.length) return;
    const one = items.map(t => {
      const span = document.createElement('span');
      span.className = 'ticker-item';
      span.textContent = t;
      return span.outerHTML;
    }).join('');
    // Repeat until one half is wider than the screen, then double it for a seamless loop
    tickerTrack.innerHTML = one;
    let reps = 1;
    while (tickerTrack.scrollWidth < window.innerWidth * 1.2 && reps < 12) {
      tickerTrack.innerHTML += one;
      reps++;
    }
    tickerTrack.innerHTML += tickerTrack.innerHTML;
    tickerHalf = tickerTrack.scrollWidth / 2;
  }
  buildTicker();

  // ------------------------------------------------------------------
  // 4. About statement: words fill in as you scroll past
  // ------------------------------------------------------------------
  const aboutLead = $('#aboutLead');
  let leadWords = [];

  function splitLead() {
    if (!aboutLead || reduce || aboutLead.querySelector('.w')) return; // already split
    const words = aboutLead.textContent.trim().split(/\s+/);
    aboutLead.setAttribute('aria-label', words.join(' '));
    aboutLead.innerHTML = words.map(w => `<span class="w" aria-hidden="true">${w.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
    leadWords = Array.from(aboutLead.querySelectorAll('.w'));
  }
  splitLead();

  // ------------------------------------------------------------------
  // 5. Event posters: gentle parallax inside their frames
  // ------------------------------------------------------------------
  let posters = [];
  const collectPosters = () => { posters = Array.from(document.querySelectorAll('.event-image')); };
  collectPosters();

  // Re-run splits when the CMS replaces text or events
  document.addEventListener('cms:content', () => {
    wrapHeroLines();
    buildTicker();
    splitLead();
  });
  document.addEventListener('cms:events', collectPosters);

  // ------------------------------------------------------------------
  // 6. Footer wordmark: size it so it exactly fills the width when fully stretched
  // ------------------------------------------------------------------
  const wordmarkEl = $('#footerWordmark');
  function fitWordmark() {
    if (!wordmarkEl) return;
    const prev = wordmarkEl.style.getPropertyValue('--wm-wdth');
    wordmarkEl.style.setProperty('--wm-wdth', '125%');
    wordmarkEl.style.fontSize = '100px';
    const range = document.createRange();
    range.selectNodeContents(wordmarkEl);
    const textWidth = range.getBoundingClientRect().width;
    if (!textWidth) return;
    const available = document.documentElement.clientWidth * 0.94;
    wordmarkEl.style.fontSize = `${(100 * available / textWidth).toFixed(2)}px`;
    if (prev) wordmarkEl.style.setProperty('--wm-wdth', prev);
    else wordmarkEl.style.removeProperty('--wm-wdth');
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWordmark);
  fitWordmark();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { buildTicker(); fitWordmark(); }, 200);
  });

  if (reduce) return;

  // ------------------------------------------------------------------
  // Frame loop: one place that reads scroll and writes styles
  // ------------------------------------------------------------------
  const footer = $('.main-footer');
  const wordmark = $('#footerWordmark');
  const hero = $('#hero');
  let lastScroll = window.scrollY;
  let velocity = 0;
  let direction = 1;

  function frame(time) {
    if (lenis) lenis.raf(time);

    const y = window.scrollY;
    const vh = window.innerHeight;
    const delta = y - lastScroll;
    lastScroll = y;
    if (Math.abs(delta) > 0.5) direction = delta > 0 ? 1 : -1;
    velocity += (Math.abs(delta) - velocity) * 0.12;

    // Hero headline squeezes narrower and drifts up as you leave
    if (hero && heroTitle && y < vh * 1.5) {
      const p = clamp(y / (hero.offsetHeight * 0.85));
      heroTitle.style.setProperty('--hero-wdth', `${75 - p * 25}%`);
      heroTitle.style.setProperty('--hero-shift', `${p * -60}px`);
      heroTitle.style.setProperty('--hero-fade', `${1 - p * 0.75}`);
    }

    // Ticker: steady drift, faster when you scroll, follows scroll direction
    if (tickerHalf) {
      tickerX -= (0.6 + Math.min(velocity, 40) * 0.35) * direction;
      if (tickerX <= -tickerHalf) tickerX += tickerHalf;
      if (tickerX > 0) tickerX -= tickerHalf;
      tickerTrack.style.transform = `translate3d(${tickerX}px,0,0)`;
    }

    // About statement fill
    if (leadWords.length) {
      const r = aboutLead.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        const p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35));
        const lit = Math.round(p * leadWords.length);
        for (let i = 0; i < leadWords.length; i++) leadWords[i].classList.toggle('on', i < lit);
      }
    }

    // Poster parallax
    for (const img of posters) {
      const r = img.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const p = clamp((r.top + r.height / 2) / (vh + r.height)); // 0 top → 1 bottom
      img.style.setProperty('--parallax', `${-10 + (1 - p) * 10}%`);
    }

    // Footer wordmark stretches out as it arrives
    if (footer && wordmark) {
      const r = footer.getBoundingClientRect();
      if (r.top < vh) {
        const p = clamp((vh - r.top) / Math.min(r.height, vh));
        wordmark.style.setProperty('--wm-wdth', `${55 + p * 70}%`);
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
