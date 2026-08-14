import { state, commit, uid, todayIso, selectedVehicle, getScopedData, money, escapeHtml, dateLabel } from "./app.js";

export function initExpensesView(root) {
  const vehicle = selectedVehicle();
  const scoped = getScopedData(vehicle?.id);
  root.innerHTML = `<div class="grid grid-2"><section class="card"><h3>Expense Ledger</h3><div id="expenseList"></div></section><section class="card"><h3>Add Expense</h3>${formHtml()}</section></div>`;
  renderList(root, scoped.expenses);
  root.querySelector("#expenseForm").addEventListener("submit", addExpense);
}

function formHtml() {
  return `<form id="expenseForm" class="form">
    <div class="form-row"><label><span class="field-label">Date</span><input class="input" type="date" name="date" value="${todayIso()}"></label><label><span class="field-label">Amount</span><input class="input" type="number" step="0.01" name="amount"></label></div>
    <label><span class="field-label">Type</span><input class="input" name="type" placeholder="Fuel, Insurance, Registration, Repair"></label>
    <label><span class="field-label">Vendor</span><input class="input" name="vendor"></label>
    <label><span class="field-label">Notes</span><textarea name="notes"></textarea></label>
    <button class="btn primary" type="submit">Add Expense</button>
  </form>`;
}

function addExpense(event) {
  event.preventDefault();
  const vehicle = selectedVehicle();
  if (!vehicle) return alert("Add a vehicle first.");
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const entry = { id: uid("exp"), vehicleId: vehicle.id, date: data.date || todayIso(), type: data.type || "Other", vendor: data.vendor || "", amount: Number(data.amount || 0), notes: data.notes || "", documentIds: [], createdAt: new Date().toISOString() };
  commit({ ...state.db, expenses: [...state.db.expenses, entry] });
}

function renderList(root, expenses) {
  const list = root.querySelector("#expenseList");
  const sorted = expenses.slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
  if (!sorted.length) { list.innerHTML = `<div class="empty-state">No expenses yet.</div>`; return; }
  list.innerHTML = sorted.map(e => `<div class="record"><div class="record-head"><div><h4>${escapeHtml(e.type)} · ${escapeHtml(e.vendor || "Unknown vendor")}</h4><p class="muted small">${dateLabel(e.date)}</p><p class="small">${escapeHtml(e.notes || "")}</p></div><div><strong>${money(e.amount)}</strong><br><button class="btn danger" data-delete="${e.id}">Delete</button></div></div></div>`).join("");
  list.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => commit({ ...state.db, expenses: state.db.expenses.filter(e => e.id !== btn.dataset.delete) })));
}
