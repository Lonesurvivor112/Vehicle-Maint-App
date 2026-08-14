import { state, replaceDatabase, setSyncStatus } from "./app.js";
import { loadSettings, saveSettings } from "./storage.js";

export function initSyncView(root) {
  const settings = loadSettings();
  root.innerHTML = `<div class="grid grid-2">
    <section class="card"><h3>GitHub JSON Cloud Sync</h3><form id="syncForm" class="form">
      <label><span class="field-label">GitHub owner</span><input class="input" name="githubOwner" value="${settings.githubOwner || ""}"></label>
      <label><span class="field-label">Private repo name</span><input class="input" name="githubRepo" value="${settings.githubRepo || ""}"></label>
      <div class="form-row"><label><span class="field-label">Branch</span><input class="input" name="githubBranch" value="${settings.githubBranch || "main"}"></label><label><span class="field-label">Database path</span><input class="input" name="githubPath" value="${settings.githubPath || "vehiclevault-db.json"}"></label></div>
      <label><span class="field-label">Fine-grained token</span><input class="input" type="password" name="githubToken" value="${settings.githubToken || ""}"></label>
      <div class="actions"><button class="btn" type="submit">Save Settings</button><button class="btn primary" type="button" id="saveGithub">Save DB to GitHub</button><button class="btn" type="button" id="loadGithub">Load DB from GitHub</button></div>
    </form></section>
    <section class="card"><h3>Security Notes</h3><p class="muted">Token is stored only in this browser localStorage. Use a private repo and the lowest possible repository-only permissions.</p><p class="muted">For iPhone PWA use, configure this once after adding the app to your Home Screen.</p></section>
  </div>`;
  root.querySelector("#syncForm").addEventListener("submit", e => { e.preventDefault(); saveSettings(Object.fromEntries(new FormData(e.currentTarget))); setSyncStatus("GitHub settings saved"); });
  root.querySelector("#saveGithub").addEventListener("click", () => githubSave(root));
  root.querySelector("#loadGithub").addEventListener("click", () => githubLoad(root));
}

function currentSettings(root) {
  const form = root.querySelector("#syncForm");
  const settings = Object.fromEntries(new FormData(form));
  saveSettings(settings);
  return settings;
}

async function githubSave(root) {
  const settings = currentSettings(root);
  if (!settings.githubOwner || !settings.githubRepo || !settings.githubToken) return setSyncStatus("Missing GitHub settings");
  setSyncStatus("Saving to GitHub...");
  try {
    const path = settings.githubPath || "vehiclevault-db.json";
    const branch = settings.githubBranch || "main";
    const apiUrl = `https://api.github.com/repos/${settings.githubOwner}/${settings.githubRepo}/contents/${path}`;
    const headers = { Authorization: `Bearer ${settings.githubToken}`, Accept: "application/vnd.github+json" };
    let sha;
    const existing = await fetch(`${apiUrl}?ref=${branch}`, { headers });
    if (existing.ok) sha = (await existing.json()).sha;
    const body = { message: `VehicleVault sync ${new Date().toISOString()}`, content: toBase64Utf8(JSON.stringify(state.db, null, 2)), branch, ...(sha ? { sha } : {}) };
    const res = await fetch(apiUrl, { method: "PUT", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    setSyncStatus("Saved to GitHub");
  } catch (err) { setSyncStatus(`GitHub save failed: ${String(err.message || err).slice(0, 90)}`); }
}

async function githubLoad(root) {
  const settings = currentSettings(root);
  if (!settings.githubOwner || !settings.githubRepo || !settings.githubToken) return setSyncStatus("Missing GitHub settings");
  setSyncStatus("Loading from GitHub...");
  try {
    const path = settings.githubPath || "vehiclevault-db.json";
    const branch = settings.githubBranch || "main";
    const apiUrl = `https://api.github.com/repos/${settings.githubOwner}/${settings.githubRepo}/contents/${path}?ref=${branch}`;
    const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${settings.githubToken}`, Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    const parsed = JSON.parse(fromBase64Utf8(json.content.replace(/\n/g, "")));
    replaceDatabase(parsed);
    setSyncStatus("Loaded from GitHub");
  } catch (err) { setSyncStatus(`GitHub load failed: ${String(err.message || err).slice(0, 90)}`); }
}

function toBase64Utf8(str) { return btoa(unescape(encodeURIComponent(str))); }
function fromBase64Utf8(str) { return decodeURIComponent(escape(atob(str))); }
