import { state, commit, uid, todayIso, selectedVehicle, getScopedData, escapeHtml, dateLabel } from "./app.js";
import { openScanner, fileToAttachment, viewDocument, formatBytes } from "./scanner.js";

let pending = null; // scanned document waiting to be saved from this form

export function initDocumentsView(root) {
  const vehicle = selectedVehicle();
  const scoped = getScopedData(vehicle?.id);
  pending = null;
  root.innerHTML = `<div class="grid grid-2"><section class="card"><h3>Receipts and Documents</h3><div id="documentList"></div></section><section class="card"><h3>Add Proof of Service</h3>${formHtml(scoped.maintenance)}</section></div>`;
  renderList(root, scoped.documents);
  bindForm(root);
}

function formHtml(maintenance) {
  const options = maintenance.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(dateLabel(m.date))} · ${escapeHtml(m.category)}: ${escapeHtml(m.title)}</option>`).join("");
  return `<form id="documentForm" class="form">
    <div class="actions"><button class="btn primary" type="button" id="docScanBtn">📷 Scan Document</button><span class="muted small">or choose a file below</span></div>
    <div id="docPending"></div>
    <div class="form-row"><label><span class="field-label">Date</span><input class="input" type="date" name="date" value="${todayIso()}"></label><label><span class="field-label">Kind</span><input class="input" name="kind" list="docKindsList" placeholder="Receipt, Photo, Warranty"></label></div>
    <datalist id="docKindsList"><option>Receipt</option><option>Invoice</option><option>Work order</option><option>Warranty</option><option>Inspection</option><option>Registration</option><option>Insurance</option><option>Photo</option></datalist>
    <label><span class="field-label">Title</span><input class="input" name="title" placeholder="Oil change receipt"></label>
    <label><span class="field-label">Link to maintenance entry</span><select class="input" name="maintenanceId"><option value="">— Not linked —</option>${options}</select></label>
    <label id="docFileLabel"><span class="field-label">File</span><input class="input" type="file" name="file" accept="image/*,.pdf,.txt"></label>
    <label><span class="field-label">Notes</span><textarea name="notes"></textarea></label>
    <button class="btn primary" type="submit">Save Document</button>
  </form>`;
}

function bindForm(root) {
  const form = root.querySelector("#documentForm");
  const showPending = () => {
    root.querySelector("#docPending").innerHTML = pending
      ? `<div class="record small">Scanned: <strong>${escapeHtml(pending.fileName)}</strong> · ${pending.pageCount} page${pending.pageCount === 1 ? "" : "s"} · ${formatBytes(pending.size)} <button class="btn tiny danger" type="button" id="docPendingClear">✕</button></div>`
      : "";
    root.querySelector("#docFileLabel").classList.toggle("hidden", Boolean(pending));
    root.querySelector("#docPendingClear")?.addEventListener("click", () => { pending = null; showPending(); });
  };
  root.querySelector("#docScanBtn").addEventListener("click", async () => {
    state.formDirty = true;
    const scanned = await openScanner({ title: form.title.value, kind: form.kind.value || "Receipt" });
    if (!scanned) return;
    pending = scanned;
    form.title.value = scanned.title;
    form.kind.value = scanned.kind;
    showPending();
  });
  form.addEventListener("submit", addDocument);
}

async function addDocument(event) {
  event.preventDefault();
  const vehicle = selectedVehicle();
  if (!vehicle) return alert("Add a vehicle first.");
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const file = form.file.files[0];
  let att = pending;
  if (!att && file) {
    try { att = await fileToAttachment(file); } catch (err) { return alert(`Could not read that file: ${err.message || err}`); }
  }
  const id = uid("doc");
  const maintenanceId = data.maintenanceId || "";
  const entry = {
    id, vehicleId: vehicle.id, maintenanceId, date: data.date || todayIso(),
    title: data.title || att?.title || file?.name || "Document", kind: data.kind || att?.kind || "Receipt",
    fileName: att?.fileName || "", mimeType: att?.mimeType || "", size: att?.size || 0, dataUrl: att?.dataUrl || "",
    thumbUrl: att?.thumbUrl || "", pageCount: att?.pageCount || 1, notes: data.notes || "", createdAt: new Date().toISOString()
  };
  const maintenance = maintenanceId
    ? state.db.maintenance.map(m => m.id === maintenanceId ? { ...m, documentIds: [...(m.documentIds || []), id] } : m)
    : state.db.maintenance;
  pending = null;
  commit({ ...state.db, maintenance, documents: [...state.db.documents, entry] });
}

function deleteDocument(id) {
  if (!confirm("Delete this document?")) return;
  commit({
    ...state.db,
    documents: state.db.documents.filter(d => d.id !== id),
    maintenance: state.db.maintenance.map(m => m.documentIds?.includes(id) ? { ...m, documentIds: m.documentIds.filter(x => x !== id) } : m),
  });
}

function renderList(root, docs) {
  const list = root.querySelector("#documentList");
  const sorted = docs.slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
  if (!sorted.length) { list.innerHTML = `<div class="empty-state">No documents uploaded yet.</div>`; return; }
  list.innerHTML = sorted.map(d => {
    const linked = state.db.maintenance.find(m => m.id === d.maintenanceId || m.documentIds?.includes(d.id));
    const thumb = d.thumbUrl || (d.dataUrl && d.mimeType?.startsWith("image/") ? d.dataUrl : "");
    return `<div class="record"><div class="record-head"><div><h4>${escapeHtml(d.title)}</h4><p class="muted small">${escapeHtml(d.kind)} · ${dateLabel(d.date)} · ${escapeHtml(d.fileName || "No file attached")}${d.size ? ` · ${formatBytes(d.size)}` : ""}${d.pageCount > 1 ? ` · ${d.pageCount} pages` : ""}</p>${linked ? `<p class="small muted">🔗 ${escapeHtml(linked.category)}: ${escapeHtml(linked.title)} (${dateLabel(linked.date)})</p>` : ""}<p class="small">${escapeHtml(d.notes || "")}</p>${thumb ? `<img class="preview-img" src="${thumb}" alt="${escapeHtml(d.title)}" data-view="${d.id}" style="cursor:pointer">` : ""}</div><div class="actions" style="align-content:flex-start;justify-content:flex-end">${d.dataUrl ? `<button class="btn" data-view="${d.id}">View</button><a class="btn" href="${d.dataUrl}" download="${escapeHtml(d.fileName || d.title)}">Download</a>` : ""}<button class="btn danger" data-delete="${d.id}">Delete</button></div></div></div>`;
  }).join("");
  list.querySelectorAll("[data-view]").forEach(el => el.addEventListener("click", () => viewDocument(state.db.documents.find(d => d.id === el.dataset.view))));
  list.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteDocument(btn.dataset.delete)));
}
