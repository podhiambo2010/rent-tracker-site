// ==== CONFIG ====
const DEFAULT_API = "https://rent-tracker-api-16i0.onrender.com";

// ==== DOM helpers (declare once) ====
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

// ==== STATE ====
const state = {
  api:        localStorage.getItem('apiBase')    || DEFAULT_API,
  adminToken: localStorage.getItem('adminToken') || "",
  leases: [],
};

// ==== Core helpers ====
function setAPI(v){
  state.api = (v || '').trim().replace(/\/$/,'');
  localStorage.setItem('apiBase', state.api);
  $('#apiEcho')?.textContent = state.api;
  $('#apiBase') ?.value = state.api;
  $('#apiBase2')?.value = state.api;
}
function setAdminToken(v){
  state.adminToken = v || "";
  localStorage.setItem('adminToken', state.adminToken);
  $('#adminToken')?.value = state.adminToken;
}
function toast(msg, ms=2400){
  const t = $('#toast'); if(!t) return;
  t.textContent = msg; t.style.display='block';
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

// ==== small utils ====
const money  = (n) => (n==null ? '—' : `Ksh ${Number(n).toLocaleString('en-KE')}`);
const yyyymm = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

// ==== Tabs ====
function showTab(name){
  $$('.tab').forEach(a => a.setAttribute('aria-selected', a.dataset.tab===name ? 'true' : 'false'));
  ['overview','leases','payments','rentroll','balances','whatsapp','settings'].forEach(id=>{
    const p = $(`#tab-${id}`); if (!p) return;
    p.classList.toggle('hidden', id !== name);
  });
  if(name==='overview') loadOverview();
  if(name==='leases')   loadLeases();
  if(name==='payments') loadPayments();
  if(name==='rentroll') loadRentroll();
  if(name==='balances') loadBalances();
}
function wireTabs(){
  $$('.tab').forEach(a=>{
    a.addEventListener('click', (e)=>{ e.preventDefault(); showTab(a.dataset.tab); });
  });
}

// ==== Header + Settings + Actions ====
function wireHeader(){
  $('#useApi')  ?.addEventListener('click', ()=>{ setAPI($('#apiBase')?.value || DEFAULT_API); toast('API saved'); });
  $('#openDocs')?.addEventListener('click', ()=> window.open(`${state.api}/docs`, '_blank'));
}
function wireSettings(){
  $('#saveSettings') ?.addEventListener('click', ()=>{
    setAPI($('#apiBase2')?.value || DEFAULT_API);
    setAdminToken($('#adminToken')?.value || '');
    toast('Settings saved');
  });
  $('#resetSettings')?.addEventListener('click', ()=>{
    setAPI(DEFAULT_API);
    setAdminToken('');
    toast('Reset to defaults');
  });
}
function wireActions(){
  $('#btnMarkSent')?.addEventListener('click', async ()=>{
    const id = ($('#invoiceIdInput')?.value || '').trim();
    if(!id){ toast('Enter an invoice_id'); return; }
    try{
      const out = await jpost('/invoices/mark_sent', { invoice_id:id, via:'whatsapp' });
      $('#actionMsg').textContent = JSON.stringify(out);
      toast('Marked as sent');
    }catch(e){
      console.error(e);
      $('#actionMsg').textContent = String(e.message||e);
      toast('Failed to mark sent');
    }
  });
  $('#btnHealth')?.addEventListener('click', async ()=>{
    try{
      const headers = state.adminToken ? {Authorization:`Bearer ${state.adminToken}`} : {};
      const r = await fetch(`${state.api}/auth/ping`, { headers });
      const data = await r.json().catch(()=> ({}));
      $('#actionMsg').textContent = JSON.stringify(data);
      toast(r.ok ? 'Auth OK' : 'Unauthorized');
    }catch(e){
      console.error(e);
      toast('Ping failed');
    }
  });
}

// ==== Overview KPIs ====
async function loadOverview(){
  try{
    const [L, P, RR, B] = await Promise.all([
      jget('/leases?limit=1000'),
      jget(`/payments?month=${yyyymm()}`),
      jget(`/rent-roll?month=${yyyymm()}`),
      jget('/balances')
    ]);
    $('#kpiLeases').textContent   = L.length;
    $('#kpiOpen').textContent     = RR.length;
    const pSum = P.reduce((s,x)=> s + (Number(x.amount)||0), 0);
    $('#kpiPayments').textContent = pSum>0 ? pSum.toLocaleString('en-KE') : P.length;
    const bSum = B.reduce((s,x)=> s + (Number(x.balance)||0), 0);
    $('#kpiBalance').textContent  = money(bSum);
  }catch(e){
    console.error(e); toast('Failed to load overview');
  }
}

// ==== Leases ====
async function loadLeases(){
  try{
    const rows = await jget('/leases?limit=1000');
    state.leases = rows || [];
    const q = ($('#leaseSearch')?.value || '').toLowerCase().trim();
    const filtered = q
      ? state.leases.filter(r => (r.tenant||'').toLowerCase().includes(q) || (r.unit||'').toLowerCase().includes(q))
      : state.leases;

    $('#leasesCount').textContent = filtered.length;
    const tbody = $('#leasesBody'), empty = $('#leasesEmpty');
    if(!filtered.length){ tbody.innerHTML=''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    tbody.innerHTML = filtered.map(r=>{
      const waHref = `${state.api}/wa_for_lease_redirect?lease_id=${encodeURIComponent(r.lease_id || r.id || '')}`;
      const waCell = (r.lease_id || r.id) ? `<a href="${waHref}" target="_blank">Open</a>` : '—';
      return `
        <tr>
          <td>${r.tenant ?? '—'}</td>
          <td>${r.unit ?? '—'}</td>
          <td>${money(r.rent_amount ?? r.rent)}</td>
          <td>${r.billing_cycle ?? r.cycle ?? '—'}</td>
          <td>${r.due_day ?? '—'}</td>
          <td><span class="status ${(String(r.status||'active').toLowerCase()==='active')?'ok':'due'}">${r.status ?? 'Active'}</span></td>
          <td>${waCell}</td>
        </tr>`;
    }).join('');
  }catch(e){
    console.error(e);
    $('#leasesBody').innerHTML=''; $('#leasesEmpty').classList.remove('hidden');
  }
}
$('#reloadLeases')?.addEventListener('click', loadLeases);
$('#leaseSearch')?.addEventListener('input', loadLeases);

// ==== Payments ====
(function initPaymentsMonth(){
  const sel = $('#paymentsMonth'); if (!sel || sel.options.length) return;
  const now = new Date();
  for(let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = d.toLocaleString('en-KE',{month:'short', year:'numeric'});
    if(i===0) opt.selected = true; sel.appendChild(opt);
  }
})();
async function loadPayments(){
  try{
    const month   = $('#paymentsMonth')?.value || yyyymm();
    const tenantQ = ($('#paymentsTenant')?.value || '').toLowerCase().trim();
    const statusQ = $('#paymentsStatus')?.value || '';
    const rows = await jget(`/payments?month=${month}`);
    const filtered = (rows||[]).filter(r => {
      const okT = tenantQ ? (String(r.tenant||'').toLowerCase().includes(tenantQ)) : true;
      const okS = statusQ ? (String(r.status||'') === statusQ) : true;
      return okT && okS;
    });
    $('#paymentsCount').textContent = filtered.length;
    $('#paymentsEmpty').classList.toggle('hidden', filtered.length>0);
    $('#paymentsBody').innerHTML = filtered.map(r=>`
      <tr>
        <td>${r.date ? new Date(r.date).toLocaleDateString('en-KE') : '—'}</td>
        <td>${r.tenant ?? '—'}</td>
        <td>${r.method ?? '—'}</td>
        <td class="muted">${r.status ?? 'posted'}</td>
        <td style="text-align:right">${money(r.amount)}</td>
      </tr>`).join('');
  }catch(e){
    console.error(e);
    $('#paymentsBody').innerHTML=''; $('#paymentsEmpty').classList.remove('hidden');
  }
}
$('#applyPayments') ?.addEventListener('click', loadPayments);
$('#clearPayments') ?.addEventListener('click', ()=>{ $('#paymentsTenant').value=''; $('#paymentsStatus').value=''; loadPayments(); });
$('#paymentsMonth')?.addEventListener('change', loadPayments);

// ==== Rent Roll ====
(function initRentrollMonth(){
  const sel = $('#rentrollMonth'); if (!sel || sel.options.length) return;
  const now = new Date();
  for(let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = d.toLocaleString('en-KE',{month:'short', year:'numeric'});
    if(i===0) opt.selected = true; sel.appendChild(opt);
  }
})();
async function loadRentroll(){
  try{
    const month = $('#rentrollMonth')?.value || yyyymm();
    const tQ = ($('#rentrollTenant')?.value || '').toLowerCase().trim();
    const pQ = ($('#rentrollProperty')?.value || '').toLowerCase().trim();
    const rows = await jget(`/rent-roll?month=${month}`);
    const filtered = (rows||[]).filter(r =>
      (tQ ? String(r.tenant||'').toLowerCase().includes(tQ) : true) &&
      (pQ ? String(r.property||'').toLowerCase().includes(pQ) : true)
    );
    $('#rentrollCount').textContent = filtered.length;
    $('#rentrollEmpty').classList.toggle('hidden', filtered.length>0);
    $('#rentrollBody').innerHTML = filtered.map(r=>`
      <tr>
        <td>${r.property ?? '—'}</td>
        <td>${r.unit ?? '—'}</td>
        <td>${r.tenant ?? '—'}</td>
        <td>${r.period ?? `${r.period_start||''} → ${r.period_end||''}`}</td>
        <td>${money(r.total_due)}</td>
        <td>${r.status ?? '—'}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>`).join('');
  }catch(e){
    console.error(e);
    $('#rentrollBody').innerHTML=''; $('#rentrollEmpty').classList.remove('hidden');
  }
}
$('#applyRentroll') ?.addEventListener('click', loadRentroll);
$('#clearRentroll') ?.addEventListener('click', ()=>{ $('#rentrollTenant').value=''; $('#rentrollProperty').value=''; loadRentroll(); });

// ==== Balances (current month) ====
async function loadBalances(){
  try{
    const rows = await jget('/balances');
    const tbody = $('#balancesBody'), empty = $('#balancesEmpty');
    if(!rows?.length){ tbody.innerHTML=''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    tbody.innerHTML = rows.map(r=>`
      <tr>
        <td>${r.tenant ?? '—'}</td>
        <td>${(r.lease_id||'').slice(0,8)}…</td>
        <td>${r.period_start ?? '—'} → ${r.period_end ?? '—'}</td>
        <td>${r.status ?? '—'}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>`).join('');
  }catch(e){
    console.error(e);
    $('#balancesBody').innerHTML=''; $('#balancesEmpty').classList.remove('hidden');
  }
}
$('#reloadBalances')?.addEventListener('click', loadBalances);

// ==== Boot ====
(function init(){
  setAPI(state.api);
  setAdminToken(state.adminToken);
  $('#yy')?.textContent = new Date().getFullYear();
  wireTabs(); wireHeader(); wireSettings(); wireActions();
  showTab('overview');              // default tab
})();
