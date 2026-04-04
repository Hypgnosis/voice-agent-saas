/**
 * Sentinel Inference — Cloud Run HTTP Server Wrapper
 *
 * Wraps the Cloud Function handler in a lightweight HTTP server
 * compatible with Cloud Run's PORT-based startup.
 */

const http = require('http');
const { sentinelInference } = require('./index');

const PORT = parseInt(process.env.PORT, 10) || 8080;

const server = http.createServer(async (req, res) => {
  // ── Parse body for POST requests ──────────────────────────────────────
  let body = '';

  if (req.method === 'POST') {
    await new Promise((resolve, reject) => {
      req.on('data', chunk => { body += chunk; });
      req.on('end', resolve);
      req.on('error', reject);
    });
  }

  // ── Adapt Node http.IncomingMessage to Cloud Function request shape ────
  const fnReq = {
    method: req.method,
    headers: req.headers,
    body: body ? (() => { try { return JSON.parse(body); } catch { return {}; }})() : {},
    path: req.url,
  };

  // ── Adapt Node http.ServerResponse to Cloud Function response shape ───
  const fnRes = {
    _statusCode: 200,
    _headers: {},
    set(key, value) {
      this._headers[key] = value;
      return this;
    },
    status(code) {
      this._statusCode = code;
      return this;
    },
    json(data) {
      res.writeHead(this._statusCode, {
        ...this._headers,
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(data));
    },
    send(data) {
      res.writeHead(this._statusCode, this._headers);
      res.end(data || '');
    },
  };

  // ── Route ──────────────────────────────────────────────────────────────
  try {
    await sentinelInference(fnReq, fnRes);
  } catch (err) {
    console.error('Unhandled error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 500, message: 'Internal server error' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    severity: 'INFO',
    component: 'inference-server',
    message: `Sentinel Inference server listening on port ${PORT}`,
    timestamp: new Date().toISOString(),
  }));
});
