const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { SignJWT, jwtVerify } = require('jose');
const crypto = require('node:crypto');

const app = express();
const production = process.env.NODE_ENV === 'production';
const cookieName = production ? '__Host-meditrack' : 'meditrack';
const jwtKey = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  return new TextEncoder().encode(process.env.JWT_SECRET);
};

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' }, contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.APP_URL || false, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

let connectPromise;
async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) throw Object.assign(new Error('MONGODB_URI is not configured.'), { status: 503 });
  if (!connectPromise) connectPromise = mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 }).catch((error) => { connectPromise = null; throw error; });
  await connectPromise;
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['PATIENT', 'CAREGIVER'], required: true },
  timezone: { type: String, default: 'UTC', maxlength: 80 }
}, { timestamps: true });
const medicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, name: { type: String, required: true, trim: true, maxlength: 100 }, dosage: { type: String, required: true, trim: true, maxlength: 60 },
  frequency: { type: String, enum: ['DAILY', 'WEEKDAYS', 'WEEKLY', 'CUSTOM'], required: true }, times: [{ type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ }], weekdays: [{ type: Number, min: 0, max: 6 }], startDate: { type: String, required: true }, endDate: { type: String, default: '' }, instructions: { type: String, maxlength: 200, default: '' }, isActive: { type: Boolean, default: true }
}, { timestamps: true });
medicationSchema.index({ userId: 1, isActive: 1 });
const adherenceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, medicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medication', required: true }, occurrenceKey: { type: String, required: true }, scheduledTime: { type: Date, required: true }, status: { type: String, enum: ['PENDING', 'TAKEN', 'SKIPPED', 'MISSED'], default: 'PENDING' }, takenAt: { type: Date, default: null }
}, { timestamps: true });
adherenceSchema.index({ userId: 1, occurrenceKey: 1 }, { unique: true });
adherenceSchema.index({ userId: 1, scheduledTime: -1 });
const connectionSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, caregiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, invitationTokenHash: { type: String, default: null, select: false }, invitationExpiresAt: { type: Date, default: null }, status: { type: String, enum: ['PENDING', 'ACTIVE', 'REVOKED'], default: 'PENDING' }
}, { timestamps: true });
connectionSchema.index({ patientId: 1, caregiverId: 1 }, { unique: true, sparse: true });
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Medication = mongoose.models.Medication || mongoose.model('Medication', medicationSchema);
const Adherence = mongoose.models.Adherence || mongoose.model('Adherence', adherenceSchema);
const CaregiverConnection = mongoose.models.CaregiverConnection || mongoose.model('CaregiverConnection', connectionSchema);

function safeUser(user) { return { id: user._id, name: user.name, email: user.email, role: user.role, timezone: user.timezone }; }
async function issueToken(user) { return new SignJWT({ sub: user._id.toString(), role: user.role }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(jwtKey()); }
function setAuthCookie(res, token) { res.cookie(cookieName, token, { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 }); }
function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (process.env.APP_URL && origin && origin !== process.env.APP_URL) return res.status(403).json({ error: 'Request origin is not allowed.' });
  if (!req.cookies[cookieName]) return next();
  const token = req.get('x-csrf-token');
  if (!token || token !== req.cookies.csrf) return res.status(403).json({ error: 'CSRF validation failed.' });
  next();
}
app.use('/api', csrf);
async function auth(req, res, next) {
  try { const token = req.cookies[cookieName]; if (!token) return res.status(401).json({ error: 'Sign in required.' }); await connectDB(); const { payload } = await jwtVerify(token, jwtKey()); req.user = await User.findById(payload.sub); if (!req.user) return res.status(401).json({ error: 'Sign in required.' }); next(); }
  catch (error) { if (error.status) return next(error); res.status(401).json({ error: 'Sign in required.' }); }
}
function requireRole(role) { return (req, res, next) => req.user.role === role ? next() : res.status(403).json({ error: 'This account cannot perform that action.' }); }
function cleanString(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function validMedication(body) {
  const name = cleanString(body.name, 100); const dosage = cleanString(body.dosage, 60); const frequency = body.frequency;
  const times = Array.isArray(body.times) ? [...new Set(body.times)] : [];
  const weekdays = Array.isArray(body.weekdays) ? [...new Set(body.weekdays.map(Number))] : [];
  if (!name || !dosage || !['DAILY', 'WEEKDAYS', 'WEEKLY', 'CUSTOM'].includes(frequency) || !times.length || times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw Object.assign(new Error('Enter a medicine name, dosage, frequency, and valid schedule times.'), { status: 422 });
  if (['WEEKLY', 'CUSTOM'].includes(frequency) && (!weekdays.length || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) throw Object.assign(new Error('Choose one or more valid weekdays.'), { status: 422 });
  const startDate = cleanString(body.startDate, 10); const endDate = cleanString(body.endDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate))) throw Object.assign(new Error('Enter valid start and end dates.'), { status: 422 });
  return { name, dosage, frequency, times, weekdays, startDate, endDate, instructions: cleanString(body.instructions, 200), isActive: body.isActive !== false };
}
function occurrenceDate(date, time, timezone) {
  const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number);
  let result = new Date(Date.UTC(year, month - 1, day, hour, minute));
  try { const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(result); const shown = Number(parts.find((part) => part.type === 'hour').value) * 60 + Number(parts.find((part) => part.type === 'minute').value); const target = hour * 60 + minute; result = new Date(result.getTime() + (target - shown) * 60000); } catch { /* Invalid timezone is rejected in profile updates; use UTC for old records. */ }
  return result;
}
function dateAtZone(date, timezone) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function shouldRun(med, date) {
  if (!med.isActive || date < med.startDate || (med.endDate && date > med.endDate)) return false;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (med.frequency === 'WEEKDAYS' && (day === 0 || day === 6)) return false;
  if (['WEEKLY', 'CUSTOM'].includes(med.frequency) && !med.weekdays.includes(day)) return false;
  return true;
}
async function getScheduled(user, fromDate, toDate) {
  const meds = await Medication.find({ userId: user._id, isActive: true });
  const start = occurrenceDate(fromDate, '00:00', user.timezone); const end = occurrenceDate(toDate, '23:59', user.timezone);
  const existing = await Adherence.find({ userId: user._id, scheduledTime: { $gte: start, $lte: end } }).populate('medicationId');
  const map = new Map(existing.map((event) => [event.occurrenceKey, event])); const output = [];
  for (let cursor = new Date(`${fromDate}T12:00:00Z`), last = new Date(`${toDate}T12:00:00Z`); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    for (const med of meds) {
      if (!shouldRun(med, date)) continue;
      for (const time of med.times) {
        const occurrenceKey = `${med._id}:${date}:${time}`; let record = map.get(occurrenceKey);
        if (!record) {
          const scheduledTime = occurrenceDate(date, time, user.timezone); const overdue = Date.now() > scheduledTime.getTime() + 2 * 60 * 60 * 1000;
          try { record = await Adherence.findOneAndUpdate({ userId: user._id, occurrenceKey }, { $setOnInsert: { userId: user._id, medicationId: med._id, occurrenceKey, scheduledTime, status: overdue ? 'MISSED' : 'PENDING' } }, { upsert: true, new: true, setDefaultsOnInsert: true }); }
          catch (error) { if (error.code !== 11000) throw error; record = await Adherence.findOne({ userId: user._id, occurrenceKey }); }
        } else if (record.status === 'PENDING' && Date.now() > record.scheduledTime.getTime() + 2 * 60 * 60 * 1000) { record.status = 'MISSED'; await record.save(); }
        output.push({ id: record._id, medication: { id: med._id, name: med.name, dosage: med.dosage, instructions: med.instructions }, date, time, scheduledTime: record.scheduledTime, status: record.status, takenAt: record.takenAt });
      }
    }
  }
  return output.sort((a, b) => a.scheduledTime - b.scheduledTime);
}
async function authorizedPatient(req, patientId) {
  if (req.user.role === 'PATIENT' && req.user._id.toString() === patientId) return true;
  if (req.user.role !== 'CAREGIVER') return false;
  return Boolean(await CaregiverConnection.exists({ patientId, caregiverId: req.user._id, status: 'ACTIVE' }));
}

app.get('/api/health', async (req, res) => res.json({ ok: true, service: 'MediTrack API', database: mongoose.connection.readyState === 1 ? 'connected' : 'not-connected' }));
app.post('/api/auth/register', async (req, res, next) => {
  try {
    await connectDB(); const name = cleanString(req.body.name, 80); const email = cleanString(req.body.email, 254).toLowerCase(); const password = req.body.password; const role = req.body.role;
    if (!name || !validEmail(email) || typeof password !== 'string' || password.length < 8 || password.length > 72 || !['PATIENT', 'CAREGIVER'].includes(role)) throw Object.assign(new Error('Enter a name, valid email, password of at least 8 characters, and account type.'), { status: 422 });
    const timezone = cleanString(req.body.timezone, 80) || 'UTC'; try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw Object.assign(new Error('Enter a valid timezone.'), { status: 422 }); }
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role, timezone }); const token = await issueToken(user); setAuthCookie(res, token); res.cookie('csrf', crypto.randomUUID(), { httpOnly: false, secure: production, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 }); res.status(201).json({ user: safeUser(user) });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' }); next(error); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try { await connectDB(); const email = cleanString(req.body.email, 254).toLowerCase(); const user = await User.findOne({ email }).select('+passwordHash'); if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' }); setAuthCookie(res, await issueToken(user)); res.cookie('csrf', crypto.randomUUID(), { httpOnly: false, secure: production, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 }); res.json({ user: safeUser(user) }); }
  catch (error) { next(error); }
});
app.post('/api/auth/logout', (req, res) => { res.clearCookie(cookieName, { httpOnly: true, secure: production, sameSite: 'lax', path: '/' }); res.clearCookie('csrf', { secure: production, sameSite: 'lax', path: '/' }); res.status(204).end(); });
app.get('/api/auth/me', auth, async (req, res) => res.json({ user: safeUser(req.user) }));

app.get('/api/profile', auth, (req, res) => res.json({ user: safeUser(req.user) }));
app.put('/api/profile', auth, async (req, res, next) => {
  try { const name = cleanString(req.body.name, 80); const timezone = cleanString(req.body.timezone, 80); if (!name || !timezone) throw Object.assign(new Error('Name and timezone are required.'), { status: 422 }); try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw Object.assign(new Error('Enter a valid timezone.'), { status: 422 }); } req.user.name = name; req.user.timezone = timezone; await req.user.save(); res.json({ user: safeUser(req.user) }); } catch (error) { next(error); }
});
app.get('/api/medications', auth, requireRole('PATIENT'), async (req, res, next) => { try { await connectDB(); res.json({ medications: await Medication.find({ userId: req.user._id }).sort({ isActive: -1, name: 1 }) }); } catch (error) { next(error); } });
app.post('/api/medications', auth, requireRole('PATIENT'), async (req, res, next) => { try { await connectDB(); const medication = await Medication.create({ userId: req.user._id, ...validMedication(req.body) }); res.status(201).json({ medication }); } catch (error) { next(error); } });
app.get('/api/medications/:id', auth, requireRole('PATIENT'), async (req, res, next) => { try { await connectDB(); const medication = await Medication.findOne({ _id: req.params.id, userId: req.user._id }); if (!medication) return res.status(404).json({ error: 'Medicine not found.' }); res.json({ medication }); } catch (error) { next(error); } });
app.put('/api/medications/:id', auth, requireRole('PATIENT'), async (req, res, next) => { try { await connectDB(); const medication = await Medication.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, validMedication(req.body), { new: true, runValidators: true }); if (!medication) return res.status(404).json({ error: 'Medicine not found.' }); res.json({ medication }); } catch (error) { next(error); } });
app.delete('/api/medications/:id', auth, requireRole('PATIENT'), async (req, res, next) => { try { await connectDB(); const medication = await Medication.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { isActive: false }, { new: true }); if (!medication) return res.status(404).json({ error: 'Medicine not found.' }); res.status(204).end(); } catch (error) { next(error); } });

app.get('/api/adherence/today', auth, requireRole('PATIENT'), async (req, res, next) => { try { await connectDB(); const date = dateAtZone(new Date(), req.user.timezone); const doses = await getScheduled(req.user, date, date); res.json({ date, gracePeriodHours: 2, doses }); } catch (error) { next(error); } });
async function updateDose(req, res, next, status) {
  try { await connectDB(); const event = await Adherence.findOne({ _id: req.params.id, userId: req.user._id }); if (!event) return res.status(404).json({ error: 'Dose not found.' }); if (event.status !== 'PENDING') return res.status(409).json({ error: 'This dose already has a status.', dose: event }); event.status = status; event.takenAt = status === 'TAKEN' ? new Date() : null; await event.save(); res.json({ dose: event }); } catch (error) { next(error); }
}
app.post('/api/adherence/:id/taken', auth, requireRole('PATIENT'), (req, res, next) => updateDose(req, res, next, 'TAKEN'));
app.post('/api/adherence/:id/skipped', auth, requireRole('PATIENT'), (req, res, next) => updateDose(req, res, next, 'SKIPPED'));
app.get('/api/adherence/history', auth, requireRole('PATIENT'), async (req, res, next) => {
  try { await connectDB(); const days = Math.max(1, Math.min(Number(req.query.days) || 30, 365)); const to = dateAtZone(new Date(), req.user.timezone); const fromDate = new Date(`${to}T12:00:00Z`); fromDate.setUTCDate(fromDate.getUTCDate() - days + 1); const from = fromDate.toISOString().slice(0, 10); const doses = await getScheduled(req.user, from, to); res.json({ doses: doses.reverse() }); } catch (error) { next(error); }
});
app.get('/api/adherence/analytics', auth, requireRole('PATIENT'), async (req, res, next) => {
  try { await connectDB(); const to = dateAtZone(new Date(), req.user.timezone); const fromDate = new Date(`${to}T12:00:00Z`); fromDate.setUTCDate(fromDate.getUTCDate() - 6); const from = fromDate.toISOString().slice(0, 10); const doses = await getScheduled(req.user, from, to); const completed = doses.filter((dose) => dose.status !== 'PENDING'); const taken = completed.filter((dose) => dose.status === 'TAKEN').length; const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(`${from}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + index); const key = date.toISOString().slice(0, 10); const day = completed.filter((dose) => dose.date === key); return { date: key, scheduled: day.length, taken: day.filter((dose) => dose.status === 'TAKEN').length, adherence: day.length ? Math.round(day.filter((dose) => dose.status === 'TAKEN').length / day.length * 100) : null }; }); res.json({ adherence: completed.length ? Math.round(taken / completed.length * 100) : null, taken, scheduled: completed.length, skipped: completed.filter((dose) => dose.status === 'SKIPPED').length, missed: completed.filter((dose) => dose.status === 'MISSED').length, days }); } catch (error) { next(error); }
});

app.post('/api/caregiver/invite', auth, requireRole('PATIENT'), async (req, res, next) => {
  try { await connectDB(); const email = cleanString(req.body.email, 254).toLowerCase(); if (!validEmail(email) || email === req.user.email) throw Object.assign(new Error('Enter a different valid caregiver email.'), { status: 422 }); const caregiver = await User.findOne({ email, role: 'CAREGIVER' }); if (!caregiver) throw Object.assign(new Error('A caregiver account with this email was not found.'), { status: 404 }); const current = await CaregiverConnection.findOne({ patientId: req.user._id, caregiverId: caregiver._id }); if (current?.status === 'ACTIVE') throw Object.assign(new Error('This caregiver is already connected.'), { status: 409 }); const rawToken = crypto.randomBytes(32).toString('hex'); const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex'); const connection = await CaregiverConnection.findOneAndUpdate({ patientId: req.user._id, caregiverId: caregiver._id }, { patientId: req.user._id, caregiverId: caregiver._id, invitationTokenHash: tokenHash, invitationExpiresAt: new Date(Date.now() + 7 * 86400000), status: 'PENDING' }, { upsert: true, new: true, setDefaultsOnInsert: true }); res.status(201).json({ invitation: { id: connection._id, email, expiresAt: connection.invitationExpiresAt, token: rawToken }, message: 'Share this invitation token securely with the caregiver.' }); } catch (error) { next(error); }
});
app.post('/api/caregiver/accept', auth, requireRole('CAREGIVER'), async (req, res, next) => {
  try { await connectDB(); const token = cleanString(req.body.token, 200); if (!token) throw Object.assign(new Error('Invitation token is required.'), { status: 422 }); const tokenHash = crypto.createHash('sha256').update(token).digest('hex'); const connection = await CaregiverConnection.findOne({ invitationTokenHash: tokenHash, caregiverId: req.user._id, status: 'PENDING', invitationExpiresAt: { $gt: new Date() } }).select('+invitationTokenHash'); if (!connection) return res.status(404).json({ error: 'Invitation not found, expired, or issued to another account.' }); connection.status = 'ACTIVE'; connection.invitationTokenHash = null; connection.invitationExpiresAt = null; await connection.save(); res.json({ connection: { id: connection._id, patientId: connection.patientId, status: connection.status } }); } catch (error) { next(error); }
});
app.get('/api/caregiver/connections', auth, requireRole('PATIENT'), async (req, res, next) => { try { await connectDB(); const links = await CaregiverConnection.find({ patientId: req.user._id, status: { $in: ['PENDING', 'ACTIVE'] } }).populate('caregiverId', 'name email'); res.json({ connections: links.map((link) => ({ id: link._id, status: link.status, expiresAt: link.invitationExpiresAt, caregiver: link.caregiverId ? safeUser(link.caregiverId) : null })) }); } catch (error) { next(error); } });
app.get('/api/caregiver/patients', auth, requireRole('CAREGIVER'), async (req, res, next) => { try { await connectDB(); const links = await CaregiverConnection.find({ caregiverId: req.user._id, status: 'ACTIVE' }).populate('patientId', 'name email'); res.json({ patients: links.map((link) => ({ connectionId: link._id, ...safeUser(link.patientId) })) }); } catch (error) { next(error); } });
app.get('/api/caregiver/patient/:patientId', auth, async (req, res, next) => { try { await connectDB(); if (!await authorizedPatient(req, req.params.patientId)) return res.status(403).json({ error: 'You are not connected to this patient.' }); const patient = await User.findById(req.params.patientId); if (!patient) return res.status(404).json({ error: 'Patient not found.' }); const date = dateAtZone(new Date(), patient.timezone); const doses = await getScheduled(patient, date, date); const due = doses.filter((dose) => dose.status !== 'PENDING'); res.json({ patient: safeUser(patient), date, summary: { scheduled: doses.length, taken: doses.filter((dose) => dose.status === 'TAKEN').length, missed: doses.filter((dose) => dose.status === 'MISSED').length, adherence: due.length ? Math.round(due.filter((dose) => dose.status === 'TAKEN').length / due.length * 100) : null }, recentActivity: doses }); } catch (error) { next(error); } });
app.get('/api/caregiver/patient/:patientId/adherence', auth, async (req, res, next) => { try { await connectDB(); if (!await authorizedPatient(req, req.params.patientId)) return res.status(403).json({ error: 'You are not connected to this patient.' }); const patient = await User.findById(req.params.patientId); if (!patient) return res.status(404).json({ error: 'Patient not found.' }); const to = dateAtZone(new Date(), patient.timezone); const fromDate = new Date(`${to}T12:00:00Z`); fromDate.setUTCDate(fromDate.getUTCDate() - 6); const doses = await getScheduled(patient, fromDate.toISOString().slice(0, 10), to); res.json({ doses: doses.reverse() }); } catch (error) { next(error); } });
app.delete('/api/caregiver/connections/:id', auth, async (req, res, next) => { try { await connectDB(); const filter = req.user.role === 'PATIENT' ? { _id: req.params.id, patientId: req.user._id } : { _id: req.params.id, caregiverId: req.user._id }; const connection = await CaregiverConnection.findOneAndUpdate(filter, { status: 'REVOKED', invitationTokenHash: null, invitationExpiresAt: null }, { new: true }); if (!connection) return res.status(404).json({ error: 'Connection not found.' }); res.status(204).end(); } catch (error) { next(error); } });

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status) || (error.name === 'ValidationError' ? 422 : 500);
  if (status >= 500) console.error('MediTrack API error:', error.message);
  res.status(status).json({ error: status >= 500 ? 'The service could not complete this request.' : error.message });
});

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`MediTrack API listening on ${port}`));
}
module.exports = app;
