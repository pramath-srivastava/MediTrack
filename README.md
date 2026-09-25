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
- Vercel CLI for combined local front-end and serverless API development.

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
   ```

5. Run `npm run dev`, then open the URL printed by Vercel.
6. Run `npm run check` for JavaScript syntax checks.

`npm start` starts the API only. Use `vercel dev` through `npm run dev` when developing the complete application, because it serves the static client and rewrites `/api/*` to the function.

## MongoDB

Create a database user with access only to this application database. Add the network access entry required by your deployment, then place the full connection string in `MONGODB_URI`. URL-encode special characters in the database password. Do not commit `.env`, the connection string, or the JWT secret.

## Vercel deployment

1. Push the project to a Git repository and import it into Vercel. If the repository contains this project in a subdirectory, set the Vercel project root to `MediTrack`.
2. In Vercel project environment variables, add `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, and `APP_URL=https://your-project.vercel.app` for each environment that will use the API.
3. Deploy. Vercel automatically runs `api/index.js` as the serverless function and serves the static files from this directory.
4. Confirm `https://your-project.vercel.app/api/health` returns `{ "ok": true }`, then register an account and create a medicine.

Production cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`. Mutating requests require a CSRF token and requests with an unexpected configured origin are rejected. The browser client sends same-origin credentials only.

## Medical notice

MediTrack organizes schedules and records doses. It does not diagnose, prescribe, or recommend medication changes. Follow your clinician’s or pharmacist’s instructions.
