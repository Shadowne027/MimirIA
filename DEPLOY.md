# MIMIR IA — Despliegue en Vercel (MongoDB + GPT-5-mini)

La app está lista para subir a Vercel tal como está:

- **Frontend:** Vite + React (se compila a `dist/`).
- **Backend:** funciones serverless en la carpeta `api/` (Vercel las detecta automáticamente):
  - `api/register.js` — crea la cuenta y asigna el **ID correlativo en MongoDB** (`#001`, `#002`, …).
  - `api/login.js` / `api/me.js` — sesión con token firmado.
  - `api/conversations.js` — historial de conversaciones por usuario (MongoDB).
  - `api/chat.js` — responde con **GPT-5-mini** (OpenAI) usando el historial como contexto y guarda cada mensaje.
- **Modo demo:** si el backend no está configurado, la app lo detecta (`/api/health`) y funciona con
  almacenamiento local y respuestas simuladas, asignando IDs `#001…` igual que el servidor.

## 1. MongoDB Atlas

1. Crea un cluster gratuito (M0) en [MongoDB Atlas](https://www.mongodb.com/atlas).
2. En **Database Access** crea un usuario con contraseña.
3. En **Network Access** permite `0.0.0.0/0` (acceso desde cualquier IP — Vercel cambia de IP).
4. En **Database → Connect → Drivers** copia la cadena de conexión:
   `mongodb+srv://usuario:contraseña@cluster0.xxxxx.mongodb.net/`

La base `mimiria` y las colecciones (`users`, `conversations`, `counters`) se crean solas al primer uso.
El contador de IDs vive en `counters` → cada registro nuevo recibe el siguiente número (`#001`, `#002`, …).

## 2. OpenAI (GPT-5-mini)

1. Entra a [platform.openai.com/api-keys](https://platform.openai.com/api-keys) y crea una API key.
2. Verifica que tu cuenta tenga acceso al modelo `gpt-5-mini`.

## 3. Vercel

1. Sube el proyecto a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New Project** → importa el repositorio.
3. Framework: **Vite** (se detecta solo). No cambies el build command.
4. En **Settings → Environment Variables** agrega las tres variables (ver `.env.example`):
   - `MONGODB_URI`
   - `OPENAI_API_KEY`
   - `TOKEN_SECRET` (genera uno largo y aleatorio)
5. **Deploy**. Listo: `https://tu-proyecto.vercel.app`.

## 4. Comprobación

- Abre la app y crea una cuenta: el toast te muestra tu ID (`#001`).
- En el chat, el panel lateral debe decir **“API conectada · GPT-5-mini + MongoDB”**.
- En Atlas verás los documentos en `users` y `conversations`, vinculados por `userId`.

## Estructura relevante

```
api/                ← funciones serverless (Node 20)
  _lib.js           ← Mongo, tokens, hash de contraseñas, prompt del tutor
  health.js         ← estado del backend (lo usa el frontend para modo demo)
  register.js       ← POST  /api/register   → ID #001…
  login.js          ← POST  /api/login
  me.js             ← GET   /api/me
  conversations.js  ← GET/POST/DELETE /api/conversations
  chat.js           ← POST  /api/chat       → GPT-5-mini + historial
src/lib/api.ts      ← cliente del frontend (API real con caída a modo demo)
vercel.json         ← SPA rewrites + configuración de funciones
```
