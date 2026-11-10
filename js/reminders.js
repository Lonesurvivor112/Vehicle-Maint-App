import { state, commit, uid, selectedVehicle, getScopedData, escapeHtml, dateLabel, reminderStatus } from "./app.js";

export function initRemindersView(root) {
  const vehicle = selectedVehicle();
  const scoped = getScopedData(vehicle?.id);
  root.innerHTML = `<div class="grid grid-2"><section class="card"><h3>Service Reminders</h3><div id="reminderList"></div></section><section class="card"><h3>Add Reminder</h3>${formHtml()}</section></div>`;
  renderList(root, scoped.reminders, vehicle);
  root.querySelector("#reminderForm").addEventListener("submit", addReminder);
}

function formHtml() {
  return `<form id="reminderForm" class="form">
    <label><span class="field-label">Title</span><input class="input" name="title" placeholder="Tire rotation"></label>
    <label><span class="field-label">Type</span><select name="type" class="input"><option>Mileage</option><option>Date</option><option>Both</option></select></label>
    <div class="form-row"><label><span class="field-label">Due mileage</span><input class="input" type="number" name="dueMileage"></label><label><span class="field-label">Due date</span><input class="input" type="date" name="dueDate"></label></div>
    <div class="form-row"><label><span class="field-label">Repeat miles</span><input class="input" type="number" name="repeatMiles" placeholder="5000"></label><label><span class="field-label">Repeat months</span><input class="input" type="number" name="repeatMonths" placeholder="6"></label></div>
    <label><span class="field-label">Notes</span><textarea name="notes"></textarea></label>
    <button class="btn primary" type="submit">Add Reminder</button>
  </form>`;
}

function addReminder(event) {
  event.preventDefault();
  const vehicle = selectedVehicle();
  if (!vehicle) return alert("Add a vehicle first.");
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const entry = { id: uid("rem"), vehicleId: vehicle.id, title: data.title || "Service reminder", type: data.type || "Mileage", dueMileage: data.dueMileage ? Number(data.dueMileage) : "", dueDate: data.dueDate || "", repeatMiles: data.repeatMiles || "", repeatMonths: data.repeatMonths || "", status: "Open", notes: data.notes || "", createdAt: new Date().toISOString() };
  commit({ ...state.db, reminders: [...state.db.reminders, entry] });
}

/* Marking a repeating reminder Done schedules the next one automatically. */
function toggleReminder(id, vehicle) {
  const r = state.db.reminders.find(x => x.id === id);
  if (!r) return;
  const reminders = state.db.reminders.map(x => x.id === id ? { ...x, status: x.status === "Done" ? "Open" : "Done" } : x);
  const miles = Number(r.repeatMiles || 0);
  const months = Number(r.repeatMonths || 0);
  if (r.status !== "Done" && (miles > 0 || months > 0)) {
    const fromMiles = Math.max(Number(vehicle?.currentMileage || 0), Number(r.dueMileage || 0));
    let dueDate = "";
    if (months > 0) {
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      dueDate = d.toISOString().slice(0, 10);
    }
    reminders.push({ ...r, id: uid("rem"), status: "Open", dueMileage: miles > 0 ? fromMiles + miles : "", dueDate, type: miles > 0 && months > 0 ? "Both" : miles > 0 ? "Mileage" : "Date", createdAt: new Date().toISOString() });
  }
  commit({ ...state.db, reminders });
}

function renderList(root, reminders, vehicle) {
  const list = root.querySelector("#reminderList");
  if (!reminders.length) { list.innerHTML = `<div class="empty-state">No reminders yet.</div>`; return; }
  list.innerHTML = reminders.map(r => { const s = reminderStatus(r, vehicle); return `<div class="record"><div class="record-head"><div><h4>${escapeHtml(r.title)}</h4><p class="muted small">${escapeHtml(r.type)} · ${r.dueMileage ? Number(r.dueMileage).toLocaleString() + " miles" : ""} ${r.dueDate ? " · " + dateLabel(r.dueDate) : ""}</p><p class="small">${escapeHtml(r.notes || "")}</p></div><div><span class="badge ${s.css}">${s.label}</span><div class="actions" style="margin-top:8px"><button class="btn success" data-toggle="${r.id}">${r.status === "Done" ? "Reopen" : "Done"}</button><button class="btn danger" data-delete="${r.id}">Delete</button></div></div></div></div>`; }).join("");
  list.querySelectorAll("[data-toggle]").forEach(btn => btn.addEventListener("click", () => toggleReminder(btn.dataset.toggle, vehicle)));
  list.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => commit({ ...state.db, reminders: state.db.reminders.filter(r => r.id !== btn.dataset.delete) })));
}
