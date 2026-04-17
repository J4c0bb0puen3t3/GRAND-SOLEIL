/* =============================================
   GRAND SOLEIL — booking.js
   Flujo completo de pago con Stripe Elements
   ============================================= */

'use strict';

let stripeInstance    = null;
let stripeElements    = null;
let paymentElement    = null;
let currentClientSecret = null;

// ── Inicializar Stripe al cargar ───────────────────────────────────────────
async function initStripe() {
  try {
    const res  = await fetch('/api/config');
    const data = await res.json();
    if (!data.publishableKey) throw new Error('Publishable key no recibida');
    stripeInstance = Stripe(data.publishableKey);
  } catch (err) {
    console.error('Error inicializando Stripe:', err);
    showToast('Error al cargar el módulo de pago. Recarga la página.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Stripe !== 'undefined') {
    initStripe();
  } else {
    // Stripe.js puede cargar un poco tarde
    window.addEventListener('load', initStripe);
  }

  // Botón "Continuar al pago"
  document.getElementById('toPaymentBtn')?.addEventListener('click', handleToPayment);

  // Botón "Volver"
  document.getElementById('backBtn')?.addEventListener('click', handleBack);

  // Submit del form (pago real)
  document.getElementById('bookingForm')?.addEventListener('submit', handlePaymentSubmit);
});

// ── PASO 1 → PASO 2 ────────────────────────────────────────────────────────
async function handleToPayment() {
  if (!validateStep1()) return;
  if (!stripeInstance) {
    showToast('El módulo de pago aún no está listo. Intenta de nuevo.', 'error');
    return;
  }

  const bookingData = getBookingData();
  const btn = document.getElementById('toPaymentBtn');
  btn.disabled = true;
  btn.textContent = 'Procesando...';

  try {
    // Crear PaymentIntent en nuestro servidor
    const res = await fetch('/api/create-payment-intent', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount:      bookingData.totalAmount,
        currency:    'mxn',
        roomType:    bookingData.roomName,
        checkIn:     bookingData.checkIn,
        checkOut:    bookingData.checkOut,
        guestName:   bookingData.guestName,
        guestEmail:  bookingData.guestEmail,
        nights:      bookingData.nights,
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error del servidor');

    currentClientSecret = data.clientSecret;

    // Montar Stripe Elements
    await mountStripeElements(currentClientSecret, bookingData);

    // Mostrar paso 2
    goToStep(2);
    renderPaymentSummary(bookingData, data);

  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Continuar al pago →';
  }
}

// ── Montar Stripe Payment Element ──────────────────────────────────────────
async function mountStripeElements(clientSecret, bookingData) {
  // Si ya hay elementos montados, desmontar
  if (paymentElement) {
    paymentElement.unmount();
    paymentElement = null;
    stripeElements = null;
  }

  const appearance = {
    theme: 'flat',
    variables: {
      colorPrimary:         '#C9A84C',
      colorBackground:      '#F7F3ED',
      colorText:            '#1C1712',
      colorDanger:          '#E53E3E',
      fontFamily:           "'Jost', sans-serif",
      fontSizeBase:         '15px',
      borderRadius:         '4px',
      spacingUnit:          '4px',
    },
    rules: {
      '.Input': {
        border:           '1px solid #E8DED0',
        padding:          '10px 14px',
        backgroundColor:  '#F7F3ED',
      },
      '.Input:focus': {
        border:     '1px solid #C9A84C',
        boxShadow:  '0 0 0 3px rgba(201,168,76,0.15)',
      },
      '.Label': {
        fontSize:      '11px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color:         '#7A6248',
        marginBottom:  '6px',
      },
    }
  };

  stripeElements = stripeInstance.elements({ clientSecret, appearance });

  paymentElement = stripeElements.create('payment', {
    layout: 'tabs',
    defaultValues: {
      billingDetails: {
        name:  bookingData.guestName,
        email: bookingData.guestEmail,
      }
    }
  });

  paymentElement.mount('#payment-element');

  // Habilitar botón de pago cuando el form esté completo
  paymentElement.on('change', event => {
    const submitBtn = document.getElementById('submitPayBtn');
    if (submitBtn) submitBtn.disabled = !event.complete;
    const errorDiv = document.getElementById('stripe-errors');
    if (errorDiv) errorDiv.textContent = event.error ? event.error.message : '';
  });

  // Habilitar el botón inicialmente (Stripe lo valida internamente)
  setTimeout(() => {
    const submitBtn = document.getElementById('submitPayBtn');
    if (submitBtn) submitBtn.disabled = false;
  }, 800);
}

// ── SUBMIT — confirmar pago ────────────────────────────────────────────────
async function handlePaymentSubmit(e) {
  e.preventDefault();
  if (!stripeInstance || !stripeElements || !currentClientSecret) return;

  const submitBtn  = document.getElementById('submitPayBtn');
  const payBtnText = document.getElementById('payBtnText');
  const spinner    = document.getElementById('payBtnSpinner');
  const errorDiv   = document.getElementById('stripe-errors');

  submitBtn.disabled   = true;
  payBtnText.textContent = 'Procesando pago...';
  spinner.hidden       = false;
  errorDiv.textContent = '';

  try {
    const bookingData = getBookingData();

    const { error, paymentIntent } = await stripeInstance.confirmPayment({
      elements: stripeElements,
      confirmParams: {
        return_url:      `${window.location.origin}/#reserva`,
        receipt_email:   bookingData.guestEmail,
        payment_method_data: {
          billing_details: {
            name:  bookingData.guestName,
            email: bookingData.guestEmail,
          }
        }
      },
      redirect: 'if_required'  // evitar redirección para métodos que no la necesitan
    });

    if (error) {
      // Error del usuario (tarjeta rechazada, etc.)
      errorDiv.textContent = translateStripeError(error);
      showToast(translateStripeError(error), 'error');
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // ¡Pago exitoso!
      showConfirmation(bookingData, paymentIntent);
      goToStep(3);
    } else if (paymentIntent && paymentIntent.status === 'requires_action') {
      showToast('Se requiere autenticación adicional. Por favor completa el proceso.', 'default');
    }

  } catch (err) {
    errorDiv.textContent = 'Ocurrió un error inesperado. Intenta de nuevo.';
    showToast('Error al procesar el pago.', 'error');
    console.error(err);
  } finally {
    submitBtn.disabled     = false;
    payBtnText.textContent = 'Pagar ahora';
    spinner.hidden         = true;
  }
}

// ── Mostrar confirmación (paso 3) ──────────────────────────────────────────
function showConfirmation(bookingData, paymentIntent) {
  const msg = document.getElementById('confirmationMsg');
  if (msg) {
    msg.textContent = `Tu reserva ha sido confirmada. Recibirás un correo de confirmación en ${bookingData.guestEmail}.`;
  }

  const details = document.getElementById('confirmationDetails');
  if (details) {
    details.innerHTML = `
      <div><span>Referencia de pago:</span> <strong>#${paymentIntent.id.slice(-8).toUpperCase()}</strong></div>
      <div><span>Habitación:</span> <strong>${bookingData.roomName}</strong></div>
      <div><span>Check-in:</span> <strong>${formatDate(bookingData.checkIn)}</strong></div>
      <div><span>Check-out:</span> <strong>${formatDate(bookingData.checkOut)}</strong></div>
      <div><span>Noches:</span> <strong>${bookingData.nights}</strong></div>
      <div><span>Total cobrado:</span> <strong>$${bookingData.totalAmount.toLocaleString('es-MX')} MXN</strong></div>
    `;
  }

  showToast('✓ ¡Pago exitoso! Reserva confirmada.', 'success', 6000);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function goToStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById(`step${i}`);
    if (el) el.hidden = (i !== n);
  });
  document.getElementById('reserva')?.scrollIntoView({ behavior: 'smooth' });
}

function handleBack() {
  goToStep(1);
  if (paymentElement) {
    paymentElement.unmount();
    paymentElement    = null;
    stripeElements    = null;
    currentClientSecret = null;
  }
}

function validateStep1() {
  const roomVal   = document.getElementById('roomSelect')?.value;
  const checkIn   = document.getElementById('checkIn')?.value;
  const checkOut  = document.getElementById('checkOut')?.value;
  const guestName = document.getElementById('guestName')?.value.trim();
  const email     = document.getElementById('guestEmail')?.value.trim();

  if (!roomVal) {
    showToast('Por favor selecciona una habitación.', 'error'); return false;
  }
  if (!checkIn || !checkOut) {
    showToast('Por favor ingresa las fechas de check-in y check-out.', 'error'); return false;
  }
  if (new Date(checkOut) <= new Date(checkIn)) {
    showToast('La fecha de check-out debe ser posterior al check-in.', 'error'); return false;
  }
  if (!guestName || guestName.length < 3) {
    showToast('Por favor ingresa tu nombre completo.', 'error'); return false;
  }
  if (!email || !email.includes('@')) {
    showToast('Por favor ingresa un correo electrónico válido.', 'error'); return false;
  }
  return true;
}

function getBookingData() {
  const roomVal  = document.getElementById('roomSelect').value;
  const checkIn  = document.getElementById('checkIn').value;
  const checkOut = document.getElementById('checkOut').value;
  const [roomName, pricePerNight] = roomVal.split('|');
  const nights = Math.max(1,
    Math.round((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24))
  );
  return {
    roomName,
    pricePerNight: parseInt(pricePerNight),
    totalAmount:   parseInt(pricePerNight) * nights,
    checkIn,
    checkOut,
    nights,
    guestName:  document.getElementById('guestName').value.trim(),
    guestEmail: document.getElementById('guestEmail').value.trim(),
    adults:     document.getElementById('adults').value,
    children:   document.getElementById('children').value,
    specialReq: document.getElementById('specialReq').value.trim(),
  };
}

function renderPaymentSummary(bookingData, intentData) {
  const el = document.getElementById('paymentSummary');
  if (!el) return;
  el.innerHTML = `
    <div><strong>${bookingData.roomName}</strong> — ${bookingData.nights} noche${bookingData.nights > 1 ? 's' : ''}</div>
    <div>${formatDate(bookingData.checkIn)} → ${formatDate(bookingData.checkOut)}</div>
    <div style="margin-top:0.5rem;font-size:1rem;color:var(--dark);font-family:var(--font-display)">
      Total: <strong>$${bookingData.totalAmount.toLocaleString('es-MX')} MXN</strong>
    </div>
  `;
}

function translateStripeError(error) {
  const map = {
    'card_declined':          'Tarjeta rechazada. Verifica tus datos o usa otra tarjeta.',
    'insufficient_funds':     'Fondos insuficientes.',
    'expired_card':           'La tarjeta ha expirado.',
    'incorrect_cvc':          'El código de seguridad es incorrecto.',
    'incorrect_number':       'El número de tarjeta es incorrecto.',
    'processing_error':       'Error al procesar. Intenta de nuevo.',
    'payment_intent_authentication_failure': 'Autenticación fallida. Intenta de nuevo.',
  };
  return map[error.code] || error.message || 'Error desconocido. Intenta de nuevo.';
}

function resetBooking() {
  goToStep(1);
  document.getElementById('bookingForm')?.reset();
  document.getElementById('bookingSummary').hidden = true;
  paymentElement = null;
  stripeElements = null;
  currentClientSecret = null;
}

// Exponer globales usados desde HTML
window.resetBooking = resetBooking;
