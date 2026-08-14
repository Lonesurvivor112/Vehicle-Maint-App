import { state, selectedVehicle, getScopedData, money, escapeHtml, dateLabel, reminderStatus, render } from "./app.js";

// "all" = fleet overview across every vehicle, "vehicle" = the selected vehicle only.
let mode = "all";

export function initDashboard(root) {
  root.innerHTML = `
    <div class="actions" style="margin-bottom:16px">
      <button class="btn ${mode === "all" ? "primary" : ""}" data-mode="all">All Vehicles</button>
      <button class="btn ${mode === "vehicle" ? "primary" : ""}" data-mode="vehicle">Selected Vehicle</button>
    </div>
    <div id="dashboardBody"></div>`;
  root.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    initDashboard(root);
  }));
  const body = root.querySelector("#dashboardBody");
  if (mode === "vehicle") vehicleView(body); else fleetView(body);
}

/* ---------- All Vehicles (fleet) ---------- */

function fleetView(root) {
  const vehicles = state.db.vehicles;
  const totalSpent = spendAll();
  const dueCount = state.db.reminders.filter(r => r.status !== "Done" && reminderStatus(r, state.db.vehicles.find(v => v.id === r.vehicleId)).urgent).length;
  const rows = vehicles.map(v => ({
    v,
    spend: vehicleSpend(v.id),
    maint: state.db.maintenance.filter(x => x.vehicleId === v.id).length,
    open: state.db.reminders.filter(x => x.vehicleId === v.id && x.status !== "Done").length
  })).sort((a, b) => b.spend - a.spend);
  const maxSpend = Math.max(1, ...rows.map(r => r.spend));

  root.innerHTML = `
    <div class="grid grid-4">
      ${stat("Vehicles", vehicles.length)}
      ${stat("Due / Coming Due", dueCount)}
      ${stat("Total Spend", money(totalSpent))}
      ${stat("Documents", state.db.documents.length)}
    </div>
    <section class="card" style="margin-top:16px">
      <h3>Spend by Vehicle</h3>
      ${rows.length ? rows.map(r => vehicleSpendRow(r, maxSpend)).join("") : `<div class="empty-state">Add a vehicle to get started.</div>`}
    </section>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card"><h3>Upcoming Reminders</h3>${fleetReminders()}</section>
      <section class="card"><h3>Recent Maintenance</h3>${fleetMaintenance()}</section>
    </div>`;

  root.querySelectorAll("[data-vehicle]").forEach(el => el.addEventListener("click", () => {
    state.selectedVehicleId = el.dataset.vehicle;
    mode = "vehicle";
    render();
  }));
}

function vehicleSpendRow(r, maxSpend) {
  const pct = Math.round((r.spend / maxSpend) * 100);
  const details = escapeHtml([r.v.year, r.v.make, r.v.model].filter(Boolean).join(" ")) || "No details";
  return `<div class="record" data-vehicle="${escapeHtml(r.v.id)}" style="cursor:pointer" title="View this vehicle">
    <div class="record-head">
      <div><h4>${escapeHtml(r.v.name)}</h4><p class="muted small">${details} · ${Number(r.v.currentMileage || 0).toLocaleString()} mi</p></div>
      <div style="text-align:right"><strong>${money(r.spend)}</strong><p class="muted small">${r.maint} services · ${r.open} open</p></div>
    </div>
    <div style="height:8px;border-radius:999px;background:rgba(255,255,255,.07);margin-top:10px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--cyan)"></div></div>
  </div>`;
}

function fleetReminders() {
  const items = state.db.reminders
    .filter(r => r.status !== "Done")
    .map(r => { const v = state.db.vehicles.find(x => x.id === r.vehicleId); return { r, v, s: reminderStatus(r, v) }; })
    .sort((a, b) => (b.s.urgent === a.s.urgent ? 0 : b.s.urgent ? 1 : -1))
    .slice(0, 6);
  if (!items.length) return `<div class="empty-state">No open reminders.</div>`;
  return items.map(({ r, v, s }) => `<div class="record"><div class="record-head"><div><h4>${escapeHtml(r.title)}</h4><p class="muted small">${escapeHtml(v?.name || "Unknown vehicle")} · ${escapeHtml(r.type)} ${r.dueMileage ? "· " + Number(r.dueMileage).toLocaleString() + " mi" : ""} ${r.dueDate ? "· " + dateLabel(r.dueDate) : ""}</p></div><span class="badge ${s.css}">${s.label}</span></div></div>`).join("");
}

function fleetMaintenance() {
  const items = state.db.maintenance.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
  if (!items.length) return `<div class="empty-state">No maintenance records.</div>`;
  return items.map(m => { const v = state.db.vehicles.find(x => x.id === m.vehicleId); return `<div class="record"><h4>${escapeHtml(m.category)}: ${escapeHtml(m.title)}</h4><p class="muted small">${escapeHtml(v?.name || "Unknown vehicle")} · ${dateLabel(m.date)} · ${Number(m.mileage || 0).toLocaleString()} mi · ${money(m.cost)}</p></div>`; }).join("");
}

/* ---------- Selected Vehicle ---------- */

function vehicleView(root) {
  const vehicle = selectedVehicle();
  if (!vehicle) { root.innerHTML = `<div class="empty-state">No vehicle selected. Add a vehicle to get started.</div>`; return; }
  const scoped = getScopedData(vehicle.id);
  const maintSpend = scoped.maintenance.reduce((s, x) => s + Number(x.cost || 0), 0);
  const expenseSpend = scoped.expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalSpent = maintSpend + expenseSpend;
  const covered = scoped.maintenance.reduce((s, x) => {
    const total = x.totalCost !== "" && x.totalCost != null ? Number(x.totalCost) : null;
    return s + (total != null && total > Number(x.cost || 0) ? total - Number(x.cost || 0) : 0);
  }, 0);
  const dueCount = scoped.reminders.filter(r => r.status !== "Done" && reminderStatus(r, vehicle).urgent).length;

  root.innerHTML = `
    <div class="grid grid-4">
      ${stat("Total Spend", money(totalSpent))}
      ${stat("Maintenance", scoped.maintenance.length)}
      ${stat("Due / Coming Due", dueCount)}
      ${stat("Documents", scoped.documents.length)}
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card">
        <h3>${escapeHtml(vehicle.name)}</h3>
        <p class="muted">${escapeHtml([vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")) || "No details"}</p>
        <p><strong>${Number(vehicle.currentMileage || 0).toLocaleString()}</strong> miles</p>
      </section>
      <section class="card">
        <h3>Spend Breakdown</h3>
        <p class="muted">Maintenance: <strong>${money(maintSpend)}</strong></p>
        <p class="muted">Other expenses: <strong>${money(expenseSpend)}</strong></p>
        ${covered > 0 ? `<p class="muted">Covered by insurance/warranty: <strong>${money(covered)}</strong></p>` : ""}
        <p class="muted">Open reminders: ${scoped.reminders.filter(r => r.status !== "Done").length}</p>
      </section>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card"><h3>Upcoming Reminders</h3>${remindersList(scoped.reminders, vehicle)}</section>
      <section class="card"><h3>Recent Maintenance</h3>${maintenanceList(scoped.maintenance)}</section>
    </div>`;
}

/* ---------- helpers ---------- */

function vehicleSpend(id) {
  const m = state.db.maintenance.filter(x => x.vehicleId === id).reduce((s, x) => s + Number(x.cost || 0), 0);
  const e = state.db.expenses.filter(x => x.vehicleId === id).reduce((s, x) => s + Number(x.amount || 0), 0);
  return m + e;
}

function spendAll() {
  return state.db.expenses.reduce((s, x) => s + Number(x.amount || 0), 0) + state.db.maintenance.reduce((s, x) => s + Number(x.cost || 0), 0);
}

function stat(label, value) {
  return `<section class="card stat"><div><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div></div></section>`;
}

function remindersList(reminders, vehicle) {
  const items = reminders.filter(r => r.status !== "Done").slice(0, 5);
  if (!items.length) return `<div class="empty-state">No open reminders.</div>`;
  return items.map(r => {
    const status = reminderStatus(r, vehicle);
    return `<div class="record"><div class="record-head"><div><h4>${escapeHtml(r.title)}</h4><p class="muted small">${escapeHtml(r.type)} · ${r.dueMileage ? Number(r.dueMileage).toLocaleString() + " miles" : ""} ${r.dueDate ? " · " + dateLabel(r.dueDate) : ""}</p></div><span class="badge ${status.css}">${status.label}</span></div></div>`;
  }).join("");
}

function maintenanceList(records) {
  const items = records.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
  if (!items.length) return `<div class="empty-state">No maintenance records.</div>`;
  return items.map(m => `<div class="record"><h4>${escapeHtml(m.category)}: ${escapeHtml(m.title)}</h4><p class="muted small">${dateLabel(m.date)} · ${Number(m.mileage || 0).toLocaleString()} miles · ${money(m.cost)}</p></div>`).join("");
}
