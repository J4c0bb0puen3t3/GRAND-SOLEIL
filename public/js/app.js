/* =============================================
   GRAND SOLEIL — app.js
   PWA registro, nav, animaciones de scroll
   ============================================= */

'use strict';

// ── Service Worker (PWA) ───────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registrado:', reg.scope))
      .catch(err => console.warn('SW error:', err));
  });
}

// ── PWA Install Banner ─────────────────────────────────────────────────────
let deferredPrompt = null;
const pwaBanner        = document.getElementById('pwaBanner');
const pwaBannerInstall = document.getElementById('pwaBannerInstall');
const pwaBannerDismiss = document.getElementById('pwaBannerDismiss');

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // Mostrar banner solo si no fue rechazado antes
  if (!sessionStorage.getItem('pwaBannerDismissed')) {
    pwaBanner.hidden = false;
  }
});

pwaBannerInstall?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    showToast('✓ Grand Soleil instalado correctamente', 'success');
  }
  deferredPrompt = null;
  pwaBanner.hidden = true;
});

pwaBannerDismiss?.addEventListener('click', () => {
  pwaBanner.hidden = true;
  sessionStorage.setItem('pwaBannerDismissed', '1');
});

window.addEventListener('appinstalled', () => {
  pwaBanner.hidden = true;
  deferredPrompt = null;
});

// ── NAV scroll effect ──────────────────────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

// ── Mobile menu ────────────────────────────────────────────────────────────
const burger     = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
let menuOpen = false;

burger.addEventListener('click', () => {
  menuOpen = !menuOpen;
  mobileMenu.classList.toggle('open', menuOpen);
  mobileMenu.setAttribute('aria-hidden', !menuOpen);
  burger.setAttribute('aria-expanded', menuOpen);
});

document.addEventListener('click', e => {
  if (menuOpen && !mobileMenu.contains(e.target) && !burger.contains(e.target)) {
    closeMenu();
  }
});

function closeMenu() {
  menuOpen = false;
  mobileMenu.classList.remove('open');
  mobileMenu.setAttribute('aria-hidden', 'true');
  burger.setAttribute('aria-expanded', 'false');
}

// ── Smooth scroll ──────────────────────────────────────────────────────────
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  closeMenu();
}

// ── Intersection Observer — fade-in ────────────────────────────────────────
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(
  '.room-card, .amenity-card, .testimonial, .section__header, .booking__copy, .booking__form-wrap'
).forEach(el => {
  el.classList.add('fade-up');
  observer.observe(el);
});

// ── Active nav link ────────────────────────────────────────────────────────
const sections = document.querySelectorAll('section[id], header[id]');
const navLinks  = document.querySelectorAll('.nav__links a');

const sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(link => {
        link.style.color = link.getAttribute('href') === `#${entry.target.id}`
          ? 'var(--gold-light)' : '';
      });
    }
  });
}, { rootMargin: '-40% 0px -40% 0px' });

sections.forEach(s => sectionObserver.observe(s));

// ── Toast global ───────────────────────────────────────────────────────────
function showToast(message, type = 'default', duration = 4500) {
  const toast    = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  toast.classList.remove('toast--error', 'toast--success');
  if (type === 'error')   toast.classList.add('toast--error');
  if (type === 'success') toast.classList.add('toast--success');
  toastMsg.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Fecha mínima en inputs ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  const checkIn  = document.getElementById('checkIn');
  const checkOut = document.getElementById('checkOut');
  if (checkIn)  checkIn.min  = today;
  if (checkOut) checkOut.min = today;

  checkIn?.addEventListener('change', () => {
    if (!checkIn.value) return;
    const next = new Date(checkIn.value);
    next.setDate(next.getDate() + 1);
    const nextStr = next.toISOString().split('T')[0];
    checkOut.min = nextStr;
    if (!checkOut.value || checkOut.value <= checkIn.value) {
      checkOut.value = nextStr;
    }
    updateSummary();
  });

  checkOut?.addEventListener('change', updateSummary);
  document.getElementById('roomSelect')?.addEventListener('change', updateSummary);
});

// ── Seleccionar habitación desde card ──────────────────────────────────────
function selectRoom(name, price) {
  scrollToSection('reserva');
  setTimeout(() => {
    const sel = document.getElementById('roomSelect');
    if (!sel) return;
    for (const opt of sel.options) {
      if (opt.text.includes(name) || opt.value.includes(name)) {
        sel.value = opt.value;
        break;
      }
    }
    updateSummary();
    document.getElementById('checkIn')?.focus();
  }, 600);
}

// ── Actualizar resumen de reserva ──────────────────────────────────────────
function updateSummary() {
  const roomVal  = document.getElementById('roomSelect')?.value;
  const checkIn  = document.getElementById('checkIn')?.value;
  const checkOut = document.getElementById('checkOut')?.value;
  const summary  = document.getElementById('bookingSummary');
  if (!summary) return;

  if (!roomVal || !checkIn || !checkOut) {
    summary.hidden = true;
    return;
  }

  const [roomName, pricePerNight] = roomVal.split('|');
  const nights = Math.max(1,
    Math.round((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24))
  );
  const total = parseInt(pricePerNight) * nights;

  document.getElementById('sumRoom').textContent   = roomName;
  document.getElementById('sumIn').textContent     = formatDate(checkIn);
  document.getElementById('sumOut').textContent    = formatDate(checkOut);
  document.getElementById('sumNights').textContent = `${nights} noche${nights > 1 ? 's' : ''}`;
  document.getElementById('sumTotal').textContent  = `$${total.toLocaleString('es-MX')} MXN`;
  summary.hidden = false;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

// Exponer globales usados desde HTML
window.scrollToSection = scrollToSection;
window.selectRoom      = selectRoom;
window.closeMenu       = closeMenu;
window.showToast       = showToast;
window.updateSummary   = updateSummary;
window.formatDate      = formatDate;
