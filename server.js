const express = require('express');
const path = require('node:path');
const api = require('./api');

const app = express();
// Render places one reverse proxy in front of this web service.
app.set('trust proxy', 1);
const root = __dirname;
const apiBaseUrl = process.env.API_BASE_URL ? new URL(process.env.API_BASE_URL).origin : '';

// Render serves the client and API from one origin. This runtime file keeps
// the deployment origin configurable without hard-coding a hostname.
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(`window.MEDITRACK_API_URL = ${JSON.stringify(apiBaseUrl)};`);
});
const pages = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/login': 'login.html',
  '/login.html': 'login.html',
  '/register': 'register.html',
  '/register.html': 'register.html',
  '/how-it-works': 'how-it-works.html',
  '/how-it-works.html': 'how-it-works.html',
  '/privacy': 'privacy.html',
  '/privacy.html': 'privacy.html',
  '/terms': 'terms.html',
  '/terms.html': 'terms.html',
  '/medical-notice': 'medical-notice.html',
  '/medical-notice.html': 'medical-notice.html',
  '/contact': 'contact.html',
  '/contact.html': 'contact.html',
  '/app': 'app.html',
  '/app.html': 'app.html',
};
for (const [route, file] of Object.entries(pages)) {
  app.get(route, (req, res) => res.sendFile(path.join(root, file)));
}

for (const file of ['styles.css', 'script.js', 'auth.js', 'public.js']) {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(root, file)));
}
app.use(api);
app.use((req, res) => res.status(404).send('Not found'));

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`MediTrack listening on port ${port}`));
