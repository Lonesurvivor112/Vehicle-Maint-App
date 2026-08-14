import { state, replaceDatabase, selectedVehicle, getScopedData, escapeHtml, todayIso } from "./app.js";

export function initExportView(root) {
  root.innerHTML = `<div class="grid grid-2">
    <section class="card"><h3>Export Records</h3><div class="actions"><button id="exportFullJson" class="btn primary">Export Full JSON</button><button id="exportVehicleJson" class="btn">Export Selected Vehicle JSON</button><button id="exportCsv" class="btn">Export Maintenance CSV</button></div><p class="muted small">Use JSON for backup and CSV for Excel reports.</p></section>
    <section class="card"><h3>Import Backup</h3><input id="importFile" type="file" accept="application/json,.json" class="input"><div class="actions" style="margin-top:12px"><button id="importJson" class="btn primary">Import JSON</button></div></section>
  </div>`;
  root.querySelector("#exportFullJson").addEventListener("click", () => downloadJson(state.db, `vehiclevault-full-${todayIso()}.json`));
  root.querySelector("#exportVehicleJson").addEventListener("click", exportVehicleJson);
  root.querySelector("#exportCsv").addEventListener("click", exportCsv);
  root.querySelector("#importJson").addEventListener("click", () => importJson(root));
}

function exportVehicleJson() {
  const vehicle = selectedVehicle();
  if (!vehicle) return alert("No vehicle selected.");
  const scoped = getScopedData(vehicle.id);
  downloadJson({ ...state.db, vehicles: [vehicle], maintenance: scoped.maintenance, expenses: scoped.expenses, reminders: scoped.reminders, documents: scoped.documents }, `vehiclevault-${safeName(vehicle.name)}-${todayIso()}.json`);
}

function exportCsv() {
  const vehicle = selectedVehicle();
  if (!vehicle) return alert("No vehicle selected.");
  const rows = getScopedData(vehicle.id).maintenance.map(m => ({ vehicle: vehicle.name, date: m.date, mileage: m.mileage, category: m.category, title: m.title, provider: m.provider, amountPaid: m.cost, totalCost: m.totalCost, coveredBy: m.coveredBy, notes: m.notes, nextDueMileage: m.nextDueMileage, nextDueDate: m.nextDueDate }));
  downloadText(`vehiclevault-maintenance-${safeName(vehicle.name)}-${todayIso()}.csv`, toCsv(rows), "text/csv");
}

async function importJson(root) {
  const file = root.querySelector("#importFile").files[0];
  if (!file) return alert("Choose a JSON file first.");
  const parsed = JSON.parse(await file.text());
  replaceDatabase(parsed);
}

function downloadJson(obj, filename) { downloadText(filename, JSON.stringify(obj, null, 2), "application/json"); }
function downloadText(filename, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function toCsv(rows) { if (!rows.length) return ""; const keys = Object.keys(rows[0]); const esc = v => `"${String(v ?? "").replaceAll('"', '""')}"`; return [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n"); }
function safeName(name) { return String(name || "vehicle").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
