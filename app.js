// const PROXY = "https://<your-proxy>.onrender.com"; // (optional, not used here)
const API = "https://rent-tracker-api-16i0.onrender.com";
const DEFAULT_API = "https://rent-tracker-api-16i0.onrender.com";

const state = {
  api: localStorage.getItem('apiBase') || DEFAULT_API,
  adminToken: localStorage.getItem('adminToken') || "",
  monthsPayments: [],
  monthsRentroll: [],
  leases: [],
};

function setAPI(v) {
  state.api = (v || '').trim().replace(/\/$/, '');
  localStorage.setItem('apiBase', state.api);
  document.querySelector('#apiEcho').textContent = state.api;
  const a = document.querySelector('#apiBase');  if (a) a.value = state.api;
  const b = document.querySelector('#apiBase2'); if (b) b.value = state.api;
}

function setAdminToken(v) {
  state.adminToken = v || "";
  localStorage.setItem('adminToken', state.adminToken);
  const t = document.querySelector('#adminToken'); if (t) t.value = state.adminToken;
}

function toast(msg, ms = 2400) {
  const t = document.querySelector('#toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', ms);
}

async function jget(path) {
  const url = `${state.api}${path}`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.json();
}

async function jpost(path, body) {
  const url = `${state.api}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (state.adminToken) headers['Authorization'] = `Bearer ${state.adminToken}`;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`${r.status} ${r.statusText} — ${text}`);
  }
  return await r.json();
}

// Header controls
document.querySelector('#useApi')?.addEventListener('click', () => {
  setAPI(document.querySelector('#apiBase').value);
  toast('API saved');
});
document.querySelector('#openDocs')?.addEventListener('click', () => {
  window.open(`${state.api}/docs`, '_blank');
});

// Settings
document.querySelector('#saveSettings')?.addEventListener('click', () => {
  setAPI(document.querySelector('#apiBase2').value);
  setAdminToken(document.querySelector('#adminToken').value);
  toast('Settings saved');
});

document.querySelector('#resetSettings')?.addEventListener('click', () => {
  setAPI(DEFAULT_API);
  setAdminToken("");
  toast('Reset to defaults');
});

// Invoice Actions
document.querySelector('#btnMarkSent')?.addEventListener('click', async () => {
  const id = document.querySelector('#invoiceIdInput').value.trim();
  if (!id) { toast('Enter an invoice_id'); return; }
  try {
    const out = await jpost('/invoices/mark_sent', { invoice_id: id, via: 'whatsapp' });
    document.querySelector('#actionMsg').textContent = JSON.stringify(out);
    toast('Marked as sent');
  } catch (e) {
    console.error(e);
    document.querySelector('#actionMsg').textContent = String(e.message || e);
    toast('Failed to mark sent');
  }
});

// Optional "/auth/ping"
document.querySelector('#btnHealth')?.addEventListener('click', async () => {
  try {
    const url = `${state.api}/auth/ping`;
    const headers = state.adminToken ? { 'Authorization': `Bearer ${state.adminToken}` } : {};
    const r = await fetch(url, { headers });
    const data = await r.json();
    document.querySelector('#actionMsg').textContent = JSON.stringify(data);
    toast(r.ok ? 'Auth OK' : 'Unauthorized');
  } catch (e) {
    console.error(e);
    toast('Ping failed');
  }
});

// Boot
(function init() {
  setAPI(state.api);
  document.querySelector('#apiBase')?.value = state.api;
  document.querySelector('#apiBase2')?.value = state.api;
  document.querySelector('#adminToken')?.value = state.adminToken;
  document.querySelector('#yy').textContent = new Date().getFullYear();
  if (typeof loadOverview === 'function') {
    loadOverview();
  }
})();
