import { state, commit, uid, todayIso, selectedVehicle, getScopedData, escapeHtml, dateLabel } from "./app.js";

export function initDocumentsView(root) {
  const vehicle = selectedVehicle();
  const scoped = getScopedData(vehicle?.id);
  root.innerHTML = `<div class="grid grid-2"><section class="card"><h3>Receipts and Documents</h3><div id="documentList"></div></section><section class="card"><h3>Upload Proof of Service</h3>${formHtml()}</section></div>`;
  renderList(root, scoped.documents);
  root.querySelector("#documentForm").addEventListener("submit", addDocument);
}

function formHtml() {
  return `<form id="documentForm" class="form">
    <div class="form-row"><label><span class="field-label">Date</span><input class="input" type="date" name="date" value="${todayIso()}"></label><label><span class="field-label">Kind</span><input class="input" name="kind" placeholder="Receipt, Photo, Warranty"></label></div>
    <label><span class="field-label">Title</span><input class="input" name="title" placeholder="Oil change receipt"></label>
    <label><span class="field-label">File</span><input class="input" type="file" name="file" accept="image/*,.pdf,.txt"></label>
    <label><span class="field-label">Notes</span><textarea name="notes"></textarea></label>
    <button class="btn primary" type="submit">Save Document</button>
  </form>`;
}

async function addDocument(event) {
  event.preventDefault();
  const vehicle = selectedVehicle();
  if (!vehicle) return alert("Add a vehicle first.");
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const file = form.file.files[0];
  const dataUrl = file ? await fileToDataUrl(file) : "";
  const entry = { id: uid("doc"), vehicleId: vehicle.id, date: data.date || todayIso(), title: data.title || file?.name || "Document", kind: data.kind || "Receipt", fileName: file?.name || "", mimeType: file?.type || "", size: file?.size || 0, dataUrl, notes: data.notes || "", createdAt: new Date().toISOString() };
  commit({ ...state.db, documents: [...state.db.documents, entry] });
}

function renderList(root, docs) {
  const list = root.querySelector("#documentList");
  const sorted = docs.slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
  if (!sorted.length) { list.innerHTML = `<div class="empty-state">No documents uploaded yet.</div>`; return; }
  list.innerHTML = sorted.map(d => `<div class="record"><div class="record-head"><div><h4>${escapeHtml(d.title)}</h4><p class="muted small">${escapeHtml(d.kind)} · ${dateLabel(d.date)} · ${escapeHtml(d.fileName || "No file attached")}</p><p class="small">${escapeHtml(d.notes || "")}</p>${d.dataUrl && d.mimeType?.startsWith("image/") ? `<img class="preview-img" src="${d.dataUrl}" alt="${escapeHtml(d.title)}">` : ""}</div><div class="actions">${d.dataUrl ? `<a class="btn" href="${d.dataUrl}" download="${escapeHtml(d.fileName || d.title)}">Download</a>` : ""}<button class="btn danger" data-delete="${d.id}">Delete</button></div></div></div>`).join("");
  list.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => commit({ ...state.db, documents: state.db.documents.filter(d => d.id !== btn.dataset.delete) })));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
