import { loadDb, saveDb, resetDb, setDb, storeRemoteDb } from "./storage.js";
import { initDashboard } from "./dashboard.js";
import { initVehiclesView } from "./vehicles.js";
import { initMaintenanceView } from "./maintenance.js";
import { initRemindersView } from "./reminders.js";
import { initExpensesView } from "./expenses.js";
import { initDocumentsView } from "./documents.js";
import { initExportView } from "./export.js";
import { initSyncView, initCloudSync, scheduleCloudWrite } from "./github-sync.js";

export const state = {
  db: await loadDb(),
  selectedVehicleId: null,
  currentView: "dashboard",
  syncStatus: "Local only",
  // True while the user has unsaved edits in a form, so a background cloud
  // pull doesn't re-render and wipe what they are typing.
  formDirty: false,
};

state.selectedVehicleId = state.db.vehicles[0]?.id || null;

const viewTitle = document.querySelector("#viewTitle");
const viewRoot = document.querySelector("#viewRoot");
const vehicleSelect = document.querySelector("#vehicleSelect");
const updatedPill = document.querySelector("#updatedPill");
const syncPill = document.querySelector("#syncPill");
const navButtons = Array.from(document.querySelectorAll(".nav-btn"));

const views = {
  dashboard: { title: "Dashboard", init: initDashboard },
  vehicles: { title: "Vehicles", init: initVehiclesView },
  maintenance: { title: "Maintenance", init: initMaintenanceView },
  reminders: { title: "Reminders", init: initRemindersView },
  expenses: { title: "Expenses", init: initExpensesView },
  documents: { title: "Documents", init: initDocumentsView },
  export: { title: "Export", init: initExportView },
  sync: { title: "GitHub Sync", init: initSyncView },
};

export function uid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  }[char]));
}

export function dateLabel(value) {
  if (!value) return "Not set";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export function selectedVehicle() {
  return state.db.vehicles.find(v => v.id === state.selectedVehicleId) || state.db.vehicles[0] || null;
}

export function commit(nextDb) {
  state.db = saveDb(nextDb);
  if (!state.selectedVehicleId || !state.db.vehicles.some(v => v.id === state.selectedVehicleId)) {
    state.selectedVehicleId = state.db.vehicles[0]?.id || null;
  }
  scheduleCloudWrite();
  render();
}

export function replaceDatabase(nextDb) {
  state.db = setDb(nextDb);
  state.selectedVehicleId = state.db.vehicles[0]?.id || null;
  scheduleCloudWrite();
  render();
}

/* Apply a newer copy pulled from the cloud without re-stamping or re-pushing it. */
export function applyRemoteDatabase(remoteDb) {
  state.db = storeRemoteDb(remoteDb);
  if (!state.db.vehicles.some(v => v.id === state.selectedVehicleId)) {
    state.selectedVehicleId = state.db.vehicles[0]?.id || null;
  }
  render();
}

export function setSyncStatus(message) {
  state.syncStatus = message;
  syncPill.textContent = message;
}

export function reminderStatus(reminder, vehicle) {
  if (reminder.status === "Done") return { label: "Completed", css: "done", urgent: false };
  const mileage = Number(vehicle?.currentMileage || 0);
  const dueMileage = Number(reminder.dueMileage || 0);
  const hasMileage = reminder.type !== "Date" && dueMileage > 0;
  const hasDate = reminder.type !== "Mileage" && reminder.dueDate;
  const days = hasDate ? Math.ceil((new Date(`${reminder.dueDate}T00:00:00`) - new Date()) / 86400000) : null;
  if ((hasMileage && mileage >= dueMileage) || (hasDate && days <= 0)) return { label: "Due now", css: "due", urgent: true };
  if ((hasMileage && dueMileage - mileage <= 500) || (hasDate && days <= 14)) return { label: "Coming due", css: "soon", urgent: true };
  return { label: "Scheduled", css: "", urgent: false };
}

export function getScopedData(vehicleId = state.selectedVehicleId) {
  return {
    vehicle: state.db.vehicles.find(v => v.id === vehicleId) || null,
    maintenance: state.db.maintenance.filter(x => x.vehicleId === vehicleId),
    expenses: state.db.expenses.filter(x => x.vehicleId === vehicleId),
    reminders: state.db.reminders.filter(x => x.vehicleId === vehicleId),
    documents: state.db.documents.filter(x => x.vehicleId === vehicleId),
  };
}

function renderVehicleSelect() {
  vehicleSelect.innerHTML = state.db.vehicles.map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join("");
  vehicleSelect.value = state.selectedVehicleId || "";
  vehicleSelect.disabled = state.db.vehicles.length === 0;
}

export function render() {
  renderVehicleSelect();
  const view = views[state.currentView] || views.dashboard;
  viewTitle.textContent = view.title;
  updatedPill.textContent = `Updated: ${state.db.updatedAt ? new Date(state.db.updatedAt).toLocaleString() : "never"}`;
  syncPill.textContent = state.syncStatus;
  viewRoot.innerHTML = "";
  state.formDirty = false;
  view.init(viewRoot);
  navButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.view === state.currentView));
}

vehicleSelect.addEventListener("change", (event) => {
  state.selectedVehicleId = event.target.value;
  render();
});

viewRoot.addEventListener("input", (event) => {
  if (event.target.closest("form") && !event.target.closest("#syncForm")) state.formDirty = true;
});

navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    state.currentView = btn.dataset.view;
    render();
  });
});

if ("serviceWorker" in navigator) {
  // The awaited DB load above can finish after the page's load event, so
  // register right away in that case instead of waiting for an event that passed.
  const registerSw = () => navigator.serviceWorker.register("sw.js").catch(console.warn);
  if (document.readyState === "complete") registerSw(); else window.addEventListener("load", registerSw);
}

window.VehicleVault = { state, commit, resetDb };
render();
initCloudSync();
