<div align="center">

# 🔐 Secure User Authentication

### Full Stack Development

[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![JWT](https://img.shields.io/badge/JWT-000000?logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#)

A full-stack MERN application implementing registration, login, hashed password storage, refresh-token session handling,  account lockout, password reset, email verification, and a protected route that only returns data to an authenticated user.

</div>

---

## 📋 Table of Contents

* [Tech Stack](#tech-stack)
* [Features](#features)
* [Project Structure](#project-structure)
* [Setup Instructions](#setup-instructions)
* [Running with Docker](#running-with-docker)
* [API Endpoints](#api-endpoints)
* [HTTP Status Codes](#http-status-codes)
* [API Docs & Postman](#api-docs--postman)
* [Testing](#testing)
* [CI/CD](#cicd)
* [Security Notes](#security-notes)
* [Refresh Token Rotation & Reuse Detection](#refresh-token)
* [Active Sessions](#active-sessions)
* [Screenshots](#screenshots)
* [Deployment](#deployment)

---

## <a id="tech-stack"></a>🛠️ Tech Stack

|Layer|Technology|
|-|-|
|**Frontend**|React.js · Vite · React Router · Axios|
|**Backend**|Node.js · Express.js · JWT · bcryptjs · express-validator · helmet · morgan|
|**Database**|MongoDB (Mongoose)|
|**Testing**|Jest · Supertest · mongodb-memory-server|
|**Docs**|Swagger/OpenAPI · Postman|
|**DevOps**|Docker · docker-compose · GitHub Actions CI|

## <a id="features"></a>✨ Features

* ✅ User registration with server-side validation
* 🔑 **Access + refresh token** session handling (15-min access token, 7-day rotating refresh token) — not a single long-lived JWT
* 🕵️ **Refresh token reuse detection** — replaying an already-rotated refresh token (stolen-token signature) instantly revokes every session on the account
* 💻 **Active Sessions page** — see every logged-in device (browser/OS, IP, last active) and revoke any one individually, or "log out all other devices" in one click
* 🔒 Passwords hashed with bcrypt — never stored or returned in plain text
* 🛡️ Protected route that only responds with valid, unexpired, non-blacklisted JWTs
* 🚪 **Server-side logout** — blacklists the access token and revokes the refresh token, not just a client-side clear
* 🔁 **Password reset flow** — forgot-password → emailed (mocked) reset link → reset
* ✉️ **Email verification** on registration (mocked email, logged to server console)
* 🔐 **Account lockout** after 5 failed login attempts (15-minute cooldown)
* 🚫 **Rate limiting** on `/login` (10 attempts / 15 min / IP) plus a general API limiter
* 🪖 `helmet` security headers + `morgan` request logging
* ⚠️ Consistent error handling with proper HTTP status codes
* 🧪 Automated Jest/Supertest test suite
* 📘 Swagger UI + Postman collection for exploring the API

## <a id="project-structure"></a>📁 Project Structure

```
Secure-User-Authentication
├── .github/workflows/ci.yml
├── docker-compose.yml
├── backend/
│   ├── config/db.js
│   ├── models/User.js
│   ├── models/TokenBlacklist.js
│   ├── middleware/auth.js
│   ├── middleware/errorHandler.js
│   ├── middleware/rateLimiters.js
│   ├── controllers/authController.js
│   ├── routes/authRoutes.js
│   ├── utils/tokens.js
│   ├── utils/sendEmail.js
│   ├── tests/setup.js
│   ├── tests/auth.test.js
│   ├── postman/Secure-User-Authentication.postman_collection.json
│   ├── swagger.yaml
│   ├── app.js
│   ├── server.js
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── api/axios.js
    │   ├── components/ProtectedRoute.jsx
    │   ├── pages/Login.jsx
    │   ├── pages/Register.jsx
    │   ├── pages/Dashboard.jsx
    │   ├── pages/ForgotPassword.jsx
    │   ├── pages/ResetPassword.jsx
    │   ├── pages/VerifyEmail.jsx
    │   ├── App.jsx
    │   └── main.jsx
    ├── package.json
    └── .env.example
```

## <a id="setup-instructions"></a>🚀 Setup Instructions

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: set `MONGO_URI` (MongoDB Atlas or local), `JWT_SECRET`, and `REFRESH_TOKEN_SECRET`
# (use two DIFFERENT long random strings for the two secrets)
npm run dev
```

Backend runs at `http://localhost:4000`. 
Swagger docs at `http://localhost:4000/api-docs`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend runs at `http://localhost:4173`.

## <a id="running-with-docker"></a>🐳 Running with Docker

A `docker-compose.yml` at the repo root spins up the backend and a MongoDB instance together — no local Mongo install needed.
```bash
# From the repo root, create a .env with your two secrets:
echo "JWT_SECRET=your_long_random_secret" >> .env
echo "REFRESH_TOKEN_SECRET=your_other_long_random_secret" >> .env

docker compose up --build
```

This builds the backend image from `backend/Dockerfile`, starts a `mongo:7` container, and connects them on an internal Docker network. The API is available at `http://localhost:4000`. Run the frontend separately with `npm run dev` (it talks to the containerized backend over `VITE_API_URL`).

## <a id="api-endpoints"></a>🔌 API Endpoints

|Method|Endpoint|Access|Description|
|-|-|-|-|
|POST|`/api/auth/register`|🌐 Public|Register a new user, sends a (mocked) verification email|
|GET|`/api/auth/verify-email/:token`|🌐 Public|Verify email using the token from the verification email|
|POST|`/api/auth/login`|🌐 Public 🚫 Rate-limited|Log in, returns an access + refresh token pair|
|POST|`/api/auth/refresh`|🌐 Public|Rotates the refresh token; detects reuse (theft) and revokes all sessions if detected|
|POST|`/api/auth/logout`|🔒 Protected|Blacklists the access token, this device's session only|
|GET|`/api/auth/sessions`|🔒 Protected|List all active device sessions (browser/OS, IP, last active)|
|DELETE|`/api/auth/sessions/:id`|🔒 Protected|Revoke one specific session ("log out this device")|
|DELETE|`/api/auth/sessions`|🔒 Protected|Revoke every session except the caller's current one|
|POST|`/api/auth/forgot-password`|🌐 Public|Request a password reset link (mocked email)|
|POST|`/api/auth/reset-password/:token`|🌐 Public|Reset password using the token from the reset email|
|GET|`/api/auth/profile`|🔒 Protected|Returns the logged-in user's data|

### Register — Request

```json
POST /api/auth/register
Content-Type: application/json

{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "secret123"
}
```

### Register — Response (201 Created)

```json
{
  "success": true,
  "message": "User registered successfully. Check your email (mocked - see server logs) to verify your account.",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "665f1...", "name": "Jane Doe", "email": "jane@example.com", "isVerified": false }
}
```

### Login — Request

```json
POST /api/auth/login
Content-Type: application/json

{
  "email": "jane@example.com",
  "password": "secret123"
}
```

### Example Authenticated Request (Protected Endpoint)

```bash
curl -X GET http://localhost:4000/api/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Response (200 OK):**

```json
{
  "success": true,
  "user": {
    "_id": "665f1...",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "isVerified": false,
    "createdAt": "2026-09-18T10:12:00.000Z"
  }
}
```

**Without a token (401 Unauthorized):**

```json
{ "success": false, "message": "Not authorized, no token provided" }
```
### Refreshing an Expired Access Token

```bash
curl -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "eyJhbGciOiJIUzI1NiIs..." }'
```

### Logging Out

```bash
curl -X POST http://localhost:4000/api/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "eyJhbGciOiJIUzI1NiIs..." }'
```
After this, the same access token will return `401` on `/api/auth/profile` even though it hasn't naturally expired yet — it's been blacklisted server-side.

## <a id="http-status-codes"></a>📊 HTTP Status Codes Used

|Code|Meaning|
|-|-|
|200|✅ Successful login / profile fetch / refresh / logout|
|201|✅ Successful registration|
|400|⚠️ Validation error, malformed request, or invalid/expired reset & verification tokens|
|401|🚫 Invalid credentials, missing/invalid/revoked token, or expired refresh token|
|404|🔍 Route not found|
|409|♻️ Email already registered|
|423|🔒 Account locked due to too many failed login attempts|
|429|🐢 Rate limited (too many login attempts from this IP)|
|500|💥 Server error|

## <a id="api-docs--postman"></a>📘 API Docs & Postman

* **Swagger/OpenAPI** — once the backend is running, open `http://localhost:4000/api-docs` for interactive docs (spec lives at `backend/swagger.yaml`).
* **Postman** — import `backend/postman/Secure-User-Authentication.postman_collection.json`. It auto-captures the access/refresh tokens from Register/Login into collection variables so you can immediately try the protected requests without copy-pasting tokens.

## <a id="testing"></a>🧪 Testing

```bash
cd backend
npm test
```

The suite uses **Jest + Supertest** against an **in-memory MongoDB** (`mongodb-memory-server`), so it needs no real database and is safe to run in CI. Coverage includes:
* Register — happy path (201, tokens returned) and failure cases (duplicate email, invalid email).
* Login — happy path (200, tokens returned) and failure cases (wrong password, unknown email).
* Protected profile route — happy path with a valid token, and 401 with no/invalid token.
* Logout — confirms a blacklisted access token is rejected on the next request.
* Refresh — happy path issuing a new token pair, and failure with an invalid refresh token.

## <a id="cicd"></a>⚙️ CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main`:
* **Backend job** — `npm install`, `npm run lint`, `npm test` (against the in-memory DB, no secrets needed)
* **Frontend job** — `npm install`, `npm run build`

Check the Actions tab on GitHub after pushing to see it run.

## <a id="security-notes"></a>🔒 Security Notes

* Passwords are hashed with bcrypt (10 salt rounds) before being saved — the raw password is never stored or logged.
* The `password` field uses Mongoose's `select: false` so it is never returned in API responses by default.
* Access tokens are short-lived (15 min); refresh tokens are longer-lived (7 days), signed with a **separate** secret, stored per-user, and rotated on every use.
* Logging out blacklists the access token server-side (TTL-indexed collection, auto-cleaned) and removes the refresh token — a stolen access token can't be replayed after logout.
* 5 failed login attempts locks the account for 15 minutes; `/login` is additionally rate-limited per IP.
* `helmet` sets standard security headers; a general rate limiter guards the whole API.
* All input is validated server-side with `express-validator` before it touches the database.

## <a id="refresh-token"></a>🕵️ Refresh Token Rotation & Reuse Detection

Each refresh token carries two claims: a `family` (constant for one device's login session) and a `jti` (a fresh random ID minted on every rotation). The server only ever stores a **hash** of the current `jti` for that family, in a separate `RefreshSession` document per device — never the raw token.
* **Normal use:** the client presents a refresh token whose `jti` matches the stored hash → the server rotates it (new `jti`, new tokens issued, same `family`).
* **Reuse/theft:** the client presents a refresh token whose `jti` does not match — meaning that exact token was already rotated away earlier. There's no way to tell whether this is an attacker replaying a stolen token or a client bug, so the server treats it as compromise: **every session for that user is revoked immediately**, and `sessionsRevokedAt` is stamped on the user so any still-unexpired access tokens are rejected too (see `middleware/auth.js`) — not just the refresh tokens.

This is the same rotation-with-family-tracking pattern used by production auth systems (Auth0, Okta, etc.) — it turns "a refresh token got stolen" from a silent, permanent compromise into a detectable, self-healing event.

## <a id="active-sessions"></a>💻 Active Sessions

`GET /api/auth/sessions` lists every device currently logged in (browser/OS parsed from the User-Agent, IP, first-seen and last-active timestamps). A user can revoke any single device (`DELETE /api/auth/sessions/:id`) or every device except the one they're currently using (`DELETE /api/auth/sessions`) — useful after using a shared/public computer, or simply to audit "is anyone else in my account."

## <a id="screenshots"></a>📸 Screenshots

<div align="center">

<h3>Registration Page</h3>
<img src="screenshots/register.png" alt="Registration form" width="700"/>

<br/><br/>

<h3>Login Page</h3>
<img src="screenshots/login.png" alt="Login form" width="700"/>

<br/><br/>

<h3>Forgot Password - Get Reset Link</h3>
<img src="screenshots/forgot-password.png" alt="Forgot Password Page to get Reset Link" width="700"/>

<br/><br/>

<h3>Reset Password Form</h3>
<img src="screenshots/reset-password.png" alt="Reset Password Form" width="700"/>

<br/><br/>

<h3>Protected Dashboard</h3>
<img src="screenshots/secure-dashboard.png" alt="Protected dashboard showing JWT-authenticated profile data" width="700"/>

<br/><br/>

<h3>Active Sessions</h3>
<img src="screenshots/active-sessions.png" alt="Active Sessions Page" width="700"/>

<br/><br/>

<h3>Swagger Dashboard</h3>
<img src="screenshots/swagger-dashboard.png" alt="Swagger Dashboard" width="700"/>

<br/><br/>

<h3>Jest Test</h3>
<img src="screenshots/jest-test.png" alt="Jest Test" width="700"/>

<br/><br/>

<h3>Docker</h3>
<img src="screenshots/docker.png" alt="Docker" width="700"/>

</div>

## <a id="deployment"></a> ☁️ Deployment

1. Push this repo to GitHub as **`Secure-User-Authentication`** (public).
2. Deploy `backend/` to **Render** (Node service) with the environment variables from `.env.example` — or deploy the `backend/Dockerfile` directly as a Render Docker service.
3. Deploy `frontend/` to **Vercel**, setting `VITE_API_URL` to your live Render backend URL.
4. Add the same environment variables as GitHub Actions secrets if you want CI to run integration tests against a real database in future.

---

<div align="center">

## 🤝 Connect & Contact

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sithumini-anuhansi-5b32a8334)
[![Email](https://img.shields.io/badge/Email-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:anuhansisithumini@gmail.com)

</div>

---

<div align="right">
<img src="https://visitor-badge.laobi.icu/badge?page_id=Sithumini-Anuhansi.Emergency-Blood-Matching-Tool&left_text=Views"/>
</div>
