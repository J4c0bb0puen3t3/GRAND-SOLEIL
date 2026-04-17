'use strict';

require('dotenv').config();
const express    = require('express');
const Stripe     = require('stripe');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

// ── Validación de variables de entorno ──────────────────────────────────────
const requiredEnv = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'];
requiredEnv.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌  Falta la variable de entorno: ${key}`);
    process.exit(1);
  }
});

const app    = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const PORT   = process.env.PORT || 3000;

// ── Seguridad ───────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", 'https://js.stripe.com', 'https://fonts.googleapis.com'],
      frameSrc:    ["'self'", 'https://js.stripe.com'],
      connectSrc:  ["'self'", 'https://api.stripe.com'],
      imgSrc:      ["'self'", 'data:', 'https:'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      workerSrc:   ["'self'", 'blob:'],
    }
  }
}));

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());

// Rate limiting en rutas de pago
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en 15 minutos.' }
});

// ── Archivos estáticos (PWA) ─────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1d',
  setHeaders(res, filePath) {
    // Service Worker sin caché para que se actualice siempre
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    // Manifest con caché corta
    if (filePath.endsWith('manifest.json')) {
      res.setHeader('Cache-Control', 'max-age=3600');
    }
  }
}));

// ── API: configuración pública ───────────────────────────────────────────────
// El frontend la llama para obtener la publishable key (nunca exponer la secret)
app.get('/api/config', (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    hotelName: process.env.HOTEL_NAME || 'Grand Soleil Hotel & Resort'
  });
});

// ── API: crear PaymentIntent ─────────────────────────────────────────────────
app.post('/api/create-payment-intent', paymentLimiter, async (req, res) => {
  try {
    const { amount, currency = 'mxn', roomType, checkIn, checkOut, guestName, guestEmail, nights } = req.body;

    // Validaciones básicas
    if (!amount || typeof amount !== 'number' || amount < 1 || amount > 1000000) {
      return res.status(400).json({ error: 'Monto inválido.' });
    }
    if (!guestEmail || !guestEmail.includes('@')) {
      return res.status(400).json({ error: 'Correo inválido.' });
    }
    if (!roomType || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'Datos de reserva incompletos.' });
    }

    // Crear o recuperar cliente en Stripe
    const customers = await stripe.customers.list({ email: guestEmail, limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: guestEmail,
        name: guestName,
        metadata: { source: 'grand-soleil-web' }
      });
    }

    // Crear PaymentIntent
    // amount en Stripe va en centavos (o la unidad mínima de la moneda)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // convertir a centavos
      currency,
      customer: customer.id,
      receipt_email: guestEmail,
      description: `Reserva ${roomType} — ${nights} noche(s)`,
      metadata: {
        roomType,
        checkIn,
        checkOut,
        guestName,
        guestEmail,
        nights: String(nights),
        hotel: 'Grand Soleil'
      },
      automatic_payment_methods: { enabled: true }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });

  } catch (err) {
    console.error('Stripe error:', err.message);
    const statusCode = err.type === 'StripeInvalidRequestError' ? 400 : 500;
    res.status(statusCode).json({ error: err.message || 'Error al procesar el pago.' });
  }
});

// ── API: webhook de Stripe (confirmaciones de pago) ──────────────────────────
// Configura el endpoint en: https://dashboard.stripe.com/webhooks
// Usa tu STRIPE_WEBHOOK_SECRET (diferente a la secret key)
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // Webhook no configurado — solo log en desarrollo
    console.warn('⚠️  STRIPE_WEBHOOK_SECRET no definido. Webhook ignorado.');
    return res.json({ received: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar eventos
  switch (event.type) {
    case 'payment_intent.succeeded':
      const pi = event.data.object;
      console.log(`✅ Pago exitoso: ${pi.id} — ${pi.metadata.guestEmail} — ${pi.metadata.roomType}`);
      // Aquí podrías: enviar email de confirmación, guardar en DB, etc.
      break;

    case 'payment_intent.payment_failed':
      const failed = event.data.object;
      console.warn(`❌ Pago fallido: ${failed.id} — ${failed.last_payment_error?.message}`);
      break;

    default:
      // Evento no manejado
      break;
  }

  res.json({ received: true });
});

// ── SPA fallback — todas las rutas sirven index.html ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Arranque del servidor ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │   Grand Soleil — Servidor activo        │
  │   http://localhost:${PORT}                 │
  │   Entorno: ${process.env.NODE_ENV || 'development'}               │
  └─────────────────────────────────────────┘
  `);
});
