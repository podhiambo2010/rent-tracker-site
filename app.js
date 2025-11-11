/* ==================== Rent Tracker Dashboard — app.js (cleaned) ==================== */

/* ---------- constants ---------- */
const DEFAULT_API = "https://rent-tracker-api-16i0.onrender.com";

/* ---------- tiny helpers ---------- */
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

/* Messaging helpers */
function getSelectedMonth() {
  return document.querySelector('#monthPicker')?.value || new Date().toISOString().slice(0,7);
}
function fmtMonYearFromISO(isoDate) {
  try {
    const d = new Date(isoDate);
    return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  } catch { return ''; }
}

/* Clear WhatsApp message with full payment options */
function buildWhatsAppURL(msisdn, payload) {
  const kes = n => `KES ${Number(n||0).toLocaleString('en-KE')}`;
  const dueDate = payload.due_date || '';
  const msg = [
    `Hello ${payload.tenant_name},`,
    `Rent for ${payload.unit} — ${payload.period}`,
    ``,
    `Total billed:  ${kes(payload.total_due)}`,
    `Paid so far:   ${kes(payload.paid_to_date)}`,
    `Balance due:   ${kes(payload.amount_due)}`,
    `Due date:      ${dueDate}`,
    ``,
    `PAYMENT OPTIONS (Global Star Investments Limited):`,
    `1) M-Pesa Paybill 522533  | Account: 8035949`,
    `2) M-Pesa Agent/Merchant 522522  | KCB A/C: 1285399528`,
    `3) Bank Transfer / Cheque | KCB, Siaya Branch  | A/C: 1285399528`,
    ``,
    `CASH: Please deposit at the bank to the KCB account above — do not hand cash to individuals.`,
    ``,
    `After payment, kindly share the M-Pesa confirmation SMS or bank slip.`,
    ``,
    `Thank you — Global Star Investments Limited.`
  ].join('\n');
  const clean = String(msisdn||'').replace(/\D/g,'');
  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
}

/* ---------- API helpers ---------- */
async function apiJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API ${r.status}: ${url}`);
  return r.json();
}
async function jget(path){
  const url = /^https?:\/\//i.test(path) ? path : `${state.api}${path}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
async function jpost(path, body, {admin=false}={}){
  const url = /^https?:\/\//i.test(path) ? path : `${state.api}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (admin && state.adminToken) headers["X-Admin-Token"] = state.adminToken;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body||{}) });
  if (!r.ok){
    const txt = await r.text().catch(()=> "");
    throw new Error(`${r.status} ${r.statusText} — ${txt}`);
  }
  return r.json();
}

/* ---------- API consumers ---------- */
async function getRentRollForMonth(ym) {
  return apiJSON(`${state.api}/rent-roll?month=${encodeURIComponent(ym)}&limit=1000`);
}
async function getContactForLease(lease_id) {
  return apiJSON(`${state.api}/contact_for_lease?lease_id=${encodeURIComponent(lease_id)}`);
}
async function getInvoiceIdForLeaseMonth(lease_id, ym) {
  const res = await fetch(`${state.api}/invoices/for_lease_month?lease_id=${encodeURIComponent(lease_id)}&month=${encodeURIComponent(ym)}`);
  if (res.status === 404) return null;
  const json = await res.json();
  return json?.invoice?.id || null; // UUID (string)
}

/* ---------- app state ---------- */
const state = {
  api:        (localStorage.getItem("api_base") || DEFAULT_API).replace(/\/$/,""),
  adminToken: localStorage.getItem("admin_token") || "",
  leasesView: [], paymentsView: [], rentrollView: [], balancesView: []
};

/* ---------- toast ---------- */
function toast(msg, ms=2200){
  const el = $("#actionMsg");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.style.opacity = 1;
  setTimeout(()=>{ el.style.opacity = 0; }, ms);
}

/* ---------- environment setters ---------- */
function setAPI(v){
  state.api = (v||DEFAULT_API).trim().replace(/\/$/,"");
  localStorage.setItem("api_base", state.api);
  $("#apiBase")  && ($("#apiBase").value  = state.api);
  $("#apiBase2") && ($("#apiBase2").value = state.api);
}
function setAdminToken(v){
  state.adminToken = v || "";
  localStorage.setItem("admin_token", state.adminToken);
  $("#adminToken") && ($("#adminToken").value = state.adminToken);
}

/* =================================================================== */
/*                           DUNNING / LOG UI                           */
/* =================================================================== */
let _logBusy = false, _logCssInjected = false;

function _injectLogCSS(){
  if (_logCssInjected) return;
  const css = `
  #dunningLogWrap{ margin:24px 0 0 }
  #dunningLogWrap .logbar{ display:flex; gap:.5rem; align-items:center; margin-bottom:.5rem; font:600 13px system-ui,-apple-system,Segoe UI,Roboto,Arial; }
  #dunningLog{ max-height:360px; overflow:auto; white-space:pre; background:#0b1020; color:#e6edf3; border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:12px; box-shadow:0 8px 28px rgba(0,0,0,.45) }
  .log-expanded #dunningLog{ max-height:70vh; }
  `;
  const s = document.createElement("style"); s.textContent = css;
  document.head.appendChild(s); _logCssInjected = true;
}
function _findInvoicePanel(){
  const anchor = document.getElementById("invoiceActions");
  if (!anchor) return null;
  let el = anchor;
  for (let i=0; i<5 && el; i++){
    if (el.classList && el.classList.contains("panel")) return el;
    el = el.parentElement;
  }
  return anchor;
}
async function loadDunningLog(month="", stage=""){
  if (_logBusy) return; _logBusy = true; _injectLogCSS();
  const qs = [];
  if (month) qs.push(`month=${encodeURIComponent(month)}`);
  if (stage) qs.push(`stage=${encodeURIComponent(stage)}`);
  qs.push("limit=200");
  const url = `${state.api}/reminders/log${qs.length?`?${qs.join("&")}`:""}`;

  const panel = _findInvoicePanel();
  let wrap = document.getElementById("dunningLogWrap");
  if (!wrap){
    wrap = document.createElement("div");
    wrap.id = "dunningLogWrap";
    wrap.innerHTML = `
      <div class="logbar">
        <span>Dunning log</span>
        <button id="logExpand" class="btn ghost" type="button">Expand</button>
        <button id="logCollapse" class="btn ghost" type="button">Collapse</button>
        <button id="logClear" class="btn ghost" type="button">Clear</button>
      </div>
      <pre id="dunningLog"></pre>
    `;
    if (panel?.parentElement){
      panel.parentElement.insertBefore(wrap, panel.nextSibling);
    } else {
      (document.querySelector("#invoiceActions") || document.body).insertAdjacentElement("afterend", wrap);
    }
    wrap.querySelector("#logCollapse").addEventListener("click", ()=>{
      const p = $("#dunningLog"); if (!p) return;
      const hidden = p.style.display === "none";
      p.style.display = hidden ? "block" : "none";
      wrap.querySelector("#logCollapse").textContent = hidden ? "Collapse" : "Expand";
    });
    wrap.querySelector("#logClear").addEventListener("click", ()=>{ const p=$("#dunningLog"); if(p) p.textContent=""; });
    wrap.querySelector("#logExpand").addEventListener("click", ()=>{
      wrap.classList.toggle("log-expanded");
      wrap.querySelector("#logExpand").textContent = wrap.classList.contains("log-expanded") ? "Shrink" : "Expand";
    });
  }

  const pre = $("#dunningLog");
  pre.style.display = "block";
  pre.textContent = "Loading dunning log…";

  try{
    const rows = await jget(url);
    if (!rows?.length){
      pre.textContent = "No dunning log rows.";
    } else {
      const lines = rows.map(r=>{
        const ts = new Date(r.created_at).toLocaleString("en-KE");
        const inv = String(r.invoice_id||"").slice(0,8)+"…";
        const lea = String(r.lease_id||"").slice(0,8)+"…";
        const amt = Number(r.amount||0).toLocaleString("en-KE");
        return `${ts} • ${r.stage} • KSh ${amt} • inv ${inv} • lease ${lea}`;
      });
      pre.textContent = lines.join("\n");
    }
    toast("Loaded dunning log");
  }catch(e){
    console.error(e);
    pre.textContent = `Failed to load dunning log: ${e}`;
    toast("Failed to load dunning log");
  }finally{
    _logBusy = false;
  }
}

async function callDunning(preview){
  if(!state.adminToken){ toast("Set Admin token in Settings first"); return; }

  // ensure preview container exists
  let wrap = document.getElementById("dunningPreview");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "dunningPreview";
    wrap.style.marginTop = "12px";
    const anchor = document.getElementById("invoiceActions") || document.body;
    anchor.insertAdjacentElement("afterend", wrap);
  }
  wrap.innerHTML = `<pre id="dunningOut" style="white-space:pre-wrap;background:#0b1020;color:#e6edf3;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:12px;"></pre>`;
  const out = document.getElementById("dunningOut");
  out.textContent = preview ? "Running dunning (preview)..." : "Applying dunning...";

  try {
    const url = `${state.api}/cron/dunning?dry_run=${preview?1:0}`;
    const opt = preview
      ? { method:"GET",  headers:{ "X-Admin-Token": state.adminToken } }
      : { method:"POST", headers:{ "X-Admin-Token": state.adminToken } };

    const r = await fetch(url, opt);
    const data = await r.json();

    const list = (title, arr) => {
      if (!arr?.length) return `\n${title}: 0`;
      const items = arr.map(x => {
        const inv = String(x.invoice_id||"").slice(0,8)+"…";
        const lea = String(x.lease_id||"").slice(0,8)+"…";
        const bal = Number(x.balance||0).toLocaleString("en-KE");
        const fee = x.fee ? ` | fee ${Number(x.fee).toLocaleString("en-KE")}` : "";
        const wa  = x.wa ? ` | WA: ${x.wa}` : "";
        return ` • inv ${inv} | lease ${lea} | bal KES ${bal}${fee}${wa}`;
      }).join("\n");
      return `\n${title}: ${arr.length}\n${items}`;
    };

    out.textContent =
      `Dunning preview ${data.dry_run ? "(dry run)" : "(applied)"}\n` +
      `Date: ${data.today}\nLate fee: ${data.late_fee_pct} (min KES ${data.late_fee_min_kes})\n` +
      list("Day 5 reminders", data.day5) +
      list("Day 10 (late fee stage)", data.day10) +
      list("Overdue (past months)", data.overdue);

    toast(preview ? "Dunning preview ready" : "Dunning applied");
  } catch (e) {
    console.error(e);
    out.textContent = `Failed to run dunning: ${e}`;
    toast("Dunning request failed");
  }
}

/* =================================================================== */
/*                                TABS                                  */
/* =================================================================== */
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

/* =================================================================== */
/*                              HEADER                                  */
/* =================================================================== */
function wireHeader(){
  $("#useApi")?.addEventListener("click", ()=>{
    const v = $("#apiBase")?.value || DEFAULT_API;
    setAPI(v); toast("API saved");
  });
  $("#openDocs")?.addEventListener("click", ()=> window.open(`${state.api}/docs`, "_blank"));
}

/* =================================================================== */
/*                             SETTINGS                                 */
/* =================================================================== */
function wireSettings(){
  $("#saveSettings")?.addEventListener("click", ()=>{
    setAPI($("#apiBase2")?.value || DEFAULT_API);
    setAdminToken($("#adminToken")?.value || "");
    toast("Settings saved");
  });
  $("#resetSettings")?.addEventListener("click", ()=>{
    setAPI(DEFAULT_API);
    setAdminToken("");
    toast("Reset to defaults");
  });
}

/* =================================================================== */
/*                        INVOICE ACTIONS (panel)                       */
/* =================================================================== */
function wireActions(){
  // Ensure a <pre id="actionMsg"> exists just below the actions panel
  if (!$("#actionMsg")){
    const pre = document.createElement("pre");
    pre.id = "actionMsg";
    pre.style.whiteSpace = "pre-wrap";
    const anchor = $("#invoiceActions") || $(".panel") || document.body;
    anchor.insertAdjacentElement("afterend", pre);
  }

  // Single "Mark as sent" (by typing UUID)
  $("#btnMarkSent")?.addEventListener("click", async ()=>{
    const invoice_id = ($("#invoiceIdInput")?.value || "").trim();
    if (!invoice_id) return toast("Enter an invoice_id first");
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    $("#actionMsg").textContent = "Marking as sent…";
    try{
      const data = await jpost("/invoices/mark_sent", { invoice_id }, {admin:true});
      $("#actionMsg").textContent = JSON.stringify(data, null, 2);
      toast("Stamped as sent");
    }catch(e){
      console.error(e);
      $("#actionMsg").textContent = String(e);
      toast("Request failed");
    }
  });

  // Dunning helpers
  function ensureButton(afterSel, id, label){
    if ($(id)) return $(id);
    const anchor = $(afterSel) || $("#invoiceActions") || document.body;
    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.id = id.replace(/^#/, "");
    btn.textContent = label;
    anchor.insertAdjacentElement("afterend", btn);
    return btn;
  }
  const bDry   = ensureButton("#btnMarkSent",   "#btnDunningDry",       "Dunning (dry run)");
  const bApply = ensureButton("#btnDunningDry", "#btnDunningApply",     "Dunning (apply)");
  const bLogR  = ensureButton("#btnDunningApply","#btnDunningLogRecent","Dunning log (recent)");
  const bLogM  = ensureButton("#btnDunningLogRecent","#btnDunningLogMonth","Dunning log (this month)");

  bDry?.addEventListener("click",  ()=> callDunning(true));
  bApply?.addEventListener("click", ()=>{ if (!state.adminToken) return toast("Set Admin token in Settings first"); if (confirm("Apply late fees and log reminders now?")) callDunning(false); });
  bLogR?.addEventListener("click", ()=> loadDunningLog());
  bLogM?.addEventListener("click", ()=> loadDunningLog(yyyymm()));

  // Auth ping
  const authBtn =
    $("#btnHealth") ||
    Array.from(document.querySelectorAll("button"))
      .find(b => (b.textContent||"").trim().toLowerCase() === "auth ping");

  authBtn?.addEventListener("click", async ()=>{
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    const out = $("#actionMsg"); if (out) out.textContent = "Pinging…";
    try{
      const r = await fetch(`${state.api}/admin/ping`, {
        headers: {
          "X-Admin-Token": state.adminToken,
          "Authorization": `Bearer ${state.adminToken}`
        }
      });
      const data = await r.json().catch(()=> ({}));
      if (out) out.textContent = JSON.stringify(data, null, 2);
      toast(r.ok ? "Admin auth OK" : `Unauthorized (${r.status})`);
    }catch(e){
      if (out) out.textContent = String(e);
      toast("Ping failed");
    }
  });
}

/* =================================================================== */
/*                             OVERVIEW                                 */
/* =================================================================== */
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

/* =================================================================== */
/*                               LEASES                                 */
/* =================================================================== */
async function loadLeases(){
  try{
    const rows = await jget("/leases?limit=1000");
    const q = ($("#leaseSearch")?.value || "").toLowerCase().trim();
    const filtered = q ? (rows||[]).filter(r => String(r.tenant||"").toLowerCase().includes(q) || String(r.unit||"").toLowerCase().includes(q)) : (rows||[]);

    state.leasesView = filtered;
    $("#leasesCount") && ($("#leasesCount").textContent = filtered.length);
    if(!filtered.length){ $("#leasesBody").innerHTML=""; $("#leasesEmpty")?.classList.remove("hidden"); return; }
    $("#leasesEmpty")?.classList.add("hidden");

    $("#leasesBody").innerHTML = filtered.map(r=>{
      const tenant = r.tenant ?? "—";
      const unit   = r.unit ?? "—";
      const rent   = r.rent_amount ?? r.rent ?? "—";
      const cycle  = r.billing_cycle ?? r.cycle ?? "monthly";
      const dueDay = r.due_day ?? "—";
      const status = r.lease_status ?? r.status ?? "Active";
      const leaseId = r.lease_id || r.id || "";
      const waHref  = leaseId ? `${state.api}/wa_for_lease_redirect?lease_id=${encodeURIComponent(leaseId)}` : null;
      return `<tr>
        <td>${tenant}</td><td>${unit}</td><td>${money(rent)}</td><td>${cycle}</td><td>${dueDay}</td>
        <td><span class="status ${String(status).toLowerCase()==="active"?"ok":"due"}">${status}</span></td>
        <td>${waHref ? `<a href="${waHref}" target="_blank">Open</a>` : "—"}</td>
      </tr>`;
    }).join("");
  }catch(e){
    console.error(e);
    $("#leasesBody").innerHTML=""; $("#leasesEmpty")?.classList.remove("hidden");
  }
}
$("#reloadLeases")?.addEventListener("click", loadLeases);

/* =================================================================== */
/*                              PAYMENTS                                */
/* =================================================================== */
function ensurePaymentsMonthOptions(){
  const sel=$("#paymentsMonth"); if(!sel || sel.options.length) return;
  const now=new Date();
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
    const opt=document.createElement("option"); opt.value=yyyymm(d);
    opt.textContent=d.toLocaleString("en-KE",{month:"short",year:"numeric"});
    if(i===0) opt.selected=true;
    sel.appendChild(opt);
  }
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

    $("#paymentsBody").innerHTML=filtered.map(r=>`
      <tr>
        <td>${r.paid_at || r.created_at ? new Date(r.paid_at || r.created_at).toLocaleDateString("en-KE") : "—"}</td>
        <td>${r.tenant ?? "—"}</td>
        <td>${r.method ?? "—"}</td>
        <td class="muted">${r.status ?? "posted"}</td>
        <td style="text-align:right">${money(r.amount)}</td>
      </tr>`).join("");

    const total=filtered.reduce((s,x)=> s+(Number(x.amount)||0),0);
    const trow=document.createElement("tr");
    trow.innerHTML=`<td colspan="4" style="text-align:right;font-weight:600">Total</td>
                    <td style="text-align:right;font-weight:600">${money(total)}</td>`;
    $("#paymentsBody")?.appendChild(trow);
  }catch(e){
    console.error(e);
    $("#paymentsBody").innerHTML=""; $("#paymentsEmpty")?.classList.remove("hidden");
  }
}
$("#applyPayments")?.addEventListener("click", loadPayments);
$("#clearPayments")?.addEventListener("click", ()=>{ $("#paymentsTenant").value=""; $("#paymentsStatus").value=""; loadPayments(); });
$("#paymentsMonth")?.addEventListener("change", loadPayments);

/* =================================================================== */
/*                              RENT ROLL                               */
/* =================================================================== */
function ensureRentrollMonthOptions(){
  const sel=$("#rentrollMonth"); if(!sel || sel.options.length) return;
  const now=new Date();
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
    const opt=document.createElement("option"); opt.value=yyyymm(d);
    opt.textContent=d.toLocaleString("en-KE",{month:"short",year:"numeric"});
    if(i===0) opt.selected=true;
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
      (pQ ? String(r.property_name||r.property||"").toLowerCase().includes(pQ) : true)
    );

    state.rentrollView = filtered;
    $("#rentrollCount") && ($("#rentrollCount").textContent = filtered.length);
    $("#rentrollEmpty")?.classList.toggle("hidden", filtered.length > 0);

    $("#rentrollBody").innerHTML = filtered.map(r => {
      const periodLabel = r.period ?? `${r.period_start||"—"} → ${r.period_end||"—"}`;
      return `
        <tr>
          <td>${r.property_name ?? r.property ?? "—"}</td>
          <td>${r.unit_code ?? r.unit ?? "—"}</td>
          <td>${r.tenant ?? "—"}</td>
          <td>${periodLabel}</td>
          <td>${money(r.total_due)}</td>
          <td class="status-cell">${r.status ?? "—"}</td>
          <td style="text-align:right">${money(r.balance)}</td>
          <td>
            <button class="btn ghost" data-action="wa"   data-lease="${r.lease_id}">WhatsApp</button>
            <button class="btn ghost" data-action="mark" data-lease="${r.lease_id}" data-month="${month}">Mark sent</button>
          </td>
        </tr>`;
    }).join("");

  }catch(e){
    console.error(e);
    $("#rentrollBody").innerHTML = "";
    $("#rentrollEmpty")?.classList.remove("hidden");
  }
}

/* Delegate clicks for Rent Roll actions */
$("#rentrollBody")?.addEventListener("click", async (ev)=>{
  const btn = ev.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const leaseId = btn.dataset.lease;
  const month   = btn.dataset.month;

  if (action === "wa"){
    window.open(`${state.api}/wa_for_lease_redirect?lease_id=${encodeURIComponent(leaseId)}`, "_blank");
    return;
  }

  if (action === "mark"){
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    btn.disabled = true; const prev = btn.textContent; btn.textContent = "…";
    try{
      const invoiceId = await getInvoiceIdForLeaseMonth(leaseId, month);
      if (!invoiceId){ toast("No invoice found for that lease/month"); return; }
      const res = await jpost("/invoices/mark_sent", { invoice_id: invoiceId }, {admin:true});
      const row = btn.closest("tr");
      row?.querySelector(".status-cell")?.replaceChildren(document.createTextNode(res?.invoice?.status || "sent"));
      toast("Marked sent");
    }catch(e){
      toast(`Failed: ${e.message||e}`);
    }finally{
      btn.disabled = false; btn.textContent = prev;
    }
  }
});

/* =================================================================== */
/*                              BALANCES                                */
/* =================================================================== */
async function loadBalances(){
  try{
    const rows=await jget("/balances");
    state.balancesView=rows||[];
    if(!rows?.length){ $("#balancesBody").innerHTML=""; $("#balancesEmpty")?.classList.remove("hidden"); return; }
    $("#balancesEmpty")?.classList.add("hidden");
    $("#balancesBody").innerHTML=rows.map(r=>`
      <tr>
        <td>${r.tenant ?? "—"}</td>
        <td>${(r.lease_id||"").slice(0,8)}…</td>
        <td>${r.period_start ?? "—"} → ${r.period_end ?? "—"}</td>
        <td>${r.status ?? "—"}</td>
        <td style="text-align:right">${money(r.balance)}</td>
      </tr>`).join("");
    const total=rows.reduce((s,x)=> s+(Number(x.balance)||0),0);
    const trow=document.createElement("tr");
    trow.innerHTML=`<td colspan="4" style="text-align:right;font-weight:600">Total</td>
                    <td style="text-align:right;font-weight:600">${money(total)}</td>`;
    $("#balancesBody")?.appendChild(trow);
  }catch(e){
    console.error(e);
    $("#balancesBody").innerHTML=""; $("#balancesEmpty")?.classList.remove("hidden");
  }
}
$("#reloadBalances")?.addEventListener("click", loadBalances);

/* =================================================================== */
/*                           EXPORT BUTTONS                             */
/* =================================================================== */
function ensureExportButtons(){
  function addAfter(anchorSel, id, label){
    if ($(id)) return null;
    const anchor=$(anchorSel); if(!anchor) return null;
    const btn=document.createElement("button");
    btn.className="btn ghost"; btn.id=id.slice(1); btn.textContent=label;
    anchor.insertAdjacentElement("afterend", btn);
    return btn;
  }
  addAfter("#reloadLeases","#exportLeases","Export CSV");
  addAfter("#applyPayments","#exportPayments","Export CSV");
  addAfter("#applyRentroll","#exportRentroll","Export CSV");
  addAfter("#reloadBalances","#exportBalances","Export CSV");

  $("#exportLeases")?.addEventListener("click", ()=>{
    const cols=[{label:"Tenant",value:r=>r.tenant},{label:"Unit",value:r=>r.unit},{label:"Rent",value:r=>r.rent_amount ?? r.rent},
      {label:"Cycle",value:r=>r.billing_cycle ?? r.cycle},{label:"Due Day",value:r=>r.due_day},{label:"Status",value:r=>r.lease_status ?? r.status},
      {label:"Lease ID",value:r=>r.lease_id || r.id}];
    download(`leases_${yyyymm()}.csv`, toCSV(state.leasesView, cols));
  });
  $("#exportPayments")?.addEventListener("click", ()=>{
    const cols=[{label:"Date",value:r=>r.paid_at || r.created_at},{label:"Tenant",value:r=>r.tenant},{label:"Method",value:r=>r.method},
      {label:"Status",value:r=>r.status ?? "posted"},{label:"Amount",value:r=>r.amount},{label:"Invoice ID",value:r=>r.invoice_id},{label:"Payment ID",value:r=>r.id}];
    download(`payments_${($("#paymentsMonth")?.value || yyyymm())}.csv`, toCSV(state.paymentsView, cols));
  });
  $("#exportRentroll")?.addEventListener("click", ()=>{
    const cols=[{label:"Property",value:r=>r.property_name ?? r.property},{label:"Unit",value:r=>r.unit_code ?? r.unit},{label:"Tenant",value:r=>r.tenant},
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

/* =================================================================== */
/*                     BIG BUTTONS (Overview panel)                     */
/* =================================================================== */
$("#btnSendAll")?.addEventListener("click", async () => {
  const ym = getSelectedMonth();
  try {
    const rows = await getRentRollForMonth(ym);
    const dueRows = rows.filter(r => Number(r.balance || 0) > 0);
    if (!dueRows.length) { alert('Nothing to send for ' + ym); return; }

    let opened = 0, skippedNoPhone = 0;
    for (const r of dueRows) {
      const contact = await getContactForLease(r.lease_id);
      const phone = (contact?.phone || '').trim();
      if (!phone) { skippedNoPhone++; continue; }
      const url = buildWhatsAppURL(phone, {
        tenant_name: contact?.tenant || r.tenant || 'Tenant',
        unit: r.unit_code || r.unit || 'Unit',
        period: fmtMonYearFromISO(r.period_start),
        total_due: Number(r.total_due || 0),
        paid_to_date: Number(r.paid_amount || 0),
        amount_due: Number(r.balance || r.total_due || 0),
        due_date: r.due_date ? new Date(r.due_date).toLocaleDateString('en-KE', { day:'2-digit', month:'short', year:'numeric' }) : ''
      });
      window.open(url, '_blank');
      opened++;
      await new Promise(res => setTimeout(res, 600));
    }
    alert(`Opened ${opened} WhatsApp chats. Skipped ${skippedNoPhone} (no phone).`);
  } catch (e) {
    console.error(e);
    alert('Send All failed: ' + e.message);
  }
});

$("#btnMarkSelected")?.addEventListener("click", async () => {
  const ym = getSelectedMonth();
  try {
    const rows = await getRentRollForMonth(ym);
    const dueRows = rows.filter(r => Number(r.balance || 0) > 0);

    const invoiceIds = [];
    for (const r of dueRows) {
      const id = await getInvoiceIdForLeaseMonth(r.lease_id, ym);
      if (id) invoiceIds.push(id);
      await new Promise(res => setTimeout(res, 120));
    }
    if (!invoiceIds.length) { alert('No invoices found to mark for ' + ym); return; }

    const res = await fetch(`${state.api}/invoices/mark_sent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice_ids: invoiceIds,
        sent_via: 'whatsapp',
        sent_to: 'tenant',
        sent_at: new Date().toISOString()
      })
    });
    if (!res.ok) throw new Error('API returned ' + res.status);
    const out = await res.json();
    alert(`Marked as sent: ${out.updated?.length || 0} invoices.`);
    if (typeof window.refreshGrid === 'function') await window.refreshGrid();
  } catch (e) {
    console.error(e);
    alert('Mark Sent failed: ' + e.message);
  }
});

/* ---------- Make each table body scroll (no DOM moves) ---------- */
function tagScrollingTables(){
  ["leasesBody","paymentsBody","rentrollBody","balancesBody"].forEach(id=>{
    const tb = document.getElementById(id);
    if(!tb) return;
    const table = tb.closest("table");
    if(table) table.classList.add("scrolling-table");
  });
}

/* =================================================================== */
/*                                 BOOT                                 */
/* =================================================================== */
(function init(){
  setAPI(state.api);
  setAdminToken(state.adminToken);
  $("#yy") && ($("#yy").textContent = new Date().getFullYear());

  wireTabs(); wireHeader(); wireSettings(); wireActions(); ensureExportButtons();

  tagScrollingTables();   // <-- per-table scrollers with sticky headers
  showTab("overview");
})();
