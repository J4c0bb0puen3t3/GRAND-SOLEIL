# Grand Soleil Hotel & Resort
### PWA + Pagos reales con Stripe · Desplegable en Render

---

## Estructura del proyecto

```
grand-soleil/
├── server/
│   └── index.js          ← Servidor Express + endpoints Stripe
├── public/               ← Archivos estáticos servidos por Express
│   ├── index.html
│   ├── manifest.json     ← PWA manifest
│   ├── sw.js             ← Service Worker
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js        ← PWA, nav, animaciones
│   │   └── booking.js    ← Flujo de pago Stripe
│   └── icons/            ← Iconos PWA (72px → 512px)
├── package.json
├── .env.example          ← Plantilla de variables de entorno
├── .gitignore
└── README.md
```

---

## Despliegue en Render (paso a paso)

### 1. Sube el código a GitHub

```bash
cd grand-soleil
git init
git add .
git commit -m "Grand Soleil — PWA + Stripe"
# Crea un repositorio en github.com y luego:
git remote add origin https://github.com/TU_USUARIO/grand-soleil.git
git push -u origin main
```

### 2. Crea un Web Service en Render

1. Ve a [render.com](https://render.com) → **New → Web Service**
2. Conecta tu repositorio de GitHub
3. Configura:
   - **Name:** `grand-soleil`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (o Starter para producción)

### 3. Agrega las variables de entorno en Render

En la pestaña **Environment** de tu Web Service, agrega:

| Variable                  | Valor                          |
|---------------------------|--------------------------------|
| `STRIPE_SECRET_KEY`       | `sk_live_XXXXXXXXXXXX`         |
| `STRIPE_PUBLISHABLE_KEY`  | `pk_live_XXXXXXXXXXXX`         |
| `NODE_ENV`                | `production`                   |
| `HOTEL_NAME`              | `Grand Soleil Hotel & Resort`  |

> ⚠️ **NUNCA** subas tu `.env` a Git. Las keys solo van en el panel de Render.

### 4. Deploy

Render detecta el push y despliega automáticamente.
Tu sitio estará en: `https://grand-soleil.onrender.com`

---

## Desarrollo local

```bash
# 1. Clona e instala dependencias
npm install

# 2. Crea tu archivo .env
cp .env.example .env
# Edita .env con tus claves TEST de Stripe

# 3. Arranca el servidor
npm run dev   # con nodemon (recarga automática)
# o
npm start

# 4. Abre en el navegador
open http://localhost:3000
```

### Tarjetas de prueba (modo test)

Usa las claves `sk_test_` / `pk_test_` de tu dashboard de Stripe y estas tarjetas:

| Tarjeta          | Número               | Resultado           |
|------------------|----------------------|---------------------|
| Visa exitosa     | `4242 4242 4242 4242`| Pago aprobado       |
| Requiere 3D Sec. | `4000 0025 0000 3155`| Autenticación extra |
| Fondos insuf.    | `4000 0000 0000 9995`| Rechazada           |
| Fecha cualquiera, CVC cualquiera |          |                     |

---

## Flujo de pago (arquitectura)

```
Usuario                     Tu Servidor (Express)           Stripe
  │                               │                            │
  │── POST /api/create-payment-intent ──────────────────────>  │
  │     { roomType, checkIn, amount, email }                   │
  │                               │── stripe.paymentIntents.create() ──>│
  │                               │<── { client_secret } ──────│
  │<── { clientSecret } ─────────│                            │
  │                               │                            │
  │── stripe.confirmPayment() ──────────────────────────────> │
  │     (Stripe.js habla directo con Stripe, sin pasar        │
  │      por tu servidor — PCI compliance ✓)                  │
  │<── paymentIntent.status === 'succeeded' ──────────────────│
  │                               │                            │
  │                               │<── Webhook: payment_intent.succeeded
  │                               │   (confirmar en el servidor)│
```

---

## PWA — características

- ✅ Instalable en iOS, Android y escritorio (Chrome/Edge)
- ✅ Funciona offline (shell cacheada con Service Worker)
- ✅ Banner de instalación personalizado
- ✅ Iconos en todos los tamaños (72px → 512px)
- ✅ Shortcuts para ir directo a Reservar
- ✅ Push Notifications (base lista para activar)
- ✅ `theme-color` para la barra del sistema

---

## Webhook de Stripe (opcional pero recomendado)

Para confirmar pagos en el servidor (enviar emails, guardar en DB):

1. En [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint**
2. URL: `https://grand-soleil.onrender.com/api/webhook`
3. Eventos a escuchar: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copia el **Signing secret** y agrégalo en Render:

| Variable                  | Valor                    |
|---------------------------|--------------------------|
| `STRIPE_WEBHOOK_SECRET`   | `whsec_XXXXXXXXXXXX`     |

---

## Seguridad implementada

- `helmet` — headers de seguridad HTTP
- `express-rate-limit` — máximo 20 intentos de pago por IP cada 15 min
- Validación de montos y datos en el servidor (no solo en el cliente)
- Secret Key de Stripe **nunca** expuesta al frontend
- Content Security Policy configurada para Stripe.js
- HTTPS obligatorio en Render (certificado automático)

---

## Soporte

Para soporte de Stripe: [stripe.com/docs](https://stripe.com/docs)  
Para soporte de Render: [render.com/docs](https://render.com/docs)
