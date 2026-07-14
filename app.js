// ==========================================
// Web3Forms Configuration
// Get your free access key at https://web3forms.com
// ==========================================
const WEB3FORMS_ACCESS_KEY = '5361e138-314b-4046-9d2c-526581028f5e';

// Helper function to submit form data to Web3Forms
async function sendToWeb3Forms(data) {
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

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. Header Scroll Effect
  // ==========================================
  const header = document.querySelector('.main-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // ==========================================
  // 2. Mobile Navigation Toggle
  // ==========================================
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');

  function toggleMobileMenu() {
    hamburgerBtn.classList.toggle('active');
    mobileNav.classList.toggle('active');
    document.body.classList.toggle('no-scroll');
  }

  hamburgerBtn.addEventListener('click', toggleMobileMenu);

  mobileNavItems.forEach(item => {
    item.addEventListener('click', () => {
      // Close menu when links are clicked
      if (mobileNav.classList.contains('active')) {
        toggleMobileMenu();
      }
    });
  });

  // ==========================================
  // 3. Scroll Reveal Animation (Intersection Observer)
  // ==========================================
  const animatedSections = document.querySelectorAll('section');

  // Set up animation classes dynamically
  animatedSections.forEach(section => {
    section.classList.add('fade-in-section');
  });

  const scrollObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');

        // Trigger stat counter animations when About section is visible
        if (entry.target.id === 'about') {
          animateCounters();
        }

        // Unobserve section after revealing
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  animatedSections.forEach(section => {
    scrollObserver.observe(section);
  });

  // ==========================================
  // 4. About Stats Counter Animation
  // ==========================================
  let countersAnimated = false;

  function animateCounters() {
    if (countersAnimated) return;
    countersAnimated = true;

    const counters = document.querySelectorAll('.stat-num');
    counters.forEach(counter => {
      const target = +counter.getAttribute('data-val');
      const speed = 100; // Lower is slower

      const updateCount = () => {
        const count = +counter.innerText;
        const inc = Math.ceil(target / speed);

        if (count < target) {
          counter.innerText = count + inc > target ? target : count + inc;
          setTimeout(updateCount, 15);
        } else {
          counter.innerText = target;
        }
      };

      updateCount();
    });
  }

  // ==========================================
  // 5. Events Category Filter
  // ==========================================
  const filterBtns = document.querySelectorAll('.filter-btn');
  const eventCards = document.querySelectorAll('.event-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle active button style
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filterValue = btn.getAttribute('data-filter');

      eventCards.forEach(card => {
        const category = card.getAttribute('data-category');

        if (filterValue === 'all') {
          card.style.display = 'flex';
          card.style.animation = 'fadeIn 0.5s forwards';
        } else if (category === filterValue) {
          card.style.display = 'flex';
          card.style.animation = 'fadeIn 0.5s forwards';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // ==========================================
  // 6. Interactive Event Details & Booking Modals
  // ==========================================
  const eventModal = document.getElementById('eventModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalContent = document.getElementById('modalContent');
  const openModalButtons = document.querySelectorAll('.open-event-modal');

  const eventsData = {
    night_club: {
      title: 'Night Club Party',
      image: 'assets/night_club_party.png',
      time: 'Saturday, July 25th, 2026 - 9:00 PM onwards',
      location: 'Mercure Hotel, Main Room',
      artist: 'DJ Julia',
      description: 'Step into the night with high-energy tracks, custom visual effects, and a spectacular smoke and light show. Bring your crew for a premium clubbing event.',
      ctaText: 'Reserve Club Pass'
    },
    tun_fun: {
      title: 'Tun Fun Nights',
      image: 'assets/tun_fun_nights.jpg',
      time: 'Saturday, July 25th, 2026 - 8:00 PM onwards',
      location: 'Aura Bar & Club, 46-50 High St, Tunbridge Wells, TN1 1XF',
      artist: 'DJ Julix',
      description: 'The ultimate multilingual DJ night. Live, loud, and unlimited fun! Experience amazing beats, non-stop entertainment, and the best party vibes with DJ Julix.',
      ctaText: 'Get VIP Entry Ticket'
    },
    julix_showcase: {
      title: 'DJ Julix - Official Artist Profile',
      image: 'assets/tun_fun_nights.png', // Fallback banner
      time: 'Featured Partnership Showcase',
      location: 'Little Crew Co. Creative Platform',
      artist: 'DJ Julix',
      description: 'DJ Julix is a pioneer in combining electronic styles with retro beats. We work closely to design custom events, audio-visual layouts, and high-impact branding.',
      ctaText: 'Inquire for Bookings'
    }
  };

  function openModal(eventId) {
    const data = eventsData[eventId];
    if (!data) return;

    modalContent.innerHTML = `
      <img src="${data.image}" alt="${data.title}" class="modal-banner">
      <h3 class="modal-title">${data.title}</h3>
      <div class="modal-meta-grid">
        <div><strong>Artist:</strong> ${data.artist}</div>
        <div><strong>Time:</strong> ${data.time}</div>
        <div style="grid-column: span 2"><strong>Venue:</strong> ${data.location}</div>
      </div>
      <p class="modal-description">${data.description}</p>
      
      <form class="modal-booking-form" id="modalBookingForm">
        <h4 style="margin-bottom: 0.5rem; font-family: var(--font-display)">Secure Your Spot</h4>
        <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
          <input type="text" id="booking_name" placeholder="Your Name" required style="width: 50%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: white;">
          <input type="email" id="booking_email" placeholder="Your Email" required style="width: 50%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); color: white;">
        </div>
        <button type="submit" class="btn btn-primary btn-block">${data.ctaText}</button>
      </form>
    `;

    eventModal.classList.add('active');
    document.body.classList.add('no-scroll');

    // Handle booking submit inside modal
    const bookingForm = document.getElementById('modalBookingForm');
    const bookingSubmitBtn = bookingForm.querySelector('button[type="submit"]');

    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('booking_name').value;
      const email = document.getElementById('booking_email').value;
      const originalBtnText = bookingSubmitBtn.innerHTML;

      // Loading state
      bookingSubmitBtn.disabled = true;
      bookingSubmitBtn.innerHTML = 'Sending... ⏳';

      const response = await sendToWeb3Forms({
        name: name,
        email: email,
        subject: `[Event Booking] ${data.title}`,
        message: `Booking request details:\n- Event: ${data.title}\n- Time: ${data.time}\n- Location: ${data.location}\n- Client Email: ${email}`
      });

      if (response.success) {
        modalContent.innerHTML = `
          <div style="text-align: center; padding: 3rem 1.5rem;">
            <div style="font-size: 3rem; margin-bottom: 1.5rem;">🎟️</div>
            <h3 class="modal-title" style="margin-bottom: 1rem;">Booking Confirmed!</h3>
            <p class="modal-description" style="margin-bottom: 2rem;">
              Thank you, <strong>${name}</strong>. We have registered your request for the event. We will contact you at <strong>${email}</strong> with details shortly.
            </p>
            ${response.isDemo ? `
              <div style="margin: -1rem auto 2rem auto; padding: 0.75rem; border-radius: 8px; background: rgba(168,85,247,0.15); border: 1px dashed #a855f7; max-width: 400px; font-size: 0.85rem; color: #d8b4fe; line-height: 1.4;">
                <strong>🔧 Developer Demo Mode:</strong> To receive actual emails, configure your Web3Forms access key in the <code>app.js</code> file.
              </div>
            ` : ''}
            <button class="btn btn-primary" id="modalConfirmDone">Done</button>
          </div>
        `;
        document.getElementById('modalConfirmDone').addEventListener('click', closeModal);
      } else {
        // Reset loading state
        bookingSubmitBtn.disabled = false;
        bookingSubmitBtn.innerHTML = originalBtnText;
        alert(`Failed to send request: ${response.message || 'Please check your connection and try again.'}`);
      }
    });
  }

  function closeModal() {
    eventModal.classList.remove('active');
    document.body.classList.remove('no-scroll');
  }

  openModalButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const eventId = btn.getAttribute('data-event-id');
      openModal(eventId);
    });
  });

  modalCloseBtn.addEventListener('click', closeModal);
  eventModal.addEventListener('click', (e) => {
    if (e.target === eventModal) closeModal();
  });

  // ==========================================
  // 7. Contact Form Handling
  // ==========================================
  const contactForm = document.getElementById('contactForm');
  const contactSubmitBtn = contactForm.querySelector('button[type="submit"]');

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('form_name').value;
    const email = document.getElementById('form_email').value;
    const phone = document.getElementById('form_phone').value;
    const subject = document.getElementById('form_subject').value;
    const message = document.getElementById('form_message').value;
    const originalBtnText = contactSubmitBtn.innerHTML;

    // Loading state
    contactSubmitBtn.disabled = true;
    contactSubmitBtn.innerHTML = 'Sending... ⏳';

    const response = await sendToWeb3Forms({
      name: name,
      email: email,
      phone: phone,
      subject: `[Contact Form] ${subject}`,
      message: message
    });

    if (response.success) {
      // Open clean modal to display success message
      modalContent.innerHTML = `
        <div style="text-align: center; padding: 3rem 1.5rem;">
          <div style="font-size: 3.5rem; margin-bottom: 1.5rem;">✉️</div>
          <h3 class="modal-title" style="margin-bottom: 1rem;">Message Sent Successfully!</h3>
          <p class="modal-description" style="margin-bottom: 2rem;">
            Thank you, <strong>${name}</strong>, for reaching out to Little Crew & Co regarding <strong>${subject}</strong>. 
            We have registered your request and will respond to <strong>${email}</strong> within 24 hours.
          </p>
          ${response.isDemo ? `
            <div style="margin: -1rem auto 2rem auto; padding: 0.75rem; border-radius: 8px; background: rgba(168,85,247,0.15); border: 1px dashed #a855f7; max-width: 400px; font-size: 0.85rem; color: #d8b4fe; line-height: 1.4;">
              <strong>🔧 Developer Demo Mode:</strong> To receive actual emails, configure your Web3Forms access key in the <code>app.js</code> file.
            </div>
          ` : ''}
          <button class="btn btn-primary" id="modalConfirmDone">Continue</button>
        </div>
      `;

      eventModal.classList.add('active');
      document.body.classList.add('no-scroll');

      // Reset Form
      contactForm.reset();

      document.getElementById('modalConfirmDone').addEventListener('click', closeModal);
    } else {
      alert(`Failed to send message: ${response.message || 'Please check your connection and try again.'}`);
    }

    // Reset button state
    contactSubmitBtn.disabled = false;
    contactSubmitBtn.innerHTML = originalBtnText;
  });
});
