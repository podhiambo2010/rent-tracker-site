// const PROXY = "https://<your-proxy>.onrender.com"; // optional
const DEFAULT_API = "https://rent-tracker-api-16i0.onrender.com";

const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

const state = {
  api: localStorage.getItem('apiBase') || DEFAULT_API,
  adminToken: localStorage.getItem('adminToken') || "",
  monthsPayments: [],
  monthsRentroll: [],
  leases: [],
};

/* ---------------- Core helpers ---------------- */
function setAPI(v){
  state.api = (v || '').trim().replace(/\/$/,'');
  localStorage.setItem('apiBase', state.api);

  const echo = $('#apiEcho'); if (echo) echo.textContent = state.api;
  const a = $('#apiBase');    if (a) a.value = state.api;
  const b = $('#apiBase2');   if (b) b.value = state.api;
}

function setAdminToken(v){
  state.adminToken = v || "";
  localStorage.setItem('adminToken', state.adminToken);
  const t = $('#adminToken'); if (t) t.value = state.adminToken;
}

function toast(msg, ms=2400){
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.style.display = 'block';
  setTimeout(()=> t.style.display='none', ms);
}

async function jget(path){
  const r = await fetch(`${state.api}${path}`, { headers:{Accept:'application/json'} });
  if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function jpost(path, body){
  const headers = {'Content-Type':'application/json'};
  if(state.adminToken) headers.Authorization = `Bearer ${state.adminToken}`;
  const r = await fetch(`${state.api}${path}`, { method:'POST', headers, body: JSON.stringify(body||{}) });
  if(!r.ok){
    const txt = await r.text().catch(()=> '');
    throw new Error(`${r.status} ${r.statusText} — ${txt}`);
  }
  return r.json();
}

/* ---------------- Nav / tabs ---------------- */
function showTab(name){
  // highlight left tab
  $$('.tab').forEach(a => a.setAttribute('aria-selected', a.dataset.tab===name ? 'true' : 'false'));
  // show panel
  ['overview','leases','payments','rentroll','balances','whatsapp','settings'].forEach(id=>{
    const p = $(`#tab-${id}`); if (!p) return;
    p.classList.toggle('hidden', id !== name);
  });
  // lazy load sections
  if(name==='overview') loadOverview();
  if(name==='leases')   loadLeases();
  if(name==='payments') initPayments();
  if(name==='rentroll') initRentroll();
  if(name==='balances') loadBalances();
}

function wireTabs(){
  $$('.tab').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      showTab(a.dataset.tab);
    });
  });
}

/* ---------------- Header controls ---------------- */
function wireHeader(){
  const btnUse = $('#useApi');
  if(btnUse){
    btnUse.addEventListener('click', ()=>{
      const v = $('#apiBase') ? $('#apiBase').value : DEFAULT_API;
      setAPI(v);
      toast('API saved');
    });
  }
  const btnDocs = $('#openDocs');
  if(btnDocs){
    btnDocs.addEventListener('click', ()=> window.open(`${state.api}/docs`, '_blank'));
  }
}

/* ---------------- Settings panel ---------------- */
function wireSettings(){
  const save = $('#saveSettings');
  if(save){
    save.addEventListener('click', ()=>{
      const v1 = $('#apiBase2') ? $('#apiBase2').value : DEFAULT_API;
      const tok = $('#adminToken') ? $('#adminToken').value : '';
      setAPI(v1);
      setAdminToken(tok);
      toast('Settings saved');
    });
  }
  const reset = $('#resetSettings');
  if(reset){
    reset.addEventListener('click', ()=>{
      setAPI(DEFAULT_API);
      setAdminToken('');
      toast('Reset to defaults');
    });
  }
}

/* ---------------- Invoice Actions ---------------- */
function wireActions(){
  const btn = $('#btnMarkSent');
  if(btn){
    btn.addEventListener('click', async ()=>{
      const id = ($('#invoiceIdInput')?.value || '').trim();
      const outEl = $('#actionMsg');
      if(!id){ toast('Enter an invoice_id'); return; }
      try{
        const out = await jpost('/invoices/mark_sent', { invoice_id:id, via:'whatsapp' });
        if(outEl) outEl.textContent = JSON.stringify(out);
        toast('Marked as sent');
      }catch(e){
        console.error(e);
        if(outEl) outEl.textContent = String(e.message||e);
        toast('Failed to mark sent');
      }
    });
  }

  const ping = $('#btnHealth');
  if(ping){
    ping.addEventListener('click', async ()=>{
      const outEl = $('#actionMsg');
      try{
        const headers = state.adminToken ? {Authorization:`Bearer ${state.adminToken}`} : {};
        const r = await fetch(`${state.api}/auth/ping`, { headers });
        const data = await r.json().catch(()=> ({}));
        if(outEl) outEl.textContent = JSON.stringify(data);
        toast(r.ok ? 'Auth OK' : 'Unauthorized');
      }catch(e){
        console.error(e);
        toast('Ping failed');
      }
    });
  }
}

/* ---------------- Data loads (minimal) ---------------- */
function ksh(n){ return Number(n||0).toLocaleString('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}); }

async function loadOverview(){
  try{
    const [leases, paymentsThisMonth, balances] = await Promise.all([
      jget('/leases?limit=1000'),
      (async ()=> jget(`/payments?month=${new Date().toISOString().slice(0,7)}`))(),
      jget('/balances')
    ]);
    const open = (await jget('/rent-roll?month=' + new Date().toISOString().slice(0,7)))
      .filter(x => String(x.status).toLowerCase() !== 'paid');

    $('#kpiLeases')   && ($('#kpiLeases').textContent   = leases.length);
    $('#kpiOpen')     && ($('#kpiOpen').textContent     = open.length);
    $('#kpiPayments') && ($('#kpiPayments').textContent =
        paymentsThisMonth.reduce((s,x)=> s + Number(x.amount||0), 0).toLocaleString('en-KE'));
    $('#kpiBalance')  && ($('#kpiBalance').textContent  =
        ksh(balances.reduce((s,x)=> s + Number(x.balance||0), 0)));
  }catch(e){
    console.error(e);
    toast('Failed to load overview');
  }
}

/* Stubs so tabs don’t error if you haven’t added the lists yet */
async function loadLeases(){ /* you can fill later; not needed to make buttons work */ }
async function initPayments(){ /* optional */ }
async function initRentroll(){ /* optional */ }
async function loadBalances(){ /* optional */ }

/* ---------------- boot ---------------- */
(function init(){
  // reflect stored values in the UI
  setAPI(state.api);
  setAdminToken(state.adminToken);
  const yy = $('#yy'); if(yy) yy.textContent = new Date().getFullYear();

  wireTabs();
  wireHeader();
  wireSettings();
  wireActions();

  // default tab
  showTab('overview');
})();

// --------- helpers for rendering ----------
const $ = (sel) => document.querySelector(sel);
const money = (n) => (n==null ? '—' : `Ksh ${Number(n).toLocaleString('en-KE')}`);
const yyyymm = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

// --------- LEASES ----------
async function loadLeases() {
  try {
    const rows = await jget('/leases?limit=1000');  // you already call this for KPIs
    state.leases = rows || [];
    const tbody = $('#leasesBody');
    const empty = $('#leasesEmpty');
    if (!tbody) return;

    // basic search filter
    const q = ($('#leaseSearch')?.value || '').toLowerCase().trim();
    const filtered = q
      ? state.leases.filter(r =>
          (r.tenant||'').toLowerCase().includes(q) ||
          (r.unit||'').toLowerCase().includes(q))
      : state.leases;

    if (!filtered.length) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      $('#leasesCount').textContent = '0';
      return;
    }

    empty.classList.add('hidden');
    $('#leasesCount').textContent = filtered.length;

    // We render what the API sends. If a field is missing, we show '—'.
    tbody.innerHTML = filtered.map(r => {
      const tenant = r.tenant ?? '—';
      const unit   = r.unit ?? '—';
      const rent   = r.rent_amount ?? r.rent ?? '—';
      const cycle  = r.billing_cycle ?? r.cycle ?? '—';
      const dueDay = r.due_day ?? '—';
      const status = r.status ?? 'Active';

      // Optional WhatsApp quick-link using your redirect endpoint (safe even without phone in UI)
      const waHref  = `${state.api}/wa_for_lease_redirect?lease_id=${encodeURIComponent(r.lease_id || r.id || '')}`;
      const waCell  = (r.lease_id || r.id) ? `<a href="${waHref}" target="_blank">Open</a>` : '—';

      return `
        <tr>
          <td>${tenant}</td>
          <td>${unit}</td>
          <td>${money(rent)}</td>
          <td>${cycle}</td>
          <td>${dueDay}</td>
          <td><span class="status ${String(status).toLowerCase()==='active'?'ok':'due'}">${status}</span></td>
          <td>${waCell}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error(e);
    $('#leasesBody').innerHTML = '';
    $('#leasesEmpty').classList.remove('hidden');
  }
}

$('#reloadLeases')?.addEventListener('click', loadLeases);
$('#leaseSearch')?.addEventListener('input', loadLeases);

// --------- PAYMENTS ----------
async function loadPayments() {
  try {
    // default to current YYYY-MM
    const monthSel = $('#paymentsMonth');
    const month = monthSel?.value || yyyymm();
    const tenantQ = ($('#paymentsTenant')?.value || '').toLowerCase().trim();
    const statusQ = $('#paymentsStatus')?.value || '';

    const rows = await jget(`/payments?month=${month}`);
    // rows come back with at least id + invoice_id right now; we render safely
    const filtered = (rows || []).filter(r => {
      const okT = tenantQ ? (String(r.tenant||'').toLowerCase().includes(tenantQ)) : true;
      const okS = statusQ ? (String(r.status||'') === statusQ) : true;
      return okT && okS;
    });

    $('#paymentsCount').textContent = filtered.length;
    $('#paymentsEmpty').classList.toggle('hidden', filtered.length>0);

    $('#paymentsBody').innerHTML = filtered.map(r => `
      <tr>
        <td>${r.date ? new Date(r.date).toLocaleDateString('en-KE') : '—'}</td>
        <td>${r.tenant ?? '—'}</td>
        <td>${r.method ?? '—'}</td>
        <td class="muted">${r.status ?? 'posted'}</td>
        <td style="text-align:right">${money(r.amount)}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
    $('#paymentsBody').innerHTML = '';
    $('#paymentsEmpty').classList.remove('hidden');
  }
}

// populate month dropdown once
(function initPaymentsMonth(){
  const sel = $('#paymentsMonth'); if (!sel) return;
  if (sel.options.length) return;
  const now = new Date();
  for (let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = d.toLocaleString('en-KE',{month:'short', year:'numeric'});
    if (i===0) opt.selected = true;
    sel.appendChild(opt);
  }
})();
$('#applyPayments')?.addEventListener('click', loadPayments);
$('#clearPayments')?.addEventListener('click', ()=>{
  $('#paymentsTenant').value=''; $('#paymentsStatus').value='';
  loadPayments();
});
$('#paymentsMonth')?.addEventListener('change', loadPayments);

// --------- RENT ROLL ----------
async function loadRentroll() {
  try {
    const sel = $('#rentrollMonth');
    const month = sel?.value || yyyymm();
    const tQ = ($('#rentrollTenant')?.value || '').toLowerCase().trim();
    const pQ = ($('#rentrollProperty')?.value || '').toLowerCase().trim();

    const rows = await jget(`/rent-roll?month=${month}`);
    const filtered = (rows||[]).filter(r =>
      (tQ ? String(r.tenant||'').toLowerCase().includes(tQ) : true) &&
      (pQ ? String(r.property||'').toLowerCase().includes(pQ) : true)
    );

    $('#rentrollCount').textContent = filtered.length;
    $('#rentrollEmpty').classList.toggle('hidden', filtered.length>0);

    $('#rentrollBody').innerHTML = filtered.map(r => `
      <tr>
        <td>${r.property ?? '—'}</td>
        <td>${r.unit ?? '—'}</td>
        <td>${r.tenant ?? '—'}</td>
        <td>${r.period ?? `${r.period_start||''} → ${r.period_end||''}`}</td>
        <td>${money(r.total_due)}</td>
        <td>${r.status ?? '—'}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
    $('#rentrollBody').innerHTML = '';
    $('#rentrollEmpty').classList.remove('hidden');
  }
}
$('#applyRentroll')?.addEventListener('click', loadRentroll);
$('#clearRentroll')?.addEventListener('click', ()=>{
  $('#rentrollTenant').value=''; $('#rentrollProperty').value='';
  loadRentroll();
});
// one-time month options
(function initRentrollMonth(){
  const sel = $('#rentrollMonth'); if (!sel) return;
  if (sel.options.length) return;
  const now = new Date();
  for (let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = d.toLocaleString('en-KE',{month:'short', year:'numeric'});
    if (i===0) opt.selected = true;
    sel.appendChild(opt);
  }
})();

// --------- BALANCES (current month) ----------
async function loadBalances() {
  try {
    const rows = await jget('/balances');
    const tbody = $('#balancesBody');
    const empty = $('#balancesEmpty');

    if (!rows?.length) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.tenant ?? '—'}</td>
        <td>${(r.lease_id||'').slice(0,8)}…</td>
        <td>${r.period_start ?? '—'} → ${r.period_end ?? '—'}</td>
        <td>${r.status ?? '—'}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
    $('#balancesBody').innerHTML = '';
    $('#balancesEmpty').classList.remove('hidden');
  }
}
$('#reloadBalances')?.addEventListener('click', loadBalances);

// --------- wire tab loads into init() ----------
async function loadOverview(){
  try {
    const [leases, pay, rr, bal] = await Promise.allSettled([
      jget('/leases?limit=1000'),
      jget(`/payments?month=${yyyymm()}`),
      jget(`/rent-roll?month=${yyyymm()}`),
      jget('/balances')
    ]);

    const L = leases.status==='fulfilled' ? leases.value||[] : [];
    $('#kpiLeases').textContent = L.length;

    const RR = rr.status==='fulfilled' ? rr.value||[] : [];
    $('#kpiOpen').textContent = RR.length;

    const P = pay.status==='fulfilled' ? pay.value||[] : [];
    // if API returns objects with "amount", sum them; otherwise show count
    const pSum = P.reduce((s,x)=> s + (Number(x.amount)||0), 0);
    $('#kpiPayments').textContent = pSum>0 ? pSum.toLocaleString('en-KE') : P.length;

    const B = bal.status==='fulfilled' ? bal.value||[] : [];
    const bSum = B.reduce((s,x)=> s + (Number(x.balance)||0), 0);
    $('#kpiBalance').textContent = money(bSum);
  } catch(e){
    console.error(e);
  }
}

// load tables whenever their tab is opened
document.querySelectorAll('.tab').forEach(el=>{
  el.addEventListener('click', ()=>{
    const tab = el.dataset.tab;
    document.querySelectorAll('[id^="tab-"]').forEach(p=>p.classList.add('hidden'));
    $(`#tab-${tab}`)?.classList.remove('hidden');

    if (tab==='leases')   loadLeases();
    if (tab==='payments') loadPayments();
    if (tab==='rentroll') loadRentroll();
    if (tab==='balances') loadBalances();
  });
});
