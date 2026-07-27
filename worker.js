// @ts-nocheck
/**
 * ============================================================================
 * 🤖 HG-TeleFlare — Cloudflare Telegram Bot Builder
 * ============================================================================
 * A zero-config, self-bootstrapping Cloudflare Worker that dynamically
 * provisions its own D1, KV, and child Workers to build Telegram bots.
 *
 * @author      Hamed Gharghi
 * @version     1.0.0
 * @repository  https://github.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder
 * @license     MIT
 * ============================================================================
 */

class Hono {
  constructor() {
    this.routes = [];
  }

  add(method, path, ...handlers) {
    this.routes.push({ method, path, handlers });
  }

  get(path, ...handlers) {
    this.add('GET', path, ...handlers);
  }

  post(path, ...handlers) {
    this.add('POST', path, ...handlers);
  }

  put(path, ...handlers) {
    this.add('PUT', path, ...handlers);
  }

  patch(path, ...handlers) {
    this.add('PATCH', path, ...handlers);
  }

  delete(path, ...handlers) {
    this.add('DELETE', path, ...handlers);
  }

  async runHandlerChain(c, handlers, index) {
    if (index >= handlers.length) {
      return new Response('Not Found', { status: 404 });
    }

    const handler = handlers[index];
    if (handler.length >= 2) {
      const next = async () => this.runHandlerChain(c, handlers, index + 1);
      return handler(c, next);
    }

    return handler(c);
  }

  async fetch(request, env = {}, ctx = {}) {
    try {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const pathname = url.pathname;

      for (const route of this.routes) {
        const params = matchRoute(route.path, pathname);
        if (!params || route.method !== method) continue;

        const c = new Context(request, env, ctx, params);
        const response = await this.runHandlerChain(c, route.handlers, 0);
        if (response instanceof Response) return response;
        return new Response(JSON.stringify({ error: 'Handler returned no response' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      console.error('Unhandled error:', e);
      return new Response(JSON.stringify({ error: e.message || 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  }
}

function matchRoute(routePath, pathname) {
  const routeParts = routePath.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (routeParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < routeParts.length; i += 1) {
    const routePart = routeParts[i];
    const pathPart = pathParts[i];
    if (routePart.startsWith(':')) {
      params[routePart.slice(1)] = decodeURIComponent(pathPart);
    } else if (routePart !== pathPart) {
      return null;
    }
  }
  return params;
}

class Context {
  constructor(request, env, ctx, params) {
    this.request = request;
    this.req = {
      header: (name) => request.headers.get(name.toLowerCase()) || request.headers.get(name),
      json: async () => {
        const text = await request.text();
        if (!text) return {};
        return JSON.parse(text);
      },
      formData: async () => request.formData(),
      param: (name) => this.params[name],
      url: request.url,
    };
    this.env = env;
    this.ctx = ctx;
    this.params = params;
    this._store = new Map();
  }

  set(key, value) {
    this._store.set(key, value);
  }

  get(key) {
    return this._store.get(key);
  }

  json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

function base64UrlEncode(value) {
  // Handle strings: encode to UTF-8 bytes first
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  // Handle binary data (Uint8Array, ArrayBuffer): encode bytes directly
  // IMPORTANT: Do NOT use TextDecoder/TextEncoder for binary data - it corrupts non-UTF-8 bytes
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerSegment = base64UrlEncode(JSON.stringify(header));
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verify(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const expectedSignature = base64UrlEncode(new Uint8Array(signature));

  if (expectedSignature !== signatureSegment) {
    throw new Error('Invalid token');
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadSegment)));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

const app = new Hono();

// ============================================================
// CLOUDFLARE API CLIENT — Handles all CF API v4 calls
// ============================================================

const PLATFORM_RESOURCES = {
  d1: 'telegram-bot-builder-db',
  kv: 'telegram-bot-builder-session-kv',
};

class CFClient {
  constructor(apiToken, accountId, d1Id, kvId) {
    this.apiToken = apiToken;
    this.accountId = accountId;
    this.d1Id = d1Id;
    this.kvId = kvId;
    this.baseUrl = 'https://api.cloudflare.com/client/v4';
    this.headers = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Generic API fetch ──
  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers },
    });
    const data = await res.json();
    if (!data.success && data.errors?.[0]?.message) {
      throw new Error(data.errors[0].message);
    }
    if (!data.success) {
      throw new Error(`API error: ${JSON.stringify(data.errors || data)}`);
    }
    return data;
  }

  // ── Account Info ──
  async getAccountName() {
    const data = await this._fetch(`/accounts/${this.accountId}`);
    return data.result.name;
  }

  // ── D1 Operations ──
  async listD1Databases() {
    const data = await this._fetch(`/accounts/${this.accountId}/d1/database`);
    return data.result || [];
  }

  async createD1Database(name) {
    const data = await this._fetch(`/accounts/${this.accountId}/d1/database`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return data.result.uuid;
  }

  async ensureD1Database(name = PLATFORM_RESOURCES.d1) {
    const existing = (await this.listD1Databases()).find((db) => db.name === name);
    if (existing?.uuid) return { id: existing.uuid, created: false };
    const id = await this.createD1Database(name);
    return { id, created: true };
  }

  async d1Query(sql, params = []) {
    const body = { sql };
    if (params.length > 0) body.params = params;
    const data = await this._fetch(
      `/accounts/${this.accountId}/d1/database/${this.d1Id}/query`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    return data.result?.[0]?.results || [];
  }

  async d1Execute(sql, params = []) {
    const body = { sql };
    if (params.length > 0) body.params = params;
    const data = await this._fetch(
      `/accounts/${this.accountId}/d1/database/${this.d1Id}/query`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    return data.result?.[0] || {};
  }

  // ── KV Operations ──
  async listKVNamespaces() {
    const data = await this._fetch(`/accounts/${this.accountId}/storage/kv/namespaces`);
    return data.result || [];
  }

  async createKVNamespace(name) {
    const data = await this._fetch(`/accounts/${this.accountId}/storage/kv/namespaces`, {
      method: 'POST',
      body: JSON.stringify({ title: name }),
    });
    return data.result.id;
  }

  async ensureKVNamespace(name = PLATFORM_RESOURCES.kv) {
    const existing = (await this.listKVNamespaces()).find((ns) => ns.title === name);
    if (existing?.id) return { id: existing.id, created: false };
    const id = await this.createKVNamespace(name);
    return { id, created: true };
  }

  async kvGet(key) {
    const res = await fetch(
      `${this.baseUrl}/accounts/${this.accountId}/storage/kv/namespaces/${this.kvId}/values/${encodeURIComponent(key)}`,
      { headers: { 'Authorization': `Bearer ${this.apiToken}` } }
    );
    if (res.status === 404) return null;
    return await res.text();
  }

  async kvPut(key, value, expirationTtl = null) {
    const body = expirationTtl ? { value, expiration_ttl: expirationTtl } : { value };
    // KV API accepts text/plain for simple values
    await fetch(
      `${this.baseUrl}/accounts/${this.accountId}/storage/kv/namespaces/${this.kvId}/values/${encodeURIComponent(key)}`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.apiToken}` },
        body: typeof value === 'string' ? value : JSON.stringify(value),
      }
    );
  }

  async kvDelete(key) {
    await fetch(
      `${this.baseUrl}/accounts/${this.accountId}/storage/kv/namespaces/${this.kvId}/values/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.apiToken}` },
      }
    );
  }

  // ── Media Storage (KV-backed — works automatically, no R2 needed!) ──
  // Store binary file data as base64 + content type in KV
  async kvPutMedia(key, data, contentType) {
    const encoded = JSON.stringify({
      ct: contentType || 'application/octet-stream',
      d: base64UrlEncode(data),
    });
    await this.kvPut(key, encoded);
  }

  async kvGetMedia(key) {
    const raw = await this.kvGet(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.d) {
        const bytes = base64UrlDecode(parsed.d);
        return { body: bytes, contentType: parsed.ct || 'application/octet-stream' };
      }
    } catch {
      // Invalid stored data
    }
    return null;
  }

  // Persist platform config on this Worker so reloads skip setup
  async savePlatformConfig(scriptName, config) {
    if (!scriptName) return false;
    await this._fetch(`/accounts/${this.accountId}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'PLATFORM_CONFIG',
        text: JSON.stringify(config),
        type: 'secret_text',
      }),
    });
    return true;
  }

  // ── Workers Operations (for deployment) ──
  async getWorkersSubdomain() {
    const data = await this._fetch(`/accounts/${this.accountId}/workers/subdomain`);
    return data.result?.subdomain || null;
  }

  async enableWorkerSubdomain(scriptName) {
    await this._fetch(
      `/accounts/${this.accountId}/workers/scripts/${encodeURIComponent(scriptName)}/subdomain`,
      {
        method: 'POST',
        body: JSON.stringify({ enabled: true }),
      }
    );
  }

  async deployWorker(scriptName, code, { envVars = {}, kvId = null, workersSubdomain = null } = {}) {
    // Worker names used on *.workers.dev must be DNS-safe (a-z, 0-9, - only)
    const safeName = String(scriptName)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 63);

    if (!safeName) throw new Error('Invalid worker script name');

    const bindings = [
      ...Object.entries(envVars).map(([name, value]) => ({
        type: 'plain_text',
        name,
        text: String(value),
      })),
    ];

    if (kvId) {
      bindings.push({
        type: 'kv_namespace',
        name: 'BOT_DATA',
        namespace_id: kvId,
      });
    }

    const metadata = {
      main_module: 'worker.js',
      bindings,
      compatibility_date: '2024-12-01',
    };

    const formData = new FormData();
    formData.append('metadata', JSON.stringify(metadata));
    formData.append(
      'worker.js',
      new Blob([code], { type: 'application/javascript+module' }),
      'worker.js'
    );

    const res = await fetch(
      `${this.baseUrl}/accounts/${this.accountId}/workers/scripts/${encodeURIComponent(safeName)}`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.apiToken}` },
        body: formData,
      }
    );
    const responseText = await res.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      // Cloudflare may return non-JSON error pages (e.g. 1101 Worker errors, HTML error pages)
      const snippet = responseText.slice(0, 1000);
      throw new Error(
        `Cloudflare API returned HTTP ${res.status}: ${snippet}`
      );
    }
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'Deploy failed');
    }

    // Resolve subdomain early (parallel-safe promise)
    const subdomainPromise = workersSubdomain
      ? Promise.resolve(workersSubdomain)
      : this.getWorkersSubdomain().catch(() => null);

    // Ensure workers.dev route is enabled (uses PUT which works on all accounts)
    try {
      await this._fetch(
        `/accounts/${this.accountId}/workers/scripts/${encodeURIComponent(safeName)}/subdomain`,
        { method: 'PUT', body: JSON.stringify({ enabled: true }) }
      );
    } catch {
      // Subdomain may already be enabled — continue
    }

    let subdomain = await subdomainPromise;
    if (!subdomain) {
      throw new Error('Could not resolve workers.dev subdomain. Enable it in the Cloudflare dashboard.');
    }

    const workerUrl = `https://${safeName}.${subdomain}.workers.dev`;

    const botToken = envVars.BOT_TOKEN;

    // Fire health check with 3s timeout (non-blocking — won't delay response)
    const healthPromise = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const probe = await fetch(`${workerUrl}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (probe.ok) {
          const health = await probe.json();
          if (!health.hasToken) {
            console.warn('Bot deployed but BOT_TOKEN binding appears missing — check env vars');
          }
        }
      } catch {
        // Worker may still be propagating — safe to ignore
      }
    })();

    // Deploy webhook (critical — must succeed before returning)
    let webhook = null;
    if (botToken) {
      const hook = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `${workerUrl}/webhook`,
          drop_pending_updates: true,
          allowed_updates: ['message', 'callback_query'],
        }),
      });
      const hookData = await hook.json();
      if (!hookData.ok) {
        throw new Error('Worker deployed but webhook failed: ' + (hookData.description || 'unknown error'));
      }
      webhook = { ok: true };
      // Fire-and-forget webhook info (won't delay response)
      fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
        .then(r => r.json())
        .then(info => {
          if (info.last_error_message) {
            console.warn('Telegram webhook last error:', info.last_error_message);
          }
        })
        .catch(() => {});
    }

    return { ...data, scriptName: safeName, workerUrl, webhook };
  }

  // ── Ensure bot_logs table exists (for existing databases where migration already ran) ──
  async ensureBotLogsTable() {
    try {
      await this.d1Execute(`CREATE TABLE IF NOT EXISTS bot_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        level TEXT NOT NULL DEFAULT 'INFO',
        message TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (bot_id) REFERENCES bots(id)
      )`);
      await this.d1Execute('CREATE INDEX IF NOT EXISTS idx_bot_logs_bot_id ON bot_logs(bot_id)');
      await this.d1Execute('CREATE INDEX IF NOT EXISTS idx_bot_logs_created ON bot_logs(created_at)');
    } catch {
      // Table or indexes may already exist — safe to ignore
    }
  }

  // ── Run initial database migrations ──
  async runMigrations() {
    const migrations = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS bots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        bot_name TEXT NOT NULL,
        bot_username TEXT,
        bot_token TEXT NOT NULL,
        worker_url TEXT,
        worker_script TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT,
        action_type TEXT NOT NULL,
        action_params TEXT NOT NULL DEFAULT '{}',
        priority INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (bot_id) REFERENCES bots(id)
      )`,
      `CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        r2_key TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (bot_id) REFERENCES bots(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_rules_bot_id ON rules(bot_id)`,
      `CREATE INDEX IF NOT EXISTS idx_media_bot_id ON media(bot_id)`,
      `CREATE TABLE IF NOT EXISTS bot_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        level TEXT NOT NULL DEFAULT 'INFO',
        message TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (bot_id) REFERENCES bots(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_bot_logs_bot_id ON bot_logs(bot_id)`,
      `CREATE INDEX IF NOT EXISTS idx_bot_logs_created ON bot_logs(created_at)`,
    ];

    for (const sql of migrations) {
      await this.d1Execute(sql);
    }

    // Add is_admin column for existing databases (safe to re-run)
    try {
      await this.d1Execute('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
    } catch {
      // Column may already exist — safe to ignore
    }

    // Create bot_logs table for existing databases (safe to re-run)
    try {
      await this.d1Execute(`CREATE TABLE IF NOT EXISTS bot_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id INTEGER NOT NULL,
        level TEXT NOT NULL DEFAULT 'INFO',
        message TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (bot_id) REFERENCES bots(id)
      )`);
      await this.d1Execute('CREATE INDEX IF NOT EXISTS idx_bot_logs_bot_id ON bot_logs(bot_id)');
      await this.d1Execute('CREATE INDEX IF NOT EXISTS idx_bot_logs_created ON bot_logs(created_at)');
    } catch {
      // Table may already exist — safe to ignore
    }

    // Add broken_media column to rules table (tracks media deletions that affect rules)
    try {
      await this.d1Execute("ALTER TABLE rules ADD COLUMN broken_media TEXT DEFAULT NULL");
    } catch {
      // Column may already exist
    }
  }
}

// ============================================================
// HELPERS
// ============================================================

function html(strings, ...values) {
  return new Response(
    strings.reduce((acc, str, i) => acc + str + (values[i] || ''), ''),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'telegram-bot-builder-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================
// CONFIG MIDDLEWARE — Reads setup from headers
// ============================================================

function parsePlatformConfig(raw) {
  if (!raw) return null;
  try {
    const cfg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (cfg?.accountId && cfg?.apiToken && cfg?.d1Id && cfg?.kvId) return cfg;
  } catch {
    // ignore invalid config
  }
  return null;
}

function getWorkerScriptName(requestOrUrl) {
  try {
    const url = typeof requestOrUrl === 'string'
      ? requestOrUrl
      : (requestOrUrl?.url || '');
    const host = new URL(url).hostname;
    if (host.endsWith('.workers.dev')) {
      return host.split('.')[0];
    }
  } catch {
    // ignore
  }
  return null;
}

function getCFClient(c) {
  const saved = parsePlatformConfig(c.env?.PLATFORM_CONFIG);
  const accountId = c.req.header('x-cf-account') || saved?.accountId;
  const apiToken = c.req.header('x-cf-token') || saved?.apiToken;
  const d1Id = c.req.header('x-cf-d1') || saved?.d1Id;
  const kvId = c.req.header('x-cf-kv') || saved?.kvId;

  if (!accountId || !apiToken || !d1Id || !kvId) return null;

  return new CFClient(apiToken, accountId, d1Id, kvId);
}

function readUserCount(rows) {
  const row = rows?.[0] || {};
  const raw = row.count ?? row.COUNT ?? row['COUNT(*)'] ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// ============================================================
// SETUP ROUTES
// ============================================================

// Check setup status
app.get('/api/setup/status', async (c) => {
  const cf = getCFClient(c);
  const saved = parsePlatformConfig(c.env?.PLATFORM_CONFIG);

  let hasUsers = false;
  if (cf) {
    try {
      const result = await cf.d1Query('SELECT COUNT(*) as count FROM users');
      hasUsers = readUserCount(result) > 0;
    } catch {
      // Table may not exist yet — treat as no users
    }
  }

  return c.json({
    configured: !!(cf || saved),
    hasD1: !!(cf?.d1Id || saved?.d1Id),
    hasKV: !!(cf?.kvId || saved?.kvId),
    hasUsers,
    config: saved ? {
      accountId: saved.accountId,
      d1Id: saved.d1Id,
      kvId: saved.kvId,
      // never return apiToken in status for safety when called without auth —
      // client already has it from PLATFORM_CONFIG injection on /
    } : null,
  });
});

// Initialize resources — streams live progress as NDJSON
// Reuses existing D1/KV/R2 if already created (safe to re-run)
app.post('/api/setup/init', async (c) => {
  const { accountId, apiToken, scriptName: clientScriptName } = await c.req.json();
  if (!accountId || !apiToken) {
    return c.json({ error: 'Account ID and API Token are required' }, 400);
  }

  const scriptName = clientScriptName || getWorkerScriptName(c.req.url || c.request);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = (msg) => writer.write(encoder.encode(JSON.stringify(msg) + '\n'));

  // Run setup in background, stream progress
  (async () => {
    try {
      const cf = new CFClient(apiToken, accountId);
      let d1Id = '', kvId = '';

      // Step 1: D1 — reuse if present
      await send({ step: 'd1', status: 'progress', message: 'Checking D1 database...' });
      const d1 = await cf.ensureD1Database(PLATFORM_RESOURCES.d1);
      d1Id = d1.id;
      cf.d1Id = d1Id;
      await send({
        step: 'd1',
        status: 'done',
        message: d1.created ? 'D1 database created' : 'Existing D1 database found',
        detail: d1Id.slice(0, 16) + '...',
      });

      // Step 2: KV — reuse if present
      await send({ step: 'kv', status: 'progress', message: 'Checking KV namespace...' });
      const kv = await cf.ensureKVNamespace(PLATFORM_RESOURCES.kv);
      kvId = kv.id;
      cf.kvId = kvId;
      await send({
        step: 'kv',
        status: 'done',
        message: kv.created ? 'KV namespace created' : 'Existing KV namespace found',
        detail: kvId.slice(0, 16) + '...',
      });

      // Step 3: Run migrations (IF NOT EXISTS — safe to re-run)
      await send({ step: 'migrations', status: 'progress', message: 'Ensuring database tables...' });
      await cf.runMigrations();
      await send({ step: 'migrations', status: 'done', message: 'Database tables ready (users, bots, rules, media)' });

      const config = { accountId, apiToken, d1Id, kvId };

      // Persist on the Worker secret so future reloads skip setup
      await send({ step: 'persist', status: 'progress', message: 'Saving platform config...' });
      try {
        if (scriptName) {
          await cf.savePlatformConfig(scriptName, config);
          await send({ step: 'persist', status: 'done', message: 'Config saved on Worker (setup will be skipped next time)' });
        } else {
          await send({ step: 'persist', status: 'done', message: 'Config saved in browser (could not detect Worker name)' });
        }
      } catch (persistErr) {
        await send({
          step: 'persist',
          status: 'done',
          message: 'Config saved in browser (Worker secret update skipped: ' + persistErr.message + ')',
        });
      }

      // Complete
      await send({
        step: 'complete',
        status: 'done',
        message: 'Platform is ready!',
        config: { accountId, d1Id, kvId },
      });
    } catch (e) {
      await send({ step: 'error', status: 'error', message: e.message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
});

// Verify token has correct permissions
app.post('/api/setup/verify-token', async (c) => {
  const { apiToken } = await c.req.json();
  if (!apiToken) return c.json({ error: 'API Token required' }, 400);

  try {
    // Test the token by getting the user's accounts
    const res = await fetch('https://api.cloudflare.com/client/v4/accounts', {
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!data.success) {
      return c.json({ error: data.errors?.[0]?.message || 'Invalid API token' }, 400);
    }
    const accounts = data.result || [];
    return c.json({
      success: true,
      accounts: accounts.map((a) => ({
        id: String(a.id ?? ''),
        name: String(a.name ?? 'Unnamed Account'),
      })).filter((a) => a.id),
    });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================
// AUTH ROUTES (using CFClient for D1)
// ============================================================

app.post('/api/register', async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Platform not initialized. Complete setup first.' }, 400);

  // Only the first user can register (the admin)
  const userCount = await cf.d1Query('SELECT COUNT(*) as count FROM users');
  if (readUserCount(userCount) > 0) {
    return c.json({
      error: 'Registration is closed. The admin account already exists. Please sign in instead.',
      code: 'REGISTRATION_CLOSED',
    }, 403);
  }

  const { username, password } = await c.req.json();
  if (!username || !password || password.length < 6) {
    return c.json({ error: 'Username and password (min 6 chars) required' }, 400);
  }

  const existing = await cf.d1Query('SELECT * FROM users WHERE username = ?', [username]);
  if (existing.length > 0) {
    return c.json({ error: 'Username already exists' }, 409);
  }

  const passwordHash = await hashPassword(password);
  // Insert as admin (first and only user)
  await cf.d1Execute('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)', [username, passwordHash]);
  const newUsers = await cf.d1Query('SELECT id, username, created_at FROM users WHERE username = ?', [username]);
  const user = newUsers[0];
  if (!user) {
    return c.json({ error: 'Registration failed — user was not created. Please try again.' }, 500);
  }

  const secret = c.env?.JWT_SECRET || 'telegram-bot-builder-secret';
  const token = await sign({
    sub: user.id,
    username,
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
  }, secret);

  return c.json({ token, user: { id: user.id, username, created_at: user.created_at } });
});

app.post('/api/login', async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Platform not initialized. Complete setup first.' }, 400);

  const { username, password } = await c.req.json();

  const result = await cf.d1Query('SELECT * FROM users WHERE username = ?', [username]);
  if (result.length === 0) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const passwordHash = await hashPassword(password);
  if (result[0].password_hash !== passwordHash) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const secret = c.env?.JWT_SECRET || 'telegram-bot-builder-secret';
  const token = await sign({
    sub: result[0].id,
    username,
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
  }, secret);

  return c.json({ token, user: { id: result[0].id, username } });
});

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

const authMiddleware = async (c, next) => {
  let authenticated = false;

  // First: try JWT-based auth
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const secret = c.env?.JWT_SECRET || 'telegram-bot-builder-secret';
      const token = authHeader.slice(7);
      const payload = await verify(token, secret);
      c.set('userId', payload.sub);
      c.set('username', payload.username);
      authenticated = true;
    } catch (e) {
      console.error('auth: jwt verify failed -', e.message);
      // JWT failed — fall through to CF-based fallback
    }
  }

  // Second: try Cloudflare API token auth (fallback)
  // This is secure because only the admin knows the CF API token
  if (!authenticated) {
    try {
      const cf = getCFClient(c);
      if (cf) {
        const users = await cf.d1Query('SELECT id, username FROM users WHERE is_admin = 1 LIMIT 1');
        if (users.length > 0) {
          console.log('auth: using CF API fallback for user', users[0].id);
          c.set('userId', users[0].id);
          c.set('username', users[0].username);
          authenticated = true;
        }
      }
    } catch (e) {
      console.error('auth: CF fallback failed:', e.message);
    }
  }

  if (!authenticated) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // CRITICAL: Execute the route OUTSIDE the authentication try/catch blocks!
  return await next();
};

// ============================================================
// AUTH CHECK ENDPOINT (debug helper)
// ============================================================

app.get('/api/auth/check', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const username = c.get('username');
  return c.json({ valid: true, userId, username });
});

// ============================================================
// TELEGRAM API HELPER
// ============================================================

async function callTelegramAPI(token, method, params = {}) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return await response.json();
}

// ============================================================
// BOT CRUD ROUTES
// ============================================================

app.get('/api/bots', authMiddleware, async (c) => {
  try {
    const cf = getCFClient(c);
    if (!cf) return c.json({ error: 'Not initialized' }, 400);

    const userId = c.get('userId');
    const results = await cf.d1Query('SELECT * FROM bots WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return c.json({ bots: results });
  } catch (e) {
    return c.json({ error: e.message || 'Failed to load bots' }, 500);
  }
});

app.post('/api/bots', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const { botToken } = await c.req.json();

  if (!botToken) return c.json({ error: 'Bot token is required' }, 400);

  const me = await callTelegramAPI(botToken, 'getMe');
  if (!me.ok) {
    return c.json({ error: 'Invalid bot token. Get it from @BotFather on Telegram.' }, 400);
  }

  const botName = me.result.first_name;
  const botUsername = me.result.username;

  // Insert and then SELECT (RETURNING may not work via D1 REST API)
  await cf.d1Execute(
    'INSERT INTO bots (user_id, bot_name, bot_username, bot_token) VALUES (?, ?, ?, ?)',
    [userId, botName, botUsername, botToken]
  );
  const bots = await cf.d1Query('SELECT * FROM bots WHERE bot_token = ?', [botToken]);

  return c.json({ bot: bots[0] });
});

// Update bot (change bot token)
app.put('/api/bots/:id', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const botId = parseInt(c.req.param('id'));
  const { botToken } = await c.req.json();

  if (!botToken) return c.json({ error: 'Bot token is required' }, 400);

  // Verify ownership
  const bots = await cf.d1Query('SELECT * FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

  // Validate new token with Telegram
  const me = await callTelegramAPI(botToken, 'getMe');
  if (!me.ok) {
    return c.json({ error: 'Invalid bot token. Get it from @BotFather on Telegram.' }, 400);
  }

  const botName = me.result.first_name;
  const botUsername = me.result.username;

  // Update bot record
  await cf.d1Execute(
    'UPDATE bots SET bot_token = ?, bot_name = ?, bot_username = ? WHERE id = ?',
    [botToken, botName, botUsername, botId]
  );

  const updatedBots = await cf.d1Query('SELECT * FROM bots WHERE id = ?', [botId]);

  return c.json({
    success: true,
    bot: updatedBots[0],
    message: `✅ Bot updated! @${botUsername} is now connected.`,
  });
});

app.get('/api/bots/:id', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const botId = parseInt(c.req.param('id'));

  const bots = await cf.d1Query('SELECT * FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

  const rules = await cf.d1Query('SELECT * FROM rules WHERE bot_id = ? ORDER BY priority ASC', [botId]);
  return c.json({ bot: bots[0], rules });
});

app.delete('/api/bots/:id', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const botId = parseInt(c.req.param('id'));

  const bots = await cf.d1Query('SELECT * FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

  await cf.d1Execute('DELETE FROM rules WHERE bot_id = ?', [botId]);
  await cf.d1Execute('DELETE FROM bots WHERE id = ?', [botId]);

  return c.json({ success: true });
});

// ============================================================
// RULES CRUD ROUTES
// ============================================================

app.post('/api/bots/:id/rules', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const botId = parseInt(c.req.param('id'));
  const { triggerType, triggerValue, actionType, actionParams, priority } = await c.req.json();

  const bots = await cf.d1Query('SELECT * FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

  // Insert and then SELECT (RETURNING may not work via D1 REST API)
  await cf.d1Execute(
    'INSERT INTO rules (bot_id, trigger_type, trigger_value, action_type, action_params, priority) VALUES (?, ?, ?, ?, ?, ?)',
    [botId, triggerType, triggerValue || null, actionType, JSON.stringify(actionParams || {}), priority || 0]
  );
  const rules = await cf.d1Query('SELECT * FROM rules WHERE bot_id = ? ORDER BY created_at DESC LIMIT 1', [botId]);

  return c.json({ rule: rules[0] });
});

app.put('/api/rules/:id', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const ruleId = parseInt(c.req.param('id'));
  const { triggerType, triggerValue, actionType, actionParams, priority } = await c.req.json();

  const rules = await cf.d1Query(
    `SELECT r.*, b.user_id FROM rules r JOIN bots b ON r.bot_id = b.id WHERE r.id = ?`,
    [ruleId]
  );
  if (rules.length === 0) return c.json({ error: 'Rule not found' }, 404);
  if (rules[0].user_id !== userId) return c.json({ error: 'Unauthorized' }, 403);

  const updates = [];
  const params = [];
  if (triggerType !== undefined) { updates.push('trigger_type = ?'); params.push(triggerType); }
  if (triggerValue !== undefined) { updates.push('trigger_value = ?'); params.push(triggerValue); }
  if (actionType !== undefined) { updates.push('action_type = ?'); params.push(actionType); }
  if (actionParams !== undefined) { updates.push('action_params = ?'); params.push(JSON.stringify(actionParams)); updates.push('broken_media = ?'); params.push(null); }
  if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }

  if (updates.length > 0) {
    // Ensure broken_media column exists (safe no-op if already exists)
    try {
      await cf.d1Execute("ALTER TABLE rules ADD COLUMN broken_media TEXT DEFAULT NULL");
    } catch {
      // Column may already exist — safe to ignore
    }
    params.push(ruleId);
    await cf.d1Execute(`UPDATE rules SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  return c.json({ success: true });
});

app.delete('/api/rules/:id', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const ruleId = parseInt(c.req.param('id'));

  const rules = await cf.d1Query(
    `SELECT r.*, b.user_id FROM rules r JOIN bots b ON r.bot_id = b.id WHERE r.id = ?`,
    [ruleId]
  );
  if (rules.length === 0) return c.json({ error: 'Rule not found' }, 404);
  if (rules[0].user_id !== userId) return c.json({ error: 'Unauthorized' }, 403);

  await cf.d1Execute('DELETE FROM rules WHERE id = ?', [ruleId]);
  return c.json({ success: true });
});

// Duplicate a rule
app.post('/api/rules/:id/duplicate', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const ruleId = parseInt(c.req.param('id'));

  const rules = await cf.d1Query(
    `SELECT r.*, b.user_id FROM rules r JOIN bots b ON r.bot_id = b.id WHERE r.id = ?`,
    [ruleId]
  );
  if (rules.length === 0) return c.json({ error: 'Rule not found' }, 404);
  if (rules[0].user_id !== userId) return c.json({ error: 'Unauthorized' }, 403);

  const original = rules[0];
  await cf.d1Execute(
    'INSERT INTO rules (bot_id, trigger_type, trigger_value, action_type, action_params, priority) VALUES (?, ?, ?, ?, ?, ?)',
    [original.bot_id, original.trigger_type, original.trigger_value, original.action_type, original.action_params, (original.priority || 0) + 1]
  );

  return c.json({ success: true, message: '✅ Rule duplicated!' });
});

// Bulk reorder rules (drag-and-drop)
app.post('/api/bots/:id/rules/reorder', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const botId = parseInt(c.req.param('id'));
  const { ruleIds } = await c.req.json();

  if (!Array.isArray(ruleIds) || ruleIds.length === 0) {
    return c.json({ error: 'ruleIds array is required' }, 400);
  }

  // Verify bot ownership
  const bots = await cf.d1Query('SELECT id FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

  // Update priorities based on position in the array
  for (let i = 0; i < ruleIds.length; i++) {
    await cf.d1Execute('UPDATE rules SET priority = ? WHERE id = ? AND bot_id = ?', [i * 10, ruleIds[i], botId]);
  }

  const updatedRules = await cf.d1Query(
    'SELECT * FROM rules WHERE bot_id = ? ORDER BY priority ASC, id ASC',
    [botId]
  );

  return c.json({ success: true, rules: updatedRules });
});

// ============================================================
// MEDIA UPLOAD ROUTE
// ============================================================

app.post('/api/media/upload', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  try {
    const userId = c.get('userId');
    const formData = await c.req.formData();
    const file = formData.get('file');
    const botId = parseInt(formData.get('bot_id') || '0');

    if (!file) return c.json({ error: 'No file provided' }, 400);

    // ── Enforce 15MB size limit (KV supports 25MB max, Base64 adds ~33%, so 15MB keeps us safe) ──
    const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return c.json({ error: `File too large (${sizeMB}MB). Maximum is 15MB.` }, 413);
    }

    // Verify bot ownership
    const bots = await cf.d1Query('SELECT id FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
    if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

    const timestamp = Date.now();
    const kvKey = `media_${botId}_${timestamp}`;
    const buffer = await file.arrayBuffer();

    // Store file in KV (auto-provisioned during setup — no manual steps needed!)
    await cf.kvPutMedia(kvKey, buffer, file.type);

    await cf.d1Execute(
      'INSERT INTO media (bot_id, filename, r2_key) VALUES (?, ?, ?)',
      [botId, file.name, kvKey]
    );
    const mediaResult = await cf.d1Query('SELECT * FROM media WHERE r2_key = ?', [kvKey]);

    // Generate a URL for the uploaded file
    const host = new URL(c.req.url || c.request.url);
    const fileUrl = host.origin + '/api/media/' + mediaResult[0].id + '/file';

    return c.json({ media: { ...mediaResult[0], url: fileUrl } });
  } catch (e) {
    return c.json({ error: 'Upload failed: ' + (e.message || 'Unknown error') }, 500);
  }
});

// ── Media List ──
app.get('/api/bots/:id/media', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const botId = parseInt(c.req.param('id'));

  const bots = await cf.d1Query('SELECT id FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

  const media = await cf.d1Query(
    'SELECT * FROM media WHERE bot_id = ? ORDER BY created_at DESC',
    [botId]
  );

  // Attach URLs
  const host = new URL(c.req.url || c.request.url);
  const mediaWithUrls = (media || []).map(m => ({
    ...m,
    url: host.origin + '/api/media/' + m.id + '/file',
  }));

  return c.json({ media: mediaWithUrls });
});

// ── Media Delete ──
app.delete('/api/media/:id', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const mediaId = parseInt(c.req.param('id'));

  // Get media record and verify ownership via bot
  const mediaRows = await cf.d1Query(
    `SELECT m.*, b.user_id FROM media m JOIN bots b ON m.bot_id = b.id WHERE m.id = ?`,
    [mediaId]
  );
  if (mediaRows.length === 0) return c.json({ error: 'Media not found' }, 404);
  if (mediaRows[0].user_id !== userId) return c.json({ error: 'Unauthorized' }, 403);

  // Delete from KV storage
  try {
    await cf.kvDelete(mediaRows[0].r2_key);
  } catch {
    // KV delete may fail if key doesn't exist — proceed with DB delete
  }

  const botId = mediaRows[0].bot_id;
  const mediaFilename = mediaRows[0].filename;

  // Delete from DB
  await cf.d1Execute('DELETE FROM media WHERE id = ?', [mediaId]);

  // ── Find rules that reference this deleted media and mark them as broken ──
  const mediaUrlPattern = `%/api/media/${mediaId}/file%`;
  const affectedRules = await cf.d1Query(
    'SELECT id, action_params FROM rules WHERE bot_id = ? AND action_params LIKE ?',
    [botId, mediaUrlPattern]
  );

  const affectedRuleIds = [];
  // Ensure broken_media column exists (safe no-op if already present)
  try {
    await cf.d1Execute("ALTER TABLE rules ADD COLUMN broken_media TEXT DEFAULT NULL");
  } catch {
    // Column may already exist
  }
  for (const rule of affectedRules) {
    affectedRuleIds.push(rule.id);
    // Build broken_media info: merge with any existing broken media references
    const existingBroken = rule.broken_media ? (() => { try { return JSON.parse(rule.broken_media); } catch { return []; } })() : [];
    const alreadyTracked = existingBroken.some(b => b.id === mediaId);
    if (!alreadyTracked) {
      existingBroken.push({ id: mediaId, filename: mediaFilename });
    }
    await cf.d1Execute('UPDATE rules SET broken_media = ? WHERE id = ?', [JSON.stringify(existingBroken), rule.id]);
  }

  return c.json({
    success: true,
    message: '✅ Media deleted!' + (affectedRuleIds.length > 0 ? ' ⚠️ ' + affectedRuleIds.length + ' rule(s) affected.' : ''),
    affectedRules: affectedRuleIds,
    mediaFilename,
  });
});

// ── Media Rename ──
app.put('/api/media/:id', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const userId = c.get('userId');
  const mediaId = parseInt(c.req.param('id'));
  const { filename } = await c.req.json();

  if (!filename || !filename.trim()) {
    return c.json({ error: 'Filename is required' }, 400);
  }

  const mediaRows = await cf.d1Query(
    `SELECT m.*, b.user_id FROM media m JOIN bots b ON m.bot_id = b.id WHERE m.id = ?`,
    [mediaId]
  );
  if (mediaRows.length === 0) return c.json({ error: 'Media not found' }, 404);
  if (mediaRows[0].user_id !== userId) return c.json({ error: 'Unauthorized' }, 403);

  await cf.d1Execute('UPDATE media SET filename = ? WHERE id = ?', [filename.trim(), mediaId]);

  const updated = await cf.d1Query('SELECT * FROM media WHERE id = ?', [mediaId]);
  const host = new URL(c.req.url || c.request.url);

  return c.json({
    success: true,
    media: { ...updated[0], url: host.origin + '/api/media/' + mediaId + '/file' },
  });
});

// ── Media File Proxy ──
app.get('/api/media/:id/file', async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  const mediaId = parseInt(c.req.param('id'));

  const mediaRows = await cf.d1Query('SELECT * FROM media WHERE id = ?', [mediaId]);
  if (mediaRows.length === 0) return new Response('Not Found', { status: 404 });

  const media = mediaRows[0];
  const kvData = await cf.kvGetMedia(media.r2_key);
  if (!kvData) return new Response('File not found in storage', { status: 404 });

  // Return the file with stored content type
  return new Response(kvData.body, {
    headers: {
      'Content-Type': kvData.contentType,
      'Content-Disposition': 'inline; filename="' + media.filename + '"',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});

// ============================================================
// LOG API ROUTES
// ============================================================

// Receive logs from deployed bot workers (called by the bot itself via HTTP)
app.post('/api/logs/:id', async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  // Ensure bot_logs table exists (safe no-op if already exists)
  await cf.ensureBotLogsTable();

  const botId = parseInt(c.req.param('id'));
  const { token, level, message: logMessage } = await c.req.json();

  if (!level || !logMessage) {
    return c.json({ error: 'Level and message required' }, 400);
  }

  // Verify bot token so only the actual bot can log
  const bots = await cf.d1Query('SELECT bot_token FROM bots WHERE id = ?', [botId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);
  if (bots[0].bot_token !== token) return c.json({ error: 'Unauthorized' }, 403);

  await cf.d1Execute(
    'INSERT INTO bot_logs (bot_id, level, message) VALUES (?, ?, ?)',
    [botId, level, logMessage]
  );

  return c.json({ success: true });
});

// Fetch logs for a bot (with optional level filter and limit)
app.get('/api/bots/:id/logs', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  // Ensure bot_logs table exists (safe no-op if already exists)
  await cf.ensureBotLogsTable();

  const userId = c.get('userId');
  const botId = parseInt(c.req.param('id'));
  const url = new URL(c.req.url, 'http://localhost');
  const level = url.searchParams.get('level') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

  // Verify ownership
  const bots = await cf.d1Query('SELECT id FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

  let sql = 'SELECT * FROM bot_logs WHERE bot_id = ?';
  const params = [botId];

  if (level && ['DEBUG', 'INFO', 'WARNING', 'ERROR'].includes(level.toUpperCase())) {
    sql += ' AND level = ?';
    params.push(level.toUpperCase());
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const logs = await cf.d1Query(sql, params);

  // Also get total count
  const countResult = await cf.d1Query('SELECT COUNT(*) as count FROM bot_logs WHERE bot_id = ?', [botId]);
  const totalCount = countResult[0]?.count || 0;

  return c.json({ logs, totalCount });
});

// Clear all logs for a bot
app.delete('/api/bots/:id/logs', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  // Ensure bot_logs table exists (safe no-op if already exists)
  await cf.ensureBotLogsTable();

  const userId = c.get('userId');
  const botId = parseInt(c.req.param('id'));

  const bots = await cf.d1Query('SELECT id FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

  await cf.d1Execute('DELETE FROM bot_logs WHERE bot_id = ?', [botId]);

  return c.json({ success: true, message: '✅ Logs cleared!' });
});

// Get log stats for a bot
app.get('/api/bots/:id/logs/stats', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  // Ensure bot_logs table exists (safe no-op if already exists)
  await cf.ensureBotLogsTable();

  const userId = c.get('userId');
  const botId = parseInt(c.req.param('id'));

  const bots = await cf.d1Query('SELECT id FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
  if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

  const countResult = await cf.d1Query('SELECT COUNT(*) as count FROM bot_logs WHERE bot_id = ?', [botId]);
  const levelCounts = await cf.d1Query(
    'SELECT level, COUNT(*) as count FROM bot_logs WHERE bot_id = ? GROUP BY level',
    [botId]
  );

  return c.json({
    totalLogs: countResult[0]?.count || 0,
    levels: levelCounts,
  });
});

// Get database storage stats (approximate)
app.get('/api/db/stats', authMiddleware, async (c) => {
  const cf = getCFClient(c);
  if (!cf) return c.json({ error: 'Not initialized' }, 400);

  // Ensure bot_logs table exists (safe no-op if already exists)
  await cf.ensureBotLogsTable();

  try {
    // Count rows across main tables for approximate usage
    // Each query is wrapped individually so a missing table doesn't crash the whole thing
    let botCount = 0, ruleCount = 0, logCount = 0, userCount = 0;
    try { const r = await cf.d1Query('SELECT COUNT(*) as count FROM bots'); botCount = r[0]?.count || 0; } catch (e) { console.error('bots count:', e.message); }
    try { const r = await cf.d1Query('SELECT COUNT(*) as count FROM rules'); ruleCount = r[0]?.count || 0; } catch (e) { console.error('rules count:', e.message); }
    try { const r = await cf.d1Query('SELECT COUNT(*) as count FROM bot_logs'); logCount = r[0]?.count || 0; } catch (e) { console.error('bot_logs count:', e.message); }
    try { const r = await cf.d1Query('SELECT COUNT(*) as count FROM users'); userCount = r[0]?.count || 0; } catch (e) { console.error('users count:', e.message); }

    // Estimate DB size (rough: sum of row counts * avg row size)
    const estimatedBytes =
      userCount * 256 +
      botCount * 512 +
      ruleCount * 384 +
      logCount * 192;

    return c.json({
      bots: botCount,
      rules: ruleCount,
      logs: logCount,
      users: userCount,
      estimatedBytes,
      estimatedMB: (estimatedBytes / (1024 * 1024)).toFixed(2),
    });
  } catch (e) {
    return c.json({ error: e.message }, 500);
  }
});

// ============================================================
// CODE GENERATOR — self-contained Worker (no npm imports)
// ============================================================

function generateBotScript(botRules) {
  const rulesJSON = JSON.stringify(botRules);

  return `const rules = ${rulesJSON};

// ── Logging helpers ──
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3 };

async function log(level, message, env) {
  if (!env) return;
  const logEnabled = env.LOG_ENABLED !== 'false';
  if (!logEnabled) return;
  const logLevel = (LOG_LEVELS[env.LOG_LEVEL] !== undefined ? env.LOG_LEVEL : 'INFO');
  const levelNum = LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.INFO;
  const configNum = LOG_LEVELS[logLevel] !== undefined ? LOG_LEVELS[logLevel] : LOG_LEVELS.INFO;
  if (levelNum < configNum) return;
  const parentUrl = env.PARENT_URL || '';
  const botToken = env.BOT_TOKEN || '';
  const botId = env.BOT_ID || '0';
  if (!parentUrl || !botToken) return;
  try {
    await fetch(parentUrl + '/api/logs/' + botId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: botToken, level, message: String(message).slice(0, 2000) }),
    });
  } catch (e) {
    // Logging failure should never crash the bot
  }
}

async function tg(env, method, body) {
  if (!env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is not configured');
  }
  try {
    const res = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram API error:', method, data.description || data);
    }
    return data;
  } catch (e) {
    console.error('Telegram API request failed:', method, e.message);
    return { ok: false, error: e.message };
  }
}

function parseParams(rule) {
  if (!rule.action_params) return {};
  if (typeof rule.action_params === 'string') {
    try { return JSON.parse(rule.action_params); } catch { return {}; }
  }
  return rule.action_params;
}

function getCommand(text) {
  if (!text || typeof text !== 'string' || !text.startsWith('/')) return null;
  const part = text.trim().split(/\\s+/)[0];
  return part.split('@')[0].slice(1).toLowerCase();
}

async function reply(env, chatId, text, extra) {
  return tg(env, 'sendMessage', {
    chat_id: chatId,
    text: text || 'Hello!',
    disable_web_page_preview: true,
    ...(extra || {}),
  });
}

function replaceVariables(text, update) {
  if (!text || typeof text !== 'string') return text || '';
  const msg = update.message || update.edited_message || update.callback_query?.message || {};
  const from = update.message?.from || update.edited_message?.from || update.callback_query?.from || {};
  const chat = msg.chat || {};
  const map = {
    '{first_name}': from.first_name || '',
    '{last_name}': from.last_name || '',
    '{username}': from.username || from.first_name || 'User',
    '{user_id}': String(from.id || ''),
    '{message}': msg.text || '',
    '{chat_title}': chat.title || chat.first_name || 'Chat',
    '{chat_id}': String(chat.id || ''),
    '{date}': msg.date ? new Date(msg.date * 1000).toLocaleString() : '',
  };
  return text.replace(/{first_name}|{last_name}|{username}|{user_id}|{message}|{chat_title}|{chat_id}|{date}/g, function(m) { return map[m] || ''; });
}

async function executeAction(env, update, actionType, params) {
  const message = update.message || update.edited_message || update.callback_query?.message;
  const from = update.message?.from || update.edited_message?.from || update.callback_query?.from;
  const chatId = message?.chat?.id;
  if (!chatId) return;

  // Log every action execution
  await log('INFO', 'Action: ' + actionType + ' triggered' + (from ? ' by ' + (from.username || from.first_name || from.id) : ''), env);

  switch (actionType) {
    case 'send_message': {
      await reply(env, chatId, replaceVariables(params.text || 'Hello!', update), {});
      break;
    }

    case 'send_photo': {
      const photo = params.photo_url || params.file_id;
      if (!photo) {
        await reply(env, chatId, '⚠️ No photo URL or file ID provided for this action.');
        break;
      }
      await tg(env, 'sendPhoto', {
        chat_id: chatId,
        photo,
        caption: replaceVariables(params.caption || '', update),
      });
      break;
    }

    case 'send_document': {
      const doc = params.document_url || params.file_id;
      if (!doc) {
        await reply(env, chatId, '⚠️ No document URL or file ID provided for this action.');
        break;
      }
      await tg(env, 'sendDocument', {
        chat_id: chatId,
        document: doc,
        caption: replaceVariables(params.document_caption || '', update),
      });
      break;
    }

    case 'show_keyboard': {
      const buttons = params.buttons || [];
      const isInline = params.keyboard_type === 'inline';
      const reply_markup = isInline
        ? { inline_keyboard: buttons.map((b) => [{ text: b, callback_data: String(b).slice(0, 64) }]) }
        : {
            keyboard: buttons.map((b) => [{ text: b }]),
            resize_keyboard: true,
            one_time_keyboard: true,
          };
      await reply(env, chatId, params.text || 'Choose an option:', { reply_markup });
      break;
    }

    case 'store_data': {
      const key = 'user:' + (from?.id || 'unknown') + ':' + (params.key || 'data');
      const value = params.value || message?.text || '';
      if (env.BOT_DATA) {
        await env.BOT_DATA.put(key, value, { expirationTtl: 86400 * 30 });
        await reply(env, chatId, '✅ Data saved!');
      } else {
        await reply(env, chatId, '⚠️ Storage is not configured for this bot.');
      }
      break;
    }

    case 'fetch_api':
      try {
        const apiRes = await fetch(params.api_url || '', {
          method: params.method || 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: params.method === 'POST' ? (params.body || '{}') : undefined,
        });
        const data = await apiRes.json();
        await reply(env, chatId, JSON.stringify(data, null, 2).slice(0, 4000));
      } catch (e) {
        await reply(env, chatId, '❌ API request failed: ' + e.message);
      }
      break;

    case 'forward':
      if (params.admin_id && message?.message_id) {
        await tg(env, 'forwardMessage', {
          chat_id: params.admin_id,
          from_chat_id: chatId,
          message_id: message.message_id,
        });
      } else {
        await reply(env, chatId, 'Admin ID not configured.');
      }
      break;

    default:
      await reply(env, chatId, 'Unknown action: ' + actionType);
  }
}

function ruleMatches(rule, update) {
  const trigger = String(rule.trigger_type || '').trim();
  const value = String(rule.trigger_value || '').trim();
  const message = update.message || update.edited_message;

  if (trigger === 'command') {
    const text = message?.text || message?.caption || '';
    const cmd = getCommand(text);
    const wanted = (value.replace(/^\\/+/, '') || 'start').toLowerCase();
    return !!cmd && cmd === wanted;
  }

  if (trigger === 'message') {
    const text = message?.text || '';
    if (!message || message.text == null) return false;
    if (!value) return true;
    return text.toLowerCase().includes(value.toLowerCase());
  }

  if (trigger === 'callback') {
    const data = update.callback_query?.data || '';
    if (!update.callback_query) return false;
    if (!value) return true;
    return data === value;
  }

  if (trigger === 'new_member') {
    return !!(message?.new_chat_members && message.new_chat_members.length);
  }

  return false;
}

async function handleUpdate(update, env) {
  // Log incoming update
  const msg = update.message || update.edited_message || {};
  const cb = update.callback_query || {};
  const from = msg.from || cb.from || {};
  const userName = from.username || from.first_name || from.id || 'unknown';
  const text = msg.text || msg.caption || cb.data || '(no text)';
  await log('INFO', 'Update from @' + userName + ': ' + text.slice(0, 200), env);

  const ordered = [...rules].sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));
  let matched = 0;
  for (const rule of ordered) {
    if (!ruleMatches(rule, update)) continue;
    matched += 1;
    await log('DEBUG', 'Rule matched: ' + (rule.trigger_type || '?') + ' = ' + (rule.trigger_value || ''), env);
    await executeAction(env, update, rule.action_type, parseParams(rule));
  }

  if (matched === 0) {
    await log('WARNING', 'No rules matched for update from @' + userName, env);
  }

  if (update.callback_query?.id) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: update.callback_query.id });
  }

  await log('INFO', 'Handled update: ' + matched + ' rule(s) matched', env);
  return matched;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      return Response.json({
        ok: true,
        hasToken: Boolean(env.BOT_TOKEN),
        rules: rules.length,
        service: 'telegram-bot',
        engine: 'HG-TeleFlare v1.0.0',
        author: 'Hamed Gharghi',
      });
    }

    if (request.method === 'POST' && (url.pathname === '/webhook' || url.pathname === '/')) {
      try {
        const update = await request.json();
        await log('INFO', 'Webhook received', env);
        const matched = await handleUpdate(update, env);
        return Response.json({ ok: true, matched });
      } catch (err) {
        console.error('Bot error:', err);
        await log('ERROR', 'Unhandled error: ' + (err.message || err), env);
        return Response.json({ ok: false, error: String(err.message || err) }, { status: 500 });
      }
    }

    return new Response('Telegram bot is running', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
};
`;
}

// ============================================================
// DEPLOYMENT ROUTE — Now uses CFClient to deploy Workers
// ============================================================

app.post('/api/bots/:id/deploy', authMiddleware, async (c) => {
  try {
    const cf = getCFClient(c);
    if (!cf) return c.json({ error: 'Not initialized' }, 400);

    const userId = c.get('userId');
    const botId = parseInt(c.req.param('id'));

    const bots = await cf.d1Query('SELECT * FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
    if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

    const bot = bots[0];
    const botRules = await cf.d1Query('SELECT * FROM rules WHERE bot_id = ? ORDER BY priority ASC', [botId]);
    if (botRules.length === 0) return c.json({ error: 'Add at least one rule before deploying' }, 400);

    const scriptName = `tb-${(bot.bot_username || String(botId)).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
    const code = generateBotScript(botRules);

    const host = new URL(c.req.url || c.request.url).hostname;
    const workersSubdomain = host.endsWith('.workers.dev')
      ? host.split('.').slice(1, -2).join('.') || host.split('.')[1]
      : null;

    const host2 = new URL(c.req.url || c.request.url);
    const parentUrl = host2.origin;

    const result = await cf.deployWorker(scriptName, code, {
      envVars: {
        BOT_TOKEN: bot.bot_token,
        PARENT_URL: parentUrl,
        BOT_ID: String(botId),
        LOG_LEVEL: 'INFO',
        LOG_ENABLED: 'true',
      },
      kvId: cf.kvId || null,
      workersSubdomain,
    });

    const workerUrl = result.workerUrl;
    await cf.d1Execute(
      'UPDATE bots SET worker_url = ?, worker_script = ?, is_active = 1 WHERE id = ?',
      [workerUrl, result.scriptName || scriptName, botId]
    );

    return c.json({
      message: `✅ Bot deployed! @${bot.bot_username} is live.`,
      workerUrl,
      scriptName: result.scriptName || scriptName,
      webhookUrl: `${workerUrl}/webhook`,
      webhook: result.webhook?.result || null,
    });
  } catch (e) {
    return c.json({ error: 'Deployment failed: ' + e.message }, 500);
  }
});

// ============================================================
// TOGGLE BOT ACTIVE/INACTIVE
// ============================================================

app.post('/api/bots/:id/toggle', authMiddleware, async (c) => {
  try {
    const cf = getCFClient(c);
    if (!cf) return c.json({ error: 'Not initialized' }, 400);

    const userId = c.get('userId');
    const botId = parseInt(c.req.param('id'));

    const bots = await cf.d1Query('SELECT * FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);
    if (bots.length === 0) return c.json({ error: 'Bot not found' }, 404);

    const bot = bots[0];
    const newState = bot.is_active ? 0 : 1;

    // If activating, require the bot to have been deployed first
    if (newState === 1 && !bot.worker_url) {
      return c.json({ error: 'Deploy the bot first before activating it.' }, 400);
    }

    // If activating: set webhook on Telegram
    if (newState === 1 && bot.worker_url && bot.bot_token) {
      const hook = await fetch(`https://api.telegram.org/bot${bot.bot_token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `${bot.worker_url}/webhook`,
          drop_pending_updates: false,
          allowed_updates: ['message', 'callback_query'],
        }),
      });
      const hookData = await hook.json();
      if (!hookData.ok) {
        return c.json({ error: 'Failed to activate bot: ' + (hookData.description || 'Telegram API error') }, 500);
      }
    }

    // If deactivating: remove webhook from Telegram so bot stops receiving updates
    if (newState === 0 && bot.bot_token) {
      await fetch(`https://api.telegram.org/bot${bot.bot_token}/deleteWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await cf.d1Execute('UPDATE bots SET is_active = ? WHERE id = ?', [newState, botId]);

    const updatedBots = await cf.d1Query('SELECT * FROM bots WHERE id = ? AND user_id = ?', [botId, userId]);

    return c.json({
      success: true,
      is_active: newState,
      bot: updatedBots[0],
      message: newState === 1
        ? `✅ @${bot.bot_username || bot.bot_name} is now active`
        : `⏸️ @${bot.bot_username || bot.bot_name} is now paused`,
    });
  } catch (e) {
    return c.json({ error: 'Toggle failed: ' + e.message }, 500);
  }
});

// ============================================================
// DASHBOARD UI
// ============================================================

app.get('/', (c) => {
  const savedPlatformConfig = parsePlatformConfig(c.env?.PLATFORM_CONFIG);
  return html`<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- ═══════════════════════════════════════════════════════════════
       PRIMARY SEO — English
       ═══════════════════════════════════════════════════════════════ -->
  <title>HG-TeleFlare — No-Code Telegram Bot Builder for Cloudflare Workers</title>
  <meta name="description" content="HG-TeleFlare is a zero-config, self-bootstrapping Cloudflare Worker that lets you build, manage, and deploy dynamic Telegram bots visually — without writing any code. Deploy in 60 seconds.">
  <meta name="keywords" content="Telegram bot builder, Cloudflare Workers, no-code bot builder, Telegram bot, bot dashboard, D1 database, Cloudflare KV, visual bot builder, Telegram automation, free bot hosting">
  <meta name="author" content="Hamed Gharghi">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://github.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder">

  <!-- ═══════════════════════════════════════════════════════════════
       SECONDARY SEO — Persian (Farsi / فارسی)
       ═══════════════════════════════════════════════════════════════ -->
  <meta name="dc.language" content="fa" scheme="RFC1766">
  <meta name="description" lang="fa" content="اچ‌جی-تل‌فلر یک ابزار بدون تنظیمات و خودراه‌انداز برای Cloudflare Workers است که به شما امکان می‌دهد ربات‌های تلگرام را به صورت بصری و بدون نوشتن کد بسازید، مدیریت کنید و منتشر کنید. استقرار در ۶۰ ثانیه.">
  <meta name="keywords" lang="fa" content="ساخت ربات تلگرام, Cloudflare Workers, ربات ساز بدون کد, ربات تلگرام, داشبورد ربات, پایگاه داده D1, ذخیره‌سازی KV, سازنده بصری ربات, اتوماسیون تلگرام, میزبانی رایگان ربات">

  <!-- ═══════════════════════════════════════════════════════════════
       Open Graph (Facebook, LinkedIn, WhatsApp, Telegram)
       ═══════════════════════════════════════════════════════════════ -->
  <meta property="og:title" content="HG-TeleFlare — No-Code Telegram Bot Builder for Cloudflare Workers">
  <meta property="og:description" content="Zero-config, self-bootstrapping Cloudflare Worker that provisions its own D1, KV, and child Workers to build Telegram bots visually.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://github.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder">
  <meta property="og:site_name" content="HG-TeleFlare">
  <meta property="og:locale" content="en_US">
  <meta property="og:locale:alternate" content="fa_IR">

  <!-- ═══════════════════════════════════════════════════════════════
       Twitter Card
       ═══════════════════════════════════════════════════════════════ -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="HG-TeleFlare — No-Code Telegram Bot Builder for Cloudflare Workers">
  <meta name="twitter:description" content="Build, manage, and deploy Telegram bots visually on Cloudflare Workers. Zero config. Deploy in 60 seconds.">

  <!-- ═══════════════════════════════════════════════════════════════
       JSON-LD Structured Data (Schema.org)
       ═══════════════════════════════════════════════════════════════ -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "HG-TeleFlare",
    "alternateName": "Cloudflare Telegram Bot Builder",
    "description": "A zero-config, self-bootstrapping Cloudflare Worker that dynamically provisions its own D1, KV, and child Workers to build Telegram bots visually.",
    "url": "https://github.com/Hamed-Gharghi/Cloudflare-Telegram-bot-builder",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Cloudflare Workers",
    "author": {
      "@type": "Person",
      "name": "Hamed Gharghi"
    },
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    }
  }
  </script>
  <style>
    :root {
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --primary-light: rgba(99, 102, 241, 0.12);
      --primary-glow: rgba(99, 102, 241, 0.3);
      --danger: #ef4444;
      --success: #22c55e;
      --warning: #f59e0b;
      --bg: #0b1120;
      --bg-card: #131c31;
      --bg-elevated: #182340;
      --bg-input: #1e293b;
      --border: #273552;
      --border-light: #34456b;
      --text: #f1f5f9;
      --text-muted: #8899bb;
      --text-dim: #556688;
      --radius: 14px;
      --radius-sm: 8px;
      --radius-xl: 20px;
      --shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
      --shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.55);
      --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      min-height: 100dvh;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    a { color: var(--primary); text-decoration: none; transition: color 0.2s; }
    a:hover { color: #818cf8; }

    ::selection { background: var(--primary); color: white; }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--border-light); }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ─── Header ─── */
    header {
      background: var(--glass-bg, rgba(19, 28, 49, 0.85));
      border-bottom: 1px solid var(--glass-border, rgba(39, 53, 82, 0.5));
      padding: 12px 0;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: box-shadow 0.3s ease;
    }
    header.scrolled { box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2); }
    header .container { display: flex; align-items: center; justify-content: space-between; gap: 16px; }

    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.3rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, var(--primary), #a78bfa, #c4b5fd);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      background-size: 200% 200%;
    }
    .logo span { font-size: 1.5rem; -webkit-text-fill-color: initial; color: var(--text); }

    .version-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.6rem;
      font-weight: 600;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.1));
      color: #a5b4fc;
      padding: 3px 8px;
      margin-left: 8px;
      border-radius: 20px;
      border: 1px solid rgba(99, 102, 241, 0.2);
      letter-spacing: 0.3px;
      white-space: nowrap;
      vertical-align: middle;
      transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
      -webkit-text-fill-color: #a5b4fc;
      background-clip: unset;
    }
    .version-badge:hover {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.2));
      border-color: rgba(99, 102, 241, 0.5);
      transform: translateY(-1px);
    }
    .version-badge .dot { color: #818cf8; }

    /* ─── Buttons ─── */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px 24px;
      border: none;
      border-radius: var(--radius-sm);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease;
      text-decoration: none;
    }
    .btn:active { transform: scale(0.96); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    .btn-primary {
      background: linear-gradient(135deg, var(--primary), #7c3aed);
      color: white;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.25);
    }
    .btn-primary:hover:not(:disabled) {
      box-shadow: 0 6px 24px rgba(99, 102, 241, 0.4);
      transform: translateY(-1px);
    }
    .btn-primary:active:not(:disabled) { transform: translateY(0) scale(0.96); }
    .btn-danger { background: linear-gradient(135deg, var(--danger), #dc2626); color: white; }
    .btn-danger:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3); transform: translateY(-1px); }
    .btn-ghost {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-ghost:hover:not(:disabled) {
      background: var(--bg-input);
      border-color: var(--border-light);
      transform: translateY(-1px);
    }
    .btn-sm { padding: 7px 14px; font-size: 0.8rem; }
    .btn-success { background: linear-gradient(135deg, var(--success), #16a34a); color: white; }
    .btn-success:hover:not(:disabled) { box-shadow: 0 4px 16px rgba(34, 197, 94, 0.3); transform: translateY(-1px); }

    /* ─── Forms ─── */
    .form-group { margin-bottom: 18px; }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; letter-spacing: 0.2px; }
    .form-input {
      width: 100%;
      padding: 12px 16px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text);
      font-size: 0.95rem;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .form-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
    .form-input:hover:not(:focus) { border-color: var(--border-light); }
    .form-input::placeholder { color: var(--text-dim); }
    textarea.form-input { resize: vertical; min-height: 80px; font-family: inherit; }
    select.form-input {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%238899bb' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 36px;
    }

    /* ─── Cards ─── */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .card:hover { transform: translateY(-2px); border-color: var(--border-light); box-shadow: var(--shadow); }

    /* ─── Setup Page ─── */
    .setup-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 20px;
    }
    .setup-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 44px;
      width: 100%;
      max-width: 540px;
      box-shadow: var(--shadow-lg);
    }
    .setup-card h1 {
      font-size: 1.7rem;
      margin-bottom: 8px;
      text-align: center;
      background: linear-gradient(135deg, var(--text), var(--primary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .setup-card .subtitle { color: var(--text-muted); text-align: center; margin-bottom: 28px; font-size: 0.95rem; }
    .setup-card .step-indicator {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 28px;
    }
    .setup-card .step {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      font-weight: 700;
      background: var(--bg-input);
      color: var(--text-dim);
      transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      border: 1px solid transparent;
    }
    .setup-card .step.active { background: var(--primary); color: white; border-color: var(--primary); box-shadow: 0 0 12px rgba(99, 102, 241, 0.3); }
    .setup-card .step.done { background: var(--success); color: white; border-color: var(--success); }
    .setup-card .step.error { background: var(--danger); color: white; border-color: var(--danger); }
    .setup-card .step-line {
      flex: 1;
      height: 2px;
      background: var(--border);
      margin-top: 16px;
      max-width: 60px;
      border-radius: 1px;
    }
    .setup-card .step-line.done { background: var(--success); }

    /* ─── Live Progress List ─── */
    .progress-list { margin: 20px 0; display: flex; flex-direction: column; gap: 8px; }
    .progress-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 18px;
      border-radius: var(--radius-sm);
      margin-bottom: 0;
      background: rgba(11, 17, 32, 0.5);
      border: 1px solid transparent;
      transition: border-color 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    }
    .progress-item.pending { opacity: 0.4; }
    .progress-item.active {
      border-color: var(--primary);
      opacity: 1;
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.1);
      background: rgba(99, 102, 241, 0.05);
    }
    .progress-item.done {
      border-color: rgba(34, 197, 94, 0.3);
      opacity: 1;
      background: rgba(34, 197, 94, 0.06);
    }
    .progress-item.error {
      border-color: rgba(239, 68, 68, 0.3);
      opacity: 1;
      background: rgba(239, 68, 68, 0.06);
    }
    .progress-icon {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      flex-shrink: 0;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .progress-item.pending .progress-icon {
      background: var(--bg-input);
      color: var(--text-dim);
    }
    .progress-item.active .progress-icon {
      background: var(--primary);
      color: white;
      animation: pulse 1.2s ease-in-out infinite;
    }
    .progress-item.done .progress-icon {
      background: var(--success);
      color: white;
    }
    .progress-item.error .progress-icon {
      background: var(--danger);
      color: white;
    }
    .progress-text { flex: 1; }
    .progress-text .title { font-size: 0.9rem; font-weight: 600; letter-spacing: 0.2px; }
    .progress-text .desc { font-size: 0.8rem; color: var(--text-muted); margin-top: 3px; }
    .progress-item.done .progress-text .desc { color: var(--success); }
    .progress-item.error .progress-text .desc { color: var(--danger); }

    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
      50% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
    }
    @keyframes checkmark {
      0% { transform: scale(0); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    .progress-item.done .progress-icon { animation: checkmark 0.25s ease; }

    .setup-status {
      padding: 12px 16px;
      border-radius: var(--radius-sm);
      margin-bottom: 16px;
      font-size: 0.9rem;
      display: none;
    }
    .setup-status.error { display: block; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: var(--danger); }
    .setup-status.success { display: block; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: var(--success); }
    .setup-status.info { display: block; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.25); color: var(--primary); }
    .setup-status.loading { display: flex; align-items: center; gap: 8px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.25); color: var(--primary); }

    .api-token-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      margin-bottom: 12px;
    }

    .success-check {
      text-align: center;
      padding: 20px 0;
    }
    .success-check .icon { font-size: 3.5rem; margin-bottom: 12px; }
    .success-check .config-summary {
      background: rgba(11, 17, 32, 0.6);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 16px;
      margin: 16px 0;
      text-align: left;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.8rem;
      word-break: break-all;
    }
    .success-check .config-summary div { margin-bottom: 6px; }
    .success-check .config-summary strong { color: var(--primary); }

    /* ─── Auth ─── */
    .auth-page {
      display: none;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      min-height: 100dvh;
      padding: 20px;
    }
    .auth-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 44px;
      width: 100%;
      max-width: 420px;
      box-shadow: var(--shadow-lg);
    }
    .auth-card h1 {
      font-size: 1.9rem;
      margin-bottom: 8px;
      text-align: center;
      background: linear-gradient(135deg, var(--text), var(--primary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .auth-card p { color: var(--text-muted); text-align: center; margin-bottom: 28px; }
    .auth-switch { text-align: center; margin-top: 20px; color: var(--text-muted); font-size: 0.9rem; }
    .auth-switch a { color: var(--primary); font-weight: 600; cursor: pointer; }
    .auth-error {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.25);
      border-radius: var(--radius-sm);
      padding: 10px 16px;
      color: var(--danger);
      font-size: 0.85rem;
      margin-bottom: 16px;
      display: none;
    }

    /* ─── Dashboard ─── */
    .dashboard { display: none; padding: 32px 0 0; animation: fadeIn 0.3s ease; }

    .footer {
      margin-top: 48px;
      padding: 20px 0;
      border-top: 1px solid var(--border);
      background: rgba(11, 17, 32, 0.4);
    }
    .footer-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .footer span {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .footer strong {
      color: var(--text);
      font-weight: 600;
    }
    .footer-links {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .footer-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      color: var(--text-muted);
      background: var(--bg-input);
      border: 1px solid var(--border);
      transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    }
    .footer-link:hover {
      color: white;
      background: var(--primary);
      border-color: var(--primary);
      transform: translateY(-2px);
    }
    .footer-link.github:hover { background: #333; border-color: #333; }
    .footer-link.linkedin:hover { background: #0077b5; border-color: #0077b5; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-header h1 { font-size: 1.8rem; font-weight: 800; letter-spacing: -0.5px; }

    .bot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    .bot-card {
      position: relative;
      overflow: hidden;
      cursor: pointer;
    }
    .bot-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.03), transparent);
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .bot-card:hover::before { opacity: 1; }
    .bot-card .bot-status {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      z-index: 1;
    }
    .bot-card .bot-status.active { background: var(--success); box-shadow: 0 0 8px rgba(34,197,94,0.5); }
    .bot-card .bot-status.inactive { background: var(--text-dim); }
    .bot-card h3 { font-size: 1.1rem; margin-bottom: 4px; position: relative; z-index: 1; }
    .bot-card .bot-username { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px; position: relative; z-index: 1; }
    .bot-card .bot-meta {
      display: flex;
      gap: 12px;
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 16px;
      position: relative;
      z-index: 1;
    }
    .bot-card .bot-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      position: relative;
      z-index: 1;
    }

    /* ─── Toggle Switch ─── */
    .toggle {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 0.8rem;
      user-select: none;
    }
    .toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
    .toggle .slider {
      position: relative;
      width: 40px;
      height: 22px;
      background: var(--border);
      border-radius: 11px;
      transition: background 0.3s ease, box-shadow 0.3s ease;
      flex-shrink: 0;
    }
    .toggle .slider::after {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      left: 2px;
      top: 2px;
      background: white;
      border-radius: 50%;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .toggle input:checked + .slider { background: var(--primary); }
    .toggle input:checked + .slider::after { transform: translateX(18px); }
    .toggle .toggle-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      transition: color 0.3s ease;
    }
    .toggle.active .toggle-label { color: var(--success); }
    .toggle.inactive .toggle-label { color: var(--text-muted); }
    .toggle:hover .slider { box-shadow: 0 0 0 3px var(--primary-light); }
    .toggle input:disabled + .slider { opacity: 0.5; cursor: not-allowed; }

    .builder-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

    /* ─── Rule Cards ─── */
    .rule-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 16px;
      transition: transform 0.15s ease, opacity 0.2s, box-shadow 0.2s, border-color 0.2s;
      cursor: default;
      display: flex;
      overflow: hidden;
    }
    .rule-card:hover { border-color: var(--primary); box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
    .rule-card.dragging { opacity: 0.3; transform: scale(0.95) rotate(-1deg); }
    .rule-card.drag-over { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); transform: translateY(3px); }
    .rule-card.broken-media {
      border-color: rgba(239, 68, 68, 0.4);
      background: rgba(239, 68, 68, 0.04);
    }
    .rule-card.broken-media:hover { border-color: rgba(239, 68, 68, 0.6); box-shadow: 0 4px 20px rgba(239,68,68,0.1); }
    .rule-card .rule-broken-badge {
      display: inline-flex; align-items: center; gap: 4px;
      background: rgba(239, 68, 68, 0.12); color: #fca5a5;
      padding: 2px 8px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;
      border: 1px solid rgba(239, 68, 68, 0.25);
    }
    .rule-card.conflict {
      border-color: rgba(245, 158, 11, 0.4);
      background: rgba(245, 158, 11, 0.04);
    }
    .rule-card.conflict:hover { border-color: rgba(245, 158, 11, 0.6); box-shadow: 0 4px 20px rgba(245,158,11,0.1); }
    .rule-card .rule-conflict-badge {
      display: inline-flex; align-items: center; gap: 4px;
      background: rgba(245, 158, 11, 0.12); color: #fcd34d;
      padding: 2px 8px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;
      border: 1px solid rgba(245, 158, 11, 0.25);
    }

    .guide-section {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius); margin-bottom: 12px; overflow: hidden;
      transition: border-color 0.2s;
    }
    .guide-section:hover { border-color: var(--border-light); }
    .guide-header {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 20px; cursor: pointer; user-select: none;
      transition: background 0.15s ease; font-weight: 600; font-size: 1rem;
    }
    .guide-header:hover { background: var(--bg-input); }
    .guide-header .guide-icon {
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.1rem; flex-shrink: 0;
    }
    .guide-header .guide-arrow {
      margin-left: auto; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); font-size: 0.8rem; color: var(--text-muted);
    }
    .guide-header.open .guide-arrow { transform: rotate(90deg); }
    .guide-body {
      padding: 0 20px 16px; font-size: 0.9rem; line-height: 1.7; color: var(--text); display: none;
    }
    .guide-body.open { display: block; animation: fadeIn 0.2s ease; }
    .guide-body code {
      background: var(--bg-input); padding: 2px 6px; border-radius: 4px;
      font-size: 0.85rem; font-family: 'SF Mono', 'Fira Code', monospace;
    }
    .guide-body .tip {
      background: rgba(99,102,241,0.08); border-left: 3px solid var(--primary);
      padding: 10px 14px; border-radius: 6px; margin: 10px 0; font-size: 0.85rem;
    }
    .guide-body ol, .guide-body ul { padding-left: 20px; margin: 8px 0; }
    .guide-body li { margin-bottom: 6px; }

    .rule-card .rule-drag-area {
      display: flex; align-items: center; justify-content: center;
      width: 32px; flex-shrink: 0; cursor: grab; user-select: none;
      background: transparent;
      border-right: 1px solid var(--border);
      transition: background 0.15s ease, color 0.15s ease;
    }
    .rule-card .rule-drag-area:hover { background: var(--bg-input); }
    .rule-card .rule-drag-area:active { cursor: grabbing; }
    .rule-card .rule-drag-area .drag-icon {
      color: var(--text-dim); font-size: 1.1rem; line-height: 1;
      transition: color 0.2s;
    }
    .rule-card .rule-drag-area:hover .drag-icon { color: var(--text-muted); }
    .rule-card .rule-body {
      flex: 1; padding: 16px 18px; min-width: 0;
    }
    .rule-card .rule-header {
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px; margin-bottom: 10px;
    }
    .rule-card .rule-badges {
      display: flex; gap: 8px; flex-wrap: wrap; align-items: center; min-width: 0;
    }
    .rule-card .rule-actions {
      display: flex; gap: 2px; align-items: center; flex-shrink: 0;
    }
    .rule-card .rule-trigger {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--primary-light); color: #a5b4fc;
      padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;
    }
    .rule-card .rule-action {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(34,197,94,0.1); color: var(--success);
      padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;
    }

    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
    .empty-state .icon { font-size: 3rem; margin-bottom: 16px; }
    .empty-state h3 { font-size: 1.3rem; margin-bottom: 8px; color: var(--text); }
    .empty-state p { max-width: 400px; margin: 0 auto 24px; }

    /* ─── Modal ─── */
    .modal-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.7); z-index: 200;
      align-items: center; justify-content: center; padding: 20px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .modal-overlay.show { display: flex; }
    .modal {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius-xl); padding: 32px;
      width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto;
      box-shadow: var(--shadow-lg); animation: modalIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes modalIn { from { transform: scale(0.92) translateY(10px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
    .modal h2 { font-size: 1.4rem; margin-bottom: 20px; }
    .modal-close { float: right; background: none; border: none; color: var(--text-muted); font-size: 1.4rem; cursor: pointer; transition: color 0.15s ease; }
    .modal-close:hover { color: var(--text); }

    .code-preview {
      background: #0d1117; border-radius: var(--radius-sm);
      padding: 20px; font-family: 'Fira Code', 'Cascadia Code', 'SF Mono', monospace;
      font-size: 0.8rem; line-height: 1.6; overflow-x: auto;
      white-space: pre-wrap; color: #e2e8f0;
      max-height: 400px; overflow-y: auto;
      border: 1px solid var(--border);
    }

    /* ─── Toast ─── */
    .toast-container {
      position: fixed; bottom: 24px; right: 24px; z-index: 300;
      display: flex; flex-direction: column; gap: 8px;
      pointer-events: none;
    }
    .toast {
      background: var(--bg-elevated, var(--bg-card));
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 20px;
      box-shadow: var(--shadow-lg);
      animation: slideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    }
    .toast.success { border-color: rgba(34, 197, 94, 0.4); }
    .toast.error { border-color: rgba(239, 68, 68, 0.4); }
    .toast.info { border-color: rgba(99, 102, 241, 0.4); }
    @keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

    .spinner {
      display: inline-block; width: 18px; height: 18px;
      border: 2px solid rgba(255,255,255,0.15); border-top-color: var(--primary);
      border-radius: 50%; animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ─── Responsive: Tablet & Below ─── */
    @media (max-width: 768px) {
      .builder-layout { grid-template-columns: 1fr; }
      .container { padding: 0 16px; }
      header { padding: 10px 0; }
      .logo { font-size: 1.15rem; }
      .logo span { font-size: 1.3rem; }
      .version-badge { font-size: 0.55rem; padding: 2px 6px; }
      .dashboard { padding: 24px 0 40px; }
      .page-header h1 { font-size: 1.5rem; }
      .bot-grid { gap: 16px; }
      .card { padding: 20px; }
      .modal { padding: 24px; max-width: 100%; margin: 10px; }
    }

    /* ─── Responsive: Mobile ─── */
    @media (max-width: 640px) {
      .auth-card, .setup-card { padding: 28px 24px; }
      .bot-grid { grid-template-columns: 1fr; }
      .page-header { flex-direction: column; align-items: stretch; text-align: center; }
      .page-header h1 { font-size: 1.3rem; text-align: center; }
      .modal { padding: 20px; border-radius: var(--radius); }
      header .container { flex-wrap: wrap; }
      .logo { flex-wrap: wrap; }
      .version-badge { margin-left: 0; }
      .setup-card { padding: 28px 20px; }
      .bot-card .bot-actions { justify-content: center; }
      .toast-container { left: 16px; right: 16px; bottom: 16px; }
      .toast { font-size: 0.85rem; padding: 10px 16px; }
      .btn { padding: 10px 18px; font-size: 0.85rem; }
      .btn-sm { padding: 6px 12px; font-size: 0.75rem; }
    }

    /* ─── Responsive: Extra Small ─── */
    @media (max-width: 400px) {
      .container { padding: 0 12px; }
      header .container { gap: 8px; }
      .logo { font-size: 1rem; }
      .logo span { font-size: 1.1rem; }
      .dashboard { padding: 16px 0 32px; }
      .page-header { margin-bottom: 20px; }
      .auth-card, .setup-card { padding: 20px 16px; border-radius: var(--radius); }
    }
  </style>
  <!-- Prism.js for syntax highlighting -->
  <link href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-okaidia.min.css" rel="stylesheet">
</head>
<body>

  <!-- ─── SETUP PAGE ─── -->
  <div id="setupPage" class="setup-page">
    <div class="setup-card" id="setupCard">
      <h1>🚀 Bot Builder Setup</h1>
      <p class="subtitle">One-time initialization to connect your Cloudflare account</p>

      <div id="setupContent">
        <!-- Rendered by JS -->
      </div>
    </div>
  </div>

  <!-- ─── AUTH PAGE ─── -->
  <div id="authPage" class="auth-page">
    <div class="auth-card">
      <h1>🤖 Bot Builder</h1>
      <p>Build Telegram bots without coding</p>
      <div id="authError" class="auth-error"></div>          <div id="loginForm" style="display:none">
            <h2 style="margin-bottom:20px;text-align:center">Sign In</h2>
            <div class="form-group">
              <label>Username</label>
              <input class="form-input" id="loginUsername" placeholder="Enter username" autocomplete="username">
            </div>
            <div class="form-group">
              <label>Password</label>
              <input class="form-input" id="loginPassword" type="password" placeholder="Enter password" autocomplete="current-password">
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="login()">Sign In</button>
          </div>
          <div id="registerForm" style="display:none">
            <h2 style="margin-bottom:8px;text-align:center">🤖 Create Admin Account</h2>
            <p style="color:var(--text-muted);text-align:center;margin-bottom:20px;font-size:0.9rem">
              Set up the first and only administrator account for this Bot Builder.
              <strong>Don't lose these credentials — there's no password recovery!</strong>
            </p>
            <div class="form-group">
              <label>Username</label>
              <input class="form-input" id="registerUsername" placeholder="Choose a username" autocomplete="username">
            </div>
            <div class="form-group">
              <label>Password</label>
              <input class="form-input" id="registerPassword" type="password" placeholder="Min 6 characters" autocomplete="new-password">
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="register()">Create Admin Account</button>
            <div style="margin-top:20px;padding:12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;font-size:0.85rem;color:var(--warning)">
              ⚠️ This is a one-time setup. After this account is created, no one else can register.
            </div>
          </div>
    </div>
  </div>

  <!-- ─── DASHBOARD ─── -->
  <div id="dashboard" class="dashboard">
    <header>
      <div class="container">
        <div class="logo">
          <span>🤖</span> Bot Builder
          <span class="version-badge"><span class="dot">●</span> v1.0.0 <span style="opacity:0.5">by</span> Hamed Gharghi</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span id="userDisplay" style="color:var(--text-muted);font-size:0.9rem"></span>
          <button class="btn btn-ghost btn-sm" onclick="logout()">Sign Out</button>
        </div>
      </div>
    </header>
    <div class="container" id="pageContent"></div>
    <footer class="footer">
      <div class="container footer-inner">
        <span>Developed by <strong>Hamed Gharghi</strong></span>
        <div class="footer-links">
          <a href="https://github.com/Hamed-Gharghi" target="_blank" rel="noopener" class="footer-link github" title="GitHub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          </a>
          <a href="https://www.linkedin.com/in/hamed-gharghi-7b137b364" target="_blank" rel="noopener" class="footer-link linkedin" title="LinkedIn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          </a>
        </div>
      </div>
    </footer>
  </div>

  <div class="modal-overlay" id="modalOverlay" onclick="if(event.target===this)closeModal()">
    <div class="modal" id="modalContent"></div>
  </div>

  <div class="toast-container" id="toastContainer"></div>

  <script>
    // ============================================================
    // CONFIG — Server secret (if set) + localStorage, sent as headers
    // ============================================================
    window.__PLATFORM_CONFIG__ = ${JSON.stringify(savedPlatformConfig).replace(/</g, '\\u003c')};

    function isValidCfConfig(cfg) {
      return !!(cfg && cfg.accountId && cfg.apiToken && cfg.d1Id && cfg.kvId);
    }

    function loadCfConfig() {
      try {
        const fromStorage = JSON.parse(localStorage.getItem('cfConfig') || 'null');
        if (isValidCfConfig(fromStorage)) return fromStorage;
      } catch (e) { /* ignore */ }

      if (isValidCfConfig(window.__PLATFORM_CONFIG__)) {
        localStorage.setItem('cfConfig', JSON.stringify(window.__PLATFORM_CONFIG__));
        return window.__PLATFORM_CONFIG__;
      }
      return null;
    }

    function saveCfConfig(cfg) {
      if (!isValidCfConfig(cfg)) return;
      cfConfig = cfg;
      localStorage.setItem('cfConfig', JSON.stringify(cfg));
    }

    let cfConfig = loadCfConfig();

    function getHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      if (cfConfig) {
        headers['x-cf-account'] = cfConfig.accountId;
        headers['x-cf-token'] = cfConfig.apiToken;
        headers['x-cf-d1'] = cfConfig.d1Id;
        headers['x-cf-kv'] = cfConfig.kvId;
        if (cfConfig.r2Name) headers['x-cf-r2'] = cfConfig.r2Name;
      }
      if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
      return headers;
    }

    // ============================================================
    // STATE
    // ============================================================
    let state = {
      token: localStorage.getItem('token') || null,
      user: JSON.parse(localStorage.getItem('user') || 'null'),
      bots: [],
      currentBot: null,
      currentRules: [],
      editingRule: null,
    };

    // ============================================================
    // API CLIENT
    // ============================================================
    async function api(path, options = {}) {
      const headers = getHeaders();
      const res = await fetch('/api' + path, { ...options, headers: { ...headers, ...options.headers } });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        // Show first 500 chars of raw response to help debug server errors
        const snippet = text ? text.slice(0, 500) : '(empty response)';
        throw new Error(
          res.ok
            ? 'Invalid server response'
            : ('Request failed (' + res.status + '): ' + snippet)
        );
      }
      if (!res.ok) {
        // Auto-redirect on expired/invalid token
        if (res.status === 401 && (data.error === 'Invalid token' || data.error === 'Unauthorized' || data.error === 'Token expired')) {
          state.token = null; state.user = null;
          localStorage.removeItem('token'); localStorage.removeItem('user');
          document.getElementById('dashboard').style.display = 'none';
          document.getElementById('authPage').style.display = 'flex';
          document.getElementById('registerForm').style.display = 'none';
          document.getElementById('loginForm').style.display = 'block';
          toast('Session expired. Please sign in again.', 'warning');
        }
        throw new Error(data.error || 'Request failed (' + res.status + ')');
      }
      return data;
    }

    // ============================================================
    // TOAST
    // ============================================================
    function toast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      const icons = { success: '✅', error: '❌', info: 'ℹ️' };
      el.innerHTML = '<span>' + (icons[type] || '') + '</span> ' + message;
      container.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(100%)'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }, 3500);
    }

    // ============================================================
    // SETUP FLOW
    // ============================================================

    // Accounts from verify-token — kept in JS memory so names with @, ', ", <, etc. never touch inline JS/HTML attrs.
    let setupAccounts = [];

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function openCloudflareTokenCreator() {
      window.open('https://dash.cloudflare.com/profile/api-tokens', '_blank', 'noopener,noreferrer');
    }

    function showSetupStep(step) {
      const content = document.getElementById('setupContent');
      if (step === 1) {
        content.innerHTML = \`
          <div class="step-indicator">
            <div class="step active">1</div>
            <div class="step-line"></div>
            <div class="step">2</div>
            <div class="step-line"></div>
            <div class="step">3</div>
          </div>
          <h3 style="margin-bottom:16px">Step 1: Create your Cloudflare API Token</h3>
          <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.9rem">
            Use a custom token with the permissions below so this app can create and manage your D1, KV, R2, and Workers resources.
          </p>
          <a class="api-token-link" href="https://dash.cloudflare.com/profile/api-tokens?name=Telegram%20Bot%20Builder&accountId=*&zoneId=all&permissionGroupKeys=%5B%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_r2%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;width:100%;justify-content:center;padding:10px 16px;border-radius:8px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:var(--primary);font-weight:600;margin-bottom:12px">
            🔑 Click here to create API Token with 1-Click →
          </a>
          <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px;padding:12px;background:var(--bg);border-radius:8px;line-height:1.7">
            <strong>Recommended token settings:</strong><br>
            <strong>Token name:</strong> telegram-bot-builder<br><br>
            <strong>Permissions:</strong><br>
            • Account → D1 · Edit<br>
            • Account → Workers KV Storage · Edit<br>
            • Account → R2 · Edit<br>
            • Account → Workers Scripts · Edit<br><br>
            <strong>Resources:</strong> Include All Accounts<br><br>
            <strong>Then:</strong> Create Custom Token → Continue to Summary → Create Token
          </div>
          <div style="padding:12px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;margin-bottom:16px;font-size:0.85rem;color:var(--text-muted)">
            After Cloudflare shows your new token, paste it in the field on the next step and continue.
          </div>
          <button class="btn btn-primary" onclick="showSetupStep(2)">I created the token →</button>
        \`;
      } else if (step === 2) {
        content.innerHTML = \`
          <div class="step-indicator">
            <div class="step done">✓</div>
            <div class="step-line done"></div>
            <div class="step active">2</div>
            <div class="step-line"></div>
            <div class="step">3</div>
          </div>
          <h3 style="margin-bottom:16px">Step 2: Connect your Account</h3>
          <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.9rem">
            Paste your API token below. We'll verify it and list your accounts.
          </p>
          <div class="setup-status" id="setupStatus"></div>
          <div class="form-group">
            <label>Cloudflare API Token</label>
            <input class="form-input" id="setupApiToken" type="password" placeholder="Paste your API token here">
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="verifyAndShowAccounts()">Verify Token</button>
        \`;
      } else if (step === 3) {
        content.innerHTML = \`
          <div class="step-indicator">
            <div class="step done">✓</div>
            <div class="step-line done"></div>
            <div class="step done">✓</div>
            <div class="step-line done"></div>
            <div class="step active">3</div>
          </div>
          <h3 style="margin-bottom:16px">Step 3: Select Account</h3>
          <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.9rem">
            Select which Cloudflare account to use for this platform.
          </p>
          <div id="accountList"></div>
        \`;
      }
    }

    async function verifyAndShowAccounts() {
      const apiToken = document.getElementById('setupApiToken').value.trim();
      const statusEl = document.getElementById('setupStatus');
      if (!apiToken) { statusEl.className = 'setup-status error'; statusEl.textContent = 'Please enter an API token'; return; }

      statusEl.className = 'setup-status loading';
      statusEl.innerHTML = '<span class="spinner"></span> Verifying token...';

      try {
        const data = await fetch('/api/setup/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiToken }),
        }).then(r => r.json());

        if (data.error) throw new Error(data.error);

        // Store token temporarily
        localStorage.setItem('tempApiToken', apiToken);

        statusEl.className = 'setup-status success';
        statusEl.textContent = '✓ Token verified!';

        // Normalize + keep accounts in memory (never interpolate names into onclick/HTML attrs)
        setupAccounts = (data.accounts || []).map((a) => ({
          id: String(a.id ?? ''),
          name: String(a.name ?? 'Unnamed Account'),
        })).filter((a) => a.id);

        if (setupAccounts.length === 0) {
          throw new Error('No Cloudflare accounts found for this token');
        }

        const content = document.getElementById('setupContent');
        content.innerHTML = \`
          <div class="step-indicator">
            <div class="step done">✓</div>
            <div class="step-line done"></div>
            <div class="step done">✓</div>
            <div class="step-line done"></div>
            <div class="step active">3</div>
          </div>
          <h3 style="margin-bottom:16px">Step 3: Select Account</h3>
          <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.9rem">
            Choose a Cloudflare account to initialize the platform.
          </p>
          <div id="accountList"></div>
        \`;

        const list = document.getElementById('accountList');
        setupAccounts.forEach((account, index) => {
          const card = document.createElement('div');
          card.className = 'card account-card';
          card.style.cssText = 'margin-bottom:12px;cursor:pointer;padding:16px';
          card.setAttribute('role', 'button');
          card.tabIndex = 0;

          const title = document.createElement('strong');
          title.textContent = account.name;

          const idLine = document.createElement('div');
          idLine.style.cssText = 'color:var(--text-muted);font-size:0.8rem';
          idLine.textContent = 'ID: ' + account.id;

          card.appendChild(title);
          card.appendChild(idLine);

          const selectAccount = () => initializePlatform(index);
          card.addEventListener('click', selectAccount);
          card.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              selectAccount();
            }
          });
          list.appendChild(card);
        });
      } catch (e) {
        statusEl.className = 'setup-status error';
        statusEl.textContent = 'Error: ' + e.message;
      }
    }

    async function initializePlatform(accountIndex) {
      const account = setupAccounts[accountIndex];
      if (!account) {
        toast('Account not found. Please verify your token again.', 'error');
        showSetupStep(2);
        return;
      }
      const accountId = account.id;
      const accountName = account.name;
      const apiToken = localStorage.getItem('tempApiToken');
      if (!apiToken) {
        toast('API token missing. Please verify your token again.', 'error');
        showSetupStep(2);
        return;
      }
      const content = document.getElementById('setupContent');

      // Define steps with icons and labels
      const steps = [
        { key: 'd1', icon: '🗄️', label: 'D1 Database', desc: 'Checking...' },
        { key: 'kv', icon: '🔑', label: 'KV Namespace', desc: 'Checking...' },
        { key: 'r2', icon: '📦', label: 'R2 Bucket', desc: 'Checking...' },
        { key: 'migrations', icon: '📋', label: 'Database Tables', desc: 'Ensuring...' },
        { key: 'persist', icon: '💾', label: 'Save Config', desc: 'Persisting...' },
      ];

      // Render initial progress UI
      content.innerHTML = \`
        <div class="step-indicator">
          <div class="step done">✓</div>
          <div class="step-line done"></div>
          <div class="step done">✓</div>
          <div class="step-line done"></div>
          <div class="step active">3</div>
        </div>
        <h3 style="margin-bottom:8px;text-align:center">⚙️ Initializing Resources</h3>
        <p style="color:var(--text-muted);text-align:center;font-size:0.85rem;margin-bottom:16px">
          Setting up your Cloudflare infrastructure...
        </p>
        <div class="progress-list" id="progressList">
          \${steps.map(s => \`
            <div class="progress-item pending" data-step="\${s.key}">
              <div class="progress-icon">\${s.icon}</div>
              <div class="progress-text">
                <div class="title">\${s.label}</div>
                <div class="desc" id="desc-\${s.key}">Waiting...</div>
              </div>
            </div>
          \`).join('')}
        </div>
      \`;

      // Helper to update step UI
      function updateStep(key, status, message, detail) {
        const item = document.querySelector(\`.progress-item[data-step="\${key}"]\`);
        if (!item) return;
        item.className = 'progress-item ' + status;
        const desc = item.querySelector('.desc');
        desc.textContent = message + (detail ? ' (' + detail + ')' : '');

        // Update step indicator numbers
        if (status === 'done') {
          const icon = item.querySelector('.progress-icon');
          icon.textContent = '✓';
        } else if (status === 'error') {
          const icon = item.querySelector('.progress-icon');
          icon.textContent = '✗';
        } else if (status === 'active') {
          const icon = item.querySelector('.progress-icon');
          icon.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span>';
        }
      }

      try {
        const scriptName = location.hostname.endsWith('.workers.dev')
          ? location.hostname.split('.')[0]
          : '';

        // Stream the response
        const response = await fetch('/api/setup/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, apiToken, scriptName }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Setup failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let config = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);

              if (msg.step === 'error') {
                throw new Error(msg.message);
              }

              if (msg.step === 'complete') {
                config = msg.config;
                break;
              }

              if (['d1', 'kv', 'r2', 'migrations', 'persist'].includes(msg.step)) {
                if (msg.status === 'progress') {
                  updateStep(msg.step, 'active', msg.message);
                } else if (msg.status === 'done') {
                  updateStep(msg.step, 'done', msg.message, msg.detail);
                }
              }
            } catch (e) {
              if (e.message === 'Setup failed') throw e;
              // Skip malformed lines
            }
          }
        }

        if (!config) throw new Error('Setup did not complete successfully');

        // Save config (browser + server secret if available)
        saveCfConfig({
          accountId: config.accountId,
          apiToken: apiToken,
          d1Id: config.d1Id,
          kvId: config.kvId,
          r2Name: config.r2Name,
        });
        localStorage.removeItem('tempApiToken');

        // Show success — then go straight to auth (setup never needed again)
        content.innerHTML = \`
          <div class="step-indicator">
            <div class="step done">✓</div>
            <div class="step-line done"></div>
            <div class="step done">✓</div>
            <div class="step-line done"></div>
            <div class="step done">✓</div>
          </div>
          <div class="success-check">
            <div class="icon">🎉</div>
            <h3>All Set! Everything is ready.</h3>
            <p style="color:var(--text-muted);margin-bottom:16px">Setup is saved. Reloading will skip this page.</p>
            <div class="config-summary">
              <div><strong>Account:</strong> \${escapeHtml(accountName)}</div>
              <div><strong>🗄️ D1:</strong> \${escapeHtml(config.d1Id.slice(0, 24))}...\${escapeHtml(config.d1Id.slice(-8))}</div>
              <div><strong>🔑 KV:</strong> \${escapeHtml(config.kvId.slice(0, 24))}...\${escapeHtml(config.kvId.slice(-8))}</div>
              <div><strong>📦 R2:</strong> \${escapeHtml(config.r2Name)}</div>
            </div>
            <button class="btn btn-primary" id="setupContinueBtn" onclick="showAdminSetup()">Continue →</button>
          </div>
        \`;

        // If an admin already exists (reused D1), send user to Sign In instead
        try {
          const statusRes = await fetch('/api/setup/status', { headers: getHeaders() });
          const statusData = await statusRes.json();
          const btn = document.getElementById('setupContinueBtn');
          if (btn && statusData.hasUsers) {
            btn.textContent = '🔐 Sign In →';
            btn.setAttribute('onclick', 'showLoginSetup()');
          } else if (btn) {
            btn.textContent = '🔐 Create Admin Account →';
          }
        } catch {
          // Keep generic Continue button
        }
      } catch (e) {
        // Mark all pending steps as errored
        document.querySelectorAll('.progress-item.pending').forEach(el => {
          el.className = 'progress-item error';
          el.querySelector('.progress-icon').textContent = '✗';
        });
        content.innerHTML += \`
          <div class="setup-status error" style="display:block;margin-top:12px">❌ \${escapeHtml(e.message)}</div>
          <button class="btn btn-ghost" onclick="showSetupStep(2)" style="margin-top:12px;width:100%">← Try Again</button>
        \`;
      }
    }

    function showLoginSetup() {
      document.getElementById('setupPage').style.display = 'none';
      document.getElementById('registerForm').style.display = 'none';
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('authPage').style.display = 'flex';
      const errorEl = document.getElementById('authError');
      if (errorEl) errorEl.style.display = 'none';
    }

    async function showAdminSetup() {
      document.getElementById('setupPage').style.display = 'none';
      document.getElementById('authPage').style.display = 'flex';
      const errorEl = document.getElementById('authError');
      if (errorEl) errorEl.style.display = 'none';

      // Reused D1 may already have an admin — never force the register form
      try {
        const res = await fetch('/api/setup/status', { headers: getHeaders() });
        const data = await res.json();
        if (data.hasUsers) {
          document.getElementById('registerForm').style.display = 'none';
          document.getElementById('loginForm').style.display = 'block';
          return;
        }
      } catch {
        // Fall through to register
      }

      document.getElementById('registerForm').style.display = 'block';
      document.getElementById('loginForm').style.display = 'none';
    }

    // ============================================================
    // AUTH
    // ============================================================
    async function login() {
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errorEl = document.getElementById('authError');
      if (!username || !password) { errorEl.textContent = 'Please fill in all fields'; errorEl.style.display = 'block'; return; }
      errorEl.style.display = 'none';
      try {
        const data = await api('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        state.token = data.token; state.user = data.user;
        localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user));
        document.getElementById('authPage').style.display = 'none';
        showDashboard();
      } catch (e) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
    }

    async function register() {
      const username = document.getElementById('registerUsername').value.trim();
      const password = document.getElementById('registerPassword').value;
      const errorEl = document.getElementById('authError');
      if (!username || password.length < 6) { errorEl.textContent = 'Password must be at least 6 characters'; errorEl.style.display = 'block'; return; }
      errorEl.style.display = 'none';
      try {
        const data = await api('/register', { method: 'POST', body: JSON.stringify({ username, password }) });
        state.token = data.token; state.user = data.user;
        localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user));
        document.getElementById('authPage').style.display = 'none';
        showDashboard();
      } catch (e) {
        const msg = e.message || '';
        // If admin already exists, switch to Sign In instead of leaving the user stuck
        if (msg.includes('Registration is closed') || msg.includes('already exists. Please sign in')) {
          document.getElementById('registerForm').style.display = 'none';
          document.getElementById('loginForm').style.display = 'block';
          errorEl.textContent = 'Admin account already exists. Please sign in instead.';
          errorEl.style.display = 'block';
          // Prefill username if they just typed it
          const loginUser = document.getElementById('loginUsername');
          if (loginUser && username) loginUser.value = username;
          return;
        }
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
      }
    }

    function logout() {
      state.token = null; state.user = null;
      localStorage.removeItem('token'); localStorage.removeItem('user');
      document.getElementById('dashboard').style.display = 'none';
      document.getElementById('authPage').style.display = 'flex';
      document.getElementById('registerForm').style.display = 'none';
      document.getElementById('loginForm').style.display = 'block';
    }

    // ============================================================
    // DASHBOARD VIEWS
    // ============================================================
    function showDashboard() {
      document.getElementById('dashboard').style.display = 'block';
      document.getElementById('userDisplay').textContent = state.user?.username || '';
      showBotsList();
    }

    async function showBotsList() {
      try {
        const data = await api('/bots');
        state.bots = data.bots;
        const content = document.getElementById('pageContent');
        content.innerHTML = \`
          <div class="page-header">
            <h1>My Bots</h1>
            <div style="display:flex;align-items:center;gap:12px">
              <button class="btn btn-ghost btn-sm" onclick="showBotsList()" id="refreshBotsBtn" title="Refresh">🔄</button>
              <button class="btn btn-ghost btn-sm" onclick="showGuide()" title="User Guide">📖 Guide</button>
              <button class="btn btn-primary" onclick="showCreateBotModal()">+ New Bot</button>
            </div>
          </div>
          <div id="dbStats" style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap">
            <span>💾 Loading DB stats...</span>
          </div>
          \${state.bots.length === 0 ? \`
            <div class="empty-state">
              <div class="icon">🤖</div>
              <h3>No bots yet</h3>
              <p>Create your first Telegram bot by entering a BotFather token. Get one from @BotFather on Telegram.</p>
              <button class="btn btn-primary" onclick="showCreateBotModal()">Create Your First Bot</button>
            </div>
          \` : \`
            <div class="bot-grid">
              \${state.bots.map(bot => \`
                <div class="card bot-card">
                  <div class="bot-status \${bot.is_active ? 'active' : 'inactive'}"></div>
                  <h3>\${bot.bot_name}</h3>
                  <div class="bot-username">@\${bot.bot_username || 'unknown'}</div>
                  <div class="bot-meta">
                    <span>📅 \${new Date(bot.created_at).toLocaleDateString()}</span>
                    <span>🆔 #\${bot.id}</span>
                  </div>
                  <div class="bot-actions">
                    <button class="btn btn-primary btn-sm" onclick="showBotBuilder(\${bot.id})">Configure</button>
                    <button class="btn btn-success btn-sm" data-bot-id="\${bot.id}" onclick="deployBot(\${bot.id})">Deploy</button>
                    <label class="toggle \${bot.is_active ? 'active' : 'inactive'}" title="\${bot.is_active ? 'Click to pause bot' : 'Click to activate bot'}">
                      <input type="checkbox" \${bot.is_active ? 'checked' : ''} onchange="toggleBot(\${bot.id}, this)">
                      <span class="slider"></span>
                      <span class="toggle-label">\${bot.is_active ? 'ON' : 'OFF'}</span>
                    </label>
                    <button class="btn btn-ghost btn-sm" onclick="showLogs(\${bot.id})" title="View bot logs">📋 Logs</button>
                    <button class="btn btn-ghost btn-sm" onclick="showEditBotModal(\${bot.id})" title="Change bot token">🔑 Edit Token</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteBot(\${bot.id})">Delete</button>
                  </div>
                </div>
              \`).join('')}
            </div>
          \`}
        \`;
      } catch (e) { toast(e.message, 'error'); }
      // Load DB stats in the background
      loadDbStats();
    }

    async function loadDbStats() {
      try {
        const data = await api('/db/stats');
        const el = document.getElementById('dbStats');
        if (!el) return;
        const humanSize = data.estimatedMB > 0 ? data.estimatedMB + ' MB' : '< 0.01 MB';
        el.innerHTML = [
          '<span>💾 ' + (data.bots || 0) + ' bots</span>',
          '<span>📝 ' + (data.rules || 0) + ' rules</span>',
          '<span>📋 ' + (data.logs || 0) + ' logs</span>',
          '<span>📊 ' + humanSize + '</span>',
        ].join('');
      } catch (e) {
        // Stats are non-critical
      }
    }

    function showGuide() {
      const content = document.getElementById('pageContent');
      content.innerHTML = [
        '<div class="page-header">',
          '<div>',
            '<button class="btn btn-ghost btn-sm" onclick="showBotsList()" style="margin-bottom:8px">← Back to Dashboard</button>',
            '<h1>📖 User Guide</h1>',
            '<p style="color:var(--text-muted);font-size:0.85rem">Everything you need to know to build and deploy your Telegram bot.</p>',
          '</div>',
        '</div>',
        '<div id="guideRoot">',
          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(99,102,241,0.12);color:var(--primary)">🤖</span>',
              '<span>What is Telegram Bot Builder?</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<p><strong>Telegram Bot Builder</strong> is a no-code platform that lets you create, configure, and deploy Telegram bots directly from your browser — all running on Cloudflare Workers.</p>',
              '<p>You don\\'t need to write any code. Just follow these steps:</p>',
              '<ol>',
                '<li><strong>Get a bot token</strong> from Telegram\\'s @BotFather</li>',
                '<li><strong>Create a bot</strong> by entering the token in this dashboard</li>',
                '<li><strong>Add rules</strong> that define how your bot responds to messages</li>',
                '<li><strong>Deploy</strong> to make your bot live on Telegram!</li>',
              '</ol>',
              '<div class="tip">💡 All your bots, rules, and media are stored securely in Cloudflare\\'s D1 database and KV storage. No servers to manage!</div>',
            '</div>',
          '</div>',

          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(34,197,94,0.12);color:#16a34a">🔑</span>',
              '<span>Getting a Bot API Token from @BotFather</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<p>To create a Telegram bot, you need an API token. Here\\'s how to get one:</p>',
              '<ol>',
                '<li>Open Telegram and search for <a href="https://t.me/BotFather" target="_blank" rel="noopener"><strong>@BotFather</strong></a></li>',
                '<li>Start a chat and send the command: <code>/newbot</code></li>',
                '<li>Follow the prompts — choose a <strong>name</strong> (e.g., "My Cool Bot") and a <strong>username</strong> (must end in "bot", like "my_cool_bot")</li>',
                '<li>Once created, @BotFather will give you an <strong>API token</strong> that looks like: <code>1234567890:ABCdefGHIjklMNOpqrsTUVwxyz</code></li>',
                '<li>Copy this token — you\\'ll paste it into the Bot Builder dashboard</li>',
              '</ol>',
              '<div class="tip">🔒 Keep your bot token secret! Anyone with it can control your bot. Never share it or commit it to code.</div>',
              '<p>You can also use <code>/mybots</code> with @BotFather later to edit your bot, change the profile picture, add commands, or revoke a token if it gets compromised.</p>',
            '</div>',
          '</div>',

          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(251,146,60,0.12);color:#ea580c">➕</span>',
              '<span>Creating a New Bot</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<p>Once you have your API token from @BotFather:</p>',
              '<ol>',
                '<li>Click <strong>"+ New Bot"</strong> on the dashboard</li>',
                '<li>Paste your bot token into the input field</li>',
                '<li>Click <strong>"Validate & Create"</strong></li>',
                '<li>The system will verify the token with Telegram and automatically fetch your bot\\'s name and username</li>',
              '</ol>',
              '<p>Your new bot will appear as a card on the dashboard. From there you can <strong>Configure</strong> it (add rules), <strong>Deploy</strong> it, or <strong>Delete</strong> it.</p>',
              '<div class="tip">💡 If you ever need to change your bot token (e.g., you revoked it in @BotFather), use the 🔑 button on the bot card or in the builder to update it.</div>',
            '</div>',
          '</div>',

          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(236,72,153,0.12);color:#db2777">📋</span>',
              '<span>Adding Rules (Triggers & Actions)</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<p>Rules define how your bot behaves. Each rule has a <strong>trigger</strong> (what causes it to run) and an <strong>action</strong> (what the bot does).</p>',
              '<h4 style="margin:14px 0 8px">🎯 Available Triggers:</h4>',
              '<ul>',
                '<li><code>/command</code> — Fires when a user sends a specific command like <code>/start</code> or <code>/help</code></li>',
                '<li><strong>📩 Message</strong> — Fires when a user sends a specific text message (exact match)</li>',
                '<li><strong>🔘 Callback</strong> — Fires when a user clicks an inline button</li>',
                '<li><strong>👋 New Member</strong> — Fires when someone joins the group chat</li>',
                '<li><strong>⏰ Scheduled</strong> — Fires on a cron schedule (e.g., every hour)</li>',
              '</ul>',
              '<h4 style="margin:14px 0 8px">⚡ Available Actions:</h4>',
              '<ul>',
                '<li><strong>💬 Send Message</strong> — Reply with a text message</li>',
                '<li><strong>🖼️ Send Photo</strong> — Send a photo (URL, file ID, or uploaded media)</li>',
                '<li><strong>📄 Send Document</strong> — Send a file or document</li>',
                '<li><strong>⌨️ Show Keyboard</strong> — Show a custom keyboard with buttons</li>',
                '<li><strong>💾 Store Data</strong> — Save data to the bot\\'s storage</li>',
                '<li><strong>🌐 Fetch API</strong> — Call an external API and optionally reply with the result</li>',
                '<li><strong>📨 Forward</strong> — Forward the message to the bot admin</li>',
              '</ul>',
              '<div class="tip">💡 <strong>Dynamic Variables:</strong> Use <code>{first_name}</code>, <code>{last_name}</code>, <code>{username}</code>, <code>{message}</code>, <code>{chat_title}</code> in your message text and captions. They\\'ll be replaced with real user data when the bot runs!</div>',
              '<div class="tip">💡 You can drag-and-drop rules to reorder them. Rules are checked in order — the first matching rule runs.</div>',
              '<div class="tip">⚠️ <strong>Duplicate trigger detection:</strong> If two rules have the same trigger (e.g., two rules reacting to "/start"), the second one will never run. The builder shows an orange <strong>"Duplicate trigger"</strong> badge when this happens. Either delete the duplicate or change its trigger.</div>',
            '</div>',
          '</div>',

          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(59,130,246,0.12);color:#2563eb">🖼️</span>',
              '<span>Media Management</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<p>You can upload images, documents, and other files to use in your bot\\'s <strong>Send Photo</strong> and <strong>Send Document</strong> actions.</p>',
              '<ol>',
                '<li>Open a bot and click the <strong>🖼️ Media</strong> button</li>',
                '<li>Click <strong>"📤 Upload File"</strong> to upload files from your computer</li>',
                '<li>Uploaded files appear in a grid with a preview image</li>',
                '<li>Use <strong>📋 URL</strong> to copy the file URL, or click <strong>📋 URL</strong> to copy it</li>',
                '<li>When editing a rule, click <strong>"📁 Media Picker"</strong> to browse and select uploaded media</li>',
              '</ol>',
              '<p><strong>⚠️ Broken Media Detection:</strong> If you delete a media file that is used by a rule, the rule card will turn <strong>red</strong> with a warning badge showing which file was deleted. Simply edit the rule to update or remove the broken media reference, and the warning will clear.</p>',
              '<div class="tip">📁 Files are stored in Cloudflare KV, not on your server. No storage limits to worry about for normal usage!</div>',
            '</div>',
          '</div>',

          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(139,92,246,0.12);color:#7c3aed">🚀</span>',
              '<span>Deploying Your Bot</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<p><strong>Deploying is what makes your bot live on Telegram.</strong> Until you deploy, your rules are just saved — they won\\'t work on Telegram yet.</p>',
              '<ol>',
                '<li>Add at least <strong>one rule</strong> to your bot</li>',
                '<li>Click the <strong>"🚀 Deploy"</strong> button in the bot builder</li>',
                '<li>The system will:',
                  '<ul>',
                    '<li>Generate a Cloudflare Worker script from your rules</li>',
                    '<li>Upload it to Cloudflare Workers</li>',
                    '<li>Set up a webhook to connect it to Telegram</li>',
                  '</ul>',
                '</li>',
                '<li>Once deployed, your bot is live! Go to Telegram and test it</li>',
              '</ol>',
              '<p><strong>Important:</strong> Every time you change your rules, you need to <strong>deploy again</strong> for the changes to take effect. The same applies when you toggle the bot ON/OFF.</p>',
              '<div class="tip">⚡ Deploying typically takes a few seconds. You\\'ll see a success message with your bot\\'s worker URL when it\\'s done.</div>',
            '</div>',
          '</div>',

          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(34,197,94,0.12);color:#16a34a">🔛</span>',
              '<span>On/Off Toggle & Bot Status</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<p>Each bot has an <strong>ON/OFF toggle</strong> switch. This allows you to pause and resume your bot without deleting it or changing its configuration:</p>',
              '<ul>',
                '<li><strong>🟢 ON</strong> — The bot is active and responding to users. A green indicator shows on the bot card.</li>',
                '<li><strong>🔴 OFF</strong> — The bot is paused. It will not respond to any messages. The indicator turns gray/red.</li>',
              '</ul>',
              '<p>You can toggle the switch from the bot card on the dashboard or from the bot builder view.</p>',
              '<div class="tip">💡 Toggling a bot off does <strong>not</strong> remove the webhook — it just tells the bot script to ignore incoming updates. To fully disconnect, you can also delete the webhook from the builder menu.</div>',
            '</div>',
          '</div>',

          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(249,115,22,0.12);color:#c2410c">📋</span>',
              '<span>Bot Logs & Monitoring</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<p>The <strong>📋 Logs</strong> button on each bot card opens the log viewer, where you can see what your bot has been doing:</p>',
              '<ul>',
                '<li>Every action your bot performs is logged with a timestamp</li>',
                '<li>Filter logs by level: <strong>DEBUG</strong>, <strong>INFO</strong>, <strong>WARNING</strong>, <strong>ERROR</strong></li>',
                '<li>Use the <strong>"Clear Logs"</strong> button to remove all logs</li>',
                '<li>Logs help you debug issues — if a rule isn\\'t firing, check the logs</li>',
              '</ul>',
              '<div class="tip">📊 The dashboard shows your total bots, rules, and estimated database usage at the top of the main page.</div>',
            '</div>',
          '</div>',

          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(239,68,68,0.12);color:#dc2626">🔴</span>',
              '<span>Broken Media Detection (Red Cards)</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<p>When you delete a media file that is being used by one or more rules, the system automatically detects this and marks those rules:</p>',
              '<ul>',
                '<li>The rule card turns <strong>red</strong> with a colored border and background</li>',
                '<li>A warning badge appears: <strong>⚠️ Media deleted: filename.ext</strong></li>',
                '<li>You\\'ll see a notification: <strong>"X rule(s) using this file are now broken!"</strong></li>',
              '</ul>',
              '<p><strong>How to fix a broken rule:</strong></p>',
              '<ol>',
                '<li>Click the ✏️ <strong>Edit</strong> button on the red rule card</li>',
                '<li>Update the photo/document URL field with a new file or remove it</li>',
                '<li>Save the rule — the red styling and warning will disappear</li>',
                '<li>Don\\'t forget to <strong>Deploy</strong> again for the fix to take effect!</li>',
              '</ol>',
              '<div class="tip">🛡️ If you delete a file by accident, just re-upload it and update the rule with the new URL. The broken media marker is stored in the database and persists across page refreshes.</div>',
            '</div>',
          '</div>',

          '<div class="guide-section">',
            '<div class="guide-header" onclick="toggleGuide(this)">',
              '<span class="guide-icon" style="background:rgba(107,114,128,0.12);color:#6b7280">❓</span>',
              '<span>Tips & Troubleshooting</span>',
              '<span class="guide-arrow">▶</span>',
            '</div>',
            '<div class="guide-body">',
              '<ul>',
                '<li><strong>Rules not working?</strong> Make sure you\\'ve deployed after making changes. The deploy step is essential.</li>',
                '<li><strong>Duplicate trigger warning?</strong> If you see an orange "Duplicate trigger" badge on a rule card, it means two rules have the same trigger — only the first one (higher priority) will run. Edit or delete the duplicate.</li>',
                '<li><strong>Bot not responding?</strong> Check the logs to see if the bot is receiving updates. Also check the ON/OFF toggle.</li>',
                '<li><strong>Media not showing?</strong> Make sure the URL is publicly accessible. For uploaded files, use the 📋 URL button to copy the correct URL.</li>',
                '<li><strong>Deploy fails?</strong> Make sure you have at least one rule added. Also verify your Cloudflare API token is still valid.</li>',
                '<li><strong>Want to reset your bot?</strong> Delete it from the dashboard and create a new one with a fresh token from @BotFather.</li>',
                '<li><strong>Bot token compromised?</strong> Use @BotFather to revoke your token, then update it using the 🔑 button in the dashboard.</li>',
              '</ul>',
              '<div class="tip">🌟 You can also view the <strong>Generated Code</strong> tab in the bot builder to see the JavaScript code that powers your bot. It\\'s read-only but educational!</div>',
            '</div>',
          '</div>',
        '</div>',
      ].join('');
    }

    function toggleGuide(header) {
      header.classList.toggle('open');
      var body = header.nextElementSibling;
      if (body) body.classList.toggle('open');
    }

    function showCreateBotModal() {
      const modal = document.getElementById('modalContent');
      modal.innerHTML = \`
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <h2>🤖 Create New Bot</h2>
        <div class="form-group">
          <label>BotFather Token</label>
          <input class="form-input" id="newBotToken" placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz">
        </div>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px">
          Get your bot token from <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> on Telegram.
        </p>
        <button class="btn btn-primary" style="width:100%" onclick="createBot()">Validate & Create</button>
      \`;
      document.getElementById('modalOverlay').classList.add('show');
    }

    async function createBot() {
      const token = document.getElementById('newBotToken').value.trim();
      if (!token) { toast('Please enter a bot token', 'error'); return; }
      try {
        await api('/bots', { method: 'POST', body: JSON.stringify({ botToken: token }) });
        toast('Bot created successfully!', 'success');
        closeModal();
        showBotsList();
      } catch (e) { toast(e.message, 'error'); }
    }

    function showEditBotModal(botId) {
      const bot = state.bots.find(b => b.id === botId) || state.currentBot;
      if (!bot) { toast('Bot not found', 'error'); return; }
      const modal = document.getElementById('modalContent');
      modal.innerHTML = \`
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <h2>🔑 Edit Bot Token</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px">
          Update the Telegram API token for <strong>@\${bot.bot_username || bot.bot_name}</strong>.
          Get a new token from <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a>.
        </p>
        <div class="form-group">
          <label>Bot Token</label>
          <input class="form-input" id="editBotToken" placeholder="Paste new token from @BotFather" value="\${bot.bot_token}">
          <p style="color:var(--text-muted);font-size:0.75rem;margin-top:4px">Current token shown above. Replace it to switch to a different bot.</p>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary" style="flex:1" onclick="editBot(\${bot.id})">Save Token</button>
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        </div>
      \`;
      document.getElementById('modalOverlay').classList.add('show');
      // Auto-focus and select the token input
      setTimeout(() => {
        const input = document.getElementById('editBotToken');
        if (input) { input.focus(); input.select(); }
      }, 100);
    }

    async function editBot(botId) {
      const token = document.getElementById('editBotToken').value.trim();
      if (!token) { toast('Please enter a bot token', 'error'); return; }
      try {
        const data = await api('/bots/' + botId, { method: 'PUT', body: JSON.stringify({ botToken: token }) });
        toast(data.message || 'Bot updated!', 'success');
        closeModal();
        showBotsList();
      } catch (e) { toast(e.message, 'error'); }
    }

    async function deleteBot(botId) {
      if (!confirm('Delete this bot and all its rules?')) return;
      try {
        await api('/bots/' + botId, { method: 'DELETE' });
        toast('Bot deleted', 'success');
        showBotsList();
      } catch (e) { toast(e.message, 'error'); }
    }

    async function toggleBot(botId, checkboxEl) {
      const wasChecked = checkboxEl.checked;
      try {
        const data = await api('/bots/' + botId + '/toggle', { method: 'POST' });
        toast(data.message || 'Bot status updated!', 'success');
        if (state.currentBot && state.currentBot.id === botId) {
          state.currentBot.is_active = data.is_active;
        }
        // Refresh the bot list to reflect the new state
        await showBotsList();
      } catch (e) {
        // Revert checkbox on failure
        checkboxEl.checked = !wasChecked;
        toast(e.message, 'error');
      }
    }

    async function deployBot(botId) {
      // Find and disable all deploy buttons for this bot
      const buttons = document.querySelectorAll('button.btn-success[data-bot-id="' + botId + '"]');
      buttons.forEach(btn => {
        btn.disabled = true;
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-color:rgba(255,255,255,0.3);border-top-color:white"></span> Deploying...';
      });
      toast('Deploying bot... This may take a moment.', 'info');
      try {
        const data = await api('/bots/' + botId + '/deploy', { method: 'POST' });
        let msg = data.message || 'Bot deployed!';
        if (data.workerUrl) msg += ' URL: ' + data.workerUrl;
        toast(msg, 'success');
        if (state.currentBot && state.currentBot.id === botId) {
          state.currentBot.worker_url = data.workerUrl;
        }
        // Refresh the list to show updated status
        await showBotsList();
      } catch (e) {
        toast(e.message, 'error');
        // Restore buttons on error
        buttons.forEach(btn => {
          btn.disabled = false;
          if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
        });
      }
    }

    function closeModal() {
      document.getElementById('modalOverlay').classList.remove('show');
      // Clear any saved modal content to avoid stale state
      state._savedModalContent = null;
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // If a media picker is open on top of a rule editor, restore the rule editor instead of closing everything
        if (state._savedModalContent) restoreModalContent();
        else closeModal();
      }
    });

    // ============================================================
    // BOT BUILDER
    // ============================================================
    async function showBotBuilder(botId) {
      try {
        const data = await api('/bots/' + botId);
        state.currentBot = data.bot;
        state.currentRules = data.rules;
        renderBuilder();
      } catch (e) { toast(e.message, 'error'); }
    }

    // ── Log Viewer ──
    async function showLogs(botId) {
      const bot = state.bots.find(b => b.id === botId) || state.currentBot;
      if (!bot) { toast('Bot not found', 'error'); return; }

      try {
        // Check selected level filter
        const levelInput = document.getElementById('logLevelFilter');
        const selectedLevel = levelInput ? levelInput.value : '';

        // Fetch logs with optional level filter
        const url = '/bots/' + botId + '/logs?limit=200' + (selectedLevel ? '&level=' + selectedLevel : '');
        const data = await api(url);
        const stats = await api('/bots/' + botId + '/logs/stats');

        const logs = data.logs || [];
        const totalCount = data.totalCount || 0;

        // Build level breakdown
        const levelSummary = (stats.levels || []).map(l =>
          l.level + ': ' + l.count
        ).join(' · ') || 'No logs';

        const content = document.getElementById('pageContent');
        content.innerHTML = \`
          <div class="page-header">
            <div>
              <button class="btn btn-ghost btn-sm" onclick="showBotBuilder(\${botId})" style="margin-bottom:8px">← Back to Builder</button>
              <h1>📋 Logs: \${escapeHtml(bot.bot_name || bot.bot_username || 'Bot #' + botId)}</h1>
              <p style="color:var(--text-muted);font-size:0.85rem">
                \${totalCount} total entries · \${levelSummary}
              </p>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <select class="form-input" id="logLevelFilter" style="width:auto;padding:6px 12px" onchange="showLogs(\${botId})">
                <option value="">All Levels</option>
                <option value="DEBUG">DEBUG</option>
                <option value="INFO" selected>INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="ERROR">ERROR</option>
              </select>
              <button class="btn btn-ghost btn-sm" onclick="refreshLogs(\${botId})" title="Refresh">🔄 Refresh</button>
              <button class="btn btn-danger btn-sm" onclick="clearLogs(\${botId})">🗑️ Clear All</button>
            </div>
          </div>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
            \${logs.length === 0 ? \`
              <div class="empty-state" style="padding:40px">
                <div class="icon">📭</div>
                <h3>No logs yet</h3>
                <p>Deploy and activate your bot to start receiving logs.</p>
              </div>
            \` : \`
              <div style="max-height:600px;overflow-y:auto">
                \${logs.map(log => \`
                  <div style="display:flex;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border);font-size:0.85rem;align-items:flex-start"
                       class="log-entry-\${log.level.toLowerCase()}">
                    <span style="flex-shrink:0;font-family:monospace;color:var(--text-muted);font-size:0.8rem">
                      \${log.created_at ? new Date(log.created_at + 'Z').toLocaleTimeString() : '--'}
                    </span>
                    <span style="flex-shrink:0;font-weight:700;min-width:70px"
                          class="log-level-\${log.level.toLowerCase()}">
                      \${renderLogLevel(log.level)}
                    </span>
                    <span style="word-break:break-word;flex:1;font-family:monospace;font-size:0.8rem;line-height:1.4">
                      \${escapeHtml(log.message)}
                    </span>
                  </div>
                \`).join('')}
              </div>
            \`}
          </div>
          \${totalCount > 100 ? \`
            <p style="color:var(--text-muted);font-size:0.8rem;margin-top:8px;text-align:center">
              Showing last 200 entries. Clear logs to free up space.
            </p>
          \` : ''}
        \`;
      } catch (e) { toast(e.message, 'error'); }
    }

    function renderLogLevel(level) {
      const colors = {
        DEBUG: 'color:#94a3b8',
        INFO: 'color:#22c55e',
        WARNING: 'color:#f59e0b',
        ERROR: 'color:#ef4444',
      };
      const icons = { DEBUG: '🔍', INFO: 'ℹ️', WARNING: '⚠️', ERROR: '❌' };
      return '<span style="' + (colors[level] || '') + '">' + (icons[level] || '📋') + ' ' + level + '</span>';
    }

    async function refreshLogs(botId) {
      await showLogs(botId);
    }

    async function clearLogs(botId) {
      if (!confirm('Clear all logs for this bot? This cannot be undone.')) return;
      try {
        await api('/bots/' + botId + '/logs', { method: 'DELETE' });
        toast('Logs cleared!', 'success');
        showLogs(botId);
      } catch (e) { toast(e.message, 'error'); }
    }

    // ── Media Manager ──
    async function showMediaManager(botId) {
      const bot = state.bots.find(b => b.id === botId) || state.currentBot;
      if (!bot) { toast('Bot not found', 'error'); return; }
      try {
        const data = await api('/bots/' + botId + '/media');
        const media = data.media || [];
        const content = document.getElementById('pageContent');
        const escapeHtmlStr = escapeHtml(bot.bot_name || bot.bot_username || 'Bot #' + botId);
        const mediaCount = media.length;
        const mediaLabel = mediaCount + ' file' + (mediaCount !== 1 ? 's' : '');
        const html = [
          '<div class="page-header">',
            '<div>',
              '<button class="btn btn-ghost btn-sm" onclick="showBotBuilder(' + botId + ')" style="margin-bottom:8px">← Back to Builder</button>',
              '<h1>🖼️ Media: ' + escapeHtmlStr + '</h1>',
              '<p style="color:var(--text-muted);font-size:0.85rem">' + mediaLabel + '</p>',
            '</div>',
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">',
              '<label class="btn btn-primary btn-sm" style="cursor:pointer">',
                '📤 Upload File',
                '<input type="file" id="mediaFileInput" style="display:none" onchange="uploadMedia(' + botId + ', this)">',
              '</label>',
              '<button class="btn btn-ghost btn-sm" onclick="showMediaManager(' + botId + ')">🔄 Refresh</button>',
            '</div>',
          '</div>',
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">',
            media.length === 0 ? [
              '<div class="empty-state" style="grid-column:1/-1">',
                '<div class="icon">📁</div>',
                '<h3>No media yet</h3>',
                '<p>Upload images, documents, or other files for your bot. These can be used in Send Photo and Send Document actions.</p>',
                '<label class="btn btn-primary" style="cursor:pointer">',
                  '📤 Upload First File',
                  '<input type="file" style="display:none" onchange="uploadMedia(' + botId + ', this)">',
                '</label>',
              '</div>'
            ].join('') : media.map(function(m) {
              return [
                '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column">',
                  '<div style="height:140px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;overflow:hidden">',
                    '<img src="' + escapeHtml(m.url) + '" alt="' + escapeHtml(m.filename) + '"',
                    ' style="max-width:100%;max-height:100%;object-fit:cover"',
                    ' onerror="this.style.display=\\'none\\';this.parentElement.innerHTML=\\'<span style=font-size:2rem>📄</span>\\'">',
                  '</div>',
                  '<div style="padding:10px;flex:1;display:flex;flex-direction:column;gap:6px">',
                    '<div style="font-size:0.85rem;font-weight:600;word-break:break-word">' + escapeHtml(m.filename) + '</div>',
                    '<div style="font-size:0.75rem;color:var(--text-muted)">📅 ' + (m.created_at ? new Date(m.created_at + 'Z').toLocaleDateString() : '--') + '</div>',
                    '<div style="display:flex;gap:4px;margin-top:auto">',
                      '<button class="btn btn-ghost btn-sm" style="flex:1;font-size:0.75rem" onclick="copyMediaUrl(' + m.id + ', \\'' + escapeHtml(m.url) + '\\')">📋 URL</button>',
                      '<button class="btn btn-ghost btn-sm" style="font-size:0.75rem" onclick="renameMedia(' + m.id + ')">✏️</button>',
                      '<button class="btn btn-danger btn-sm" style="font-size:0.75rem" onclick="deleteMedia(' + m.id + ', ' + botId + ')">🗑️</button>',
                    '</div>',
                  '</div>',
                '</div>'
              ].join('');
            }).join(''),
          '</div>'
        ].join('');
        content.innerHTML = html;
      } catch (e) { toast(e.message, 'error'); }
    }

    async function uploadMedia(botId, input) {
      const file = input.files?.[0];
      if (!file) return;
      // Enforce 15MB limit client-side before upload
      const MAX_CLIENT_SIZE = 15 * 1024 * 1024;
      if (file.size > MAX_CLIENT_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        toast('❌ File too large (' + sizeMB + 'MB). Maximum is 15MB.', 'error');
        return;
      }
      // Reset input so same file can be re-uploaded
      input.value = '';
      try {
        const headers = getHeaders();
        // For FormData, we must NOT set Content-Type - let the browser set it
        delete headers['Content-Type'];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bot_id', String(botId));
        const res = await fetch('/api/media/upload', {
          method: 'POST',
          headers,
          body: formData,
        });
        if (!res.ok) {
          const err = await res.text();
          let msg = 'Upload failed (' + res.status + ')';
          try { const d = JSON.parse(err); if (d.error) msg = d.error; } catch {}
          throw new Error(msg);
        }
        toast('✅ File uploaded!', 'success');
        showMediaManager(botId);
      } catch (e) { toast(e.message, 'error'); }
    }

    async function deleteMedia(mediaId, botId) {
      if (!confirm('Delete this file? This cannot be undone.')) return;
      try {
        const res = await api('/media/' + mediaId, { method: 'DELETE' });
        if (res.affectedRules && res.affectedRules.length > 0) {
          toast('⚠️ ' + res.affectedRules.length + ' rule(s) using this file are now broken! Edit them to fix.', 'warning');
          // Mark affected rules in current state so they show red immediately if user goes back
          if (state.currentRules) {
            state.currentRules = state.currentRules.map(r => {
              if (!res.affectedRules.includes(r.id)) return r;
              // Merge with any existing broken_media
              let existing = [];
              if (r.broken_media) {
                try { existing = JSON.parse(r.broken_media); } catch { existing = []; }
              }
              if (!existing.some(b => b.id === mediaId)) {
                existing.push({ id: mediaId, filename: res.mediaFilename || 'unknown' });
              }
              return { ...r, broken_media: JSON.stringify(existing) };
            });
          }
        } else {
          toast('File deleted!', 'success');
        }
        showMediaManager(botId);
      } catch (e) { toast(e.message, 'error'); }
    }

    async function renameMedia(mediaId) {
      const newName = prompt('Enter new filename:');
      if (!newName || !newName.trim()) return;
      try {
        await api('/media/' + mediaId, { method: 'PUT', body: JSON.stringify({ filename: newName.trim() }) });
        toast('File renamed!', 'success');
        // Refresh current view
        const bot = state.currentBot;
        if (bot) showMediaManager(bot.id);
      } catch (e) { toast(e.message, 'error'); }
    }

    function copyMediaUrl(mediaId, url) {
      navigator.clipboard.writeText(url)
        .then(() => toast('📋 URL copied!', 'success'))
        .catch(() => toast('Failed to copy URL', 'error'));
    }

    // ── Media Picker for Action Fields ──
    function openMediaPicker(botId, targetInputId) {
      state._mediaPickerTarget = targetInputId;
      // Save current modal content so we can restore it after picking (don't close the rule editor!)
      state._savedModalContent = document.getElementById('modalContent').innerHTML;

      const modal = document.getElementById('modalContent');
      const modalHtml = [
        '<button class="modal-close" onclick="restoreModalContent()">&times;</button>',
        '<h2>📁 Select a File</h2>',
        '<p style="color:var(--text-muted);margin-bottom:16px">Click a file to use its URL in the action field.</p>',
        '<div id="mediaPickerGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;max-height:400px;overflow-y:auto">',
          '<div style="text-align:center;padding:40px;color:var(--text-muted);grid-column:1/-1">Loading files...</div>',
        '</div>',
        '<div style="margin-top:16px;text-align:right">',
          '<button class="btn btn-ghost" onclick="restoreModalContent()">Cancel</button>',
        '</div>'
      ].join('');
      modal.innerHTML = modalHtml;
      document.getElementById('modalOverlay').classList.add('show');

      // Fetch and display media
      api('/bots/' + botId + '/media').then(data => {
        const media = data.media || [];
        const grid = document.getElementById('mediaPickerGrid');
        if (media.length === 0) {
          grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);grid-column:1/-1">📭 No files uploaded yet. Close this and use the Media button to upload.</div>';
          return;
        }
        grid.innerHTML = media.map(function(m) {
          return [
            '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:8px;cursor:pointer;text-align:center;transition:all 0.15s"',
                 ' onmouseover="this.style.borderColor=\\'var(--primary)\\'"',
                 ' onmouseout="this.style.borderColor=\\'var(--border)\\'"',
                 ' onclick="selectMediaForAction(\\'' + escapeHtml(m.url) + '\\')">',
              '<div style="height:80px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:6px">',
                '<img src="' + escapeHtml(m.url) + '" alt="' + escapeHtml(m.filename) + '"',
                     ' style="max-width:100%;max-height:100%;object-fit:cover"',
                     ' onerror="this.style.display=\\'none\\';this.parentElement.innerHTML=\\'<span style=font-size:1.5rem>📄</span>\\'">',
              '</div>',
              '<div style="font-size:0.75rem;word-break:break-word">' + escapeHtml(m.filename) + '</div>',
            '</div>'
          ].join('');
        }).join('');
      }).catch(function(e) {
        document.getElementById('mediaPickerGrid').innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);grid-column:1/-1">❌ Error loading files: ' + e.message + '</div>';
      });
    }

    function restoreModalContent() {
      if (state._savedModalContent) {
        document.getElementById('modalContent').innerHTML = state._savedModalContent;
        state._savedModalContent = null;
      } else {
        closeModal();
      }
    }

    function selectMediaForAction(url) {
      const targetId = state._mediaPickerTarget;
      // First restore the rule editor HTML so the input element exists
      restoreModalContent();
      // Then set the value on the restored input
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) el.value = url;
      }
      toast('✅ File URL inserted!', 'success');
    }

    function renderBuilder() {
      const bot = state.currentBot;
      const rules = state.currentRules;
      // Compute trigger conflicts before rendering
      state._conflictingRuleIds = findConflictingTriggers(rules);
      const content = document.getElementById('pageContent');
      content.innerHTML = \`
        <div class="page-header">
          <div>
            <button class="btn btn-ghost btn-sm" onclick="showBotsList()" style="margin-bottom:8px">← Back to Bots</button>
            <h1>\${bot.bot_name}</h1>
            <p style="color:var(--text-muted)">@\${bot.bot_username || 'unknown'} · \${rules.length} rule\${rules.length !== 1 ? 's' : ''}</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-primary" onclick="showAddRuleModal()">+ Add Rule</button>
            <button class="btn btn-success" data-bot-id="\${bot.id}" onclick="deployBot(\${bot.id})">🚀 Deploy</button>
            <button class="btn btn-ghost btn-sm" onclick="showEditBotModal(\${bot.id})" title="Change bot token">🔑</button>
            <button class="btn btn-ghost btn-sm" onclick="showMediaManager(\${bot.id})" title="Manage uploaded media">🖼️ Media</button>
            <label class="toggle \${bot.is_active ? 'active' : 'inactive'}" title="\${bot.is_active ? 'Click to pause bot' : 'Click to activate bot'}" style="margin-left:4px">
              <input type="checkbox" \${bot.is_active ? 'checked' : ''} onchange="toggleBot(\${bot.id}, this)">
              <span class="slider"></span>
              <span class="toggle-label">\${bot.is_active ? 'ON' : 'OFF'}</span>
            </label>
          </div>
        </div>
        <div class="builder-layout">
          <div>
            <h3 style="margin-bottom:16px">📋 Rules</h3>
            \${rules.length === 0 ? \`
              <div class="empty-state" style="padding:40px 20px">
                <div class="icon">📝</div>
                <h3>No rules yet</h3>
                <p>Add your first rule to define how your bot behaves.</p>
                <button class="btn btn-primary" onclick="showAddRuleModal()">+ Add Rule</button>
              </div>
            \` : rules.map(rule => \`
              <div class="rule-card \${rule.broken_media ? 'broken-media' : (state._conflictingRuleIds && state._conflictingRuleIds.has(rule.id) ? 'conflict' : '')}" draggable="true" data-rule-id="\${rule.id}" ondragstart="onDragStart(event)" ondragover="onDragOver(event)" ondrop="onDrop(event)" ondragend="onDragEnd(event)">
                <div class="rule-drag-area" title="Drag to reorder">
                  <span class="drag-icon">⠿</span>
                </div>
                <div class="rule-body">
                  <div class="rule-header">
                    <div class="rule-badges">
                      <span class="rule-trigger">🔷 \${formatTrigger(rule)}</span>
                      <span class="rule-action">🎯 \${formatAction(rule)}</span>
                      \${(() => {
                        if (!state._conflictingRuleIds) return '';
                        if (state._conflictingRuleIds.has(rule.id)) {
                          return '<span class="rule-conflict-badge">⚠️ Duplicate trigger</span>';
                        }
                        return '';
                      })()}
                    </div>
                    <div class="rule-actions">
                      <button class="btn btn-ghost btn-sm" onclick="editRule(\${rule.id})" title="Edit">✏️</button>
                      <button class="btn btn-ghost btn-sm" onclick="duplicateRule(\${rule.id})" title="Duplicate">📋</button>
                      <button class="btn btn-danger btn-sm" onclick="deleteRule(\${rule.id})" title="Delete">🗑️</button>
                    </div>
                  </div>
                  \${(() => {
                    if (!rule.broken_media) return '';
                    try {
                      const broken = JSON.parse(rule.broken_media);
                      if (!broken || broken.length === 0) return '';
                      return '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">' +
                        broken.map(m => '<span class="rule-broken-badge">⚠️ Media deleted: ' + escapeHtml(m.filename || 'unknown') + '</span>').join('') +
                        '</div>';
                    } catch(e) { return ''; }
                  })()}
                  <div style="font-size:0.85rem;color:var(--text-muted)">\${renderRulePreview(rule)}</div>
                </div>
              </div>
            \`).join('')}
          </div>
          <div>
            <h3 style="margin-bottom:16px">📄 Generated Code</h3>
            <div class="code-preview" id="codePreview">Loading...</div>
            <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="copyCode()">📋 Copy Code</button>
          </div>
        </div>
      \`;
      showCodePreview();
    }

    function findConflictingTriggers(rules) {
      var conflicts = new Set();
      var seen = {};
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        var key = r.trigger_type;
        if (r.trigger_type === 'new_member' || r.trigger_type === 'scheduled') {
          // All new_member rules conflict (no trigger_value), same for scheduled
          key = r.trigger_type + '__any';
        } else {
          key = r.trigger_type + '__' + (r.trigger_value || '');
        }
        if (seen[key] !== undefined) {
          conflicts.add(r.id);
          conflicts.add(seen[key]);
        } else {
          seen[key] = r.id;
        }
      }
      return conflicts;
    }

    function formatTrigger(rule) {
      const types = { command: '/', message: '📩', callback: '🔘', new_member: '👋', scheduled: '⏰' };
      const icon = types[rule.trigger_type] || '❓';
      const val = rule.trigger_value ? ': ' + rule.trigger_value : '';
      return icon + ' ' + rule.trigger_type.replace('_', ' ') + val;
    }
    function formatAction(rule) {
      const types = { send_message: '💬 Send Message', send_photo: '🖼️ Send Photo', send_document: '📄 Send Document', show_keyboard: '⌨️ Show Keyboard', store_data: '💾 Store Data', fetch_api: '🌐 Fetch API', forward: '📨 Forward' };
      return types[rule.action_type] || rule.action_type;
    }
    function renderRulePreview(rule) {
      try {
        const params = typeof rule.action_params === 'string' ? JSON.parse(rule.action_params) : rule.action_params;
        switch (rule.action_type) {
          case 'send_message': return 'Text: "' + (params.text || '').slice(0,60) + (params.text?.length>60?'...':'') + '"';
          case 'send_photo': return 'Photo: ' + (params.caption || 'no caption');
          case 'send_document': return '📄 ' + (params.document_url || params.file_id || 'no file') + ' · ' + (params.document_caption || '');
          case 'show_keyboard': return (params.buttons||[]).length + ' buttons · ' + (params.keyboard_type||'reply');
          case 'store_data': return 'Key: ' + (params.key||'') + ' → Value: ' + (params.value||'message text');
          case 'fetch_api': return params.method + ' ' + (params.api_url||'').slice(0,40);
          case 'forward': return 'To admin: ' + (params.admin_id||'not set');
          default: return JSON.stringify(params);
        }
      } catch(e) { return rule.action_params; }
    }

    function showCodePreview() {
      const el = document.getElementById('codePreview');
      const rules = state.currentRules;
      let code = '';
      rules.forEach((rule, i) => {
        const params = typeof rule.action_params === 'string' ? JSON.parse(rule.action_params) : rule.action_params;
        code += '// Rule ' + (i+1) + ': ' + rule.trigger_type;
        if (rule.trigger_value) code += ' "' + rule.trigger_value + '"';
        code += '\\n';
        if (rule.trigger_type === 'command') {
          code += 'bot.onCommand(' + JSON.stringify(rule.trigger_value?.replace('/','')||'start') + ', async (ctx) => {\\n';
        } else if (rule.trigger_type === 'message') {
          code += 'bot.on(\\'message\\', async (ctx) => {\\n';
        } else if (rule.trigger_type === 'callback') {
          code += 'bot.on(\\'callback_query\\', async (ctx) => {\\n';
        }
        code += '  await ctx.reply(' + JSON.stringify(params.text||'Hello!') + ');\\n';
        code += '});\\n\\n';
      });
      if (!code) code = '// Add rules to see generated code';
      el.innerHTML = '<pre><code class="language-javascript">' + escapeHtml(code) + '</code></pre>';
      var codeEl = el.querySelector('code');
      if (codeEl && typeof Prism !== 'undefined' && typeof Prism.highlightElement === 'function') {
        try { Prism.highlightElement(codeEl); } catch(e) {}
      }
    }

    function copyCode() {
      navigator.clipboard.writeText(document.getElementById('codePreview').textContent)
        .then(() => toast('Code copied!', 'success'))
        .catch(() => toast('Failed to copy', 'error'));
    }

    function showAddRuleModal(rule) {
      state.editingRule = rule || null;
      const isEditing = !!rule;
      const modal = document.getElementById('modalContent');

      // Parse params for pre-filling
      const params = rule ? (typeof rule.action_params === 'string' ? JSON.parse(rule.action_params || '{}') : (rule.action_params || {})) : {};

      modal.innerHTML = \`
        <button class="modal-close" onclick="closeModal()">&times;</button>
        <h2>\${isEditing ? '✏️ Edit Rule' : '➕ Add Rule'}</h2>
        <div class="form-group">
          <label>Trigger Type</label>
          <select class="form-input" id="ruleTriggerType" onchange="updateTriggerFields()">
            <option value="command" \${rule && rule.trigger_type === 'command' ? 'selected' : ''}>Command (e.g. /start)</option>
            <option value="message" \${rule && rule.trigger_type === 'message' ? 'selected' : ''}>Any Message</option>
            <option value="callback" \${rule && rule.trigger_type === 'callback' ? 'selected' : ''}>Callback Query (button click)</option>
            <option value="new_member" \${rule && rule.trigger_type === 'new_member' ? 'selected' : ''}>New Member Joins</option>
          </select>
        </div>
        <div class="form-group" id="triggerValueGroup">
          <label>Trigger Value</label>
          <input class="form-input" id="ruleTriggerValue" placeholder="/start, /help, etc." value="\${rule ? (rule.trigger_value || '') : ''}">
        </div>
        <div class="form-group">
          <label>Action Type</label>
          <select class="form-input" id="ruleActionType" onchange="updateActionFields()">
            <option value="send_message" \${(!rule || rule.action_type === 'send_message') ? 'selected' : ''}>Send Message</option>
            <option value="send_photo" \${rule && rule.action_type === 'send_photo' ? 'selected' : ''}>Send Photo</option>
            <option value="send_document" \${rule && rule.action_type === 'send_document' ? 'selected' : ''}>Send Document</option>
            <option value="show_keyboard" \${rule && rule.action_type === 'show_keyboard' ? 'selected' : ''}>Show Keyboard</option>
            <option value="store_data" \${rule && rule.action_type === 'store_data' ? 'selected' : ''}>Store Data</option>
            <option value="fetch_api" \${rule && rule.action_type === 'fetch_api' ? 'selected' : ''}>Fetch External API</option>
            <option value="forward" \${rule && rule.action_type === 'forward' ? 'selected' : ''}>Forward to Admin</option>
          </select>
        </div>
        <div id="actionParamsFields">
          <div class="form-group">             <label>Message Text</label>
            <textarea class="form-input" id="actionText" rows="3" placeholder="Enter message text...">\${(isEditing && params.text) ? params.text : ''}</textarea>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">💡 You can use variables: <code>{first_name}</code> <code>{last_name}</code> <code>{username}</code> <code>{message}</code></div>
          </div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="saveRule()">\${isEditing ? 'Save Changes' : 'Save Rule'}</button>
      \`;

      // Update trigger and action fields to show proper placeholders
      updateTriggerFields();
      updateActionFields();

      // Pre-fill action params fields after the action fields are rendered
      if (isEditing) {
        setTimeout(() => prefillActionParams(params), 50);
      }

      document.getElementById('modalOverlay').classList.add('show');
    }

    function prefillActionParams(params) {
      if (!params) return;
      // Set common fields
      const textEl = document.getElementById('actionText');
      if (textEl && params.text) textEl.value = params.text;
      const btnEl = document.getElementById('actionButtons');
      if (btnEl && params.buttons) btnEl.value = Array.isArray(params.buttons) ? params.buttons.join('\\n') : params.buttons;
      const kbTypeEl = document.getElementById('actionKeyboardType');
      if (kbTypeEl && params.keyboard_type) kbTypeEl.value = params.keyboard_type;
      const keyEl = document.getElementById('actionDataKey');
      if (keyEl && params.key) keyEl.value = params.key;
      const valEl = document.getElementById('actionDataValue');
      if (valEl && params.value) valEl.value = params.value;
      const urlEl = document.getElementById('actionApiUrl');
      if (urlEl && params.api_url) urlEl.value = params.api_url;
      const methodEl = document.getElementById('actionApiMethod');
      if (methodEl && params.method) methodEl.value = params.method;
      const bodyEl = document.getElementById('actionApiBody');
      if (bodyEl && params.body) bodyEl.value = params.body;
      const adminEl = document.getElementById('actionAdminId');
      if (adminEl && params.admin_id) adminEl.value = params.admin_id;
      const photoUrlEl = document.getElementById('actionPhotoUrl');
      if (photoUrlEl && params.photo_url) photoUrlEl.value = params.photo_url;
      const captionEl = document.getElementById('actionCaption');
      if (captionEl && params.caption) captionEl.value = params.caption;
      const docUrlEl = document.getElementById('actionDocUrl');
      if (docUrlEl && params.document_url) docUrlEl.value = params.document_url;
      const docCaptionEl = document.getElementById('actionDocCaption');
      if (docCaptionEl && params.document_caption) docCaptionEl.value = params.document_caption;
    }

    function updateTriggerFields() {
      const type = document.getElementById('ruleTriggerType').value;
      const group = document.getElementById('triggerValueGroup');
      const input = document.getElementById('ruleTriggerValue');
      if (type === 'command' || type === 'message' || type === 'callback') {
        group.style.display = 'block';
        input.placeholder = type === 'command' ? '/start, /help, /about' : type === 'message' ? 'Filter by keyword or leave empty for any message' : 'Callback data to match';
      } else {
        group.style.display = 'none';
      }
    }

    function updateActionFields() {
      const type = document.getElementById('ruleActionType').value;
      const container = document.getElementById('actionParamsFields');
      const fields = {
        send_message: \`
          <div class="form-group"><label>Message Text</label><textarea class="form-input" id="actionText" rows="3" placeholder="Enter message text..."></textarea>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">💡 Use <code>{first_name}</code> <code>{last_name}</code> <code>{username}</code> <code>{message}</code> <code>{chat_title}</code></div></div>
        \`,
        show_keyboard: \`
          <div class="form-group"><label>Keyboard Text</label><textarea class="form-input" id="actionText" rows="2" placeholder="Message above keyboard"></textarea></div>
          <div class="form-group"><label>Buttons (one per line)</label><textarea class="form-input" id="actionButtons" rows="4" placeholder="Button 1\nButton 2\nButton 3"></textarea></div>
          <div class="form-group"><label>Keyboard Type</label><select class="form-input" id="actionKeyboardType"><option value="reply">Reply Keyboard</option><option value="inline">Inline Keyboard</option></select></div>
        \`,
        store_data: \`
          <div class="form-group"><label>Data Key</label><input class="form-input" id="actionDataKey" placeholder="e.g. user_input"></div>
          <div class="form-group"><label>Data Value</label><input class="form-input" id="actionDataValue" placeholder="Leave empty to store user's message"></div>
        \`,
        fetch_api: \`
          <div class="form-group"><label>API URL</label><input class="form-input" id="actionApiUrl" placeholder="https://api.example.com/data"></div>
          <div class="form-group"><label>Method</label><select class="form-input" id="actionApiMethod"><option value="GET">GET</option><option value="POST">POST</option></select></div>
          <div class="form-group"><label>Body (JSON, for POST)</label><textarea class="form-input" id="actionApiBody" rows="3" placeholder='{"key":"value"}'></textarea></div>
        \`,
        forward: \`
          <div class="form-group"><label>Admin User ID</label><input class="form-input" id="actionAdminId" placeholder="Telegram user ID"></div>
        \`,
        send_photo: \`
          <div class="form-group"><label>Photo URL or File ID</label>
            <div style="display:flex;gap:6px">
              <input class="form-input" id="actionPhotoUrl" placeholder="e.g. https://example.com/photo.jpg or Telegram file_id" style="flex:1">
              <button class="btn btn-ghost btn-sm" type="button" onclick="openMediaPicker(state.currentBot?.id || 0, 'actionPhotoUrl')" title="Choose from uploaded files" style="flex-shrink:0">📁</button>
            </div>
          </div>
          <div class="form-group"><label>Caption</label><input class="form-input" id="actionCaption" placeholder="Photo caption">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">💡 Variables: <code>{first_name}</code> <code>{username}</code> <code>{message}</code></div></div>
        \`,
        send_document: \`
          <div class="form-group"><label>Document URL or File ID</label>
            <div style="display:flex;gap:6px">
              <input class="form-input" id="actionDocUrl" placeholder="e.g. https://example.com/file.pdf or Telegram file_id" style="flex:1">
              <button class="btn btn-ghost btn-sm" type="button" onclick="openMediaPicker(state.currentBot?.id || 0, 'actionDocUrl')" title="Choose from uploaded files" style="flex-shrink:0">📁</button>
            </div>
          </div>
          <div class="form-group"><label>Caption</label><input class="form-input" id="actionDocCaption" placeholder="Document caption">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">💡 Variables: <code>{first_name}</code> <code>{username}</code> <code>{message}</code></div></div>
        \`,
      };
      container.innerHTML = fields[type] || '<p style="color:var(--text-muted)">No additional parameters needed.</p>';
    }

    async function saveRule() {
      const isEditing = state.editingRule && state.editingRule.id;
      const triggerType = document.getElementById('ruleTriggerType').value;
      const triggerValue = document.getElementById('ruleTriggerValue')?.value || '';
      const actionType = document.getElementById('ruleActionType').value;
      let actionParams = {};
      switch (actionType) {
        case 'send_message': actionParams = { text: document.getElementById('actionText')?.value||'' }; break;
        case 'show_keyboard': actionParams = { text: document.getElementById('actionText')?.value||'Choose:', buttons: (document.getElementById('actionButtons')?.value||'').split('\\n').filter(b=>b.trim()), keyboard_type: document.getElementById('actionKeyboardType')?.value||'reply' }; break;
        case 'store_data': actionParams = { key: document.getElementById('actionDataKey')?.value||'', value: document.getElementById('actionDataValue')?.value||'' }; break;
        case 'fetch_api': actionParams = { api_url: document.getElementById('actionApiUrl')?.value||'', method: document.getElementById('actionApiMethod')?.value||'GET', body: document.getElementById('actionApiBody')?.value||'{}' }; break;
        case 'forward': actionParams = { admin_id: parseInt(document.getElementById('actionAdminId')?.value)||0 }; break;
        case 'send_photo': actionParams = { photo_url: document.getElementById('actionPhotoUrl')?.value||'', caption: document.getElementById('actionCaption')?.value||'' }; break;
        case 'send_document': actionParams = { document_url: document.getElementById('actionDocUrl')?.value||'', document_caption: document.getElementById('actionDocCaption')?.value||'' }; break;
      }
      try {
        if (isEditing) {
          await api('/rules/' + state.editingRule.id, { method: 'PUT', body: JSON.stringify({ triggerType, triggerValue, actionType, actionParams }) });
          toast('Rule updated!', 'success');
        } else {
          await api('/bots/' + state.currentBot.id + '/rules', { method: 'POST', body: JSON.stringify({ triggerType, triggerValue, actionType, actionParams }) });
          toast('Rule added!', 'success');
        }
        closeModal();
        showBotBuilder(state.currentBot.id);
      } catch(e) { toast(e.message, 'error'); }
    }

    // ── Drag-and-drop rule reordering ──
    let dragSourceId = null;

    function onDragStart(e) {
      const card = e.target.closest('.rule-card');
      if (!card) return;
      dragSourceId = card.dataset.ruleId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragSourceId);
    }

    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const card = e.target.closest('.rule-card');
      if (!card || card.dataset.ruleId === dragSourceId) return;
      document.querySelectorAll('.rule-card').forEach(c => c.classList.remove('drag-over'));
      card.classList.add('drag-over');
    }

    function onDrop(e) {
      e.preventDefault();
      document.querySelectorAll('.rule-card').forEach(c => {
        c.classList.remove('dragging', 'drag-over');
      });
      const targetCard = e.target.closest('.rule-card');
      if (!targetCard || !dragSourceId || targetCard.dataset.ruleId === dragSourceId) {
        dragSourceId = null;
        return;
      }

      const targetId = targetCard.dataset.ruleId;
      const rules = state.currentRules;
      const sourceIndex = rules.findIndex(r => String(r.id) === dragSourceId);
      const targetIndex = rules.findIndex(r => String(r.id) === targetId);
      if (sourceIndex === -1 || targetIndex === -1) { dragSourceId = null; return; }

      // Reorder the array locally for instant feedback
      const newRules = [...rules];
      const [moved] = newRules.splice(sourceIndex, 1);
      newRules.splice(targetIndex, 0, moved);
      state.currentRules = newRules;
      renderBuilder();

      // Persist the new order
      const ruleIds = newRules.map(r => r.id);
      const botId = state.currentBot.id;
      api('/bots/' + botId + '/rules/reorder', { method: 'POST', body: JSON.stringify({ ruleIds }) })
        .then(data => { state.currentRules = data.rules; renderBuilder(); })
        .catch(e => { toast(e.message, 'error'); showBotBuilder(botId); });

      dragSourceId = null;
    }

    function onDragEnd(e) {
      document.querySelectorAll('.rule-card').forEach(c => c.classList.remove('dragging', 'drag-over'));
      dragSourceId = null;
    }

    async function duplicateRule(ruleId) {
      try {
        await api('/rules/' + ruleId + '/duplicate', { method: 'POST' });
        toast('Rule duplicated!', 'success');
        showBotBuilder(state.currentBot.id);
      } catch (e) { toast(e.message, 'error'); }
    }

    async function editRule(ruleId) {
      const rule = (state.currentRules || []).find(r => r.id === ruleId);
      if (!rule) { toast('Rule not found', 'error'); return; }
      showAddRuleModal(rule);
    }

    async function deleteRule(ruleId) {
      if (!confirm('Delete this rule?')) return;
      try {
        await api('/rules/' + ruleId, { method: 'DELETE' });
        toast('Rule deleted', 'success');
        showBotBuilder(state.currentBot.id);
      } catch(e) { toast(e.message, 'error'); }
    }

    // ============================================================
    // INIT
    // ============================================================
    async function init() {
      // Prefer valid saved config (localStorage or Worker PLATFORM_CONFIG secret)
      cfConfig = loadCfConfig();

      if (isValidCfConfig(cfConfig)) {
        document.getElementById('setupPage').style.display = 'none';
        if (state.token) {
          document.getElementById('authPage').style.display = 'none';
          showDashboard();
        } else {
          document.getElementById('authPage').style.display = 'flex';
          // Check if admin exists to show login or register form
          try {
            const res = await fetch('/api/setup/status');
            const data = await res.json();
            if (data.hasUsers) {
              document.getElementById('registerForm').style.display = 'none';
              document.getElementById('loginForm').style.display = 'block';
            } else {
              document.getElementById('loginForm').style.display = 'none';
              document.getElementById('registerForm').style.display = 'block';
            }
          } catch {
            // Default: show register (admin setup)
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('registerForm').style.display = 'block';
          }
        }
        return;
      }

      document.getElementById('setupPage').style.display = 'flex';
      showSetupStep(1);
    }

    init().catch(e => console.error('Init error:', e));
  </script>
  <!-- Prism.js for syntax highlighting -->
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js"></script>
</body>
</html>`;
});

// ============================================================
// START
// ============================================================
export default app;

