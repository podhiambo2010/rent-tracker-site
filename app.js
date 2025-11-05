// ======================= Rent Tracker Dashboard (app.js) =======================
// This file is defensive: it renders whatever the API returns, and never crashes
// if some fields are missing. It also stores API base + Admin token in localStorage.

const DEFAULT_API = "https://rent-tracker-api-16i0.onrender.com";

/* ---------------- Tiny helpers ---------------- */
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const yyyymm = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const money  = (n) => (n==null ? "—" : `Ksh ${Number(n || 0).toLocaleString("en-KE")}`);
const ksh    = (n) => Number(n||0).toLocaleString("en-KE",{style:"currency",currency:"KES",maximumFractionDigits:0});

const state = {
  api: localStorage.getItem("apiBase")   || DEFAULT_API,
  adminToken: localStorage.getItem("adminToken") || "",
  leases: [],
  paymentsMonth: yyyymm(),
  rentrollMonth: yyyymm()
};

/* ---------------- Core fetchers ---------------- */
function setAPI(v){
  state.api = (v||"").trim().replace(/\/$/,"");
  localStorage.setItem("apiBase", state.api);
  $("#apiEcho") && ($("#apiEcho").textContent = state.api);
  $("#apiBase") && ($("#apiBase").value = state.api);
  $("#apiBase2") && ($("#apiBase2").value = state.api);
}
function setAdminToken(v){
  state.adminToken = v || "";
  localStorage.setItem("adminToken", state.adminToken);
  $("#adminToken") && ($("#adminToken").value = state.adminToken);
}
function toast(msg, ms=2200){ const t=$("#toast"); if(!t) return; t.textContent=msg; t.style.display="block"; setTimeout(()=>t.style.display="none",ms); }

async function jget(path){
  const r = await fetch(`${state.api}${path}`, { headers: { Accept:"application/json" }});
  if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
async function jpost(path, body){
  const headers = { "Content-Type": "application/json" };
  if(state.adminToken) headers.Authorization = `Bearer ${state.adminToken}`;
  const r = await fetch(`${state.api}${path}`, { method:"POST", headers, body: JSON.stringify(body||{}) });
  if(!r.ok){
    const txt = await r.text().catch(()=> "");
    throw new Error(`${r.status} ${r.statusText} — ${txt}`);
  }
  return r.json();
}

/* ---------------- Tabs ---------------- */
function showTab(name){
  $$(".tab").forEach(a => a.setAttribute("aria-selected", a.dataset.tab===name ? "true" : "false"));
  ["overview","leases","payments","rentroll","balances","whatsapp","settings"].forEach(id=>{
    const p = $(`#tab-${id}`); if(!p) return;
    p.classList.toggle("hidden", id!==name);
  });

  if(name==="overview") loadOverview();
  if(name==="leases")   loadLeases();
  if(name==="payments") loadPayments();
  if(name==="rentroll") loadRentroll();
  if(name==="balances") loadBalances();
}
function wireTabs(){ $$(".tab").forEach(a=> a.addEventListener("click", (e)=>{ e.preventDefault(); showTab(a.dataset.tab); })); }

/* ---------------- Header buttons ---------------- */
function wireHeader(){
  $("#useApi")?.addEventListener("click", ()=>{
    const v = $("#apiBase")?.value || DEFAULT_API;
    setAPI(v); toast("API saved");
  });
  $("#openDocs")?.addEventListener("click", ()=> window.open(`${state.api}/docs`, "_blank"));
}

/* ---------------- Settings panel ---------------- */
function wireSettings(){
  $("#saveSettings")?.addEventListener("click", ()=>{
    setAPI($("#apiBase2")?.value || DEFAULT_API);
    setAdminToken($("#adminToken")?.value || "");
    toast("Settings saved");
  });
  $("#resetSettings")?.addEventListener("click", ()=>{
    setAPI(DEFAULT_API); setAdminToken(""); toast("Reset to defaults");
  });
}

/* ---------------- Invoice actions ---------------- */
function wireActions(){
  $("#btnMarkSent")?.addEventListener("click", async ()=>{
    const id = ($("#invoiceIdInput")?.value || "").trim();
    if(!id) return toast("Enter an invoice_id");
    try{
      const out = await jpost("/invoices/mark_sent", { invoice_id:id, via:"whatsapp" });
      $("#actionMsg") && ($("#actionMsg").textContent = JSON.stringify(out));
      toast("Marked as sent");
    }catch(e){ console.error(e); $("#actionMsg") && ($("#actionMsg").textContent=String(e.message||e)); toast("Failed to mark sent"); }
  });

  $("#btnHealth")?.addEventListener("click", async ()=>{
    try{
      const headers = state.adminToken ? { Authorization:`Bearer ${state.adminToken}` } : {};
      const r = await fetch(`${state.api}/auth/ping`, { headers });
      const data = await r.json().catch(()=> ({}));
      $("#actionMsg") && ($("#actionMsg").textContent = JSON.stringify(data));
      toast(r.ok ? "Auth OK" : "Unauthorized");
    }catch(e){ console.error(e); toast("Ping failed"); }
  });
}

/* ---------------- OVERVIEW KPIs ---------------- */
async function loadOverview(){
  try{
    const month = yyyymm();
    const [L, P, RR, B] = await Promise.all([
      jget("/leases?limit=1000").catch(()=>[]),
      jget(`/payments?month=${month}`).catch(()=>[]),
      jget(`/rent-roll?month=${month}`).catch(()=>[]),
      jget("/balances").catch(()=>[])
    ]);

    $("#kpiLeases")  && ($("#kpiLeases").textContent  = (L||[]).length);
    $("#kpiOpen")    && ($("#kpiOpen").textContent    = (RR||[]).filter(r => String(r.status||"").toLowerCase()!=="paid").length);

    const pSum = (P||[]).reduce((s,x)=> s + (Number(x.amount)||0), 0);
    $("#kpiPayments") && ($("#kpiPayments").textContent = pSum>0 ? pSum.toLocaleString("en-KE") : (P||[]).length);

    const bSum = (B||[]).reduce((s,x)=> s + (Number(x.balance)||0), 0);
    $("#kpiBalance") && ($("#kpiBalance").textContent = ksh(bSum));
  }catch(e){ console.error(e); toast("Failed to load overview"); }
}

/* ---------------- LEASES ---------------- */
async function loadLeases(){
  try{
    const rows = await jget("/leases?limit=1000");
    state.leases = rows || [];

    const q = ($("#leaseSearch")?.value || "").toLowerCase().trim();
    const filtered = q
      ? state.leases.filter(r =>
          String(r.tenant||"").toLowerCase().includes(q) ||
          String(r.unit||"").toLowerCase().includes(q))
      : state.leases;

    $("#leasesCount") && ($("#leasesCount").textContent = filtered.length);

    if(!filtered.length){
      $("#leasesBody") && ($("#leasesBody").innerHTML = "");
      $("#leasesEmpty")?.classList.remove("hidden");
      return;
    }
    $("#leasesEmpty")?.classList.add("hidden");

    $("#leasesBody").innerHTML = filtered.map(r=>{
      const tenant = r.tenant ?? "—";
      const unit   = r.unit ?? "—";
      const rent   = r.rent_amount ?? r.rent ?? "—";
      const cycle  = r.billing_cycle ?? r.cycle ?? "—";
      const dueDay = r.due_day ?? "—";
      const status = r.status ?? "Active";
      const leaseId = r.lease_id || r.id || "";
      const waHref  = leaseId ? `${state.api}/wa_for_lease_redirect?lease_id=${encodeURIComponent(leaseId)}` : null;

      return `
        <tr>
          <td>${tenant}</td>
          <td>${unit}</td>
          <td>${money(rent)}</td>
          <td>${cycle}</td>
          <td>${dueDay}</td>
          <td><span class="status ${String(status).toLowerCase()==="active"?"ok":"due"}">${status}</span></td>
          <td>${waHref ? `<a href="${waHref}" target="_blank">Open</a>` : "—"}</td>
        </tr>
      `;
    }).join("");
  }catch(e){
    console.error(e);
    $("#leasesBody") && ($("#leasesBody").innerHTML="");
    $("#leasesEmpty")?.classList.remove("hidden");
  }
}
$("#reloadLeases")?.addEventListener("click", loadLeases);
$("#leaseSearch")?.addEventListener("input", loadLeases);

/* ---------------- PAYMENTS ---------------- */
function ensurePaymentsMonthOptions(){
  const sel = $("#paymentsMonth"); if(!sel || sel.options.length) return;
  const now = new Date();
  for(let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = yyyymm(d);
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = d.toLocaleString("en-KE",{month:"short", year:"numeric"});
    if(i===0) opt.selected = true;
    sel.appendChild(opt);
  }
}
ensurePaymentsMonthOptions();

async function loadPayments(){
  try{
    const month = $("#paymentsMonth")?.value || yyyymm();
    const tQ = ($("#paymentsTenant")?.value || "").toLowerCase().trim();
    const sQ = $("#paymentsStatus")?.value || "";

    const rows = await jget(`/payments?month=${month}`);
    const filtered = (rows||[]).filter(r=>{
      const okT = tQ ? String(r.tenant||"").toLowerCase().includes(tQ) : true;
      const okS = sQ ? String(r.status||"")===sQ : true;
      return okT && okS;
    });

    $("#paymentsCount") && ($("#paymentsCount").textContent = filtered.length);
    $("#paymentsEmpty")?.classList.toggle("hidden", filtered.length>0);

    $("#paymentsBody") && ($("#paymentsBody").innerHTML = filtered.map(r=>`
      <tr>
        <td>${r.date ? new Date(r.date).toLocaleDateString("en-KE") : "—"}</td>
        <td>${r.tenant ?? "—"}</td>
        <td>${r.method ?? "—"}</td>
        <td class="muted">${r.status ?? "posted"}</td>
        <td style="text-align:right">${money(r.amount)}</td>
      </tr>
    `).join(""));
  }catch(e){
    console.error(e);
    $("#paymentsBody") && ($("#paymentsBody").innerHTML="");
    $("#paymentsEmpty")?.classList.remove("hidden");
  }
}
$("#applyPayments")?.addEventListener("click", loadPayments);
$("#clearPayments")?.addEventListener("click", ()=>{ $("#paymentsTenant").value=""; $("#paymentsStatus").value=""; loadPayments(); });
$("#paymentsMonth")?.addEventListener("change", loadPayments);

/* ---------------- RENT ROLL ---------------- */
function ensureRentrollMonthOptions(){
  const sel = $("#rentrollMonth"); if(!sel || sel.options.length) return;
  const now = new Date();
  for(let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = yyyymm(d);
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = d.toLocaleString("en-KE",{month:"short", year:"numeric"});
    if(i===0) opt.selected = true;
    sel.appendChild(opt);
  }
}
ensureRentrollMonthOptions();

async function loadRentroll(){
  try{
    const month = $("#rentrollMonth")?.value || yyyymm();
    const tQ = ($("#rentrollTenant")?.value || "").toLowerCase().trim();
    const pQ = ($("#rentrollProperty")?.value || "").toLowerCase().trim();

    const rows = await jget(`/rent-roll?month=${month}`);
    const filtered = (rows||[]).filter(r =>
      (tQ ? String(r.tenant||"").toLowerCase().includes(tQ) : true) &&
      (pQ ? String(r.property||"").toLowerCase().includes(pQ) : true)
    );

    $("#rentrollCount") && ($("#rentrollCount").textContent = filtered.length);
    $("#rentrollEmpty")?.classList.toggle("hidden", filtered.length>0);

    $("#rentrollBody") && ($("#rentrollBody").innerHTML = filtered.map(r=>`
      <tr>
        <td>${r.property ?? "—"}</td>
        <td>${r.unit ?? "—"}</td>
        <td>${r.tenant ?? "—"}</td>
        <td>${r.period ?? `${r.period_start||"—"} → ${r.period_end||"—"}`}</td>
        <td>${money(r.total_due)}</td>
        <td>${r.status ?? "—"}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>
    `).join(""));
  }catch(e){
    console.error(e);
    $("#rentrollBody") && ($("#rentrollBody").innerHTML="");
    $("#rentrollEmpty")?.classList.remove("hidden");
  }
}
$("#applyRentroll")?.addEventListener("click", loadRentroll);
$("#clearRentroll")?.addEventListener("click", ()=>{ $("#rentrollTenant").value=""; $("#rentrollProperty").value=""; loadRentroll(); });

/* ---------------- BALANCES (current month) ---------------- */
async function loadBalances(){
  try{
    const rows = await jget("/balances");
    if(!rows?.length){
      $("#balancesBody") && ($("#balancesBody").innerHTML="");
      $("#balancesEmpty")?.classList.remove("hidden");
      return;
    }
    $("#balancesEmpty")?.classList.add("hidden");
    $("#balancesBody") && ($("#balancesBody").innerHTML = rows.map(r=>`
      <tr>
        <td>${r.tenant ?? "—"}</td>
        <td>${(r.lease_id||"").slice(0,8)}…</td>
        <td>${r.period_start ?? "—"} → ${r.period_end ?? "—"}</td>
        <td>${r.status ?? "—"}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>
    `).join(""));
  }catch(e){
    console.error(e);
    $("#balancesBody") && ($("#balancesBody").innerHTML="");
    $("#balancesEmpty")?.classList.remove("hidden");
  }
}
$("#reloadBalances")?.addEventListener("click", loadBalances);

/* ---------------- Boot ---------------- */
(function init(){
  setAPI(state.api);
  setAdminToken(state.adminToken);
  $("#yy") && ($("#yy").textContent = new Date().getFullYear());

  wireTabs();
  wireHeader();
  wireSettings();
  wireActions();

  // default landing
  showTab("overview");
})();
