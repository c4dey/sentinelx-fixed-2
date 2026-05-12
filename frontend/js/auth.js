'use strict';

// ─────────────────────────────────────────────────────────────
//  SentinelX Auth — manages login/signup/session across VM & ESC
// ─────────────────────────────────────────────────────────────

const ROLE_BG     = { Admin:'rgba(255,107,107,0.15)', Analyst:'rgba(88,166,255,0.15)', Viewer:'rgba(105,219,124,0.15)' };
const ROLE_COLOR  = { Admin:'#ff6b6b',                Analyst:'#58a6ff',               Viewer:'#69db7c' };
const ROLE_BORDER = { Admin:'rgba(255,107,107,0.3)',   Analyst:'rgba(88,166,255,0.3)',   Viewer:'rgba(105,219,124,0.3)' };

// ── Hard-coded demo accounts (no real backend) ────────────────
const SAMPLE_ACCOUNTS = [
  { email:'admin@sentinelx.com',   password:'Admin1234!',   first:'Admin',   last:'User',    role:'Admin'   },
  { email:'analyst@sentinelx.com', password:'Analyst123!',  first:'Jane',    last:'Analyst', role:'Analyst' },
  { email:'viewer@sentinelx.com',  password:'Viewer1234!',  first:'View',    last:'Only',    role:'Viewer'  },
];

const AUTH_SCREEN   = () => document.getElementById('auth-screen');
const APP_VM        = () => document.getElementById('app-vm');
const APP_ESC       = () => document.getElementById('app-esc');

let _currentApp = null; // 'vm' | 'esc'

// ── Expose globally so other JS can read ─────────────────────
window.getCurrentApp = () => _currentApp;

// ── Session boot ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await sxDetectBackend();

  // Check persisted session
  if (SxAuth.isLoggedIn()) {
    const u = SxAuth.getUser();
    if (u) {
      // Re-validate against backend if connected
      if (window.SX_BACKEND_MODE) {
        try { await SxAPI.me(); } catch { SxAuth.clearTokens(); showAuthScreen(); return; }
      }
      applySession(u, SxStorage.getItem('sx_last_app') || 'vm');
      return;
    }
  }

  // Check offline sample session
  const saved = localStorage.getItem('sx_offline_session');
  if (saved) {
    try {
      const u = JSON.parse(saved);
      applySession(u, localStorage.getItem('sx_last_app') || 'vm');
      return;
    } catch {}
  }

  showAuthScreen();
});

function showAuthScreen() {
  AUTH_SCREEN().style.display = '';
  if (APP_VM())  APP_VM().style.display  = 'none';
  if (APP_ESC()) APP_ESC().style.display = 'none';
}

// ── Apply a logged-in user session ────────────────────────────
function applySession(rawUser, app) {
  const u = normalizeUser(rawUser);
  SxAuth.setUser(u);

  _currentApp = app === 'esc' ? 'esc' : 'vm';
  localStorage.setItem('sx_last_app', _currentApp);

  AUTH_SCREEN().style.display = 'none';

  if (_currentApp === 'esc') {
    if (APP_VM())  APP_VM().style.display  = 'none';
    if (APP_ESC()) APP_ESC().style.display = 'flex';
    escInitWithUser(u);
  } else {
    if (APP_ESC()) APP_ESC().style.display = 'none';
    if (APP_VM())  APP_VM().style.display  = 'flex';
    vmInitWithUser(u);
  }
}

function normalizeUser(u) {
  const role = u.role || 'Analyst';
  return {
    ...u,
    role,
    initials: ((u.first?.[0] || '') + (u.last?.[0] || '')).toUpperCase(),
    bg:       u.bg     || ROLE_BG[role]     || 'rgba(141,150,160,0.15)',
    color:    u.color  || ROLE_COLOR[role]  || '#8d96a0',
    border:   u.border || ROLE_BORDER[role] || 'rgba(141,150,160,0.3)',
  };
}

// ── Sign-in form ──────────────────────────────────────────────
async function authSignIn() {
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  const pass  = document.getElementById('auth-pass').value;
  const err   = document.getElementById('auth-error');
  err.style.display = 'none';

  if (!email || !pass) { err.textContent = 'Enter your email and password.'; err.style.display = 'block'; return; }

  const app   = document.getElementById('auth-app-select')?.value || 'vm';
  const errMsg = msg => { err.textContent = msg; err.style.display = 'block'; };

  // Try backend first
  if (window.SX_BACKEND_MODE) {
    try {
      const u = await SxAPI.signIn(email, pass);
      applySession(u, app);
      return;
    } catch(e) {
      // If specifically an auth failure, show it; if network, fall through to offline
      if (e.status === 401 || e.status === 403) { errMsg(e.message || 'Invalid credentials.'); return; }
    }
  }

  // Offline fallback: check sample accounts
  const sample = SAMPLE_ACCOUNTS.find(a => a.email === email && a.password === pass);
  if (sample) {
    const u = normalizeUser(sample);
    SxAuth.setUser(u);
    localStorage.setItem('sx_offline_session', JSON.stringify(u));
    applySession(u, app);
    return;
  }

  // Check locally-registered accounts (from signUp offline)
  const localAccounts = JSON.parse(localStorage.getItem('sx_local_accounts') || '[]');
  const local = localAccounts.find(a => a.email === email && a.password === pass);
  if (local) {
    const u = normalizeUser(local);
    SxAuth.setUser(u);
    localStorage.setItem('sx_offline_session', JSON.stringify(u));
    applySession(u, app);
    return;
  }

  errMsg('Invalid email or password.');
}

// ── Sign-up form ──────────────────────────────────────────────
async function authSignUp() {
  const first = document.getElementById('su-first').value.trim();
  const last  = document.getElementById('su-last').value.trim();
  const email = document.getElementById('su-email').value.trim().toLowerCase();
  const pass  = document.getElementById('su-pass').value;
  const role  = document.getElementById('su-role')?.value || 'Analyst';
  const err   = document.getElementById('su-error');
  err.style.display = 'none';

  if (!first || !last || !email || !pass) { err.textContent = 'All fields are required.'; err.style.display = 'block'; return; }
  if (pass.length < 6)                    { err.textContent = 'Password must be at least 6 characters.'; err.style.display = 'block'; return; }

  const app = document.getElementById('auth-app-select')?.value || 'vm';

  if (window.SX_BACKEND_MODE) {
    try {
      const u = await SxAPI.signUp(first, last, email, pass, role);
      applySession(u, app);
      return;
    } catch(e) {
      if (e.status && e.status !== 503) { err.textContent = e.message; err.style.display = 'block'; return; }
    }
  }

  // Offline — save to local accounts (excluded from data, separate from sample accounts)
  const localAccounts = JSON.parse(localStorage.getItem('sx_local_accounts') || '[]');
  if (localAccounts.find(a => a.email === email) || SAMPLE_ACCOUNTS.find(a => a.email === email)) {
    err.textContent = 'An account with this email already exists.';
    err.style.display = 'block';
    return;
  }
  const newUser = { first, last, email, password: pass, role };
  localAccounts.push(newUser);
  localStorage.setItem('sx_local_accounts', JSON.stringify(localAccounts));

  const u = normalizeUser(newUser);
  SxAuth.setUser(u);
  localStorage.setItem('sx_offline_session', JSON.stringify(u));
  applySession(u, app);
}

// ── Demo account quick-login ───────────────────────────────────
function authDemoLogin(role) {
  const map = {
    Admin:   SAMPLE_ACCOUNTS[0],
    Analyst: SAMPLE_ACCOUNTS[1],
    Viewer:  SAMPLE_ACCOUNTS[2],
  };
  const acct = map[role];
  if (!acct) return;
  document.getElementById('auth-email').value = acct.email;
  document.getElementById('auth-pass').value  = acct.password;
}

// ── Sign-out ──────────────────────────────────────────────────
async function unifiedSignOut() {
  if (window.SX_BACKEND_MODE) {
    try { await SxAPI.signOut(); } catch {}
  }
  SxAuth.clearTokens();
  localStorage.removeItem('sx_offline_session');
  _currentApp = null;
  showAuthScreen();
}

// ── Tab switching on auth screen ──────────────────────────────
function authShowTab(tab) {
  document.getElementById('auth-signin-pane').style.display = tab === 'signin' ? '' : 'none';
  document.getElementById('auth-signup-pane').style.display = tab === 'signup' ? '' : 'none';
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

// ── App switcher (VM ↔ ESC while logged in) ───────────────────
function switchApp(app) {
  const u = SxAuth.getUser();
  if (!u) return;
  _currentApp = app;
  localStorage.setItem('sx_last_app', app);
  applySession(u, app);
}

// ── Password change ───────────────────────────────────────────
async function vmChangePassword() {
  const cur = document.getElementById('vm-cp-current').value;
  const nw  = document.getElementById('vm-cp-new').value;
  const con = document.getElementById('vm-cp-confirm').value;
  if (!cur || !nw) return alert('Fill in current and new password.');
  if (nw !== con)  return alert('New passwords do not match.');
  if (nw.length < 6) return alert('Password must be at least 6 characters.');
  if (window.SX_BACKEND_MODE) {
    try { await SxAPI.changePassword(cur, nw); alert('Password changed successfully.'); }
    catch(e) { alert(e.message || 'Failed to change password.'); }
  } else {
    const u = SxAuth.getUser();
    const localAccounts = JSON.parse(localStorage.getItem('sx_local_accounts') || '[]');
    const idx = localAccounts.findIndex(a => a.email === u.email);
    if (idx < 0) return alert('Cannot change password for sample accounts.');
    if (localAccounts[idx].password !== cur) return alert('Current password is incorrect.');
    localAccounts[idx].password = nw;
    localStorage.setItem('sx_local_accounts', JSON.stringify(localAccounts));
    alert('Password changed successfully.');
  }
  ['vm-cp-current','vm-cp-new','vm-cp-confirm'].forEach(id => document.getElementById(id).value = '');
}
