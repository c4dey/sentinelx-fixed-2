'use strict';

// ── SentinelX API Client ──────────────────────────────────────
const API_BASE = (() => {
  if (window.SX_API_BASE) return window.SX_API_BASE;
  if (window.location.port !== '5500' && window.location.port !== '3000') {
    return window.location.origin + '/api';
  }
  return '/api';
})();

// ── Sample account detection ──────────────────────────────────
const SAMPLE_EMAILS = new Set([
  'admin@sentinelx.com',
  'analyst@sentinelx.com',
  'viewer@sentinelx.com',
]);
function isSampleAccount(email) {
  return SAMPLE_EMAILS.has((email || '').toLowerCase());
}

// ── Account-scoped storage ────────────────────────────────────
// Each real account gets its own namespace. Sample accounts never persist.
function _scopedKey(base, email) {
  if (!email) return base;
  const safe = email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
  return `${base}__${safe}`;
}

const SxStorage = {
  _email() { const u = SxAuth.getUser(); return u ? u.email : null; },
  _isSample() { return isSampleAccount(this._email()); },
  getItem(base) {
    if (this._isSample()) return null;
    return localStorage.getItem(_scopedKey(base, this._email()));
  },
  setItem(base, value) {
    if (this._isSample()) return;
    localStorage.setItem(_scopedKey(base, this._email()), value);
  },
  removeItem(base) {
    if (this._isSample()) return;
    localStorage.removeItem(_scopedKey(base, this._email()));
  },
};

// ── Token storage ─────────────────────────────────────────────
const SxAuth = {
  getAccess()     { return localStorage.getItem('sx_access_token'); },
  getRefresh()    { return localStorage.getItem('sx_refresh_token'); },
  setTokens(a, r) { localStorage.setItem('sx_access_token', a); localStorage.setItem('sx_refresh_token', r); },
  clearTokens()   {
    localStorage.removeItem('sx_access_token');
    localStorage.removeItem('sx_refresh_token');
    localStorage.removeItem('sx_current_user');
  },
  getUser()       { try { return JSON.parse(localStorage.getItem('sx_current_user')); } catch { return null; } },
  setUser(u)      { localStorage.setItem('sx_current_user', JSON.stringify(u)); },
  isLoggedIn()    { return !!this.getAccess() && !!this.getUser(); },
};

// ── Core fetch wrapper ────────────────────────────────────────
let _refreshPromise = null;

async function sxFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = SxAuth.getAccess();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...options, headers });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.code === 'TOKEN_EXPIRED') {
      if (!_refreshPromise) {
        _refreshPromise = sxRefreshToken().finally(() => { _refreshPromise = null; });
      }
      const refreshed = await _refreshPromise;
      if (refreshed) {
        headers['Authorization'] = 'Bearer ' + SxAuth.getAccess();
        return fetch(API_BASE + path, { ...options, headers });
      }
    }
    throw Object.assign(new Error(body.error || 'Unauthorized'), { status: 401, body });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status, body });
  }

  return res.json().catch(() => ({}));
}

async function sxRefreshToken() {
  const rt = SxAuth.getRefresh();
  if (!rt) { SxAuth.clearTokens(); window.location.reload(); return false; }
  try {
    const res = await fetch(API_BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) throw new Error('refresh failed');
    const data = await res.json();
    SxAuth.setTokens(data.access_token, data.refresh_token);
    SxAuth.setUser(data.user);
    return true;
  } catch {
    SxAuth.clearTokens();
    window.location.reload();
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// AUTH API
// ══════════════════════════════════════════════════════════════
const SxAPI = {
  async signIn(email, password) {
    const data = await sxFetch('/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
    SxAuth.setTokens(data.access_token, data.refresh_token);
    SxAuth.setUser(data.user);
    return data.user;
  },
  async signUp(first, last, email, password, role = 'Analyst') {
    const data = await sxFetch('/auth/signup', { method: 'POST', body: JSON.stringify({ first, last, email, password, role }) });
    SxAuth.setTokens(data.access_token, data.refresh_token);
    SxAuth.setUser(data.user);
    return data.user;
  },
  async signOut() {
    try { await sxFetch('/auth/signout', { method: 'POST', body: JSON.stringify({ refresh_token: SxAuth.getRefresh() }) }); } catch {}
    SxAuth.clearTokens();
  },
  async me() { const data = await sxFetch('/auth/me'); SxAuth.setUser(data.user); return data.user; },

  async getUsers()            { return (await sxFetch('/users')).users; },
  async deleteUser(id)        { return sxFetch(`/users/${id}`, { method: 'DELETE' }); },
  async updateRole(id, role)  { return sxFetch(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); },
  async changePassword(cur, nw) { return sxFetch('/users/me/password', { method: 'PATCH', body: JSON.stringify({ current_password: cur, new_password: nw }) }); },

  async vmList(filters = {})  { const p = new URLSearchParams(filters).toString(); return (await sxFetch('/vm' + (p ? '?' + p : ''))).records; },
  async vmCreate(record)      { return (await sxFetch('/vm', { method: 'POST', body: JSON.stringify(record) })).record; },
  async vmUpdate(id, data)    { return (await sxFetch(`/vm/${id}`, { method: 'PUT', body: JSON.stringify(data) })).record; },
  async vmDelete(id)          { return sxFetch(`/vm/${id}`, { method: 'DELETE' }); },
  async vmBulk(records)       { return sxFetch('/vm/bulk', { method: 'POST', body: JSON.stringify({ records }) }); },

  async escList(filters = {}) { const p = new URLSearchParams(filters).toString(); return (await sxFetch('/esc' + (p ? '?' + p : ''))).records; },
  async escCreate(record)     { return (await sxFetch('/esc', { method: 'POST', body: JSON.stringify(record) })).record; },
  async escUpdate(id, data)   { return (await sxFetch(`/esc/${id}`, { method: 'PUT', body: JSON.stringify(data) })).record; },
  async escDelete(id)         { return sxFetch(`/esc/${id}`, { method: 'DELETE' }); },
  async escBulk(records)      { return sxFetch('/esc/bulk', { method: 'POST', body: JSON.stringify({ records }) }); },

  async vmPeriods()  { return (await sxFetch('/vm/periods')).periods; },
  async escPeriods() { return (await sxFetch('/esc/periods')).periods; },
  async health()     { return sxFetch('/health'); },
  async isBackendUp() { try { await this.health(); return true; } catch { return false; } },
};

window.SX_BACKEND_MODE = false;
async function sxDetectBackend() {
  window.SX_BACKEND_MODE = await SxAPI.isBackendUp();
  if (!window.SX_BACKEND_MODE) console.warn('[SentinelX] Backend not reachable — running in localStorage mode');
  else console.log('[SentinelX] Backend connected at', API_BASE);
  return window.SX_BACKEND_MODE;
}
