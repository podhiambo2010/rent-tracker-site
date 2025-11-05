// const PROXY = "https://<your-proxy>.onrender.com"; // optional, not used here
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

  const echo = document.querySelector('#apiEcho');
  if (echo) echo.textContent = state.api;

  const a = document.querySelector('#apiBase');
  if (a) a.value = state.api;

  const b = document.querySelector('#apiBase2');
  if (b) b.value = state.api;
}

function setAdminToken(v) {
  state.adminToken = v || "";
  localStorage.setItem('adminToken', state.adminToken);

  const t = document.querySelector('#adminToken');
  if (t) t.value = state.adminToken;
}

function toast(msg, ms = 2400) {
  const t = document.querySelector('#toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), ms);
}

async function jget(path) {
  const url = `${state.api}${path}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
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

/* ---------- Header controls ---------- */
const btnUseApi = document.querySelector('#useApi');
if (btnUseApi) {
  btnUseApi.addEventListener('click', () => {
    const input = document.querySelector('#apiBase');
    setAPI(input ? input.value : DEFAULT_API);
    toast('API saved');
  });
}

const btnOpenDocs = document.querySelector('#openDocs');
if (btnOpenDocs) {
  btnOpenDocs.addEventListener('click', () => {
    window.open(`${state.api}/docs`, '_blank');
  });
}

/* ---------- Settings ---------- */
const btnSaveSettings = document.querySelector('#saveSettings');
if (btnSaveSettings) {
  btnSaveSettings.addEventListener('click', () => {
    const api2 = document.querySelector('#apiBase2');
    const tok = document.querySelector('#adminToken');
    setAPI(api2 ? api2.value : DEFAULT_API);
    setAdminToken(tok ? tok.value : '');
    toast('Settings saved');
  });
}

const btnResetSettings = document.querySelector('#resetSettings');
if (btnResetSettings) {
  btnResetSettings.addEventListener('click', () => {
    setAPI(DEFAULT_API);
    setAdminToken('');
    toast('Reset to defaults');
  });
}

/* ---------- Invoice Actions ---------- */
const btnMarkSent = document.querySelector('#btnMarkSent');
if (btnMarkSent) {
  btnMarkSent.addEventListener('click', async () => {
    const idInput = document.querySelector('#invoiceIdInput');
    const id = (idInput ? idInput.value : '').trim();
    const msg = document.querySelector('#actionMsg');

    if (!id) {
      toast('Enter an invoice_id');
      return;
    }
    try {
      const out = await jpost('/invoices/mark_sent', { invoice_id: id, via: 'whatsapp' });
      if (msg) msg.textContent = JSON.stringify(out);
      toast('Marked as sent');
    } catch (e) {
      console.error(e);
      if (msg) msg.textContent = String(e.message || e);
      toast('Failed to mark sent');
    }
  });
}

/* ---------- Optional /auth/ping ---------- */
const btnHealth = document.querySelector('#btnHealth');
if (btnHealth) {
  btnHealth.addEventListener('click', async () => {
    const msg = document.querySelector('#actionMsg');
    try {
      const headers = state.adminToken ? { Authorization: `Bearer ${state.adminToken}` } : {};
      const r = await fetch(`${state.api}/auth/ping`, { headers });
      const data = await r.json().catch(() => ({}));
      if (msg) msg.textContent = JSON.stringify(data);
      toast(r.ok ? 'Auth OK' : 'Unauthorized');
    } catch (e) {
      console.error(e);
      toast('Ping failed');
    }
  });
}

/* ---------- Minimal Overview loader (leave others as in your previous file) ---------- */
async function loadOverview() {
  try {
    const [leases, paymentsThisMonth, balances] = await Promise.all([
      jget('/leases?limit=1000'),
      (async () => {
        const y = new Date().toISOString().slice(0, 7);
        return await jget(`/payments?month=${y}`);
      })(),
      jget('/balances'),
    ]);

    const kpiLeases = document.querySelector('#kpiLeases');
    const kpiPayments = document.querySelector('#kpiPayments');
    const kpiOpen = document.querySelector('#kpiOpen');
    const kpiBalance = document.querySelector('#kpiBalance');

    if (kpiLeases) kpiLeases.textContent = leases.length;
    if (kpiPayments) kpiPayments.textContent =
      paymentsThisMonth.reduce((s, x) => s + Number(x.amount || 0), 0).toLocaleString('en-KE');

    const open = (await jget('/rent-roll?month=' + new Date().toISOString().slice(0, 7)))
      .filter(x => String(x.status).toLowerCase() !== 'paid');
    if (kpiOpen) kpiOpen.textContent = open.length;

    const bal = balances.reduce((s, x) => s + Number(x.balance || 0), 0);
    if (kpiBalance) kpiBalance.textContent = Number(bal).toLocaleString('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
  } catch (err) {
    console.error(err);
    toast('Failed to load overview');
  }
}

/* ---------- init ---------- */
(function init() {
  setAPI(state.api);

  const a = document.querySelector('#apiBase');
  if (a) a.value = state.api;

  const b = document.querySelector('#apiBase2');
  if (b) b.value = state.api;

  const t = document.querySelector('#adminToken');
  if (t) t.value = state.adminToken;

  const yy = document.querySelector('#yy');
  if (yy) yy.textContent = new Date().getFullYear();

  loadOverview(); // others load on tab-clicks in your larger file
})();
