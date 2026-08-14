import { state, commit, uid, todayIso, selectedVehicle, getScopedData, money, escapeHtml, dateLabel } from "./app.js";

export function initMaintenanceView(root) {
  const vehicle = selectedVehicle();
  const scoped = getScopedData(vehicle?.id);
  root.innerHTML = `<div class="grid grid-2">
    <section class="card"><h3>Maintenance History</h3><input id="maintenanceSearch" class="input" placeholder="Search service, provider, notes..."><div id="maintenanceList" style="margin-top:12px"></div></section>
    <section class="card"><h3 id="maintenanceFormTitle">Log Maintenance</h3>${formHtml(vehicle)}</section>
  </div>`;
  renderList(root, scoped.maintenance);
  root.querySelector("#maintenanceSearch").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    renderList(root, scoped.maintenance.filter(m => `${m.title} ${m.category} ${m.provider} ${m.notes}`.toLowerCase().includes(q)));
  });
  bindForm(root, vehicle);
}

function formHtml(vehicle, entry = {}) {
  const editing = Boolean(entry.id);
  const mileageVal = entry.mileage ?? vehicle?.currentMileage ?? "";
  return `<form id="maintenanceForm" class="form">
    <input type="hidden" name="id" value="${escapeHtml(entry.id || "")}">
    <div class="form-row"><label><span class="field-label">Date</span><input class="input" name="date" type="date" value="${escapeHtml(entry.date || todayIso())}"></label><label><span class="field-label">Mileage</span><input class="input" name="mileage" type="number" value="${escapeHtml(mileageVal)}"></label></div>
    <label><span class="field-label">Category</span><input class="input" name="category" placeholder="Oil Change, Tires, Brakes" value="${escapeHtml(entry.category || "")}"></label>
    <label><span class="field-label">Service title</span><input class="input" name="title" placeholder="Synthetic oil and filter" value="${escapeHtml(entry.title || "")}"></label>
    <label><span class="field-label">Provider</span><input class="input" name="provider" placeholder="Shop, dealer, self" value="${escapeHtml(entry.provider || "")}"></label>
    <div class="form-row"><label><span class="field-label">Amount paid (out of pocket)</span><input class="input" name="cost" type="number" step="0.01" placeholder="0.00" value="${escapeHtml(entry.cost ?? "")}"></label><label><span class="field-label">Total cost if paid in full</span><input class="input" name="totalCost" type="number" step="0.01" placeholder="Optional — full price" value="${escapeHtml(entry.totalCost ?? "")}"></label></div>
    <label><span class="field-label">Covered by (insurance, warranty, etc.)</span><input class="input" name="coveredBy" placeholder="e.g. Insurance — $500 deductible" value="${escapeHtml(entry.coveredBy || "")}"></label>
    <div class="form-row"><label><span class="field-label">Next due mileage</span><input class="input" name="nextDueMileage" type="number" value="${escapeHtml(entry.nextDueMileage ?? "")}"></label><label><span class="field-label">Next due date</span><input class="input" name="nextDueDate" type="date" value="${escapeHtml(entry.nextDueDate || "")}"></label></div>
    <label><span class="field-label">Notes</span><textarea name="notes" placeholder="Parts used, warranty info, observations...">${escapeHtml(entry.notes || "")}</textarea></label>
    <div class="actions"><button class="btn primary" type="submit">${editing ? "Update Maintenance" : "Save Maintenance"}</button><button class="btn" type="button" id="cancelMaintenanceEdit">${editing ? "Cancel" : "Clear"}</button></div>
  </form>`;
}

function bindForm(root, vehicle) {
  const form = root.querySelector("#maintenanceForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const existing = data.id ? state.db.maintenance.find(m => m.id === data.id) : null;
    const targetVehicleId = existing ? existing.vehicleId : vehicle?.id;
    if (!targetVehicleId) return alert("Add a vehicle first.");

    const entry = {
      id: existing ? existing.id : uid("mnt"),
      vehicleId: targetVehicleId,
      date: data.date || todayIso(),
      mileage: Number(data.mileage || vehicle?.currentMileage || 0),
      category: data.category || "General Service",
      title: data.title || "Maintenance entry",
      provider: data.provider || "",
      cost: Number(data.cost || 0),
      totalCost: data.totalCost ? Number(data.totalCost) : "",
      coveredBy: data.coveredBy || "",
      notes: data.notes || "",
      nextDueMileage: data.nextDueMileage ? Number(data.nextDueMileage) : "",
      nextDueDate: data.nextDueDate || "",
      documentIds: existing?.documentIds || [],
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    const maintenance = existing
      ? state.db.maintenance.map(m => m.id === entry.id ? entry : m)
      : [...state.db.maintenance, entry];
    const vehicles = state.db.vehicles.map(v => v.id === targetVehicleId
      ? { ...v, currentMileage: Math.max(Number(v.currentMileage || 0), entry.mileage) } : v);

    // Only auto-create a follow-up reminder for brand-new entries, never on edit.
    const reminders = [...state.db.reminders];
    if (!existing && (entry.nextDueMileage || entry.nextDueDate)) {
      reminders.push({ id: uid("rem"), vehicleId: targetVehicleId, title: `Follow up: ${entry.category}`, type: entry.nextDueMileage && entry.nextDueDate ? "Both" : entry.nextDueMileage ? "Mileage" : "Date", dueMileage: entry.nextDueMileage, dueDate: entry.nextDueDate, repeatMiles: "", repeatMonths: "", status: "Open", notes: `Created from maintenance entry: ${entry.title}`, createdAt: new Date().toISOString() });
    }

    commit({ ...state.db, vehicles, maintenance, reminders });
  });

  root.querySelector("#cancelMaintenanceEdit").addEventListener("click", () => resetForm(root));
}

function editMaintenance(root, id) {
  const entry = state.db.maintenance.find(m => m.id === id);
  if (!entry) return;
  const vehicle = selectedVehicle();
  root.querySelector("#maintenanceFormTitle").textContent = "Edit Maintenance";
  root.querySelector("#maintenanceForm").outerHTML = formHtml(vehicle, entry);
  bindForm(root, vehicle);
  root.querySelector("#maintenanceFormTitle").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm(root) {
  const vehicle = selectedVehicle();
  root.querySelector("#maintenanceFormTitle").textContent = "Log Maintenance";
  root.querySelector("#maintenanceForm").outerHTML = formHtml(vehicle);
  bindForm(root, vehicle);
}

function costCell(m) {
  const paid = Number(m.cost || 0);
  const hasTotal = m.totalCost !== "" && m.totalCost != null;
  const total = hasTotal ? Number(m.totalCost) : null;
  let extra = "";
  if (total != null && total > paid) {
    const covered = total - paid;
    extra = `<div class="small muted">Total ${money(total)} · covered ${money(covered)}${m.coveredBy ? " · " + escapeHtml(m.coveredBy) : ""}</div>`;
  } else if (m.coveredBy) {
    extra = `<div class="small muted">${escapeHtml(m.coveredBy)}</div>`;
  }
  return `<strong>${money(paid)}</strong>${extra}`;
}

function renderList(root, records) {
  const list = root.querySelector("#maintenanceList");
  const sorted = records.slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
  if (!sorted.length) { list.innerHTML = `<div class="empty-state">No maintenance records.</div>`; return; }
  list.innerHTML = sorted.map(m => `<div class="record"><div class="record-head"><div><h4>${escapeHtml(m.category)}: ${escapeHtml(m.title)}</h4><p class="muted small">${dateLabel(m.date)} · ${Number(m.mileage || 0).toLocaleString()} miles · ${escapeHtml(m.provider || "No provider")}</p><p class="small">${escapeHtml(m.notes || "")}</p>${m.nextDueMileage || m.nextDueDate ? `<p class="small muted">Next due: ${m.nextDueMileage ? Number(m.nextDueMileage).toLocaleString() + " miles" : ""} ${m.nextDueDate ? " · " + dateLabel(m.nextDueDate) : ""}</p>` : ""}</div><div style="text-align:right">${costCell(m)}<div class="actions" style="margin-top:8px;justify-content:flex-end"><button class="btn" data-edit="${m.id}">Edit</button><button class="btn danger" data-delete="${m.id}">Delete</button></div></div></div></div>`).join("");
  list.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => editMaintenance(root, btn.dataset.edit)));
  list.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => commit({ ...state.db, maintenance: state.db.maintenance.filter(x => x.id !== btn.dataset.delete) })));
}
