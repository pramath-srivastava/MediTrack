# MediTrack

MediTrack is a responsive medication scheduling and adherence tracker. Accounts, medicines, scheduled dose records, profile data, and caregiver connections are stored in MongoDB through the Express API.

## What works

- Patient and caregiver registration, sign-in, sign-out, and persistent HTTP-only cookie sessions.
- Patient medication creation, editing, pausing, and removal from the active schedule.
- Daily schedules, weekdays, selected weekdays, multiple daily times, dose marking, history, and seven-day adherence analytics.
- Profile name and timezone updates.
- Caregiver invitations for an existing caregiver account. The patient receives a single-use token to share through a secure channel; the invited caregiver must sign in to that exact account to accept it. Either party can revoke access.
- Browser notification permission can be requested. MediTrack does not provide background push, email reminders, or email delivery.

## Requirements

- Node.js 20 or newer and npm.
- MongoDB Atlas or another MongoDB deployment.

## Local setup

1. In a terminal, change to `MediTrack`.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set these values:

   ```env
   MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/meditrack?retryWrites=true&w=majority
   JWT_SECRET=at-least-32-random-characters-that-are-kept-secret
   NODE_ENV=development
   APP_URL=http://localhost:3000
   API_BASE_URL=
   ```

5. Run `npm run dev`, then open `http://localhost:3000`.
6. Run `npm run check` for JavaScript syntax checks.

`npm start` and `npm run dev` run the complete application: the Express server serves the existing static client and mounts the existing API at `/api`.

## MongoDB

Create a database user with access only to this application database. Add the network access entry required by your deployment, then place the full connection string in `MONGODB_URI`. URL-encode special characters in the database password. Do not commit `.env`, the connection string, or the JWT secret.

## Render deployment (free web service)

This deployment uses one Render Web Service for both the existing frontend and Express API, so browser sessions remain same-origin and the existing HTTP-only authentication and CSRF protections keep working.

1. Push this repository to GitHub. In Render, select **New > Web Service**, connect the repository, and select the `main` branch. If this project is inside a larger repository, set **Root Directory** to `MediTrack`; otherwise leave it blank.
2. Select **Node**, choose the **Free** instance type, and set **Build Command** to `npm ci` and **Start Command** to `npm start`. These settings are also recorded in `render.yaml`.
3. Add these environment variables in Render before the first deploy:

   ```env
   MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/meditrack?retryWrites=true&w=majority
   JWT_SECRET=at-least-32-random-characters-that-are-kept-secret
   NODE_ENV=production
   APP_URL=https://YOUR-SERVICE.onrender.com
   API_BASE_URL=https://YOUR-SERVICE.onrender.com
   ```

   Generate a unique `JWT_SECRET` of at least 32 characters. Do not commit either secret. `API_BASE_URL` is served at runtime through `/config.js`; it can be left unset only when the client and API are hosted at the same Render URL.
4. Create the service, wait for the deploy to finish, then open `https://YOUR-SERVICE.onrender.com/api/health`. It should return `{ "ok": true }`. Open the main URL and register a real account to verify the application.
5. In MongoDB Atlas, allow network access from Render and ensure the database user in `MONGODB_URI` can access the MediTrack database. Use Atlas data; the service does not create or use demo data.

Render Free web services can sleep after 15 minutes without traffic, so the next request can take about a minute to start. They also use an ephemeral filesystem; this application is unaffected because persistent application data stays in MongoDB Atlas.

Production cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`. Mutating requests require a CSRF token and requests with an unexpected configured origin are rejected. The browser client sends same-origin credentials only.

## Medical notice

MediTrack organizes schedules and records doses. It does not diagnose, prescribe, or recommend medication changes. Follow your clinician’s or pharmacist’s instructions.
