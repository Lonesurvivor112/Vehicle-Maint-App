/* Document scanner — no libraries, works offline.
 * Capture uses <input capture="environment">, which opens the rear camera on
 * iPhone/Android (including the Home Screen app) and a file picker on desktop.
 * Each page: auto-detect the paper edges, let the user drag the 4 corners,
 * perspective-correct, optionally enhance (whiten paper / darken text), then
 * compress to JPEG. One page is saved as a JPEG, several pages as one PDF. */
import { escapeHtml, todayIso } from "./app.js";

const WORK_MAX = 2000;   // longest side kept while editing
const OUT_MAX = 1700;    // longest side of the saved page (~200 dpi on Letter)
const JPEG_QUALITY = 0.72;
const THUMB_MAX = 320;
const HANDLE_HIT = 34;   // corner grab radius, CSS px

/* ---------- public API ---------- */

/* Opens the scanner. Resolves to an attachment object, or null if cancelled. */
export function openScanner({ title = "", kind = "Receipt" } = {}) {
  return new Promise((resolve) => {
    const scan = { pages: [], mode: "document", resolve, title, kind };
    buildModal(scan);
  });
}

/* Converts a picked file into an attachment, compressing photos. */
export async function fileToAttachment(file) {
  if (file.type.startsWith("image/")) {
    const canvas = await fileToCanvas(file, OUT_MAX);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    return {
      fileName: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      mimeType: "image/jpeg",
      size: dataUrlBytes(dataUrl),
      dataUrl,
      thumbUrl: thumbFrom(canvas),
      pageCount: 1,
    };
  }
  const dataUrl = await readAsDataUrl(file);
  return { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl, thumbUrl: "", pageCount: 1 };
}

/* Opens a stored document in a new tab (works for PDFs and images on iOS too). */
export function viewDocument(doc) {
  if (!doc?.dataUrl) return;
  const [meta, b64] = doc.dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] || doc.mimeType || "application/octet-stream";
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const win = window.open(url, "_blank");
  if (!win) { // pop-up blocked — fall back to a download
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.fileName || doc.title || "document";
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function formatBytes(n) {
  n = Number(n || 0);
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/* ---------- modal ---------- */

function buildModal(scan) {
  const el = document.createElement("div");
  el.className = "modal-backdrop";
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Scan document">
    <div class="modal-head"><h3>Scan Document</h3><button class="btn" type="button" data-act="cancel" aria-label="Close">✕</button></div>
    <div class="modal-body"></div>
    <input type="file" accept="image/*" capture="environment" data-input="camera" hidden>
    <input type="file" accept="image/*" data-input="library" hidden>
  </div>`;
  document.body.appendChild(el);
  document.body.classList.add("modal-open");
  scan.el = el;
  scan.body = el.querySelector(".modal-body");

  const onPick = async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    scan.body.innerHTML = `<div class="empty-state">Loading photo…</div>`;
    try {
      const canvas = await fileToCanvas(file, WORK_MAX);
      startEdit(scan, canvas);
    } catch (err) {
      alert(`Could not read that image: ${err.message || err}`);
      scan.pages.length ? showReview(scan) : showCapture(scan);
    }
  };
  el.querySelector('[data-input="camera"]').addEventListener("change", onPick);
  el.querySelector('[data-input="library"]').addEventListener("change", onPick);
  el.querySelector('[data-act="cancel"]').addEventListener("click", () => close(scan, null));

  showCapture(scan);
}

function close(scan, result) {
  if (result === null && scan.pages.length && !confirm("Discard the scanned pages?")) return;
  scan.el.remove();
  document.body.classList.remove("modal-open");
  scan.resolve(result);
}

function pick(scan, which) {
  scan.el.querySelector(`[data-input="${which}"]`).click();
}

function showCapture(scan) {
  scan.body.innerHTML = `<div class="scan-capture">
    <p class="muted">Lay the receipt or document on a darker surface, fill the frame and avoid glare.</p>
    <div class="actions" style="justify-content:center">
      <button class="btn primary big" type="button" data-act="camera">📷 Take Photo</button>
      <button class="btn big" type="button" data-act="library">🖼️ Choose Image</button>
    </div>
    ${scan.pages.length ? `<div class="actions" style="justify-content:center;margin-top:12px"><button class="btn" type="button" data-act="back">Back to pages</button></div>` : ""}
  </div>`;
  scan.body.querySelector('[data-act="camera"]').addEventListener("click", () => pick(scan, "camera"));
  scan.body.querySelector('[data-act="library"]').addEventListener("click", () => pick(scan, "library"));
  scan.body.querySelector('[data-act="back"]')?.addEventListener("click", () => showReview(scan));
}

/* ---------- edit step: corners, rotate, mode ---------- */

function startEdit(scan, canvas) {
  const ed = { src: canvas, corners: detectDocument(canvas) || fullCorners(canvas) };
  scan.body.innerHTML = `<div class="scan-edit">
    <p class="muted small">Drag the corners to the edges of the page.</p>
    <div class="scan-canvas-wrap"><canvas class="scan-canvas"></canvas></div>
    <div class="actions scan-tools">
      <button class="btn" type="button" data-act="rotl" title="Rotate left">⟲</button>
      <button class="btn" type="button" data-act="rotr" title="Rotate right">⟳</button>
      <button class="btn" type="button" data-act="auto">Auto-detect</button>
      <button class="btn" type="button" data-act="full">Whole photo</button>
    </div>
    <div class="segmented" role="radiogroup" aria-label="Scan mode">
      ${["document", "gray", "color"].map(m => `<button type="button" class="seg ${scan.mode === m ? "active" : ""}" data-mode="${m}">${{ document: "Enhanced", gray: "Grayscale", color: "Color" }[m]}</button>`).join("")}
    </div>
    <div class="actions" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" type="button" data-act="retake">Retake</button>
      <button class="btn primary" type="button" data-act="use">Use This Page</button>
    </div>
  </div>`;
  const display = scan.body.querySelector(".scan-canvas");
  const draw = () => drawEditor(display, ed);
  const setCorners = (c) => { ed.corners = c; draw(); };

  bindCornerDrag(display, ed, draw);
  scan.body.querySelector('[data-act="rotl"]').addEventListener("click", () => { ed.src = rotate(ed.src, -1); setCorners(detectDocument(ed.src) || fullCorners(ed.src)); });
  scan.body.querySelector('[data-act="rotr"]').addEventListener("click", () => { ed.src = rotate(ed.src, 1); setCorners(detectDocument(ed.src) || fullCorners(ed.src)); });
  scan.body.querySelector('[data-act="auto"]').addEventListener("click", () => {
    const found = detectDocument(ed.src);
    if (!found) alert("Couldn't find the page edges automatically — drag the corners instead.");
    setCorners(found || fullCorners(ed.src));
  });
  scan.body.querySelector('[data-act="full"]').addEventListener("click", () => setCorners(fullCorners(ed.src)));
  scan.body.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
    scan.mode = btn.dataset.mode;
    scan.body.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b === btn));
  }));
  scan.body.querySelector('[data-act="retake"]').addEventListener("click", () => scan.pages.length ? showReview(scan) : showCapture(scan));
  scan.body.querySelector('[data-act="use"]').addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Processing…";
    await new Promise(r => setTimeout(r, 30)); // let the label paint first
    const page = processPage(ed.src, ed.corners, scan.mode);
    scan.pages.push(page);
    showReview(scan);
  });

  // Size the canvas once the modal has laid out, and on rotation/resize.
  requestAnimationFrame(draw);
  const ro = new ResizeObserver(draw);
  ro.observe(display.parentElement);
}

function drawEditor(display, ed) {
  const wrap = display.parentElement;
  if (!wrap.isConnected) return;
  const maxW = wrap.clientWidth;
  const maxH = Math.max(240, Math.min(window.innerHeight * 0.55, 640));
  const scale = Math.min(maxW / ed.src.width, maxH / ed.src.height);
  const w = Math.round(ed.src.width * scale);
  const h = Math.round(ed.src.height * scale);
  const dpr = window.devicePixelRatio || 1;
  display.style.width = `${w}px`;
  display.style.height = `${h}px`;
  display.width = Math.round(w * dpr);
  display.height = Math.round(h * dpr);
  ed.viewScale = scale;

  const ctx = display.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(ed.src, 0, 0, w, h);
  const pts = ed.corners.map(p => ({ x: p.x * scale, y: p.y * scale }));

  // Dim everything outside the selected quad.
  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,.55)";
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.moveTo(pts[0].x, pts[0].y);
  [3, 2, 1].forEach(i => ctx.lineTo(pts[i].x, pts[i].y));
  ctx.closePath();
  ctx.fill("evenodd");
  ctx.restore();

  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.stroke();

  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(34,211,238,.35)";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#22d3ee";
    ctx.stroke();
  });
}

function bindCornerDrag(display, ed, draw) {
  let active = -1;
  const toImage = (event) => {
    const rect = display.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / ed.viewScale, y: (event.clientY - rect.top) / ed.viewScale };
  };
  display.addEventListener("pointerdown", (event) => {
    const p = toImage(event);
    const hit = HANDLE_HIT / ed.viewScale;
    let best = -1, bestDist = Infinity;
    ed.corners.forEach((c, i) => {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (bestDist > hit) return;
    active = best;
    display.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  display.addEventListener("pointermove", (event) => {
    if (active < 0) return;
    const p = toImage(event);
    ed.corners[active] = {
      x: Math.min(ed.src.width, Math.max(0, p.x)),
      y: Math.min(ed.src.height, Math.max(0, p.y)),
    };
    draw();
  });
  const end = () => { active = -1; };
  display.addEventListener("pointerup", end);
  display.addEventListener("pointercancel", end);
}

/* ---------- review step: page list, title, save ---------- */

function showReview(scan) {
  const total = scan.pages.reduce((s, p) => s + dataUrlBytes(p.dataUrl), 0);
  scan.body.innerHTML = `<div class="scan-review">
    <div class="scan-pages">
      ${scan.pages.map((p, i) => `<figure class="scan-page"><img src="${p.thumbUrl}" alt="Page ${i + 1}"><figcaption>Page ${i + 1}</figcaption><button class="btn danger tiny" type="button" data-remove="${i}" aria-label="Remove page ${i + 1}">✕</button></figure>`).join("")}
      <button class="scan-page add" type="button" data-act="add">＋<span>Add page</span></button>
    </div>
    <p class="muted small">${scan.pages.length} page${scan.pages.length === 1 ? "" : "s"} · about ${formatBytes(total)}${scan.pages.length > 1 ? " · saved as one PDF" : ""}</p>
    <div class="form">
      <label><span class="field-label">Title</span><input class="input" data-field="title" placeholder="Oil change receipt" value="${escapeHtml(scan.title)}"></label>
      <label><span class="field-label">Kind</span><input class="input" data-field="kind" list="docKinds" value="${escapeHtml(scan.kind)}"></label>
      <datalist id="docKinds"><option>Receipt</option><option>Invoice</option><option>Work order</option><option>Warranty</option><option>Inspection</option><option>Registration</option><option>Insurance</option><option>Photo</option></datalist>
    </div>
    <div class="actions" style="justify-content:flex-end;margin-top:12px">
      <button class="btn" type="button" data-act="cancel2">Cancel</button>
      <button class="btn primary" type="button" data-act="save" ${scan.pages.length ? "" : "disabled"}>Attach Document</button>
    </div>
  </div>`;
  const titleInput = scan.body.querySelector('[data-field="title"]');
  const kindInput = scan.body.querySelector('[data-field="kind"]');
  titleInput.addEventListener("input", () => { scan.title = titleInput.value; });
  kindInput.addEventListener("input", () => { scan.kind = kindInput.value; });
  scan.body.querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", () => {
    scan.pages.splice(Number(btn.dataset.remove), 1);
    scan.pages.length ? showReview(scan) : showCapture(scan);
  }));
  scan.body.querySelector('[data-act="add"]').addEventListener("click", () => showCapture(scan));
  scan.body.querySelector('[data-act="cancel2"]').addEventListener("click", () => close(scan, null));
  scan.body.querySelector('[data-act="save"]').addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Saving…";
    const result = await buildAttachment(scan);
    scan.pages = []; // nothing left to discard
    close(scan, result);
  });
}

async function buildAttachment(scan) {
  const title = scan.title.trim() || `Scan ${todayIso()}`;
  const base = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "scan";
  const first = scan.pages[0];
  if (scan.pages.length === 1) {
    return { title, kind: scan.kind || "Receipt", fileName: `${base}.jpg`, mimeType: "image/jpeg", size: dataUrlBytes(first.dataUrl), dataUrl: first.dataUrl, thumbUrl: first.thumbUrl, pageCount: 1, scanned: true };
  }
  const pdf = buildPdf(scan.pages);
  const dataUrl = await readAsDataUrl(pdf);
  return { title, kind: scan.kind || "Receipt", fileName: `${base}.pdf`, mimeType: "application/pdf", size: pdf.size, dataUrl, thumbUrl: first.thumbUrl, pageCount: scan.pages.length, scanned: true };
}

/* ---------- image processing ---------- */

function processPage(src, corners, mode) {
  const out = warp(src, corners);
  if (mode !== "color") enhance(out, mode);
  return { dataUrl: out.toDataURL("image/jpeg", JPEG_QUALITY), thumbUrl: thumbFrom(out), width: out.width, height: out.height };
}

function fullCorners(c) {
  return [{ x: 0, y: 0 }, { x: c.width, y: 0 }, { x: c.width, y: c.height }, { x: 0, y: c.height }];
}

function isFull(corners, c) {
  const f = fullCorners(c);
  return corners.every((p, i) => Math.hypot(p.x - f[i].x, p.y - f[i].y) < 2);
}

/* Perspective-correct the quad (tl, tr, br, bl) into a flat rectangle. */
function warp(src, corners) {
  const [tl, tr, br, bl] = corners;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const k = Math.min(1, OUT_MAX / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (isFull(corners, src)) {
    octx.imageSmoothingQuality = "high";
    octx.drawImage(src, 0, 0, w, h);
    return out;
  }

  const sw = src.width, sh = src.height;
  const sdata = src.getContext("2d").getImageData(0, 0, sw, sh).data;
  const odata = octx.createImageData(w, h);
  const o = odata.data;
  const H = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], corners);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d = H[6] * px + H[7] * py + 1;
      let sx = (H[0] * px + H[1] * py + H[2]) / d - 0.5;
      let sy = (H[3] * px + H[4] * py + H[5]) / d - 0.5;
      sx = Math.min(sw - 1.001, Math.max(0, sx));
      sy = Math.min(sh - 1.001, Math.max(0, sy));
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const oi = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sdata[i00 + c] + (sdata[i10 + c] - sdata[i00 + c]) * fx;
        const bot = sdata[i01 + c] + (sdata[i11 + c] - sdata[i01 + c]) * fx;
        o[oi + c] = top + (bot - top) * fy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(odata, 0, 0);
  return out;
}

/* Solve the 3x3 homography that maps 4 points `from` onto 4 points `to`. */
function homography(from, to) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < 8; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b.map((val, i) => val / A[i][i]);
}

/* "gray": plain grayscale. "document": flatten uneven lighting, whiten the
 * paper and darken the ink — the classic scanner look, and it compresses well. */
function enhance(canvas, mode) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  if (mode === "gray") {
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = l;
    }
    ctx.putImageData(img, 0, 0);
    return;
  }

  // Background estimate: shrink hard (averages away the thin ink strokes),
  // take a local max to favour paper over text, then blur back up.
  const bw = Math.max(8, Math.round(w / 24)), bh = Math.max(8, Math.round(h / 24));
  const small = document.createElement("canvas");
  small.width = bw; small.height = bh;
  const sctx = small.getContext("2d");
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, bw, bh);
  const sd = sctx.getImageData(0, 0, bw, bh);
  const lum = new Float32Array(bw * bh);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * sd.data[i * 4] + 0.587 * sd.data[i * 4 + 1] + 0.114 * sd.data[i * 4 + 2];
  const maxed = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = Math.min(bh - 1, Math.max(0, y + dy)), xx = Math.min(bw - 1, Math.max(0, x + dx));
        m = Math.max(m, lum[yy * bw + xx]);
      }
      const i = (y * bw + x) * 4;
      maxed[i] = maxed[i + 1] = maxed[i + 2] = m; maxed[i + 3] = 255;
    }
  }
  sctx.putImageData(new ImageData(maxed, bw, bh), 0, 0);
  const bg = document.createElement("canvas");
  bg.width = w; bg.height = h;
  const bgctx = bg.getContext("2d");
  bgctx.imageSmoothingQuality = "high";
  bgctx.drawImage(small, 0, 0, w, h);
  const bgd = bgctx.getImageData(0, 0, w, h).data;

  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const norm = Math.min(1, l / Math.max(40, bgd[i])); // 1 = paper, lower = ink
    // Contrast curve: paper → white, ink → near black, keep some anti-aliasing.
    let v = (norm - 0.55) / (0.88 - 0.55);
    v = Math.min(1, Math.max(0, v));
    v = v * v * (3 - 2 * v);
    d[i] = d[i + 1] = d[i + 2] = Math.round(v * 255);
  }
  ctx.putImageData(img, 0, 0);
}

/* Find the paper: Otsu threshold on a small grayscale copy, keep the largest
 * bright blob, take its extreme corners. Returns null when unsure. */
function detectDocument(src) {
  const S = 220;
  const k = Math.min(1, S / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) {
    g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) | 0;
    hist[g[i]]++;
  }
  // Otsu
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thresh = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = g.length - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thresh = t; }
  }
  // Largest connected bright region (4-neighbour flood fill).
  const label = new Int32Array(w * h).fill(-1);
  let bestId = -1, bestSize = 0;
  const stack = [];
  for (let start = 0, id = 0; start < g.length; start++) {
    if (g[start] <= thresh || label[start] !== -1) continue;
    let size = 0;
    stack.push(start); label[start] = id;
    while (stack.length) {
      const p = stack.pop(); size++;
      const x = p % w, y = (p / w) | 0;
      const n = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of n) if (q >= 0 && label[q] === -1 && g[q] > thresh) { label[q] = id; stack.push(q); }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
    id++;
  }
  const area = bestSize / g.length;
  if (bestId < 0 || area < 0.12 || area > 0.97) return null;

  // Extreme points of the blob give the four corners.
  let tl, tr, br, bl, sTL = Infinity, sTR = -Infinity, sBR = -Infinity, sBL = Infinity;
  for (let p = 0; p < g.length; p++) {
    if (label[p] !== bestId) continue;
    const x = p % w, y = (p / w) | 0;
    if (x + y < sTL) { sTL = x + y; tl = { x, y }; }
    if (x - y > sTR) { sTR = x - y; tr = { x, y }; }
    if (x + y > sBR) { sBR = x + y; br = { x, y }; }
    if (x - y < sBL) { sBL = x - y; bl = { x, y }; }
  }
  const corners = [tl, tr, br, bl].map(p => ({
    x: Math.min(src.width, Math.max(0, (p.x + 0.5) / k)),
    y: Math.min(src.height, Math.max(0, (p.y + 0.5) / k)),
  }));
  // Reject degenerate shapes (e.g. a sliver or a triangle).
  const quadArea = Math.abs(corners.reduce((s, p, i) => {
    const q = corners[(i + 1) % 4];
    return s + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
  if (quadArea < 0.1 * src.width * src.height) return null;
  return corners;
}

function rotate(src, dir) {
  const out = document.createElement("canvas");
  out.width = src.height;
  out.height = src.width;
  const ctx = out.getContext("2d");
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(dir * Math.PI / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

/* ---------- helpers ---------- */

async function fileToCanvas(file, maxSide) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode(); // browsers apply the photo's EXIF rotation here
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function thumbFrom(canvas) {
  const k = Math.min(1, THUMB_MAX / Math.max(canvas.width, canvas.height));
  const t = document.createElement("canvas");
  t.width = Math.max(1, Math.round(canvas.width * k));
  t.height = Math.max(1, Math.round(canvas.height * k));
  const ctx = t.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", 0.6);
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl).split(",")[1] || "";
  return Math.floor(b64.length * 3 / 4);
}

function dataUrlToBytes(dataUrl) {
  const bin = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* Minimal PDF writer: one JPEG per page, page width = US Letter (612 pt). */
function buildPdf(pages) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (part) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = pages.length;
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`));
  pages.forEach((p, i) => {
    const pageId = 3 + i * 3, imgId = pageId + 1, contentId = pageId + 2;
    const W = 612, H = Math.round(612 * p.height / p.width);
    const jpeg = dataUrlToBytes(p.dataUrl);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(pageId, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    obj(imgId, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
      push(jpeg);
      push("\nendstream");
    });
    obj(contentId, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  });
  const total = 3 + n * 3;
  const xrefAt = length;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}
