// ==========================================
// Web3Forms Configuration (email notifications)
// Get your free access key at https://web3forms.com
// ==========================================
const WEB3FORMS_ACCESS_KEY = '5361e138-314b-4046-9d2c-526581028f5e';

// ==========================================
// CMS / Database (Supabase) — configured in cms-config.js
// ==========================================
const CMS = window.CMS_CONFIG || {};
const DB_ENABLED = !!(CMS.SUPABASE_URL && CMS.SUPABASE_ANON_KEY);

async function dbRequest(path, options = {}) {
  const url = `${CMS.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: CMS.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CMS.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`Database request failed (${response.status}): ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function saveSubmission(record) {
  return dbRequest('submissions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(record)
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// UK phone: accepts 07…, +44 7…, 0044…, landlines; returns +44 format or null
function normaliseUkPhone(value) {
  const digits = String(value || '').replace(/[\s()\-.]/g, '');
  const match = digits.match(/^(?:\+44|0044|0)([1-9]\d{8,9})$/);
  return match ? '+44' + match[1] : null;
}

// UK postcode: returns e.g. "TN1 1XF" or null
function normaliseUkPostcode(value) {
  const compact = String(value || '').toUpperCase().replace(/\s+/g, '');
  if (!/^(?:[A-Z]{1,2}\d[A-Z\d]?|GIR)\d[A-Z]{2}$/.test(compact)) return null;
  return compact.slice(0, -3) + ' ' + compact.slice(-3);
}

// Helper function to submit form data to Web3Forms
async function sendToWeb3Forms(data) {
  if (window.CMS_CONFIG && window.CMS_CONFIG.DISABLE_EMAIL) {
    console.info('Email sending is off (local demo). Form data:', data);
    return { success: true, skipped: true };
  }

  if (WEB3FORMS_ACCESS_KEY === 'YOUR_ACCESS_KEY_HERE' || !WEB3FORMS_ACCESS_KEY) {
    console.warn('Web3Forms Access Key is not configured. Form data:', data);
    // Simulate network delay and return success for testing/demo purposes
    await new Promise(resolve => setTimeout(resolve, 1200));
    return { success: true, isDemo: true };
  }

  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        from_name: 'Little Crew & Co Website',
        ...data
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Error submitting form to Web3Forms:', error);
    return { success: false, message: error.message || 'Connection error' };
  }
}

// Saves the form to the database (for the admin panel) AND sends the email
// notification. Succeeds if at least one of the two works.
function saveFailedMessage() {
  const phoneEl = document.querySelector('[data-cms="contact.phone"]');
  const phone = phoneEl ? phoneEl.textContent.trim() : '';
  return "We couldn't save your details. Please check your connection and try again" +
    (phone ? `, or call us on ${phone}.` : '.');
}

// Saves the form to the database (what the admin panel shows) and then sends
// the email notification. When the database is connected, the form only counts
// as sent once the database save works — so nothing can silently go missing.
// `suspicious` = the hidden spam-trap field was filled. That can be a bot, but
// browser AutoFill sometimes fills it too, so the entry is still saved (marked
// for review) instead of being thrown away; only the email is skipped.
async function submitForm(record, emailData, suspicious = false) {
  if (suspicious) {
    record = { ...record, subject: `[Possible spam] ${record.subject || ''}`.slice(0, 300) };
    emailData = { ...emailData, subject: `[Possible spam] ${emailData.subject || ''}` };
  }

  if (DB_ENABLED) {
    try {
      await saveSubmission(record);
    } catch (error) {
      console.error('Could not save form to the database:', error);
      return { success: false, message: saveFailedMessage() };
    }
    if (suspicious) return { success: true };
    // Saved: the email is a bonus notification, so its result doesn't change the outcome
    sendToWeb3Forms(emailData).then(mail => {
      if (!mail.success && !mail.skipped) console.warn('Email notification failed:', mail.message);
    });
    return { success: true };
  }

  // No database configured: email is the only record
  const mail = await sendToWeb3Forms(emailData);
  return {
    success: !!mail.success,
    isDemo: !!mail.isDemo,
    message: mail.success ? '' : "We couldn't send your message. Please check your connection and try again."
  };
}

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. Header: solid once scrolled, hides while scrolling down
  // ==========================================
  const header = document.querySelector('.main-header');
  let lastY = window.scrollY;
  function updateHeader() {
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 20);
    const menuOpen = document.body.classList.contains('no-scroll');
    header.classList.toggle('header-hidden', !menuOpen && y > 300 && y > lastY + 2);
    if (y < lastY - 2 || y <= 300) header.classList.remove('header-hidden');
    lastY = y;
  }
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
  header.addEventListener('focusin', () => header.classList.remove('header-hidden'));

  // Underline the nav link for the section currently on screen
  const navLinks = document.querySelectorAll('.desktop-nav .nav-item');
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => link.classList.toggle('is-current', link.getAttribute('href') === '#' + entry.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['hero', 'about', 'services', 'events', 'contact'].forEach(id => {
    const el = document.getElementById(id);
    if (el) spy.observe(el);
  });

  // ==========================================
  // 2. Mobile Navigation Toggle
  // ==========================================
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');

  function toggleMobileMenu() {
    const open = !mobileNav.classList.contains('active');
    header.classList.remove('header-hidden');
    hamburgerBtn.classList.toggle('active', open);
    mobileNav.classList.toggle('active', open);
    document.body.classList.toggle('no-scroll', open);
    hamburgerBtn.setAttribute('aria-expanded', String(open));
    hamburgerBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.dispatchEvent(new CustomEvent(open ? 'lc:lock' : 'lc:unlock'));
  }

  hamburgerBtn.addEventListener('click', toggleMobileMenu);
  mobileNavItems.forEach(item => {
    item.addEventListener('click', () => {
      if (mobileNav.classList.contains('active')) toggleMobileMenu();
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mobileNav.classList.contains('active')) toggleMobileMenu();
  });

  // ==========================================
  // 3. About stats counters (start when the numbers come into view)
  // ==========================================
  let countersAnimated = false;
  const statsBlock = document.querySelector('.about-stats');
  if (statsBlock) {
    new IntersectionObserver((entries, observer) => {
      if (entries.some(e => e.isIntersecting)) {
        animateCounters();
        observer.disconnect();
      }
    }, { threshold: 0.4 }).observe(statsBlock);
  }

  function animateCounters() {
    if (countersAnimated) return;
    countersAnimated = true;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('.stat-num').forEach(counter => {
      const target = +counter.getAttribute('data-val') || 0;
      if (reduce) { counter.innerText = target; return; }
      const start = performance.now();
      const duration = 1400;
      const tick = now => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 4);
        counter.innerText = Math.round(target * eased);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // ==========================================
  // 5. Editable Content (from the admin panel)
  // ==========================================
  function richText(value, className) {
    // *word* → highlighted span, new line → line break
    return escapeHtml(value)
      .replace(/\*(.+?)\*/g, `<span class="${className}">$1</span>`)
      .replace(/\n/g, '<br>');
  }

  function applyContent(content) {
    document.querySelectorAll('[data-cms]').forEach(el => {
      const value = content[el.dataset.cms];
      if (value === undefined || value === null) return;

      if (el.dataset.cmsAttr) {
        el.setAttribute(el.dataset.cmsAttr, value);
        if (el.classList.contains('stat-num') && countersAnimated) el.innerText = value;
        return;
      }

      if (el.dataset.cmsRich) {
        el.innerHTML = richText(value, el.dataset.cmsRich);
      } else {
        el.textContent = value;
      }

      if (el.dataset.cmsHref) {
        const prefix = el.dataset.cmsHref;
        el.href = prefix + (prefix === 'tel:' ? value.replace(/[^\d+]/g, '') : value.trim());
      }
    });
  }

  // ==========================================
  // 6. Events (rendered from the database when configured)
  // ==========================================
  const upcomingGrid = document.getElementById('upcomingGrid');
  const pastGrid = document.getElementById('pastGrid');
  const pastEventsBlock = document.getElementById('pastEventsBlock');
  const filterBtns = document.querySelectorAll('.filter-btn');

  // Built-in details, used when the database isn't configured
  let eventsData = {
    anarkali_marikar: {
      title: 'Anarkali Marikar Remix — New Year Party',
      image: 'assets/anarkali_marikar_live.jpg',
      time: 'Sunday, January 3rd, 2027 • Gate Opens: 5:00 PM',
      location: 'Maidstone Leisure Centre, ME15 7RN',
      artist: 'Anarkali Marikar & Live Band',
      description: "Little Crew presents Anarkali Marikar Remix - New Year Party! Celebrate New Year 2027 with a high-energy live music performance by Anarkali Marikar and band. Featuring a Live DJ, authentic food stalls, live henna artists, live caricatures, and a 360° photobooth for a night to remember at Maidstone Leisure Centre. Powered by Joanna Holidays, Ample Mortgages, Nava Ruchi, and IMAD Photography. Book your tickets now on CrowdPass!",
      ctaText: 'Book Tickets on CrowdPass 🎟️',
      bookingUrl: 'https://littlecrew.crowdpass.co.uk/'
    },
    sooraj_santhosh: {
      title: 'Sooraj Santhosh Live — UK & Ireland Tour',
      image: 'assets/sooraj_santhosh_tour.jpg',
      time: 'May 2027 • UK & Ireland Tour',
      location: 'UK & Ireland Venues (Announcing Soon)',
      artist: 'Sooraj Santhosh',
      description: 'One Voice, A Thousand Emotions. Little Crew Presents Sooraj Santhosh Live on his landmark tour across the UK and Ireland, powered by Joanna Holidays. Experience an electrifying evening of soulful melodies and powerhouse vocals. Stay tuned for city and venue schedules! Contact us at 073 88 390 443 for tour info and sponsorships.',
      ctaText: 'Register for Tour Info'
    },
    anju_joseph: {
      title: 'Anju Joseph Live — UK & Europe Tour',
      image: 'assets/anju_joseph_tour.jpg',
      time: 'May – June 2027 • UK & Europe Tour',
      location: 'UK & Europe Venues (Announcing Soon)',
      artist: 'Anju Joseph, Feat. Sreenath Sivasankaran & Mahesh Kunjumon',
      description: 'A Complete Entertainment Show! Little Crew and V4 Entertainments present Anju Joseph Live on an electrifying UK & Europe tour across May – June 2027. Featuring dynamic musical performances with Sreenath Sivasankaran and sensational comedy & mimicry by Mahesh Kunjumon. Contact us for tour bookings and sponsorships at +44 7388 390443 or +44 7878 8896384.',
      ctaText: 'Inquire for Tour Info'
    },
    tun_fun: {
      title: 'Tun Fun Nights (Past Event)',
      image: 'assets/tun_fun_nights.jpg',
      time: 'Saturday, July 25th, 2026 • 8:00 PM onwards',
      location: 'Aura Bar & Club, 46-50 High St, Tunbridge Wells, TN1 1XF',
      artist: 'DJ Julix',
      description: 'The ultimate multilingual DJ night. Live, loud, and unlimited fun! Experience amazing beats, non-stop entertainment, and the best party vibes with DJ Julix. This event has concluded. Contact us for private bookings and future party series!',
      ctaText: 'Inquire for Future Events'
    }
  };

  function safeUrl(url) {
    const value = String(url || '').trim();
    return /^(https?:|mailto:|tel:)/i.test(value) || !/^[a-z]+:/i.test(value) ? value : '';
  }

  // 'tickets' (link), 'waitlist' (waitlist form) or 'enquiry' (name + email form)
  function bookingMode(ev) {
    const mode = ev.booking_mode || (ev.booking_url ? 'tickets' : 'enquiry');
    return mode === 'tickets' && !safeUrl(ev.booking_url) ? 'enquiry' : mode;
  }

  function eventCardHtml(ev) {
    const isPast = ev.category === 'past';
    const pillClass = { upcoming: 'upcoming-pill', tour: 'tour-pill', past: 'past-pill' }[ev.pill_style] || 'upcoming-pill';
    const badges = (ev.badges || []).filter(Boolean);
    const mode = bookingMode(ev);
    const bookingUrl = safeUrl(ev.booking_url);
    const phone = String(ev.phone || '').replace(/[^\d+]/g, '');

    let actions = '';
    if (isPast) {
      actions = `<button class="btn btn-outline btn-sm btn-block open-event-modal" data-event-id="${escapeHtml(ev.id)}">View Event Highlights 📸</button>`;
    } else {
      if (mode === 'tickets') {
        actions += `<a href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">Book Now 🎟️</a>`;
      } else if (mode === 'waitlist') {
        actions += `<button class="btn btn-primary btn-sm open-event-modal" data-event-id="${escapeHtml(ev.id)}">Join Waitlist 📝</button>`;
      }
      if (phone) {
        actions += `<a href="tel:${escapeHtml(phone)}" class="btn btn-outline btn-sm">Call Contact 📞</a>`;
      }
      if (!actions) {
        actions = `<button class="btn btn-primary btn-sm open-event-modal" data-event-id="${escapeHtml(ev.id)}">More Details</button>`;
      }
    }

    return `
      <div class="event-card glass-card${isPast ? ' past-event-card' : ''}" data-category="${isPast ? 'past' : 'upcoming'}"${isPast ? ' style="max-width: 520px; width: 100%;"' : ''}>
        <div class="event-image-wrapper open-event-modal" data-event-id="${escapeHtml(ev.id)}" title="Click to view details">
          ${ev.image_url ? `<img src="${escapeHtml(safeUrl(ev.image_url))}" alt="${escapeHtml(ev.title)} poster" class="event-image${isPast ? ' past-event-image' : ''}" loading="lazy">` : ''}
          ${(ev.date_day || ev.date_month || ev.date_year) ? `
          <div class="event-date-badge${isPast ? ' past-date' : ''}">
            <span class="day">${escapeHtml(ev.date_day)}</span>
            <span class="month">${escapeHtml(ev.date_month)}</span>
            <span class="year">${escapeHtml(ev.date_year)}</span>
          </div>` : ''}
          ${ev.status_pill ? `<div class="event-status-pill ${pillClass}">${escapeHtml(ev.status_pill)}</div>` : ''}
        </div>
        <div class="event-info">
          <div class="event-meta">
            ${ev.time_label ? `<span class="event-time">${escapeHtml(ev.time_label)}</span>` : ''}
            ${ev.location ? `<span class="event-location">${escapeHtml(ev.location)}</span>` : ''}
          </div>
          <h3 class="event-title">${escapeHtml(ev.title)}</h3>
          ${ev.tagline ? `<div class="event-tagline-text"${isPast ? ' style="color: var(--text-muted);"' : ''}>${escapeHtml(ev.tagline)}</div>` : ''}
          ${ev.summary ? `<p class="event-desc">${escapeHtml(ev.summary)}</p>` : ''}
          ${badges.length ? `<div class="event-artist-row">${badges.map(b => `<span class="artist-badge">${escapeHtml(b)}</span>`).join('')}</div>` : ''}
          <div class="event-actions">${actions}</div>
        </div>
      </div>`;
  }

  function stripEmoji(text) {
    return String(text || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  }

  function renderEvents(events) {
    const upcoming = events.filter(ev => ev.category !== 'past');
    const past = events.filter(ev => ev.category === 'past');

    upcomingGrid.innerHTML = upcoming.length
      ? upcoming.map(eventCardHtml).join('')
      : '<p class="section-subtitle" style="grid-column: 1 / -1; text-align: center;">New events are coming soon — stay tuned!</p>';
    pastGrid.innerHTML = past.map(eventCardHtml).join('');
    pastEventsBlock.dataset.empty = past.length ? '' : 'true';

    eventsData = {};
    events.forEach(ev => {
      eventsData[ev.id] = {
        title: ev.details_title || ev.title,
        image: safeUrl(ev.image_url),
        time: ev.details_time || stripEmoji(ev.time_label),
        location: ev.details_location || stripEmoji(ev.location),
        artist: ev.artist,
        description: ev.description || ev.summary || '',
        mode: bookingMode(ev),
        ctaText: ev.cta_text || { tickets: 'Book Tickets Now 🎟️', waitlist: 'Join Waitlist 📝', enquiry: 'Send Enquiry' }[bookingMode(ev)],
        bookingUrl: safeUrl(ev.booking_url)
      };
    });

    document.getElementById('upcomingCount').textContent = upcoming.length;
    document.getElementById('pastCount').textContent = past.length;

    const active = document.querySelector('.filter-btn.active');
    applyFilter(active ? active.getAttribute('data-filter') : 'all');
    renderNextUp(upcoming[0]);
    renderHeroSlides(events.filter(ev => ev.featured && ev.category !== 'past'));
    document.dispatchEvent(new CustomEvent('cms:events'));
  }

  // ==========================================
  // Hero slider: event ads chosen in the admin ("Show in top banner"),
  // followed by the brand slide
  // ==========================================
  const heroEl = document.getElementById('hero');
  const slidesEl = document.getElementById('heroSlides');
  const heroControls = document.getElementById('heroControls');
  const dotsEl = document.getElementById('heroDots');
  const pauseBtn = document.getElementById('heroPause');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SLIDE_MS = 7000;
  let slideIndex = 0;
  let userPaused = false;
  let hoverPaused = false;

  heroEl.style.setProperty('--slide-ms', `${SLIDE_MS}ms`);
  if (reduceMotion) heroEl.classList.add('no-autoplay');

  const allSlides = () => Array.from(slidesEl.querySelectorAll('.hero-slide'));

  function eventSlideHtml(ev) {
    const id = escapeHtml(ev.id);
    const mode = bookingMode(ev);
    const img = safeUrl(ev.image_url);
    // Only use the date badge when it's a real day (tours put words like "MAY / TOUR" there)
    const date = /^\d{1,2}$/.test(String(ev.date_day || '').trim())
      ? [ev.date_day, ev.date_month, ev.date_year].filter(Boolean).join(' ')
      : '';
    const meta = [date, stripEmoji(ev.time_label), stripEmoji(ev.location)].filter(Boolean);

    let actions;
    if (mode === 'tickets') {
      actions = `<a href="${escapeHtml(safeUrl(ev.booking_url))}" target="_blank" rel="noopener noreferrer" class="btn btn-ticket">Book tickets 🎟️</a>
        <button class="btn btn-ghost open-event-modal" data-event-id="${id}">Event details</button>`;
    } else if (mode === 'waitlist') {
      actions = `<button class="btn btn-ticket open-event-modal" data-event-id="${id}">Join the waitlist 📝</button>`;
    } else {
      actions = `<button class="btn btn-ticket open-event-modal" data-event-id="${id}">Enquire now</button>`;
    }

    const banner = safeUrl(ev.banner_image_url);
    const cssUrl = url => `url('${escapeHtml(url.replace(/'/g, '%27'))}')`;

    // With a banner ad image: it fills the slide behind the text (on phones it shows above the text).
    // Without one: blurred poster backdrop with the poster card on the right.
    const media = banner
      ? `<div class="slide-banner-bg" style="background-image:${cssUrl(banner)}"></div>`
      : (img ? `<div class="slide-backdrop" style="background-image:${cssUrl(img)}"></div>` : '');
    const bannerImg = banner
      ? `<img class="slide-banner-img open-event-modal" data-event-id="${id}" src="${escapeHtml(banner)}" alt="${escapeHtml(ev.title)}">`
      : '';
    const posterCard = !banner && img
      ? `<div class="slide-poster open-event-modal" data-event-id="${id}" title="View event details"><img src="${escapeHtml(img)}" alt="${escapeHtml(ev.title)} poster"></div>`
      : '';

    return `
      <div class="hero-slide hero-slide-event${banner ? ' has-banner' : ''}" role="group" aria-roledescription="slide" aria-label="${escapeHtml(ev.title)}">
        ${media}
        <div class="container slide-event-inner">
          ${bannerImg}
          <div class="slide-copy">
            ${ev.status_pill ? `<p class="slide-kicker">${escapeHtml(ev.status_pill)}</p>` : ''}
            <h2 class="slide-title">${escapeHtml(ev.title)}</h2>
            ${ev.tagline ? `<p class="slide-tagline">${escapeHtml(ev.tagline)}</p>` : ''}
            ${meta.length ? `<ul class="slide-meta">${meta.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}
            ${ev.summary ? `<p class="slide-summary">${escapeHtml(ev.summary)}</p>` : ''}
            <div class="slide-actions">${actions}</div>
          </div>
          ${posterCard}
        </div>
      </div>`;
  }

  function renderHeroSlides(featured) {
    slidesEl.querySelectorAll('.hero-slide-event').forEach(el => el.remove());
    const brand = slidesEl.querySelector('.hero-slide-brand');
    featured.forEach(ev => brand.insertAdjacentHTML('beforebegin', eventSlideHtml(ev)));
    setupSlider();
  }

  function setupSlider() {
    const slides = allSlides();
    heroControls.hidden = slides.length < 2;
    pauseBtn.hidden = reduceMotion;
    dotsEl.innerHTML = slides.map((slide, i) =>
      `<button class="slider-dot" role="tab" aria-label="Slide ${i + 1} of ${slides.length}: ${escapeHtml(slide.getAttribute('aria-label') || '')}"></button>`
    ).join('');
    goToSlide(0);
  }

  function isPaused() {
    return reduceMotion || userPaused || hoverPaused || document.hidden;
  }

  function updatePauseState() {
    heroEl.classList.toggle('is-paused', isPaused());
  }

  function goToSlide(index) {
    const slides = allSlides();
    if (!slides.length) return;
    slideIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === slideIndex;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active; // hidden slides can't be tabbed into
    });
    Array.from(dotsEl.children).forEach((dot, i) => {
      dot.classList.remove('is-active');
      dot.setAttribute('aria-selected', String(i === slideIndex));
    });
    const dot = dotsEl.children[slideIndex];
    if (dot) {
      void dot.offsetWidth; // restart the progress animation
      dot.classList.add('is-active');
    }
    updatePauseState();
  }

  // The active dot's progress bar drives autoplay: when it fills, move on
  dotsEl.addEventListener('animationend', e => {
    if (e.target.classList.contains('is-active') && !isPaused() && allSlides().length > 1) goToSlide(slideIndex + 1);
  });
  dotsEl.addEventListener('click', e => {
    const dot = e.target.closest('.slider-dot');
    if (dot) goToSlide(Array.from(dotsEl.children).indexOf(dot));
  });
  document.getElementById('heroPrev').addEventListener('click', () => goToSlide(slideIndex - 1));
  document.getElementById('heroNext').addEventListener('click', () => goToSlide(slideIndex + 1));
  pauseBtn.addEventListener('click', () => {
    userPaused = !userPaused;
    pauseBtn.textContent = userPaused ? '▶' : '❚❚';
    pauseBtn.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
    updatePauseState();
  });

  // Pause while someone is pointing at or tabbing through the banner
  slidesEl.addEventListener('mouseenter', () => { hoverPaused = true; updatePauseState(); });
  slidesEl.addEventListener('mouseleave', () => { hoverPaused = false; updatePauseState(); });
  heroEl.addEventListener('focusin', () => { hoverPaused = true; updatePauseState(); });
  heroEl.addEventListener('focusout', () => { hoverPaused = false; updatePauseState(); });
  document.addEventListener('visibilitychange', updatePauseState);

  heroControls.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') goToSlide(slideIndex - 1);
    if (e.key === 'ArrowRight') goToSlide(slideIndex + 1);
  });

  // Swipe on touch screens
  let touchStart = null;
  slidesEl.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') touchStart = { x: e.clientX, y: e.clientY };
  });
  slidesEl.addEventListener('pointerup', e => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) goToSlide(slideIndex + (dx < 0 ? 1 : -1));
  });
  slidesEl.addEventListener('pointercancel', () => { touchStart = null; });
  slidesEl.style.touchAction = 'pan-y';

  setupSlider();

  // Hero "Next up" card shows the first upcoming event
  function renderNextUp(ev) {
    const card = document.getElementById('nextUp');
    if (!card) return;
    if (!ev) { card.hidden = true; return; }
    card.hidden = false;
    const img = document.getElementById('nextUpImg');
    if (ev.image_url) { img.src = safeUrl(ev.image_url); img.hidden = false; } else { img.hidden = true; }
    document.getElementById('nextUpTitle').textContent = ev.title;
    const date = [ev.date_day, ev.date_month, ev.date_year].filter(Boolean).join(' ');
    document.getElementById('nextUpDate').textContent = date || stripEmoji(ev.time_label);
  }

  // ==========================================
  // 7. Events Category Filter
  // ==========================================
  function applyFilter(filterValue) {
    document.querySelectorAll('.event-card').forEach(card => {
      const category = card.getAttribute('data-category');

      if (filterValue === 'all' || category === filterValue) {
        card.style.display = 'flex';
        card.style.animation = 'fadeIn 0.5s forwards';
      } else {
        card.style.display = 'none';
      }
    });

    // Show or hide the Past Events sub-section block
    if (pastEventsBlock) {
      const hide = filterValue === 'upcoming' || pastEventsBlock.dataset.empty === 'true';
      pastEventsBlock.style.display = hide ? 'none' : 'block';
    }
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle active button style
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.getAttribute('data-filter'));
    });
  });

  // ==========================================
  // 8. Load content & events from the database
  // ==========================================
  if (DB_ENABLED) {
    dbRequest('site_content?select=key,value')
      .then(rows => {
        const content = {};
        (rows || []).forEach(row => { content[row.key] = row.value; });
        applyContent(content);
        document.dispatchEvent(new CustomEvent('cms:content'));
      })
      .catch(err => console.error('Could not load site content:', err));

    dbRequest('events?select=*&published=eq.true&order=sort_order.asc,created_at.asc')
      .then(rows => renderEvents(rows || []))
      .catch(err => console.error('Could not load events:', err));
  }

  // ==========================================
  // 9. Interactive Event Details & Booking Modals
  // ==========================================
  const eventModal = document.getElementById('eventModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalContent = document.getElementById('modalContent');

  function demoNotice(isDemo) {
    return isDemo ? `
      <div style="margin: -1rem auto 2rem auto; padding: 0.75rem; border-radius: 8px; background: rgba(168,85,247,0.15); border: 1px dashed #a855f7; max-width: 400px; font-size: 0.85rem; color: #d8b4fe; line-height: 1.4;">
        <strong>🔧 Developer Demo Mode:</strong> To save submissions, add your Supabase details in <code>cms-config.js</code>.
      </div>
    ` : '';
  }

  function openModal(eventId) {
    const data = eventsData[eventId];
    if (!data) return;

    modalContent.innerHTML = `
      ${data.image ? `<img src="${escapeHtml(data.image)}" alt="${escapeHtml(data.title)}" class="modal-banner">` : ''}
      <h3 class="modal-title">${escapeHtml(data.title)}</h3>
      <div class="modal-meta-grid">
        ${data.artist ? `<div><strong>Artist:</strong> ${escapeHtml(data.artist)}</div>` : ''}
        ${data.time ? `<div><strong>Time:</strong> ${escapeHtml(data.time)}</div>` : ''}
        ${data.location ? `<div style="grid-column: span 2"><strong>Venue:</strong> ${escapeHtml(data.location)}</div>` : ''}
      </div>
      <p class="modal-description">${escapeHtml(data.description)}</p>

      ${modalActionHtml(data)}
    `;

    eventModal.classList.add('active');
    document.body.classList.add('no-scroll');
    document.dispatchEvent(new CustomEvent('lc:lock'));
    modalCloseBtn.focus({ preventScroll: true });

    const form = document.getElementById('modalBookingForm');
    if (form) form.addEventListener('submit', e => handleEventForm(e, data));
  }

  function modalActionHtml(data) {
    const mode = data.mode || (data.bookingUrl ? 'tickets' : 'enquiry');
    // Spam trap: display:none keeps it away from people, screen readers and AutoFill
    const honeypot = '<div class="trap-wrap" aria-hidden="true"><input type="text" id="booking_website" name="lc_extra_field" tabindex="-1" autocomplete="off"></div>';

    if (mode === 'tickets' && data.bookingUrl) {
      return `
        <div style="margin-top: 1.5rem; text-align: center;">
          <a href="${escapeHtml(data.bookingUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-block" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; text-decoration: none; padding: 0.85rem; font-size: 1.05rem;">
            ${escapeHtml(data.ctaText || 'Book Tickets Now 🎟️')}
          </a>
        </div>`;
    }

    if (mode === 'waitlist') {
      return `
        <form class="modal-booking-form waitlist-form" id="modalBookingForm" data-mode="waitlist" novalidate>
          <h4 class="waitlist-heading">Join the Waitlist</h4>
          <p class="waitlist-note">Booking isn't open yet. Join the waitlist and we'll let you know as soon as tickets are available.</p>
          <div class="waitlist-grid">
            <label class="waitlist-field">
              <span>Full name</span>
              <input type="text" id="booking_name" required maxlength="200" autocomplete="name" placeholder="Your name">
            </label>
            <label class="waitlist-field">
              <span>Email</span>
              <input type="email" id="booking_email" required maxlength="320" autocomplete="email" placeholder="you@example.com">
            </label>
            <label class="waitlist-field">
              <span>UK contact number</span>
              <input type="tel" id="booking_phone" required maxlength="20" autocomplete="tel" placeholder="07123 456789">
            </label>
            <label class="waitlist-field">
              <span>UK postcode</span>
              <input type="text" id="booking_postcode" required maxlength="10" autocomplete="postal-code" placeholder="TN1 1XF" style="text-transform: uppercase;">
            </label>
          </div>
          <p class="waitlist-error" id="waitlistError" role="alert"></p>
          ${honeypot}
          <button type="submit" class="btn btn-primary btn-block">${escapeHtml(data.ctaText || 'Join Waitlist 📝')}</button>
        </form>`;
    }

    return `
      <form class="modal-booking-form" id="modalBookingForm" data-mode="enquiry">
        <h4 style="margin-bottom: 0.5rem; font-family: var(--font-display)">Secure Your Spot</h4>
        <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
          <input type="text" id="booking_name" placeholder="Your Name" required maxlength="200" style="width: 50%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: white;">
          <input type="email" id="booking_email" placeholder="Your Email" required maxlength="320" style="width: 50%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: white;">
        </div>
        <p class="waitlist-error" id="enquiryError" role="alert"></p>
        ${honeypot}
        <button type="submit" class="btn btn-primary btn-block">${escapeHtml(data.ctaText)}</button>
      </form>`;
  }

  async function handleEventForm(e, data) {
    e.preventDefault();
    const form = e.currentTarget;
    const isWaitlist = form.dataset.mode === 'waitlist';
    const submitBtn = form.querySelector('button[type="submit"]');

    const name = document.getElementById('booking_name').value.trim();
    const email = document.getElementById('booking_email').value.trim();
    const isBot = document.getElementById('booking_website').value !== '';
    let phone = null;
    let postcode = null;

    if (isWaitlist) {
      const errorBox = document.getElementById('waitlistError');
      const phoneInput = document.getElementById('booking_phone');
      const postcodeInput = document.getElementById('booking_postcode');
      phone = normaliseUkPhone(phoneInput.value);
      postcode = normaliseUkPostcode(postcodeInput.value);

      const problems = [];
      if (!name) problems.push([document.getElementById('booking_name'), 'Please enter your name.']);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push([document.getElementById('booking_email'), 'Please enter a valid email address.']);
      if (!phone) problems.push([phoneInput, 'Please enter a valid UK phone number, e.g. 07123 456789.']);
      if (!postcode) problems.push([postcodeInput, 'Please enter a valid UK postcode, e.g. TN1 1XF.']);

      form.querySelectorAll('input').forEach(input => input.removeAttribute('aria-invalid'));
      if (problems.length) {
        problems.forEach(([input]) => input.setAttribute('aria-invalid', 'true'));
        errorBox.textContent = problems[0][1];
        problems[0][0].focus();
        return;
      }
      errorBox.textContent = '';
      postcodeInput.value = postcode;
    }

    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Sending... ⏳';

    const details = `Time: ${data.time || '-'}\nLocation: ${data.location || '-'}`;
    const response = await submitForm(
      isWaitlist
        ? { form: 'waitlist', name, email, phone, postcode, subject: `Waitlist: ${data.title}`.slice(0, 300), event_title: data.title.slice(0, 300), message: details }
        : { form: 'booking', name, email, subject: `Event enquiry: ${data.title}`.slice(0, 300), event_title: data.title.slice(0, 300), message: details },
      isWaitlist
        ? {
          name, email, phone,
          subject: `[Waitlist] ${data.title}`,
          message: `Waitlist sign-up:\n- Event: ${data.title}\n- Name: ${name}\n- Email: ${email}\n- Phone: ${phone}\n- Postcode: ${postcode}`
        }
        : {
          name, email,
          subject: `[Event Booking] ${data.title}`,
          message: `Booking request details:\n- Event: ${data.title}\n- Time: ${data.time}\n- Location: ${data.location}\n- Client Email: ${email}`
        },
      isBot
    );

    if (response.success) {
      modalContent.innerHTML = `
        <div style="text-align: center; padding: 3rem 1.5rem;">
          <div style="font-size: 3rem; margin-bottom: 1.5rem;">${isWaitlist ? '📝' : '✨'}</div>
          <h3 class="modal-title" style="margin-bottom: 1rem;">${isWaitlist ? "You're on the Waitlist!" : 'Our Team Will Get Back to You!'}</h3>
          <p class="modal-description" style="margin-bottom: 2rem;">
            ${isWaitlist
              ? `Thank you, <strong>${escapeHtml(name)}</strong>! You've joined the waitlist for <strong>${escapeHtml(data.title)}</strong>. We'll contact you at <strong>${escapeHtml(email)}</strong> as soon as booking opens.`
              : `Thank you, <strong>${escapeHtml(name)}</strong>! We have received your inquiry for <strong>${escapeHtml(data.title)}</strong>. Our team will get in touch with you at <strong>${escapeHtml(email)}</strong> shortly with all the details.`}
          </p>
          ${demoNotice(response.isDemo)}
          <button class="btn btn-primary" id="modalConfirmDone">Done</button>
        </div>
      `;
      document.getElementById('modalConfirmDone').addEventListener('click', closeModal);
    } else {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
      const errorEl = document.getElementById(isWaitlist ? 'waitlistError' : 'enquiryError');
      if (errorEl) errorEl.textContent = response.message || saveFailedMessage();
    }
  }

  function closeModal() {
    eventModal.classList.remove('active');
    document.body.classList.remove('no-scroll');
    document.dispatchEvent(new CustomEvent('lc:unlock'));
  }

  // One listener handles every "open details" element, including events added later
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.open-event-modal');
    if (trigger) openModal(trigger.getAttribute('data-event-id'));
  });

  modalCloseBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && eventModal.classList.contains('active')) closeModal();
  });
  eventModal.addEventListener('click', (e) => {
    if (e.target === eventModal) closeModal();
  });

  // ==========================================
  // 10. Contact Form Handling
  // ==========================================
  const contactForm = document.getElementById('contactForm');
  const contactSubmitBtn = contactForm.querySelector('button[type="submit"]');
  const contactError = document.getElementById('contactError');

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('form_name').value.trim();
    const email = document.getElementById('form_email').value.trim();
    const phone = document.getElementById('form_phone').value.trim();
    const subject = document.getElementById('form_subject').value;
    const message = document.getElementById('form_message').value.trim();
    const isBot = document.getElementById('form_website').value !== '';
    const originalBtnText = contactSubmitBtn.innerHTML;
    contactError.textContent = '';

    // Loading state
    contactSubmitBtn.disabled = true;
    contactSubmitBtn.innerHTML = 'Sending... ⏳';

    const response = await submitForm(
      { form: 'contact', name, email, phone: phone || null, subject, message: message.slice(0, 5000) },
      {
        name: name,
        email: email,
        phone: phone,
        subject: `[Contact Form] ${subject}`,
        message: message
      },
      isBot
    );

    if (response.success) {
      // Open clean modal to display success message
      modalContent.innerHTML = `
        <div style="text-align: center; padding: 3rem 1.5rem;">
          <div style="font-size: 3.5rem; margin-bottom: 1.5rem;">✉️</div>
          <h3 class="modal-title" style="margin-bottom: 1rem;">Message Sent Successfully!</h3>
          <p class="modal-description" style="margin-bottom: 2rem;">
            Thank you, <strong>${escapeHtml(name)}</strong>, for reaching out to Little Crew & Co regarding <strong>${escapeHtml(subject)}</strong>.
            We have registered your request and will respond to <strong>${escapeHtml(email)}</strong> within 24 hours.
          </p>
          ${demoNotice(response.isDemo)}
          <button class="btn btn-primary" id="modalConfirmDone">Continue</button>
        </div>
      `;

      eventModal.classList.add('active');
      document.body.classList.add('no-scroll');
      document.dispatchEvent(new CustomEvent('lc:lock'));

      // Reset Form
      contactForm.reset();

      document.getElementById('modalConfirmDone').addEventListener('click', closeModal);
    } else {
      contactError.textContent = response.message || saveFailedMessage();
    }

    // Reset button state
    contactSubmitBtn.disabled = false;
    contactSubmitBtn.innerHTML = originalBtnText;
  });
});
