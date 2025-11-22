/* ==================== Rent Tracker Dashboard — app.js (balances & KPIs fixed) ==================== */

/* ---------- constants ---------- */
const DEFAULT_API = "https://rent-tracker-api-16i0.onrender.com";

/* ---------- tiny helpers ---------- */
const $  = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

// Nicely format KES amounts (works with strings or numbers)
const formatMoney = (value) => {
  if (value === null || value === undefined) return "0.00";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const yyyymm = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const money = (n) =>
  n == null ? "—" : `Ksh ${Number(n || 0).toLocaleString("en-KE")}`;

const ksh = (n) =>
  Number(n || 0).toLocaleString("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  });

/* ---------- app state ---------- */
const state = {
  api: (localStorage.getItem("api_base") || DEFAULT_API).replace(/\/$/, ""),
  adminToken: localStorage.getItem("admin_token") || "",
  leasesView: [],
  paymentsView: [],
  rentrollView: [],
  balancesView: [],
};

/* ---------- generic API helper (uses current base + admin token) ---------- */
async function api(path, options = {}) {
  const base = (state.api || DEFAULT_API).replace(/\/$/, "");
  const url = base + path;

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (state.adminToken) {
    headers["X-Admin-Token"] = state.adminToken.trim();
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("API error:", data || res.statusText);
    throw new Error((data && data.error) || res.statusText);
  }

  return data;
}

/* ---------- CSV helpers ---------- */
const csvEscape = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCSV(rows, cols) {
  if (!rows?.length) return "";
  const head = cols.map((c) => csvEscape(c.label)).join(",");
  const body = rows
    .map((r) =>
      cols
        .map((c) =>
          csvEscape(
            typeof c.value === "function" ? c.value(r) : r[c.value]
          )
        )
        .join(",")
    )
    .join("\n");
  return head + "\n" + body;
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

/* ---------- month + messaging helpers ---------- */

// Shared month for Overview + Balances + metrics
function getSelectedMonth() {
  return $("#monthPicker")?.value || new Date().toISOString().slice(0, 7);
}

function fmtMonYearFromISO(isoDate) {
  try {
    const d = new Date(isoDate);
    return d.toLocaleString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function fmtKes(n) {
  const num = Number(n || 0);
  return num.toLocaleString("en-KE", { maximumFractionDigits: 0 });
}

// General WhatsApp link builder used by:
// - Rent Roll "WhatsApp" buttons
// - Overview "Send All" button
// - DIY WhatsApp tab
function buildWhatsAppURL(phone, ctx = {}) {
  const msisdn = String(phone || "").replace(/[^\d]/g, "");
  if (!msisdn) return "";

  const tenant = ctx.tenant_name || "Tenant";
  const unit   = ctx.unit || "your unit";
  const period = ctx.period || "";

  const rent = Number(
    ctx.rent ??
    ctx.subtotal_rent ??
    0
  );
  const late = Number(
    ctx.late_fees ??
    ctx.late ??
    0
  );

  // Single source of truth for the monthly invoice total
  const total = Number(
    ctx.total_due ??
    (rent + late)
  );

  const paid = Number(ctx.paid_to_date ?? 0);

  // Overall outstanding (for that month or overall, depending on ctx)
  const balance = Number(
    ctx.amount_due ??
    ctx.balance ??
    (total - paid)
  );

  const dueDate = ctx.due_date || "";

  const lines = [
    `Hello ${tenant},`,
    "",
    `Rent invoice for ${period || "(no period)"} (${unit})`,
    "",
    `Base rent: KES ${fmtKes(rent)}`,
    `Late fees: KES ${fmtKes(late)}`,
    `Total for this month: KES ${fmtKes(total)}`,
  ];

  if (paid) {
    lines.push(`Paid to date: KES ${fmtKes(paid)}`);
  }

  lines.push(`Balance outstanding: KES ${fmtKes(balance)}`);

  if (dueDate) {
    lines.push(`Due date: ${dueDate}`);
  }

  lines.push("", "Kindly clear your balance as soon as possible. Thank you.");

  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${msisdn}?text=${text}`;
}

/* ---------- JSON GET/POST helpers (using state.api directly) ---------- */
async function jget(path) {
  const url = /^https?:\/\//i.test(path) ? path : `${state.api}${path}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function jpost(path, body, { admin = false } = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${state.api}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (admin && state.adminToken) headers["X-Admin-Token"] = state.adminToken;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} — ${txt}`);
  }
  return r.json();
}

/* ---------- API consumers ---------- */
async function getRentRollForMonth(ym) {
  return jget(`/rent-roll?month=${encodeURIComponent(ym)}&limit=1000`);
}
async function getContactForLease(lease_id) {
  return jget(`/contact_for_lease?lease_id=${encodeURIComponent(lease_id)}`);
}
async function getInvoiceIdForLeaseMonth(lease_id, ym) {
  const res = await fetch(
    `${state.api}/invoices/for_lease_month?lease_id=${encodeURIComponent(
      lease_id
    )}&month=${encodeURIComponent(ym)}`
  );
  if (res.status === 404) return null;
  const json = await res.json();
  return json?.invoice?.id || null;
}

/* ---------- toast ---------- */
function toast(msg, ms = 2200) {
  const el = $("#actionMsg");
  if (!el) {
    alert(msg);
    return;
  }
  el.textContent = msg;
  el.style.opacity = 1;
  setTimeout(() => {
    el.style.opacity = 0;
  }, ms);
}

/* ==================== OUTSTANDING BY TENANT (TILE) ==================== */

// Renders the little table under "Outstanding by tenant"
function renderOutstanding(rows) {
  const body = document.getElementById("outstandingBody");
  const empty = document.getElementById("outstandingEmpty");
  if (!body) return;

  // Positive balances only, sorted DESC
  const list = (rows || [])
    .filter(
      (r) =>
        Number(
          r.balance_total ?? r.balance ?? r.outstanding ?? r.amount_due ?? 0
        ) > 0
    )
    .sort(
      (a, b) =>
        Number(
          b.balance_total ?? b.balance ?? b.outstanding ?? b.amount_due ?? 0
        ) -
        Number(
          a.balance_total ?? a.balance ?? a.outstanding ?? a.amount_due ?? 0
        )
    );

  body.innerHTML = list
    .map((x) => {
      const name = x.tenant || x.tenant_name || x.tenant_name_text || "—";
      const bal =
        x.balance_total ?? x.balance ?? x.outstanding ?? x.amount_due ?? 0;
      return `
        <tr>
          <td>${name}</td>
          <td style="text-align:right">Ksh ${Number(bal || 0).toLocaleString(
            "en-KE"
          )}</td>
        </tr>`;
    })
    .join("");

  if (empty) empty.classList.toggle("hidden", list.length > 0);
}

async function loadOutstandingByTenant() {
  try {
    const rows = await fetchOutstandingRows();
    renderOutstanding(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error("Failed to load outstanding-by-tenant", err);
    renderOutstanding([]);
  }
}

document
  .getElementById("reloadOutstanding")
  ?.addEventListener("click", () => {
    loadOutstandingByTenant().catch(console.error);
  });

/* ============================== DUNNING ============================== */
let _logBusy = false;
async function loadDunningLog(month = "", stage = "") {
  if (_logBusy) return;
  _logBusy = true;
  const qs = [];
  if (month) qs.push(`month=${encodeURIComponent(month)}`);
  if (stage) qs.push(`stage=${encodeURIComponent(stage)}`);
  qs.push("limit=200");
  const url = `${state.api}/reminders/log${
    qs.length ? `?${qs.join("&")}` : ""
  }`;
  let pre = $("#dunningLog");
  if (!pre) {
    const wrap = document.createElement("div");
    wrap.id = "dunningLogWrap";
    wrap.innerHTML = `
      <div class="bar-flex" style="margin:8px 0;">
        <span class="chip">Dunning log</span>
        <button id="logReload" class="btn ghost">Reload</button>
      </div>
      <pre id="dunningLog"></pre>
    `;
    ($("#invoiceActions") || document.body).insertAdjacentElement(
      "afterend",
      wrap
    );
    $("#logReload")?.addEventListener("click", () => loadDunningLog());
    pre = $("#dunningLog");
  }
  pre.textContent = "Loading dunning log…";
  try {
    const rows = await jget(url);
    pre.textContent = (rows?.length
      ? rows
          .map((r) => {
            const ts = new Date(r.created_at).toLocaleString("en-KE");
            const inv = String(r.invoice_id || "").slice(0, 8) + "…";
            const lea = String(r.lease_id || "").slice(0, 8) + "…";
            const amt = Number(r.amount || 0).toLocaleString("en-KE");
            return `${ts} • ${r.stage} • KSh ${amt} • inv ${inv} • lease ${lea}`;
          })
          .join("\n")
      : "No dunning log rows.");
    toast("Loaded dunning log");
  } catch (e) {
    pre.textContent = `Failed to load: ${e}`;
    toast("Failed to load dunning log");
  } finally {
    _logBusy = false;
  }
}

async function callDunning(preview) {
  if (!state.adminToken) {
    toast("Set Admin token in Settings first");
    return;
  }
  let pre = $("#dunningOut");
  if (!pre) {
    const box = document.createElement("pre");
    box.id = "dunningOut";
    ($("#invoiceActions") || document.body).insertAdjacentElement(
      "afterend",
      box
    );
    pre = box;
  }
  pre.textContent = preview
    ? "Running dunning (preview)..."
    : "Applying dunning...";
  try {
    const url = `${state.api}/cron/dunning?dry_run=${preview ? 1 : 0}`;
    const opt = preview
      ? { method: "GET", headers: { "X-Admin-Token": state.adminToken } }
      : { method: "POST", headers: { "X-Admin-Token": state.adminToken } };
    const r = await fetch(url, opt);
    const data = await r.json();
    const list = (title, arr) =>
      !arr?.length
        ? `\n${title}: 0`
        : `\n${title}: ${arr.length}\n` +
          arr
            .map((x) => {
              const inv = String(x.invoice_id || "").slice(0, 8) + "…";
              const lea = String(x.lease_id || "").slice(0, 8) + "…";
              const bal = Number(x.balance || 0).toLocaleString("en-KE");
              const fee = x.fee
                ? ` | fee ${Number(x.fee).toLocaleString("en-KE")}`
                : "";
              const wa = x.wa ? ` | WA: ${x.wa}` : "";
              return ` • inv ${inv} | lease ${lea} | bal KES ${bal}${fee}${wa}`;
            })
            .join("\n");
    pre.textContent =
      `Dunning ${data.dry_run ? "(dry run)" : "(applied)"}\nDate: ${
        data.today
      }\nLate fee: ${data.late_fee_pct} (min KES ${data.late_fee_min_kes})` +
      list("Day 5 reminders", data.day5) +
      list("Day 10 (late fee stage)", data.day10) +
      list("Overdue (past months)", data.overdue);
    toast(preview ? "Dunning preview ready" : "Dunning applied");
  } catch (e) {
    pre.textContent = `Failed: ${e}`;
    toast("Dunning request failed");
  }
}

/* =============================== TABS =============================== */
function showTab(name) {
  $$(".tab").forEach((a) =>
    a.setAttribute("aria-selected", a.dataset.tab === name ? "true" : "false")
  );
  ["overview", "leases", "payments", "rentroll", "balances", "whatsapp", "settings"].forEach(
    (id) => {
      const p = $(`#tab-${id}`);
      if (p) p.classList.toggle("hidden", id !== name);
    }
  );
  if (name === "overview") loadOverview().catch(console.error);
  if (name === "leases") loadLeases();
  if (name === "payments") loadPayments();
  if (name === "rentroll") loadRentroll();
  if (name === "balances") loadBalances().catch(console.error);
}
function wireTabs() {
  $$(".tab").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showTab(a.dataset.tab);
    })
  );
}

/* ============================== HEADER ============================== */
function setAPI(v) {
  state.api = (v || DEFAULT_API).trim().replace(/\/$/, "");
  localStorage.setItem("api_base", state.api);
  $("#apiBase") && ($("#apiBase").value = state.api);
  $("#apiBase2") && ($("#apiBase2").value = state.api);
}
function setAdminToken(v) {
  state.adminToken = v || "";
  localStorage.setItem("admin_token", state.adminToken);
  $("#adminToken") && ($("#adminToken").value = state.adminToken);
}

function wireHeader() {
  $("#useApi")?.addEventListener("click", () => {
    setAPI($("#apiBase")?.value || DEFAULT_API);
    toast("API saved");
  });
  $("#openDocs")?.addEventListener("click", () =>
    window.open(`${state.api}/docs`, `_blank`)
  );
}

/* ============================= SETTINGS ============================= */
function wireSettings() {
  $("#saveSettings")?.addEventListener("click", () => {
    setAPI($("#apiBase2")?.value || DEFAULT_API);
    setAdminToken($("#adminToken")?.value || "");
    toast("Settings saved");
  });
  $("#resetSettings")?.addEventListener("click", () => {
    setAPI(DEFAULT_API);
    setAdminToken("");
    toast("Reset to defaults");
  });
}

/* ========================== INVOICE ACTIONS ========================= */
function wireActions() {
  if (!$("#actionMsg")) {
    const pre = document.createElement("pre");
    pre.id = "actionMsg";
    pre.style.whiteSpace = "pre-wrap";
    ($("#invoiceActions") || document.body).insertAdjacentElement(
      "afterend",
      pre
    );
  }
  // Single "Mark as sent"
  $("#btnMarkSent")?.addEventListener("click", async () => {
    const invoice_id = ($("#invoiceIdInput")?.value || "").trim();
    if (!invoice_id) return toast("Enter an invoice_id first");
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    $("#actionMsg").textContent = "Marking as sent…";
    try {
      const data = await jpost(
        "/invoices/mark_sent",
        { invoice_id },
        { admin: true }
      );
      $("#actionMsg").textContent = JSON.stringify(data, null, 2);
      toast("Stamped as sent");
    } catch (e) {
      $("#actionMsg").textContent = String(e);
      toast("Request failed");
    }
  });

  // Dunning buttons
  function ensure(afterSel, id, label) {
    if ($(id)) return $(id);
    const anchor = $(afterSel) || $("#invoiceActions") || document.body;
    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.id = id.slice(1);
    btn.textContent = label;
    anchor.insertAdjacentElement("afterend", btn);
    return btn;
  }
  const bDry = ensure("#btnMarkSent", "#btnDunningDry", "Dunning (dry run)");
  const bApply = ensure("#btnDunningDry", "#btnDunningApply", "Dunning (apply)");
  const bLogR = ensure(
    "#btnDunningApply",
    "#btnDunningLogRecent",
    "Dunning log (recent)"
  );
  const bLogM = ensure(
    "#btnDunningLogRecent",
    "#btnDunningLogMonth",
    "Dunning log (this month)"
  );

  bDry?.addEventListener("click", () => callDunning(true));
  bApply?.addEventListener("click", () => {
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    if (confirm("Apply late fees and log reminders now?"))
      callDunning(false);
  });
  bLogR?.addEventListener("click", () => loadDunningLog());
  bLogM?.addEventListener("click", () => loadDunningLog(yyyymm()));

  // Auth ping
  const authBtn =
    $("#btnHealth") ||
    Array.from(document.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim().toLowerCase() === "auth ping"
    );
  authBtn?.addEventListener("click", async () => {
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    const out = $("#actionMsg");
    if (out) out.textContent = "Pinging…";
    try {
      const r = await fetch(`${state.api}/admin/ping`, {
        headers: {
          "X-Admin-Token": state.adminToken,
          Authorization: `Bearer ${state.adminToken}`,
        },
      });
      const data = await r.json().catch(() => ({}));
      if (out) out.textContent = JSON.stringify(data, null, 2);
      toast(r.ok ? "Admin auth OK" : `Unauthorized (${r.status})`);
    } catch (e) {
      if (out) out.textContent = String(e);
      toast("Ping failed");
    }
  });
}

/* =============================== DATA LOADERS =============================== */

/* ---- Overview KPIs & tile ---- */
async function loadOverview() {
  const month = getSelectedMonth();
  try {
    const [L, P, RR, perTenant] = await Promise.all([
      jget("/leases?limit=1000").catch(() => []),
      jget(`/payments?month=${encodeURIComponent(month)}`).catch(() => []),
      jget(`/rent-roll?month=${encodeURIComponent(month)}`).catch(() => []),
      fetchOutstandingRows().catch(() => []),
    ]);

    // Total leases (lifetime)
    $("#kpiLeases") && ($("#kpiLeases").textContent = (L || []).length);

    // Open invoices for that month (rent-roll rows that are not fully paid)
    $("#kpiOpen") &&
      ($("#kpiOpen").textContent = (RR || []).filter(
        (r) => String(r.status || "").toLowerCase() !== "paid"
      ).length);

    // Payments KPI – show amount if >0, otherwise count
    const pSum = (P || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    $("#kpiPayments") &&
      ($("#kpiPayments").textContent =
        pSum > 0 ? pSum.toLocaleString("en-KE") : (P || []).length);

    // Balance KPI – sum per-tenant outstanding (or fall back to rent-roll)
    let balanceTotal = 0;
    if (Array.isArray(perTenant) && perTenant.length) {
      balanceTotal = perTenant.reduce(
        (s, r) => s + (Number(r.outstanding) || 0),
        0
      );
    } else {
      balanceTotal = (RR || []).reduce(
        (s, r) => s + (Number(r.balance ?? r.total_due) || 0),
        0
      );
    }
    if ($("#kpiBalance")) {
      $("#kpiBalance").textContent = ksh(balanceTotal);
    }

    // Feed the small “Outstanding by tenant” tile
    renderOutstanding(Array.isArray(perTenant) ? perTenant : []);
  } catch (e) {
    console.error(e);
    toast("Failed to load overview");
  }
}

/* ---- Leases ---- */
async function loadLeases() {
  try {
    const rows = await jget("/leases?limit=1000");
    const q = ($("#leaseSearch")?.value || "").toLowerCase().trim();
    const filtered = q
      ? (rows || []).filter(
          (r) =>
            String(r.tenant || "")
              .toLowerCase()
              .includes(q) ||
            String(r.unit || "")
              .toLowerCase()
              .includes(q)
        )
      : rows || [];
    state.leasesView = filtered;
    $("#leasesCount") && ($("#leasesCount").textContent = filtered.length);
    $("#leasesEmpty")?.classList.toggle("hidden", filtered.length > 0);
    $("#leasesBody").innerHTML = filtered
      .map((r) => {
        const tenant = r.tenant ?? "—";
        const unit = r.unit ?? "—";
        const rent = r.rent_amount ?? r.rent ?? "—";
        const cycle = r.billing_cycle ?? r.cycle ?? "monthly";
        const dueDay = r.due_day ?? "—";
        const status = r.lease_status ?? r.status ?? "Active";
        const leaseId = r.lease_id || r.id || "";
        const waHref = leaseId
          ? `${state.api}/wa_for_lease_redirect?lease_id=${encodeURIComponent(
              leaseId
            )}`
          : null;
        return `<tr>
        <td>${tenant}</td>
        <td>${unit}</td>
        <td>${money(rent)}</td>
        <td>${cycle}</td>
        <td>${dueDay}</td>
        <td><span class="status ${
          String(status).toLowerCase() === "active" ? "ok" : "due"
        }">${status}</span></td>
        <td>${waHref ? `<a href="${waHref}" target="_blank">Open</a>` : "—"}</td>
      </tr>`;
      })
      .join("");
  } catch (e) {
    console.error(e);
    $("#leasesBody").innerHTML = "";
    $("#leasesEmpty")?.classList.remove("hidden");
  }
}
$("#reloadLeases")?.addEventListener("click", loadLeases);

/* --------- Payments --------- */
function ensurePaymentsMonthOptions() {
  const sel = $("#paymentsMonth");
  if (!sel || sel.options.length) return;
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const opt = document.createElement("option");
    opt.value = yyyymm(d);
    opt.textContent = d.toLocaleString("en-KE", {
      month: "short",
      year: "numeric",
    });
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}
ensurePaymentsMonthOptions();

async function loadPayments() {
  try {
    const month = $("#paymentsMonth")?.value || yyyymm();
    const tQ = ($("#paymentsTenant")?.value || "").toLowerCase().trim();
    const sQ = $("#paymentsStatus")?.value || "";
    const rows = await jget(`/payments?month=${month}`);
    const filtered = (rows || []).filter((r) => {
      const okT = tQ
        ? String(r.tenant || "").toLowerCase().includes(tQ)
        : true;
      const okS = sQ ? String(r.status || "") === sQ : true;
      return okT && okS;
    });
    state.paymentsView = filtered;
    $("#paymentsCount") && ($("#paymentsCount").textContent = filtered.length);
    $("#paymentsEmpty")?.classList.toggle("hidden", filtered.length > 0);
    $("#paymentsBody").innerHTML = filtered
      .map(
        (r) => `
      <tr>
        <td>${
          r.paid_at || r.created_at
            ? new Date(r.paid_at || r.created_at).toLocaleDateString("en-KE")
            : "—"
        }</td>
        <td>${r.tenant ?? "—"}</td>
        <td>${r.method ?? "—"}</td>
        <td class="muted">${r.status ?? "posted"}</td>
        <td style="text-align:right">${money(r.amount)}</td>
      </tr>`
      )
      .join("");
    const total = filtered.reduce(
      (s, x) => s + (Number(x.amount) || 0),
      0
    );
    const trow = document.createElement("tr");
    trow.innerHTML = `<td colspan="4" style="text-align:right;font-weight:600">Total</td>
      <td style="text-align:right;font-weight:600">${money(total)}</td>`;
    $("#paymentsBody")?.appendChild(trow);
  } catch (e) {
    console.error(e);
    $("#paymentsBody").innerHTML = "";
    $("#paymentsEmpty")?.classList.remove("hidden");
  }
}
$("#applyPayments")?.addEventListener("click", loadPayments);
$("#clearPayments")?.addEventListener("click", () => {
  $("#paymentsTenant").value = "";
  $("#paymentsStatus").value = "";
  loadPayments();
});
$("#paymentsMonth")?.addEventListener("change", loadPayments);

/* --------- Rent Roll --------- */
function ensureRentrollMonthOptions() {
  const sel = $("#rentrollMonth");
  if (!sel || sel.options.length) return;
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const opt = document.createElement("option");
    opt.value = yyyymm(d);
    opt.textContent = d.toLocaleString("en-KE", {
      month: "short",
      year: "numeric",
    });
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}
ensureRentrollMonthOptions();

// --- Rent roll tab ---
async function loadRentroll() {
  try {
    const month = $("#rentrollMonth")?.value || yyyymm();
    const tQ = ($("#rentrollTenant")?.value || "").toLowerCase().trim();
    const pQ = ($("#rentrollProperty")?.value || "").toLowerCase().trim();

    // Pull rows for the selected month from the API
    const rows = await jget(`/rent-roll?month=${month}`);

    // Apply simple text filters (tenant / property)
    const filtered = (rows || []).filter((r) => {
      const okTenant = tQ
        ? String(r.tenant || "").toLowerCase().includes(tQ)
        : true;
      const propName = String(r.property_name || r.property || "");
      const okProp = pQ ? propName.toLowerCase().includes(pQ) : true;
      return okTenant && okProp;
    });

    state.rentrollView = filtered;
    if ($("#rentrollCount")) {
      $("#rentrollCount").textContent = filtered.length;
    }

    const empty = $("#rentrollEmpty");
    empty?.classList.toggle("hidden", filtered.length > 0);

    // Render table rows
    $("#rentrollBody").innerHTML = filtered
      .map((r) => {
        const periodLabel =
          r.period ?? `${r.period_start || "—"} → ${r.period_end || "—"}`;

        // Base rent from view (or fallback)
        const baseRent = Number(
          r.subtotal_rent ?? r.rent ?? r.total_due ?? 0
        );

        // Late fees (already capped per invoice in Supabase)
        const lateFees = Number(r.late_fees ?? 0);

        // Credits if you ever use them (defaults to 0)
        const credits = Number(r.credits ?? 0);

        // **Authoritative monthly invoice total** for this lease/period:
        // prefer total_due coming from Supabase; if it’s missing, recompute.
        const totalDueRaw =
          r.total_due != null ? Number(r.total_due) : NaN;
        const totalDue = Number.isFinite(totalDueRaw)
          ? totalDueRaw
          : baseRent + lateFees - credits;

        // This is what we show in the "Balance" column
        const displayBalance = totalDue;
        <td>${lateFees ? money(lateFees) : "—"}</td>
        <td class="status-cell">${r.status ?? "—"}</td>
        <td style="text-align:right">${money(displayBalance)}</td>

        return `
          <tr>
            <td>${r.property_name ?? r.property ?? "—"}</td>
            <td>${r.unit_code ?? r.unit ?? "—"}</td>
            <td>${r.tenant ?? "—"}</td>
            <td>${periodLabel}</td>

            <!-- Rent (base) -->
            <td>${money(baseRent)}</td>

            <!-- Late fees (dash if zero) -->
            <td>${lateFees ? money(lateFees) : "—"}</td>

            <!-- Status from view -->
            <td class="status-cell">${r.status ?? "—"}</td>

            <!-- Total invoice amount for the period -->
            <td style="text-align:right">${money(displayBalance)}</td>

            <td>
              <button class="btn ghost" data-action="wa"
                      data-lease="${r.lease_id}">WhatsApp</button>
              <button class="btn ghost" data-action="mark"
                      data-lease="${r.lease_id}"
                      data-month="${month}">Mark sent</button>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (e) {
    console.error(e);
    $("#rentrollBody").innerHTML = "";
    $("#rentrollEmpty")?.classList.remove("hidden");
  }
}

// Keep these listeners as they were
$("#applyRentroll")?.addEventListener("click", loadRentroll);
$("#clearRentroll")?.addEventListener("click", () => {
  $("#rentrollTenant").value = "";
  $("#rentrollProperty").value = "";
  loadRentroll();
});

$("#applyRentroll")?.addEventListener("click", loadRentroll);
$("#clearRentroll")?.addEventListener("click", () => {
  $("#rentrollTenant").value = "";
  $("#rentrollProperty").value = "";
  loadRentroll();
});

$("#rentrollBody")?.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action,
    leaseId = btn.dataset.lease,
    month = btn.dataset.month;

  // WhatsApp button in the Rent Roll table
  if (action === "wa") {
    try {
      const ym = $("#rentrollMonth")?.value || yyyymm();
      const leaseKey = String(leaseId);

      // Find the matching rent-roll row for this lease/month
      const row = (state.rentrollView || []).find(
        (r) => String(r.lease_id ?? r.id ?? "") === leaseKey
      );

      // Get contact (phone + display tenant name)
      const contact = await getContactForLease(leaseId);
      const phoneRaw = (contact?.phone || contact?.phone_e164 || "").trim();
      if (!phoneRaw) {
        toast("No phone number on file for this lease");
        return;
      }

      const ctx = {
        tenant_name:
          contact?.tenant ||
          row?.tenant ||
          row?.tenant_name ||
          "Tenant",
        unit: row?.unit_code || row?.unit || "Unit",
        period:
          row?.period ||
          fmtMonYearFromISO(row?.period_start || `${ym}-01`),
        rent: Number(row?.subtotal_rent ?? row?.rent ?? 0),
        late_fees: Number(row?.late_fees ?? 0),
        total_due: Number(row?.total_due ?? 0),
        paid_to_date: Number(row?.paid_amount ?? 0),
        amount_due: Number(row?.balance ?? row?.total_due ?? 0),
        due_date: row?.due_date
          ? new Date(row.due_date).toLocaleDateString("en-KE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "",
      };

      const url = buildWhatsAppURL(phoneRaw, ctx);
      if (!url) {
        toast("Could not build WhatsApp link");
        return;
      }
      window.open(url, "_blank");
    } catch (err) {
      console.error("Failed to open WhatsApp for rent roll row", err);
      toast("Failed to open WhatsApp");
    }
    return;
  }

  if (action === "mark") {
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "…";
    try {
      const invoiceId = await getInvoiceIdForLeaseMonth(leaseId, month);
      if (!invoiceId) {
        toast("No invoice found for that lease/month");
        return;
      }
      const res = await jpost(
        "/invoices/mark_sent",
        { invoice_id: invoiceId },
        { admin: true }
      );
      btn
        .closest("tr")
        ?.querySelector(".status-cell")
        ?.replaceChildren(
          document.createTextNode(res?.invoice?.status || "sent")
        );
      toast("Marked sent");
    } catch (e) {
      toast(`Failed: ${e.message || e}`);
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
});

/* --------- Balances helpers & tab --------- */

// Normalise metrics/collection_by_tenant_month result
async function fetchOutstandingRows(month) {
  const ym = month || getSelectedMonth();
  try {
    const res = await api(
      `/metrics/collection_by_tenant_month?month=${encodeURIComponent(ym)}`
    );
    if (!Array.isArray(res)) return [];
    return res.map((r) => {
      const rentDue = Number(r.rent_due_total ?? r.total_due ?? 0) || 0;
      const paid = Number(r.amount_paid_total ?? r.paid_amount ?? 0) || 0;
      const balance =
        Number(r.balance_total ?? r.balance ?? rentDue - paid) || 0;
      const pct =
        r.collection_rate_pct != null
          ? Number(r.collection_rate_pct)
          : rentDue > 0
          ? Math.round((paid / rentDue) * 100)
          : 0;
      return {
        tenant_id: r.tenant_id || r.id || null,
        tenant_name: r.tenant || r.tenant_name || r.tenant_name_text || "—",
        rent_due: rentDue,
        paid,
        outstanding: balance,
        collection_rate_pct: pct,
      };
    });
  } catch (e) {
    console.error("fetchOutstandingRows failed", e);
    return [];
  }
}

// --- Balances tab ---
async function loadBalances() {
  try {
    const rows = await fetchOutstandingRows(); // current-month outstanding per tenant
    state.balancesView = rows || [];

    const body  = $("#balancesBody");
    const empty = $("#balancesEmpty");

    if (!body) return;

    if (!rows || !rows.length) {
      body.innerHTML = "";
      empty?.classList.remove("hidden");
      // also clear the small “Outstanding by tenant” table
      renderOutstanding([]);
      return;
    }

    empty?.classList.add("hidden");

    // Main "Balances (This Month)" table – one row per tenant
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${r.tenant_name ?? "—"}</td>
        <td>${(r.tenant_id || "").slice(0,8)}…</td>
        <td>${new Date().toLocaleString('en-KE', { month: 'short', year: 'numeric' })}</td>
        <td>${Number(r.outstanding || 0) === 0 ? "paid" : "due"}</td>
        <td style="text-align:right">${money(r.outstanding)}</td>
      </tr>
    `).join("");

    // Add total row at the bottom
    const total = rows.reduce((s, x) => s + (Number(x.outstanding) || 0), 0);
    const trow = document.createElement("tr");
    trow.innerHTML = `
      <td colspan="4" style="text-align:right;font-weight:600">Total</td>
      <td style="text-align:right;font-weight:600">${money(total)}</td>
    `;
    body.appendChild(trow);

    // Re-use the same data for the lower “Outstanding by tenant (this month)” section
    renderOutstanding(rows);
  } catch (e) {
    console.error(e);
    $("#balancesBody").innerHTML = "";
    $("#balancesEmpty")?.classList.remove("hidden");
    renderOutstanding([]);
  }
}
// --- Balances tab ---
// Helper: compute per-tenant outstanding using the rent roll
async function fetchOutstandingRows() {
  const month = getSelectedMonth();
  try {
    const rows = await jget(`/rent-roll?month=${encodeURIComponent(month)}`);
    if (!Array.isArray(rows) || !rows.length) return [];

    const byTenant = new Map();

    for (const r of rows) {
      const tenantName =
        r.tenant ||
        r.tenant_name ||
        r.tenant_name_text ||
        "Tenant";

      // Try to get a stable key; fall back to name
      const key =
        r.tenant_id ||
        r.tenant_uuid ||
        r.lease_id ||
        tenantName;

      const existing = byTenant.get(key) || {
        tenant_id: key,
        tenant_name: tenantName,
        outstanding: 0,
      };

      const bal = Number(r.balance ?? r.total_due ?? 0) || 0;
      existing.outstanding += bal;
      byTenant.set(key, existing);
    }

    // Drop very tiny rounding leftovers
    return Array.from(byTenant.values()).filter(
      (t) => Math.abs(t.outstanding) > 1e-2
    );
  } catch (err) {
    console.error("Failed to compute outstanding rows", err);
    return [];
  }
}

async function loadBalances() {
  try {
    const rows = await fetchOutstandingRows();
    state.balancesView = rows || [];

    const body  = $("#balancesBody");
    const empty = $("#balancesEmpty");
    if (!body) return;

    if (!rows || !rows.length) {
      body.innerHTML = "";
      empty?.classList.remove("hidden");
      renderOutstanding([]); // clear lower tile too
      return;
    }

    empty?.classList.add("hidden");

    const monthLabel = new Date(
      `${getSelectedMonth()}-01`
    ).toLocaleString("en-KE", { month: "short", year: "numeric" });

    // Main table: one row per tenant
    body.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>${r.tenant_name ?? "—"}</td>
        <td>${(r.tenant_id || "").toString().slice(0, 8)}…</td>
        <td>${monthLabel}</td>
        <td>${Number(r.outstanding || 0) === 0 ? "paid" : "due"}</td>
        <td style="text-align:right">${money(r.outstanding)}</td>
      </tr>`
      )
      .join("");

    // Total row
    const total = rows.reduce(
      (sum, x) => sum + (Number(x.outstanding) || 0),
      0
    );
    const trow = document.createElement("tr");
    trow.innerHTML = `
      <td colspan="4" style="text-align:right;font-weight:600">Total</td>
      <td style="text-align:right;font-weight:600">${money(total)}</td>
    `;
    body.appendChild(trow);

    // Lower “Outstanding by tenant (this month)” section uses the same data
    renderOutstanding(rows);
  } catch (e) {
    console.error(e);
    $("#balancesBody").innerHTML = "";
    $("#balancesEmpty")?.classList.remove("hidden");
    renderOutstanding([]);
  }
}

$("#reloadBalances")?.addEventListener("click", () =>
  loadBalances().catch(console.error)
);

/* --------- COLLECTION SUMMARY (metrics card) --------- */
async function loadCollectionSummaryMonth() {
  const container = document.querySelector("#collection-summary-month");
  if (!container) return;

  const month = getSelectedMonth();

  try {
    const [rentRoll, payments] = await Promise.all([
      jget(`/rent-roll?month=${encodeURIComponent(month)}`).catch(() => []),
      jget(`/payments?month=${encodeURIComponent(month)}`).catch(() => []),
    ]);

    const totalDue = (rentRoll || []).reduce(
      (sum, r) => sum + (Number(r.total_due) || 0),
      0
    );
    const paid = (payments || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    const balance = totalDue - paid;
    const collectionRate = totalDue > 0 ? (paid / totalDue) * 100 : 0;

    const monthLabel = new Date(`${month}-01`).toLocaleDateString("en-KE", {
      year: "numeric",
      month: "short",
    });

    const elMonth = container.querySelector("[data-role='month-label']");
    const elDue   = container.querySelector("[data-role='rent-due-total']");
    const elPaid  = container.querySelector("[data-role='amount-paid-total']");
    const elBal   = container.querySelector("[data-role='balance-total']");
    const elRate  = container.querySelector("[data-role='collection-rate']");

    if (elMonth) elMonth.textContent = monthLabel;
    if (elDue)   elDue.textContent   = formatMoney(totalDue);
    if (elPaid)  elPaid.textContent  = formatMoney(paid);
    if (elBal)   elBal.textContent   = formatMoney(balance);
    if (elRate)  elRate.textContent  = `${collectionRate.toFixed(1)}%`;
  } catch (err) {
    console.error("Failed to compute collection summary", err);
    container.textContent = "Error loading collection summary.";
  }
}

/* ============================ EXPORTS ============================ */
function ensureExportButtons() {
  function addAfter(anchorSel, id, label) {
    if ($(id)) return null;
    const anchor = $(anchorSel);
    if (!anchor) return null;
    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.id = id.slice(1);
    btn.textContent = label;
    anchor.insertAdjacentElement("afterend", btn);
    return btn;
  }
  addAfter("#reloadLeases", "#exportLeases", "Export CSV");
  addAfter("#applyPayments", "#exportPayments", "Export CSV");
  addAfter("#applyRentroll", "#exportRentroll", "Export CSV");
  addAfter("#reloadBalances", "#exportBalances", "Export CSV");

  $("#exportLeases")?.addEventListener("click", () => {
    const cols = [
      { label: "Tenant", value: (r) => r.tenant },
      { label: "Unit", value: (r) => r.unit },
      { label: "Rent", value: (r) => r.rent_amount ?? r.rent },
      { label: "Cycle", value: (r) => r.billing_cycle ?? r.cycle },
      { label: "Due Day", value: (r) => r.due_day },
      { label: "Status", value: (r) => r.lease_status ?? r.status },
      { label: "Lease ID", value: (r) => r.lease_id || r.id },
    ];
    download(
      `leases_${yyyymm()}.csv`,
      toCSV(state.leasesView, cols)
    );
  });

  $("#exportPayments")?.addEventListener("click", () => {
    const cols = [
      { label: "Date", value: (r) => r.paid_at || r.created_at },
      { label: "Tenant", value: (r) => r.tenant },
      { label: "Method", value: (r) => r.method },
      { label: "Status", value: (r) => r.status ?? "posted" },
      { label: "Amount", value: (r) => r.amount },
      { label: "Invoice ID", value: (r) => r.invoice_id },
      { label: "Payment ID", value: (r) => r.id },
    ];
    download(
      `payments_${$("#paymentsMonth")?.value || yyyymm()}.csv`,
      toCSV(state.paymentsView, cols)
    );
  });

  $("#exportRentroll")?.addEventListener("click", () => {
    const cols = [
      { label: "Property", value: (r) => r.property_name ?? r.property },
      { label: "Unit", value: (r) => r.unit_code ?? r.unit },
      { label: "Tenant", value: (r) => r.tenant },
      {
        label: "Period",
        value: (r) =>
          r.period || `${r.period_start || ""} → ${r.period_end || ""}`,
      },
      { label: "Total Due", value: (r) => r.total_due },
      { label: "Status", value: (r) => r.status },
      { label: "Balance", value: (r) => r.balance },
    ];
    download(
      `rent_roll_${$("#rentrollMonth")?.value || yyyymm()}.csv`,
      toCSV(state.rentrollView, cols)
    );
  });

  // Metrics-based balances CSV
  $("#exportBalances")?.addEventListener("click", () => {
    const month = getSelectedMonth();
    const cols = [
      { label: "Tenant", value: (r) => r.tenant_name },
      { label: "Month", value: () => month },
      {
        label: "Rent Due",
        value: (r) => r.rent_due,
      },
      {
        label: "Paid",
        value: (r) => r.paid,
      },
      {
        label: "Balance",
        value: (r) => r.outstanding,
      },
      {
        label: "Collection Rate %",
        value: (r) => r.collection_rate_pct,
      },
    ];
    download(
      `balances_${month}.csv`,
      toCSV(state.balancesView, cols)
    );
  });
}
ensureExportButtons();

/* ======================= OVERVIEW BIG BUTTONS ====================== */
$("#btnSendAll")?.addEventListener("click", async () => {
  const ym = getSelectedMonth();
  try {
    const rows = await getRentRollForMonth(ym);
    const dueRows = rows.filter((r) => Number(r.balance || 0) > 0);
    if (!dueRows.length) {
      alert("Nothing to send for " + ym);
      return;
    }
    let opened = 0,
      skippedNoPhone = 0;
    for (const r of dueRows) {
      const contact = await getContactForLease(r.lease_id);
      const phone = (contact?.phone || "").trim();
      if (!phone) {
        skippedNoPhone++;
        continue;
      }
      const url = buildWhatsAppURL(phone, {
        tenant_name: contact?.tenant || r.tenant || "Tenant",
        unit: r.unit_code || r.unit || "Unit",
        period: fmtMonYearFromISO(r.period_start),
        rent: Number(r.subtotal_rent || r.rent || 0),
        late_fees: Number(r.late_fees || 0),
        total_due: Number(r.total_due || 0),
        paid_to_date: Number(r.paid_amount || 0),
        amount_due: Number(r.balance || r.total_due || 0),
        due_date: r.due_date
          ? new Date(r.due_date).toLocaleDateString("en-KE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "",
      });
      window.open(url, "_blank");
      opened++;
      await new Promise((res) => setTimeout(res, 600));
    }
    alert(
      `Opened ${opened} WhatsApp chats. Skipped ${skippedNoPhone} (no phone).`
    );
  } catch (e) {
    console.error(e);
    alert("Send All failed: " + e.message);
  }
});

$("#btnMarkSelected")?.addEventListener("click", async () => {
  const ym = getSelectedMonth();
  try {
    const rows = await getRentRollForMonth(ym);
    const dueRows = rows.filter((r) => Number(r.balance || 0) > 0);
    const invoiceIds = [];
    for (const r of dueRows) {
      const id = await getInvoiceIdForLeaseMonth(r.lease_id, ym);
      if (id) invoiceIds.push(id);
      await new Promise((res) => setTimeout(res, 120));
    }
    if (!invoiceIds.length) {
      alert("No invoices found to mark for " + ym);
      return;
    }
    const res = await fetch(`${state.api}/invoices/mark_sent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_ids: invoiceIds,
        sent_via: "whatsapp",
        sent_to: "tenant",
        sent_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error("API returned " + res.status);
    const out = await res.json();
    alert(`Marked as sent: ${out.updated?.length || 0} invoices.`);
  } catch (e) {
    console.error(e);
    alert("Mark Sent failed: " + e.message);
  }
});

/* ============================ WHATSAPP DIY ============================ */
$("#waBuild")?.addEventListener("click", () => {
  const name = ($("#waTenant")?.value || "").trim() || "Tenant";
  const phone = ($("#waPhone")?.value || "").trim();
  const period =
    ($("#waPeriod")?.value || "").trim() ||
    new Date().toLocaleString("en-KE", {
      month: "short",
      year: "numeric",
    });
  const bal = Number($("#waBalance")?.value || 0);
  if (!phone) {
    alert("Enter a recipient phone number");
    return;
  }
  const url = buildWhatsAppURL(phone, {
    tenant_name: name,
    unit: "your unit",
    period,
    rent: bal,
    late_fees: 0,
    total_due: bal,
    paid_to_date: 0,
    amount_due: bal,
    due_date: "",
  });
  const out = $("#waResult");
  if (out) {
    out.innerHTML = `Link ready: <a href="${url}" target="_blank">Open WhatsApp</a>`;
  } else {
    window.open(url, "_blank");
  }
});

/* ================================ BOOT ================================ */
(function init() {
  setAPI(state.api);
  setAdminToken(state.adminToken);

  $("#yy") && ($("#yy").textContent = new Date().getFullYear());
  wireTabs();
  wireHeader();
  wireSettings();
  wireActions();

  // Ensure monthPicker has a default (current month)
  const mp = document.getElementById("monthPicker");
  if (mp && !mp.value) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    mp.value = `${now.getFullYear()}-${mm}`;
  }

  // When month changes: keep Overview, metrics card, balances, and tile in sync
  if (mp) {
    mp.addEventListener("change", () => {
      loadCollectionSummaryMonth().catch(console.error);
      loadOverview().catch(console.error);
      loadBalances().catch(console.error);
      loadOutstandingByTenant().catch(console.error);
    });
  }

  // Initial load for the summary card
  loadCollectionSummaryMonth().catch(console.error);

  // Default tab
  showTab("overview");
})();
