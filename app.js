/* ==================== Rent Tracker Dashboard — app.js (drop-in) ==================== */
const DEFAULT_API = "https://rent-tracker-api-16i0.onrender.com";

/* ---------------- tiny helpers (single definitions) ---------------- */
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const yyyymm = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const money  = (n) => (n==null ? "—" : `Ksh ${Number(n||0).toLocaleString("en-KE")}`);
const ksh    = (n) => Number(n||0).toLocaleString("en-KE",{style:"currency",currency:"KES",maximumFractionDigits:0});
const monthLabel = (d) => d.toLocaleString("en-KE",{month:"short",year:"numeric"});

/* CSV helpers */
const csvEscape = (v)=> {
  const s = v==null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
};
function toCSV(rows, cols){
  if(!rows?.length) return "";
  const head = cols.map(c => csvEscape(c.label)).join(",");
  const body = rows.map(r => cols.map(c => csvEscape(
    (typeof c.value==="function" ? c.value(r) : r[c.value]) ?? ""
  )).join(",")).join("\n");
  return head + "\n" + body;
}
function download(filename, text){
  const blob = new Blob([text], {type:"text/csv;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
}
function openHtmlInNewTab(title, inner){
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif;padding:20px}
  h1{font-size:18px;margin:0 0 12px} a{display:inline-block;margin:6px 0}
  table{border-collapse:collapse;width:100%} td,th{border:1px solid #ddd;padding:8px}
  th{text-align:left;background:#f7f7f7}</style></head><body>${inner}</body></html>`;
  const blob = new Blob([html], {type:"text/html"});
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(()=> URL.revokeObjectURL(url), 30000);
}

/* ---------------- app state ---------------- */
const state = {
  api: localStorage.getItem("apiBase") || DEFAULT_API,
  adminToken: localStorage.getItem("adminToken") || "",
  leasesView:   [],
  paymentsView: [],
  rentrollView: [],
  balancesView: []
};

/* ---------------- core fetchers & UI sync ---------------- */
function setAPI(v){
  state.api = (v||"").trim().replace(/\/$/,"");
  localStorage.setItem("apiBase", state.api);
  $("#apiEcho")  && ($("#apiEcho").textContent = state.api);
  $("#apiBase")  && ($("#apiBase").value      = state.api);
  $("#apiBase2") && ($("#apiBase2").value     = state.api);
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
  const headers = { "Content-Type":"application/json" };
  if(state.adminToken) headers.Authorization = `Bearer ${state.adminToken}`;
  const r = await fetch(`${state.api}${path}`, { method:"POST", headers, body: JSON.stringify(body||{}) });
  if(!r.ok){
    const txt = await r.text().catch(()=> "");
    throw new Error(`${r.status} ${r.statusText} — ${txt}`);
  }
  return r.json();
}

/* ---------------- tabs ---------------- */
function showTab(name){
  $$(".tab").forEach(a => a.setAttribute("aria-selected", a.dataset.tab===name ? "true":"false"));
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
function wireTabs(){ $$(".tab").forEach(a => a.addEventListener("click", e => { e.preventDefault(); showTab(a.dataset.tab); })); }

/* ---------------- header ---------------- */
function wireHeader(){
  $("#useApi")?.addEventListener("click", ()=>{
    const v = $("#apiBase")?.value || DEFAULT_API;
    setAPI(v); toast("API saved");
  });
  $("#openDocs")?.addEventListener("click", ()=> window.open(`${state.api}/docs`, "_blank"));
}

/* ---------------- settings ---------------- */
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

/* ---------------- invoice actions ---------------- */
function wireActions(){
  // Multi-ID mark_sent: accepts comma, space, or newline-separated IDs
  $("#btnMarkSent")?.addEventListener("click", async ()=>{
    const raw = ($("#invoiceIdInput")?.value || "").trim();
    if(!raw) return toast("Enter one or more invoice_id values");
    const ids = raw.split(/[\s,]+/).map(s=>s.trim()).filter(Boolean);
    let ok=0, fail=0;
    for(const id of ids){
      try { await jpost("/invoices/mark_sent", { invoice_id:id, via:"whatsapp" }); ok++; }
      catch(e){ console.error("mark_sent failed:", id, e); fail++; }
    }
    $("#actionMsg") && ($("#actionMsg").textContent = JSON.stringify({processed:ids.length, ok, fail}));
    toast(`Marked sent: ${ok} • Failed: ${fail}`);
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

/* ---------------- overview KPIs ---------------- */
async function loadOverview(){
  try{
    const month = yyyymm();
    const [L, P, RR, B] = await Promise.all([
      jget("/leases?limit=1000").catch(()=>[]),
      jget(`/payments?month=${month}`).catch(()=>[]),
      jget(`/rent-roll?month=${month}`).catch(()=>[]),
      jget("/balances").catch(()=>[])
    ]);

    $("#kpiLeases")   && ($("#kpiLeases").textContent = (L||[]).length);
    $("#kpiOpen")     && ($("#kpiOpen").textContent   = (RR||[]).filter(r => String(r.status||"").toLowerCase()!=="paid").length);

    const pSum = (P||[]).reduce((s,x)=> s + (Number(x.amount)||0), 0);
    $("#kpiPayments") && ($("#kpiPayments").textContent = pSum>0 ? pSum.toLocaleString("en-KE") : (P||[]).length);

    const bSum = (B||[]).reduce((s,x)=> s + (Number(x.balance)||0), 0);
    $("#kpiBalance")  && ($("#kpiBalance").textContent  = ksh(bSum));
  }catch(e){ console.error(e); toast("Failed to load overview"); }
}

/* ---------------- leases ---------------- */
async function loadLeases(){
  try{
    const rows = await jget("/leases?limit=1000");
    const q = ($("#leaseSearch")?.value || "").toLowerCase().trim();
    const filtered = q
      ? (rows||[]).filter(r =>
          String(r.tenant||"").toLowerCase().includes(q) ||
          String(r.unit||"").toLowerCase().includes(q))
      : (rows||[]);
    state.leasesView = filtered;

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

/* ---------------- payments ---------------- */
function ensurePaymentsMonthOptions(){
  const sel = $("#paymentsMonth"); if(!sel || sel.options.length) return;
  const now = new Date();
  for(let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = yyyymm(d);
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = monthLabel(d);
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
    state.paymentsView = filtered;

    // header label
    const hdr = $("#paymentsHeaderLabel");
    if(hdr){
      const [y,m] = (month||yyyymm()).split("-").map(Number);
      hdr.textContent = `Payments for ${monthLabel(new Date(y, m-1, 1))}`;
    }

    $("#paymentsCount") && ($("#paymentsCount").textContent = filtered.length);
    $("#paymentsEmpty")?.classList.toggle("hidden", filtered.length>0);

    const total = filtered.reduce((s,x)=> s + (Number(x.amount)||0), 0);
    $("#paymentsBody") && ($("#paymentsBody").innerHTML = filtered.map(r=>`
      <tr>
        <td>${r.date ? new Date(r.date).toLocaleDateString("en-KE") : "—"}</td>
        <td>${r.tenant ?? "—"}</td>
        <td>${r.method ?? "—"}</td>
        <td class="muted">${r.status ?? "posted"}</td>
        <td style="text-align:right">${money(r.amount)}</td>
      </tr>
    `).join("") + `
      <tr class="total-row">
        <td colspan="4" style="text-align:right"><strong>Total</strong></td>
        <td style="text-align:right"><strong>${money(total)}</strong></td>
      </tr>
    `);
  }catch(e){
    console.error(e);
    $("#paymentsBody") && ($("#paymentsBody").innerHTML="");
    $("#paymentsEmpty")?.classList.remove("hidden");
  }
}
$("#applyPayments")?.addEventListener("click", loadPayments);
$("#clearPayments")?.addEventListener("click", ()=>{ $("#paymentsTenant").value=""; $("#paymentsStatus").value=""; loadPayments(); });
$("#paymentsMonth")?.addEventListener("change", loadPayments);

/* ---------------- rent roll ---------------- */
function ensureRentrollMonthOptions(){
  const sel = $("#rentrollMonth"); if(!sel || sel.options.length) return;
  const now = new Date();
  for(let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = yyyymm(d);
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = monthLabel(d);
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
    state.rentrollView = filtered;

    $("#rentrollCount") && ($("#rentrollCount").textContent = filtered.length);
    $("#rentrollEmpty")?.classList.toggle("hidden", filtered.length>0);

    const totalBal = filtered.reduce((s,x)=> s + (Number(x.balance)||0), 0);
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
    `).join("") + `
      <tr class="total-row">
        <td colspan="6" style="text-align:right"><strong>Total</strong></td>
        <td style="text-align:right"><strong>${money(totalBal)}</strong></td>
      </tr>
    `);
  }catch(e){
    console.error(e);
    $("#rentrollBody") && ($("#rentrollBody").innerHTML="");
    $("#rentrollEmpty")?.classList.remove("hidden");
  }
}
$("#applyRentroll")?.addEventListener("click", loadRentroll);
$("#clearRentroll")?.addEventListener("click", ()=>{ $("#rentrollTenant").value=""; $("#rentrollProperty").value=""; loadRentroll(); });

/* ---------------- balances (current month) ---------------- */
async function loadBalances(){
  try{
    const rows = await jget("/balances");
    state.balancesView = rows || [];

    if(!rows?.length){
      $("#balancesBody") && ($("#balancesBody").innerHTML="");
      $("#balancesEmpty")?.classList.remove("hidden");
      return;
    }
    $("#balancesEmpty")?.classList.add("hidden");

    const total = rows.reduce((s,x)=> s + (Number(x.balance)||0), 0);
    $("#balancesBody") && ($("#balancesBody").innerHTML = rows.map(r=>`
      <tr>
        <td>${r.tenant ?? "—"}</td>
        <td>${(r.lease_id||"").slice(0,8)}…</td>
        <td>${r.period_start ?? "—"} → ${r.period_end ?? "—"}</td>
        <td>${r.status ?? "—"}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>
    `).join("") + `
      <tr class="total-row">
        <td colspan="4" style="text-align:right"><strong>Total</strong></td>
        <td style="text-align:right"><strong>${money(total)}</strong></td>
      </tr>
    `);
  }catch(e){
    console.error(e);
    $("#balancesBody") && ($("#balancesBody").innerHTML="");
    $("#balancesEmpty")?.classList.remove("hidden");
  }
}
$("#reloadBalances")?.addEventListener("click", loadBalances);

/* ---------------- auto-inject action & export buttons ---------------- */
function ensureExtraButtons(){
  // utility: insert a button after some anchor element
  function addAfter(anchorSel, id, label, extraClass="btn ghost"){
    if($(id)) return null;
    const anchor = $(anchorSel); if(!anchor) return null;
    const btn = document.createElement("button");
    btn.className = extraClass;
    btn.id = id.replace(/^#/, "");
    btn.textContent = label;
    anchor.insertAdjacentElement("afterend", btn);
    return btn;
  }

  // CSV buttons
  addAfter("#reloadLeases",   "#exportLeases",   "Export CSV");
  addAfter("#applyPayments",  "#exportPayments", "Export CSV");
  addAfter("#applyRentroll",  "#exportRentroll", "Export CSV");
  addAfter("#reloadBalances", "#exportBalances", "Export CSV");

  // NEW: Actions
  addAfter("#exportPayments", "#markVisibleSent", "Mark visible as sent");
  addAfter("#exportBalances", "#bulkWhatsApp",    "Bulk WhatsApp");

  /* Handlers */
  $("#exportLeases")?.addEventListener("click", ()=>{
    const cols = [
      {label:"Tenant", value:r=>r.tenant},
      {label:"Unit",   value:r=>r.unit},
      {label:"Rent",   value:r=>r.rent_amount ?? r.rent},
      {label:"Cycle",  value:r=>r.billing_cycle ?? r.cycle},
      {label:"Due Day",value:r=>r.due_day},
      {label:"Status", value:r=>r.status},
      {label:"Lease ID", value:r=>r.lease_id || r.id}
    ];
    download(`leases_${yyyymm()}.csv`, toCSV(state.leasesView, cols));
  });

  $("#exportPayments")?.addEventListener("click", ()=>{
    const cols = [
      {label:"Date",      value:r=>r.date},
      {label:"Tenant",    value:r=>r.tenant},
      {label:"Method",    value:r=>r.method},
      {label:"Status",    value:r=>r.status ?? "posted"},
      {label:"Amount",    value:r=>r.amount},
      {label:"Invoice ID",value:r=>r.invoice_id},
      {label:"Payment ID",value:r=>r.id}
    ];
    download(`payments_${($("#paymentsMonth")?.value || yyyymm())}.csv`, toCSV(state.paymentsView, cols));
  });

  $("#exportRentroll")?.addEventListener("click", ()=>{
    const cols = [
      {label:"Property", value:r=>r.property},
      {label:"Unit",     value:r=>r.unit},
      {label:"Tenant",   value:r=>r.tenant},
      {label:"Period",   value:r=>r.period ?? `${r.period_start||""} → ${r.period_end||""}`},
      {label:"Total Due",value:r=>r.total_due},
      {label:"Status",   value:r=>r.status},
      {label:"Balance",  value:r=>r.balance}
    ];
    download(`rent_roll_${($("#rentrollMonth")?.value || yyyymm())}.csv`, toCSV(state.rentrollView, cols));
  });

  $("#exportBalances")?.addEventListener("click", ()=>{
    const cols = [
      {label:"Tenant",      value:r=>r.tenant},
      {label:"Lease ID",    value:r=>r.lease_id},
      {label:"Period Start",value:r=>r.period_start},
      {label:"Period End",  value:r=>r.period_end},
      {label:"Status",      value:r=>r.status},
      {label:"Total Due",   value:r=>r.total_due},
      {label:"Paid",        value:r=>r.paid_amount},
      {label:"Balance",     value:r=>r.balance}
    ];
    download(`balances_${yyyymm()}.csv`, toCSV(state.balancesView, cols));
  });

  // NEW A) Payments → Mark visible as sent
  $("#markVisibleSent")?.addEventListener("click", async ()=>{
    const ids = Array.from(new Set(
      (state.paymentsView||[]).map(r=>r.invoice_id).filter(Boolean)
    ));
    if(!ids.length) return toast("No invoice IDs in the visible payments.");
    let ok=0, fail=0;
    for(const id of ids){
      try { await jpost("/invoices/mark_sent", { invoice_id:id, via:"whatsapp" }); ok++; }
      catch(e){ console.error("mark_visible failed:", id, e); fail++; }
    }
    $("#actionMsg") && ($("#actionMsg").textContent = JSON.stringify({processed:ids.length, ok, fail}));
    toast(`Marked visible as sent: ${ok} • Failed: ${fail}`);
  });

  // NEW B) Balances → Bulk WhatsApp links
  $("#bulkWhatsApp")?.addEventListener("click", ()=>{
    const rows = state.balancesView||[];
    if(!rows.length) return toast("No balances to build WhatsApp links.");
    const first = rows[0];
    const label = (first?.period_start)
      ? monthLabel(new Date(first.period_start))
      : monthLabel(new Date());

    const items = rows.map(r=>{
      const href = r.lease_id
        ? `${state.api}/wa_for_lease_redirect?lease_id=${encodeURIComponent(r.lease_id)}`
        : null;
      const line = href
        ? `<a href="${href}" target="_blank">Open WA →</a>`
        : `<span style="color:#888">no lease_id</span>`;
      return `<tr><td>${csvEscape(r.tenant||"—")}</td><td>${(r.lease_id||"").slice(0,8)}…</td><td>${money(r.balance)}</td><td>${line}</td></tr>`;
    }).join("");

    openHtmlInNewTab(
      `WhatsApp Links — ${label}`,
      `<h1>WhatsApp Links — ${label}</h1>
       <p>Click each link to open a prefilled WhatsApp message for that tenant.</p>
       <table>
         <thead><tr><th>Tenant</th><th>Lease</th><th>Balance</th><th>Link</th></tr></thead>
         <tbody>${items}</tbody>
       </table>`
    );
  });
}

/* ---------------- boot ---------------- */
(function init(){
  setAPI(state.api);
  setAdminToken(state.adminToken);
  $("#yy") && ($("#yy").textContent = new Date().getFullYear());

  wireTabs();
  wireHeader();
  wireSettings();
  wireActions();

  // add action & export buttons next to existing action buttons
  ensureExtraButtons();

  showTab("overview");  // default view
})();
