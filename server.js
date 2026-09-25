const express = require('express');
const path = require('node:path');
const api = require('./api');

const app = express();
const root = __dirname;
const apiBaseUrl = (process.env.API_BASE_URL || '').replace(/\/$/, '');

// Render serves the client and API from one origin. This runtime file keeps
// the deployment origin configurable without hard-coding a hostname.
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(`window.MEDITRACK_API_URL = ${JSON.stringify(apiBaseUrl)};`);
});
app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(root, 'styles.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(root, 'script.js')));
app.use(api);
app.get('*', (req, res) => res.sendFile(path.join(root, 'index.html')));

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => console.log(`MediTrack listening on port ${port}`));
