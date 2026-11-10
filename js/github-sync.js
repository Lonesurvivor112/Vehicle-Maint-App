/* GitHub cloud sync — same model as SnakApp.
 * The app is public on GitHub Pages; the database is one JSON file in a
 * separate PRIVATE repo, read and written through the GitHub Contents API with
 * a fine-grained token. Config and token live only in this device's
 * localStorage and are never written into the database.
 * Changes push ~1.5 s after they are made; other devices pick them up within a
 * minute. Newer copy wins, decided by the updatedAt stamp inside the data. */
import { state, applyRemoteDatabase, setSyncStatus, escapeHtml } from "./app.js";
import { loadSettings, saveSettings } from "./storage.js";

const WRITE_DEBOUNCE_MS = 1500;
const POLL_MS = 60000;

let cfg = null;          // { owner, repo, branch, path, token }
let status = "disconnected"; // disconnected | syncing | connected | error
let lastSyncedAt = null;
let lastError = "";
let remoteSha = null;    // git blob sha of the remote file, needed to update it
let writeTimer = null;
let pollTimer = null;
let writing = false;
let sectionRoot = null;  // the Sync view, when it is on screen

/* ---------- status ---------- */

function setStatus(next, error = "") {
  status = next;
  lastError = error;
  const label = {
    disconnected: "Local only",
    syncing: "Syncing…",
    connected: lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Cloud connected",
    error: "Sync error",
  }[status];
  setSyncStatus(label);
  if (sectionRoot?.isConnected) renderStatus(sectionRoot);
}

/* ---------- GitHub API ---------- */

function configFromSettings(s) {
  return {
    owner: (s.githubOwner || "").trim(),
    repo: (s.githubRepo || "").trim(),
    branch: (s.githubBranch || "main").trim(),
    path: (s.githubPath || "vehiclevault-db.json").trim().replace(/^\/+/, ""),
    token: (s.githubToken || "").trim(),
  };
}

function ghHeaders(extra) {
  return {
    Authorization: `Bearer ${cfg.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

function ghUrl(path) {
  const encoded = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encoded}`;
}

function ghError(res) {
  const map = {
    401: "token invalid or expired",
    403: "token lacks access to this repo (needs Contents: Read and write)",
    404: "repo, branch or folder not found — check the owner/name and that the token can see the private repo",
    409: "the cloud file changed at the same moment — try Sync Now",
    422: "GitHub rejected the update — try Sync Now",
  };
  return new Error(map[res.status] || `GitHub error ${res.status}`);
}

/* sha comes from the directory listing — the content endpoint caps at 1 MB */
async function ghGetSha() {
  const dir = cfg.path.includes("/") ? cfg.path.slice(0, cfg.path.lastIndexOf("/")) : "";
  const res = await fetch(`${ghUrl(dir)}?ref=${encodeURIComponent(cfg.branch)}`, { headers: ghHeaders(), cache: "no-store" });
  if (res.status === 404 && dir) return null; // folder not created yet
  if (!res.ok) throw ghError(res);
  const list = await res.json();
  const name = cfg.path.split("/").pop();
  const entry = Array.isArray(list) ? list.find(f => f.name === name) : null;
  return entry ? entry.sha : null;
}

/* raw media type works for files up to 100 MB */
async function ghGetRaw() {
  const res = await fetch(`${ghUrl(cfg.path)}?ref=${encodeURIComponent(cfg.branch)}`, {
    headers: ghHeaders({ Accept: "application/vnd.github.raw+json" }),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw ghError(res);
  return res.text();
}

async function ghPut(text, sha) {
  const body = { message: `VehicleVault sync ${new Date().toISOString()}`, content: b64encode(text), branch: cfg.branch };
  if (sha) body.sha = sha;
  const res = await fetch(ghUrl(cfg.path), { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw ghError(res);
  return (await res.json()).content.sha;
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const stamp = (db) => Date.parse(db?.updatedAt || 0) || 0;
const hasData = (db) => Boolean(db && (db.vehicles?.length || db.maintenance?.length || db.expenses?.length || db.documents?.length));

/* ---------- sync engine ---------- */

async function writeCloud() {
  if (!cfg) return;
  clearTimeout(writeTimer);
  writing = true;
  setStatus("syncing");
  try {
    const text = JSON.stringify(state.db, null, 2);
    try {
      remoteSha = await ghPut(text, remoteSha);
    } catch {
      // sha went stale (saved from another device) — refresh and retry once
      remoteSha = await ghGetSha();
      remoteSha = await ghPut(text, remoteSha);
    }
    lastSyncedAt = new Date();
    setStatus("connected");
  } catch (err) {
    console.warn("VehicleVault: cloud write failed.", err);
    setStatus("error", err.message || String(err));
  } finally {
    writing = false;
  }
}

/* Pull if the cloud copy is newer, otherwise push this device's copy. */
async function syncFromCloud({ firstConnect = false } = {}) {
  const remoteText = await ghGetRaw();
  remoteSha = await ghGetSha();
  const remote = remoteText && remoteText.trim() ? JSON.parse(remoteText) : null;

  if (remote && hasData(remote)) {
    const localIsReal = stamp(state.db) > 0;
    let useRemote = stamp(remote) >= stamp(state.db) || !localIsReal;
    if (firstConnect && !useRemote && hasData(state.db)) {
      useRemote = !confirm(
        `This device has changes newer than the cloud copy.\n\n` +
        `OK = upload this device's data to the cloud (replaces the cloud copy).\n` +
        `Cancel = load the cloud copy onto this device instead.`
      );
    }
    if (useRemote) {
      if (stamp(remote) !== stamp(state.db)) applyRemoteDatabase(remote);
      return;
    }
  }
  if (stamp(state.db) > 0 || hasData(state.db)) await writeCloud();
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(pollOnce, POLL_MS);
}

async function pollOnce() {
  if (!cfg || writing || writeTimer || status !== "connected") return;
  if (state.formDirty) return; // don't wipe a half-filled form; retry next tick
  try {
    const sha = await ghGetSha();
    if (sha && sha !== remoteSha) {
      const text = await ghGetRaw();
      const remote = text ? JSON.parse(text) : null;
      remoteSha = sha;
      if (remote && stamp(remote) > stamp(state.db)) applyRemoteDatabase(remote);
      lastSyncedAt = new Date();
      setStatus("connected");
    }
  } catch { /* transient network error — try again next tick */ }
}

/* Called by app.js after every local change. */
export function scheduleCloudWrite() {
  if (!cfg || status === "disconnected") return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => { writeTimer = null; writeCloud(); }, WRITE_DEBOUNCE_MS);
}

async function connect(settings) {
  cfg = configFromSettings(settings);
  if (!cfg.owner || !cfg.repo || !cfg.token) { cfg = null; throw new Error("Enter the owner, private repo name and token first."); }
  setStatus("syncing");
  try {
    await syncFromCloud({ firstConnect: true });
    saveSettings({ ...settings, connected: true });
    lastSyncedAt = new Date();
    setStatus("connected");
    startPolling();
  } catch (err) {
    cfg = null;
    setStatus("disconnected");
    throw err;
  }
}

function disconnect() {
  clearInterval(pollTimer);
  clearTimeout(writeTimer);
  writeTimer = null;
  cfg = null;
  remoteSha = null;
  lastSyncedAt = null;
  saveSettings({ ...loadSettings(), connected: false });
  setStatus("disconnected");
}

async function syncNow() {
  if (!cfg) throw new Error("Cloud database is not connected.");
  clearTimeout(writeTimer);
  writeTimer = null;
  setStatus("syncing");
  try {
    await syncFromCloud();
    lastSyncedAt = new Date();
    setStatus("connected");
  } catch (err) {
    setStatus("error", err.message || String(err));
    throw err;
  }
}

/* Called once at startup: reconnect if this device was connected before. */
export async function initCloudSync() {
  const settings = loadSettings();
  if (!settings.connected) return;
  cfg = configFromSettings(settings);
  if (!cfg.owner || !cfg.repo || !cfg.token) { cfg = null; return; }
  setStatus("syncing");
  try {
    await syncFromCloud();
    lastSyncedAt = new Date();
    setStatus("connected");
  } catch (err) {
    console.warn("VehicleVault: cloud sync at startup failed.", err);
    setStatus("error", err.message || String(err));
  }
  startPolling(); // keep trying even after an offline start
}

// Pick up changes from other devices as soon as the app comes back into view.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pollOnce(); });

/* ---------- view ---------- */

export function initSyncView(root) {
  sectionRoot = root;
  const s = loadSettings();
  root.innerHTML = `<div class="grid grid-2">
    <section class="card"><h3>Cloud Database (GitHub)</h3>
      <div id="syncStatusBox" class="sync-status"></div>
      <form id="syncForm" class="form" autocomplete="off">
        <div class="form-row"><label><span class="field-label">GitHub owner</span><input class="input" name="githubOwner" placeholder="Lonesurvivor112" value="${escapeHtml(s.githubOwner)}"></label><label><span class="field-label">Private repo name</span><input class="input" name="githubRepo" placeholder="vehiclevault-db" value="${escapeHtml(s.githubRepo)}"></label></div>
        <div class="form-row"><label><span class="field-label">Branch</span><input class="input" name="githubBranch" value="${escapeHtml(s.githubBranch || "main")}"></label><label><span class="field-label">Database path</span><input class="input" name="githubPath" value="${escapeHtml(s.githubPath || "vehiclevault-db.json")}"></label></div>
        <label><span class="field-label">Fine-grained token</span><input class="input" type="password" name="githubToken" autocomplete="new-password" value="${escapeHtml(s.githubToken)}"></label>
        <div class="actions" id="syncActions"></div>
      </form>
    </section>
    <section class="card"><h3>How it works</h3>
      <p class="muted">The app itself is public on GitHub Pages. Your data is one JSON file in a separate <strong>private</strong> repo that only your token can read.</p>
      <p class="muted">Once connected, every change uploads automatically a moment after you save it, and other devices pick it up within a minute (or as soon as you reopen the app). The newest copy wins. Tap <strong>Sync Now</strong> before closing if you want to be sure.</p>
      <p class="muted">Token: GitHub → Settings → Developer settings → Fine-grained tokens. Repository access: only the private DB repo. Permission: <strong>Contents: Read and write</strong>. The token is stored only in this browser — connect once on each device.</p>
      <p class="muted small">Scanned documents are stored inside the database file, so the cloud copy is a complete backup.</p>
    </section>
  </div>`;
  renderStatus(root);
}

function renderStatus(root) {
  const box = root.querySelector("#syncStatusBox");
  const actions = root.querySelector("#syncActions");
  if (!box || !actions) return;
  const size = new Blob([JSON.stringify(state.db)]).size;
  const sizeLabel = size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  const repo = cfg ? `${escapeHtml(cfg.owner)}/${escapeHtml(cfg.repo)}` : "";
  box.innerHTML = {
    disconnected: `<span class="badge">Not connected</span> <span class="muted small">Data is saved on this device only.</span>`,
    syncing: `<span class="badge soon">Syncing…</span> <span class="muted small">${repo}</span>`,
    connected: `<span class="badge done">Connected</span> <span class="muted small">${repo}${lastSyncedAt ? ` · last synced ${lastSyncedAt.toLocaleTimeString()}` : ""}</span>`,
    error: `<span class="badge due">Sync error</span> <span class="muted small">${escapeHtml(lastError)}</span>`,
  }[status] + `<div class="muted small" style="margin-top:6px">Database size: ${sizeLabel}</div>`;

  const isOn = status !== "disconnected";
  actions.innerHTML = isOn
    ? `<button class="btn primary" type="button" id="syncNowBtn">Sync Now</button><button class="btn danger" type="button" id="disconnectBtn">Disconnect</button>`
    : `<button class="btn primary" type="submit">Connect</button>`;
  root.querySelectorAll("#syncForm input").forEach(i => { i.readOnly = isOn; });

  const form = root.querySelector("#syncForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const settings = { ...loadSettings(), ...Object.fromEntries(new FormData(form)) };
    saveSettings(settings);
    try { await connect(settings); } catch (err) { setStatus("disconnected"); alert(`Could not connect: ${err.message || err}`); }
  };
  root.querySelector("#syncNowBtn")?.addEventListener("click", async () => {
    try { await syncNow(); } catch (err) { alert(`Sync failed: ${err.message || err}`); }
  });
  root.querySelector("#disconnectBtn")?.addEventListener("click", () => {
    if (confirm("Stop syncing this device? Your data stays on this device and in the cloud.")) disconnect();
  });
}
