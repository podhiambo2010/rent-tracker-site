/* ==================== Rent Tracker Dashboard — app.js (fixed) ==================== */
const DEFAULT_API = "https://rent-tracker-api-16i0.onrender.com";

/* ---------------- tiny helpers ---------------- */
const $  = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const yyyymm = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const money  = (n) => (n==null ? "—" : `Ksh ${Number(n||0).toLocaleString("en-KE")}`);
const ksh    = (n) => Number(n||0).toLocaleString("en-KE",{style:"currency",currency:"KES",maximumFractionDigits:0});

/* CSV helpers */
const csvEscape = (v)=>{ const s=v==null?"":String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
function toCSV(rows, cols){
  if(!rows?.length) return "";
  const head = cols.map(c=>csvEscape(c.label)).join(",");
  const body = rows.map(r=>cols.map(c=>csvEscape(typeof c.value==="function"?c.value(r):r[c.value])).join(",")).join("\n");
  return head+"\n"+body;
}
function download(filename, text){
  const blob = new Blob([text], {type:"text/csv;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
}

/* ---------------- app state ---------------- */
const state = {
  api: localStorage.getItem("apiBase") || DEFAULT_API,
  adminToken: localStorage.getItem("adminToken") || "",
  leasesView: [], paymentsView: [], rentrollView: [], balancesView: []
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
  const url = /^https?:\/\//i.test(path) ? path : `${state.api}${path}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function jpost(path, body){
  const url = /^https?:\/\//i.test(path) ? path : `${state.api}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (state.adminToken) headers.Authorization = `Bearer ${state.adminToken}`;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body || {}) });
  if (!r.ok){
    const txt = await r.text().catch(()=> "");
    throw new Error(`${r.status} ${r.statusText} — ${txt}`);
  }
  return r.json();
}

/* small helper to read dunning log */
async function loadDunningLog(month = "", stage = ""){
  const qs = [];
  if (month) qs.push(`month=${encodeURIComponent(month)}`);
  if (stage) qs.push(`stage=${encodeURIComponent(stage)}`);
  const url = `/reminders/log${qs.length ? `?${qs.join("&")}` : ""}`;

  try{
    const rows = await jget(url);
    const target = $("#dunningLog") || (() => {
      const pre = document.createElement("pre");
      pre.id = "dunningLog";
      pre.className = "scrollbox";
      pre.style.maxHeight = "260px";
      pre.style.whiteSpace = "pre-wrap";
      const anchor = $("#invoiceActions") || document.body;
      anchor.insertAdjacentElement("afterend", pre);
      return pre;
    })();

    target.textContent = rows.length
      ? rows.map(r => `${new Date(r.created_at).toLocaleString("en-KE")} • ${r.stage} • ${r.amount} • ${String(r.invoice_id).slice(0,8)}…`).join("\n")
      : "No dunning log rows.";
    toast("Loaded dunning log");
  }catch(e){
    console.error(e);
    toast("Failed to load dunning log");
  }
}

/* ---- Dunning helper (returns JSON; uses X-Admin-Token) ---- */
async function callDunning(preview){
  if(!state.adminToken){ toast("Set Admin token in Settings first"); return; }
  const url = `${state.api}/cron/dunning?dry_run=${preview?1:0}`;
  const opt = preview
    ? { method:"GET",  headers:{ "X-Admin-Token": state.adminToken } }
    : { method:"POST", headers:{ "X-Admin-Token": state.adminToken } };

  const out = $("#actionMsg"); if(out) out.textContent = preview ? "Running…" : "Applying…";
  const r = await fetch(url, opt);
  const data = await r.json();
  if(out) out.textContent = JSON.stringify(data, null, 2);

  // build human list with WhatsApp links if present
  const wrap = $("#dunningPreview") || (()=>{ const d=document.createElement("div"); d.id="dunningPreview";
    ($("#btnDunningDry")||$("#invoiceActions")||document.body).insertAdjacentElement("afterend", d); return d; })();
  const listBlock = (title, arr)=>{
    if(!arr || !arr.length) return "";
    const items = arr.map(x=>{
      const id = (x.invoice_id||"").slice(0,8)+"…";
      const fee = x.fee ? ` • fee ${Number(x.fee).toLocaleString("en-KE")}` : "";
      const wa  = x.wa ? ` — <a href="${x.wa}" target="_blank">Open in WhatsApp</a>` : "";
      return `<li>Inv ${id} • Lease ${String(x.lease_id||"").slice(0,8)}… • Bal ${Number(x.balance||0).toLocaleString("en-KE")}${fee}${wa}</li>`;
    }).join("");
    return `<h4 style="margin:.75rem 0">${title}</h4><ul>${items}</ul>`;
  };
  wrap.innerHTML =
    listBlock("Day 5 reminders", data.day5) +
    listBlock("Day 10 (late fee stage)", data.day10) +
    listBlock("Overdue (past months)", data.overdue);

  toast(preview ? "Dunning preview ready" : "Dunning applied");
  return data;
}

/* ---------------- tabs ---------------- */
function showTab(name){
  $$(".tab").forEach(a => a.setAttribute("aria-selected", a.dataset.tab===name ? "true" : "false"));
  ["overview","leases","payments","rentroll","balances","whatsapp","settings"].forEach(id=>{
    const p = $(`#tab-${id}`); if(!p) return; p.classList.toggle("hidden", id!==name);
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
  $("#useApi")?.addEventListener("click", ()=>{ const v = $("#apiBase")?.value || DEFAULT_API; setAPI(v); toast("API saved"); });
  $("#openDocs")?.addEventListener("click", ()=> window.open(`${state.api}/docs`, "_blank"));
}

/* ---------------- settings ---------------- */
function wireSettings(){
  $("#saveSettings")?.addEventListener("click", ()=>{ setAPI($("#apiBase2")?.value || DEFAULT_API); setAdminToken($("#adminToken")?.value || ""); toast("Settings saved"); });
  $("#resetSettings")?.addEventListener("click", ()=>{ setAPI(DEFAULT_API); setAdminToken(""); toast("Reset to defaults"); });
}

/* ---------------- invoice actions (ALL buttons, scoped) ---------------- */
function wireActions(){
  // --- Auth ping (admin) ---
  $("#btnAuthPing")?.addEventListener("click", async ()=>{
    if (!state.adminToken){ toast("Set Admin token in Settings first"); return; }
    const url = `${state.api}/admin/ping`;
    const headers = { "X-Admin-Token": state.adminToken };
    $("#actionMsg") && ($("#actionMsg").textContent = "Pinging…");
    try{
      const r = await fetch(url, { method: "GET", headers });
      const data = await r.json().catch(()=> ({}));
      $("#actionMsg") && ($("#actionMsg").textContent = JSON.stringify(data, null, 2));
      toast(r.ok ? "Admin auth OK" : "Unauthorized (check token)");
    }catch(e){
      console.error(e);
      $("#actionMsg") && ($("#actionMsg").textContent = String(e));
      toast("Ping failed");
    }
  });

  // --- helpers to create buttons next to Mark as sent ---
  function ensureBtn(afterSel, id, label){
    if ($(id)) return $(id);
    const anchor = $(afterSel) || $("#btnMarkSent") || $("#invoiceActions");
    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.id = id.replace(/^#/, "");
    btn.textContent = label;
    (anchor || document.body).insertAdjacentElement("afterend", btn);
    return btn;
  }

  // Dunning buttons
  const bDry   = ensureBtn("#btnMarkSent", "#btnDunningDry",  "Dunning (dry run)");
  const bApply = ensureBtn("#btnDunningDry", "#btnDunningGo", "Dunning (apply)");

  async function callDunning(apply){
    if (!state.adminToken){ toast("Set Admin token in Settings first"); return; }
    const url = `${state.api}/cron/dunning?dry_run=${apply ? 0 : 1}`;
    const opt = apply
      ? { method: "POST", headers: { "X-Admin-Token": state.adminToken } }
      : { headers: { "X-Admin-Token": state.adminToken } };

    const out = $("#actionMsg"); if (out) out.textContent = apply ? "Applying…" : "Running…";
    const r = await fetch(url, opt);
    const data = await r.json();

    // pretty JSON
    if (out) out.textContent = JSON.stringify(data, null, 2);

    // human list with WhatsApp links when provided by API
    const wrap = $("#dunningPreview") || (() => {
      const d = document.createElement("div");
      d.id = "dunningPreview";
      const anchor = $("#btnDunningDry") || $("#invoiceActions") || document.body;
      anchor.insertAdjacentElement("afterend", d);
      return d;
    })();

    const listBlock = (title, arr) => {
      if (!arr || !arr.length) return "";
      const items = arr.map(x => {
        const id = (x.invoice_id || "").slice(0,8) + "…";
        const fee = x.fee ? ` • fee ${Number(x.fee).toLocaleString("en-KE")}` : "";
        const wa  = x.wa ? ` — <a href="${x.wa}" target="_blank">Open in WhatsApp</a>` : "";
        return `<li>Inv ${id} • Lease ${String(x.lease_id||"").slice(0,8)}… • Bal ${Number(x.balance||0).toLocaleString("en-KE")}${fee}${wa}</li>`;
      }).join("");
      return `<h4 style="margin:.75rem 0">${title}</h4><ul>${items}</ul>`;
    };

    wrap.innerHTML =
      listBlock("Day 5 reminders", data.day5) +
      listBlock("Day 10 (late fee stage)", data.day10) +
      listBlock("Overdue (past months)", data.overdue);

    toast(apply ? "Dunning applied" : "Preview ready");
  }

  bDry?.addEventListener("click",  () => callDunning(false));
  bApply?.addEventListener("click", () => {
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    if (confirm("Apply late fees and log reminders now?")) callDunning(true);
  });

  // Dunning log buttons
  const bLogRecent = ensureBtn("#btnDunningGo", "#btnDunningLogRecent", "Dunning log (recent)");
  const bLogMonth  = ensureBtn("#btnDunningLogRecent", "#btnDunningLogMonth", "Dunning log (this month)");

  bLogRecent?.addEventListener("click", () => loadDunningLog());
  bLogMonth?.addEventListener("click",  () => loadDunningLog(yyyymm()));
}

/* ---------------- overview KPIs ---------------- */
async function loadOverview(){
  try{
    const month = yyyymm();
    const [L,P,RR,B] = await Promise.all([
      jget("/leases?limit=1000").catch(()=>[]),
      jget(`/payments?month=${month}`).catch(()=>[]),
      jget(`/rent-roll?month=${month}`).catch(()=>[]),
      jget("/balances").catch(()=>[])
    ]);
    $("#kpiLeases")  && ($("#kpiLeases").textContent = (L||[]).length);
    $("#kpiOpen")    && ($("#kpiOpen").textContent   = (RR||[]).filter(r => String(r.status||"").toLowerCase()!=="paid").length);
    const pSum = (P||[]).reduce((s,x)=> s + (Number(x.amount)||0), 0);
    $("#kpiPayments")&& ($("#kpiPayments").textContent = pSum>0 ? pSum.toLocaleString("en-KE") : (P||[]).length);
    const bSum = (B||[]).reduce((s,x)=> s + (Number(x.balance)||0), 0);
    $("#kpiBalance") && ($("#kpiBalance").textContent  = ksh(bSum));
  }catch(e){ console.error(e); toast("Failed to load overview"); }
}

/* ---------------- leases ---------------- */
async function loadLeases(){
  try{
    const rows = await jget("/leases?limit=1000");
    const q = ($("#leaseSearch")?.value || "").toLowerCase().trim();
    const filtered = q ? (rows||[]).filter(r => String(r.tenant||"").toLowerCase().includes(q) || String(r.unit||"").toLowerCase().includes(q)) : (rows||[]);
    state.leasesView = filtered;
    $("#leasesCount") && ($("#leasesCount").textContent = filtered.length);
    if(!filtered.length){ $("#leasesBody") && ($("#leasesBody").innerHTML=""); $("#leasesEmpty")?.classList.remove("hidden"); return; }
    $("#leasesEmpty")?.classList.add("hidden");
    $("#leasesBody").innerHTML = filtered.map(r=>{
      const tenant = r.tenant ?? "—";
      const unit   = r.unit ?? "—";
      const rent   = r.rent_amount ?? r.rent ?? "—";
      const cycle  = r.billing_cycle ?? r.cycle ?? "monthly";
      const dueDay = r.due_day ?? "—";
      const status = r.status ?? "Active";
      const leaseId = r.lease_id || r.id || "";
      const waHref  = leaseId ? `${state.api}/wa_for_lease_redirect?lease_id=${encodeURIComponent(leaseId)}` : null;
      return `<tr>
        <td>${tenant}</td><td>${unit}</td><td>${money(rent)}</td><td>${cycle}</td><td>${dueDay}</td>
        <td><span class="status ${String(status).toLowerCase()==="active"?"ok":"due"}">${status}</span></td>
        <td>${waHref ? `<a href="${waHref}" target="_blank">Open</a>` : "—"}</td>
      </tr>`;
    }).join("");
  }catch(e){ console.error(e); $("#leasesBody") && ($("#leasesBody").innerHTML=""); $("#leasesEmpty")?.classList.remove("hidden"); }
}
$("#reloadLeases")?.addEventListener("click", loadLeases);

/* ---------------- payments ---------------- */
function ensurePaymentsMonthOptions(){
  const sel=$("#paymentsMonth"); if(!sel || sel.options.length) return;
  const now=new Date();
  for(let i=0;i<12;i++){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
    const opt=document.createElement("option"); opt.value=yyyymm(d);
    opt.textContent=d.toLocaleString("en-KE",{month:"short",year:"numeric"}); if(i===0) opt.selected=true; sel.appendChild(opt); }
}
ensurePaymentsMonthOptions();

async function loadPayments(){
  try{
    const month=$("#paymentsMonth")?.value || yyyymm();
    const tQ=($("#paymentsTenant")?.value || "").toLowerCase().trim();
    const sQ=$("#paymentsStatus")?.value || "";
    const rows=await jget(`/payments?month=${month}`);
    const filtered=(rows||[]).filter(r=>{
      const okT=tQ?String(r.tenant||"").toLowerCase().includes(tQ):true;
      const okS=sQ?String(r.status||"")===sQ:true;
      return okT && okS;
    });
    state.paymentsView=filtered;
    $("#paymentsCount") && ($("#paymentsCount").textContent=filtered.length);
    $("#paymentsEmpty")?.classList.toggle("hidden", filtered.length>0);
    $("#paymentsBody") && ($("#paymentsBody").innerHTML=filtered.map(r=>`
      <tr>
        <td>${r.paid_at || r.created_at ? new Date(r.paid_at || r.created_at).toLocaleDateString("en-KE") : "—"}</td>
        <td>${r.tenant ?? "—"}</td>
        <td>${r.method ?? "—"}</td>
        <td class="muted">${r.status ?? "posted"}</td>
        <td style="text-align:right">${money(r.amount)}</td>
      </tr>`).join(""));
    const total=filtered.reduce((s,x)=> s+(Number(x.amount)||0),0);
    const trow=document.createElement("tr");
    trow.innerHTML=`<td colspan="4" style="text-align:right;font-weight:600">Total</td>
                    <td style="text-align:right;font-weight:600">${money(total)}</td>`;
    $("#paymentsBody")?.appendChild(trow);
  }catch(e){ console.error(e); $("#paymentsBody") && ($("#paymentsBody").innerHTML=""); $("#paymentsEmpty")?.classList.remove("hidden"); }
}
$("#applyPayments")?.addEventListener("click", loadPayments);
$("#clearPayments")?.addEventListener("click", ()=>{ $("#paymentsTenant").value=""; $("#paymentsStatus").value=""; loadPayments(); });
$("#paymentsMonth")?.addEventListener("change", loadPayments);

/* ---------------- rent roll ---------------- */
function ensureRentrollMonthOptions(){
  const sel=$("#rentrollMonth"); if(!sel || sel.options.length) return;
  const now=new Date();
  for(let i=0;i<12;i++){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
    const opt=document.createElement("option"); opt.value=yyyymm(d);
    opt.textContent=d.toLocaleString("en-KE",{month:"short",year:"numeric"}); if(i===0) opt.selected=true; sel.appendChild(opt); }
}
ensureRentrollMonthOptions();

async function loadRentroll(){
  try{
    const month=$("#rentrollMonth")?.value || yyyymm();
    const tQ=($("#rentrollTenant")?.value || "").toLowerCase().trim();
    const pQ=($("#rentrollProperty")?.value || "").toLowerCase().trim();
    const rows=await jget(`/rent-roll?month=${month}`);
    const filtered=(rows||[]).filter(r => (tQ ? String(r.tenant||"").toLowerCase().includes(tQ) : true) && (pQ ? String(r.property||"").toLowerCase().includes(pQ) : true));
    state.rentrollView=filtered;
    $("#rentrollCount") && ($("#rentrollCount").textContent=filtered.length);
    $("#rentrollEmpty")?.classList.toggle("hidden", filtered.length>0);
    $("#rentrollBody") && ($("#rentrollBody").innerHTML=filtered.map(r=>`
      <tr>
        <td>${r.property ?? "—"}</td>
        <td>${r.unit ?? "—"}</td>
        <td>${r.tenant ?? "—"}</td>
        <td>${r.period ?? `${r.period_start||"—"} → ${r.period_end||"—"}`}</td>
        <td>${money(r.total_due)}</td>
        <td>${r.status ?? "—"}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>`).join(""));
  }catch(e){ console.error(e); $("#rentrollBody") && ($("#rentrollBody").innerHTML=""); $("#rentrollEmpty")?.classList.remove("hidden"); }
}
$("#applyRentroll")?.addEventListener("click", loadRentroll);
$("#clearRentroll")?.addEventListener("click", ()=>{ $("#rentrollTenant").value=""; $("#rentrollProperty").value=""; loadRentroll(); });

/* ---------------- balances ---------------- */
async function loadBalances(){
  try{
    const rows=await jget("/balances");
    state.balancesView=rows||[];
    if(!rows?.length){ $("#balancesBody") && ($("#balancesBody").innerHTML=""); $("#balancesEmpty")?.classList.remove("hidden"); return; }
    $("#balancesEmpty")?.classList.add("hidden");
    $("#balancesBody") && ($("#balancesBody").innerHTML=rows.map(r=>`
      <tr>
        <td>${r.tenant ?? "—"}</td>
        <td>${(r.lease_id||"").slice(0,8)}…</td>
        <td>${r.period_start ?? "—"} → ${r.period_end ?? "—"}</td>
        <td>${r.status ?? "—"}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>`).join(""));
    const total=rows.reduce((s,x)=> s+(Number(x.balance)||0),0);
    const trow=document.createElement("tr");
    trow.innerHTML=`<td colspan="4" style="text-align:right;font-weight:600">Total</td>
                    <td style="text-align:right;font-weight:600">${money(total)}</td>`;
    $("#balancesBody")?.appendChild(trow);
  }catch(e){ console.error(e); $("#balancesBody") && ($("#balancesBody").innerHTML=""); $("#balancesEmpty")?.classList.remove("hidden"); }
}
$("#reloadBalances")?.addEventListener("click", loadBalances);

/* ---------------- Export CSV buttons ---------------- */
function ensureExportButtons(){
  function addAfter(anchorSel, btnId, label){
    if($(btnId)) return null;
    const anchor=$(anchorSel); if(!anchor) return null;
    const btn=document.createElement("button"); btn.className="btn ghost"; btn.id=btnId.slice(1); btn.textContent=label;
    anchor.insertAdjacentElement("afterend", btn); return btn;
  }
  addAfter("#reloadLeases","#exportLeases","Export CSV");
  addAfter("#applyPayments","#exportPayments","Export CSV");
  addAfter("#applyRentroll","#exportRentroll","Export CSV");
  addAfter("#reloadBalances","#exportBalances","Export CSV");

  $("#exportLeases")?.addEventListener("click", ()=>{
    const cols=[{label:"Tenant",value:r=>r.tenant},{label:"Unit",value:r=>r.unit},{label:"Rent",value:r=>r.rent_amount ?? r.rent},
      {label:"Cycle",value:r=>r.billing_cycle ?? r.cycle},{label:"Due Day",value:r=>r.due_day},{label:"Status",value:r=>r.status},
      {label:"Lease ID",value:r=>r.lease_id || r.id}];
    download(`leases_${yyyymm()}.csv`, toCSV(state.leasesView, cols));
  });
  $("#exportPayments")?.addEventListener("click", ()=>{
    const cols=[{label:"Date",value:r=>r.paid_at || r.created_at},{label:"Tenant",value:r=>r.tenant},{label:"Method",value:r=>r.method},
      {label:"Status",value:r=>r.status ?? "posted"},{label:"Amount",value:r=>r.amount},{label:"Invoice ID",value:r=>r.invoice_id},{label:"Payment ID",value:r=>r.id}];
    download(`payments_${($("#paymentsMonth")?.value || yyyymm())}.csv`, toCSV(state.paymentsView, cols));
  });
  $("#exportRentroll")?.addEventListener("click", ()=>{
    const cols=[{label:"Property",value:r=>r.property},{label:"Unit",value:r=>r.unit},{label:"Tenant",value:r=>r.tenant},
      {label:"Period",value:r=>r.period ?? `${r.period_start||""} → ${r.period_end||""}`},{label:"Total Due",value:r=>r.total_due},
      {label:"Status",value:r=>r.status},{label:"Balance",value:r=>r.balance}];
    download(`rent_roll_${($("#rentrollMonth")?.value || yyyymm())}.csv`, toCSV(state.rentrollView, cols));
  });
  $("#exportBalances")?.addEventListener("click", ()=>{
    const cols=[{label:"Tenant",value:r=>r.tenant},{label:"Lease ID",value:r=>r.lease_id},{label:"Period Start",value:r=>r.period_start},
      {label:"Period End",value:r=>r.period_end},{label:"Status",value:r=>r.status},{label:"Total Due",value:r=>r.total_due},
      {label:"Paid",value:r=>r.paid_amount},{label:"Balance",value:r=>r.balance}];
    download(`balances_${yyyymm()}.csv`, toCSV(state.balancesView, cols));
  });
}

/* ---------------- boot ---------------- */
(function init(){
  setAPI(state.api);
  setAdminToken(state.adminToken);
  $("#yy") && ($("#yy").textContent = new Date().getFullYear());
  wireTabs(); wireHeader(); wireSettings(); wireActions(); ensureExportButtons();
  showTab("overview");
})();
