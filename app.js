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
