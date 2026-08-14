import { state, commit, uid, escapeHtml } from "./app.js";

export function initVehiclesView(root) {
  root.innerHTML = `
    <div class="grid grid-2">
      <section class="card"><h3>Vehicle List</h3><div id="vehicleList"></div></section>
      <section class="card"><h3 id="vehicleFormTitle">Add Vehicle</h3>${vehicleForm()}</section>
    </div>`;
  renderList(root);
  bindForm(root);
}

function vehicleForm(vehicle = {}) {
  return `<form id="vehicleForm" class="form">
    <input type="hidden" name="id" value="${escapeHtml(vehicle.id || "")}">
    <label><span class="field-label">Display name</span><input class="input" name="name" value="${escapeHtml(vehicle.name || "")}" placeholder="Daily Driver"></label>
    <div class="form-row"><label><span class="field-label">Year</span><input class="input" name="year" value="${escapeHtml(vehicle.year || "")}"></label><label><span class="field-label">Make</span><input class="input" name="make" value="${escapeHtml(vehicle.make || "")}"></label></div>
    <div class="form-row"><label><span class="field-label">Model</span><input class="input" name="model" value="${escapeHtml(vehicle.model || "")}"></label><label><span class="field-label">Trim</span><input class="input" name="trim" value="${escapeHtml(vehicle.trim || "")}"></label></div>
    <div class="form-row"><label><span class="field-label">Current mileage</span><input class="input" type="number" name="currentMileage" value="${escapeHtml(vehicle.currentMileage || "")}"></label><label><span class="field-label">Color</span><input class="input" name="color" value="${escapeHtml(vehicle.color || "")}"></label></div>
    <div class="form-row"><label><span class="field-label">VIN</span><input class="input" name="vin" value="${escapeHtml(vehicle.vin || "")}"></label><label><span class="field-label">Plate</span><input class="input" name="plate" value="${escapeHtml(vehicle.plate || "")}"></label></div>
    <label><span class="field-label">Purchase date</span><input class="input" type="date" name="purchaseDate" value="${escapeHtml(vehicle.purchaseDate || "")}"></label>
    <label><span class="field-label">Notes</span><textarea name="notes">${escapeHtml(vehicle.notes || "")}</textarea></label>
    <div class="actions"><button class="btn primary" type="submit">Save Vehicle</button><button class="btn" type="button" id="clearVehicleForm">Clear</button></div>
  </form>`;
}

function renderList(root) {
  const list = root.querySelector("#vehicleList");
  if (!state.db.vehicles.length) { list.innerHTML = `<div class="empty-state">No vehicles yet.</div>`; return; }
  list.innerHTML = state.db.vehicles.map(v => `<div class="record"><div class="record-head"><div><h4>${escapeHtml(v.name)}</h4><p class="muted small">${escapeHtml([v.year, v.make, v.model, v.trim].filter(Boolean).join(" ")) || "No details"}</p><p class="small">${Number(v.currentMileage || 0).toLocaleString()} miles</p></div><div class="actions"><button class="btn" data-edit="${v.id}">Edit</button><button class="btn danger" data-delete="${v.id}">Delete</button></div></div></div>`).join("");
  list.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => editVehicle(root, btn.dataset.edit)));
  list.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteVehicle(btn.dataset.delete)));
}

function editVehicle(root, id) {
  const vehicle = state.db.vehicles.find(v => v.id === id);
  root.querySelector("#vehicleFormTitle").textContent = "Edit Vehicle";
  root.querySelector("#vehicleForm").outerHTML = vehicleForm(vehicle);
  bindForm(root);
}

function bindForm(root) {
  const form = root.querySelector("#vehicleForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const id = data.id || uid("veh");
    const vehicle = {
      id,
      name: data.name || `${data.year || ""} ${data.make || ""} ${data.model || ""}`.trim() || "Untitled Vehicle",
      year: data.year || "", make: data.make || "", model: data.model || "", trim: data.trim || "",
      vin: data.vin || "", plate: data.plate || "", color: data.color || "",
      currentMileage: Number(data.currentMileage || 0), purchaseDate: data.purchaseDate || "", notes: data.notes || "",
      createdAt: state.db.vehicles.find(v => v.id === id)?.createdAt || new Date().toISOString()
    };
    const vehicles = state.db.vehicles.some(v => v.id === id) ? state.db.vehicles.map(v => v.id === id ? vehicle : v) : [...state.db.vehicles, vehicle];
    state.selectedVehicleId = id;
    commit({ ...state.db, vehicles });
  });
  root.querySelector("#clearVehicleForm").addEventListener("click", () => {
    root.querySelector("#vehicleFormTitle").textContent = "Add Vehicle";
    form.outerHTML = vehicleForm();
    bindForm(root);
  });
}

function deleteVehicle(id) {
  if (!confirm("Delete this vehicle and all related records?")) return;
  commit({
    ...state.db,
    vehicles: state.db.vehicles.filter(v => v.id !== id),
    maintenance: state.db.maintenance.filter(x => x.vehicleId !== id),
    expenses: state.db.expenses.filter(x => x.vehicleId !== id),
    reminders: state.db.reminders.filter(x => x.vehicleId !== id),
    documents: state.db.documents.filter(x => x.vehicleId !== id),
  });
}
