# MediTrack

An educational medication scheduling and adherence prototype for PS-05. MediTrack helps a person organize a schedule and record doses; it does not diagnose, prescribe, recommend medication changes, or replace a qualified health professional.

## Current implementation

- Responsive, keyboard-friendly single-page interface for overview, medicines, history, analytics, caregiver sharing, and profile settings.
- Browser-only demo mode with fictional accounts and dose history. Demo state is isolated in local storage on the current browser; it is not shared between devices. Use **Reset demo data** to restore the sample schedule.
- Demo medicine add/edit/delete (delete deactivates for history retention), pause/resume, daily/weekdays/weekly/custom schedules, taken/skipped/missed occurrence tracking, filters, weekly chart, in-app reminders, and optional browser notifications.
- Express/Mongoose API intended for Vercel serverless deployment, with user, medication, adherence, and caregiver connection models, cookie JWT auth, password hashing, CSRF token checks, rate limiting, input validation, and resource authorization.

**The current browser interface uses demo data only. It does not yet sign in to or call the API.** API features must be verified independently until the front end is connected to live endpoints. The demo never switches to local sample data after an API failure.

## Requirements

- Node.js 20 or newer and npm.
- MongoDB Atlas cluster for live API operation.
- A Vercel account for deployment; GitHub connection is recommended.

## Run locally

1. Open a terminal in `MediTrack/`.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env` and set `MONGODB_URI`, `JWT_SECRET` (at least 32 characters), `NODE_ENV=development`, and `APP_URL=http://localhost:3000`.
4. Start Vercel's local runtime: `npm run dev`.
5. Open the address printed by Vercel CLI. The demo interface works without a database. API calls require the environment variables and MongoDB.

The API can also run directly with `npm start`; static front-end files are served by Vercel, so use the Vercel CLI when developing the combined deployment. The health endpoint is `/api/health`.

## MongoDB Atlas setup

1. Create a free shared cluster in MongoDB Atlas.
2. Create a database user with a strong password and grant access only to the application database.
3. In Network Access, allow the deployment's database connection. Atlas/Vercel network configuration may require a suitable IP access policy; avoid exposing database credentials.
4. Copy the SRV connection URI into `MONGODB_URI`, replacing the password and setting the database name (for example `meditrack`). URL-encode special characters in the password.
5. Do not commit `.env` or any connection string. Production data is stored in MongoDB, never the Vercel filesystem.

## Deploy to Vercel via GitHub

1. Push this project to a GitHub repository.
2. In Vercel, choose **Add New → Project**, import the repository, and set the project root to `MediTrack` if the repository contains the parent directory too. The static HTML, CSS, and JavaScript are served from the project root; the `public/` directory is reserved for future static assets.
3. Add `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, and `APP_URL=https://your-project.vercel.app` under Project Settings → Environment Variables for Production (and Preview if required).
4. Deploy. Vercel serves the root static files and rewrites `/api/*` to the Express function in `api/index.js`.
5. Check `https://your-project.vercel.app/api/health`. It should return JSON with `ok: true`. `database: not-connected` is expected until an authenticated request connects to MongoDB; check Atlas and environment settings if API requests fail.

Vercel Hobby has platform, function duration, bandwidth, and usage limits that can change. MongoDB Atlas free clusters also have capacity and connection limits; check the current provider plans before relying on the service. Deployment instructions do not mean a deployment has been performed or verified.

## Security and behavior notes

- Authentication cookies are HttpOnly, SameSite=Lax, and Secure in production. Mutating API requests require the readable CSRF cookie mirrored in `X-CSRF-Token`; requests with an unexpected Origin are rejected when `APP_URL` is configured.
- Auth endpoints are rate limited. Password hashes use bcryptjs. Invitation tokens are returned once to the patient and stored only as a SHA-256 hash with a 7-day expiry.
- A dose becomes missed after a 2-hour grace period in the user's timezone. Duplicate scheduled occurrences are prevented by a unique user/occurrence key.
- Browser notifications and JavaScript reminders work only while the app is open; there is no service-worker push delivery.
- Caregiver invitation is API-only and requires an existing caregiver account. Email delivery is not configured.
- AI schedule suggestions, Web Push, PWA installation, email notifications, and account recovery are not implemented.

## Medical disclaimer

Follow instructions from your doctor or pharmacist. MediTrack is an educational prototype and cannot guarantee adherence or provide medical advice.
