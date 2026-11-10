/* Database persistence.
 * The DB lives in memory and is mirrored to IndexedDB on every change. IndexedDB
 * has no practical size cap, unlike localStorage (~5 MB), which matters because
 * scanned documents are embedded in the DB. localStorage is used only as a
 * fallback when IndexedDB is unavailable, and for small device-only settings. */
const STORAGE_KEY = "vehiclevault-db-v1";
const SETTINGS_KEY = "vehiclevault-settings-v1";
const IDB_NAME = "vehiclevault";
const IDB_STORE = "kv";

export function starterDb() {
  const vehicleId = `veh_${Date.now()}`;
  return {
    app: "VehicleVault",
    schemaVersion: 1,
    // Blank stamp marks untouched example data, so cloud sync never lets it
    // overwrite a real database on a new device.
    updatedAt: "",
    vehicles: [{
      id: vehicleId,
      name: "Daily Driver",
      year: "2020",
      make: "Ford",
      model: "Escape",
      trim: "SE",
      vin: "",
      plate: "",
      color: "Blue",
      currentMileage: 58250,
      purchaseDate: "",
      notes: "Example vehicle. Edit or delete this record.",
      createdAt: new Date().toISOString()
    }],
    maintenance: [{
      id: `mnt_${Date.now()}`,
      vehicleId,
      date: new Date().toISOString().slice(0, 10),
      mileage: 58250,
      category: "Oil Change",
      title: "Synthetic oil and filter",
      provider: "Self / Local Shop",
      cost: 64.99,
      notes: "Example maintenance entry.",
      nextDueMileage: 63250,
      nextDueDate: "",
      documentIds: [],
      createdAt: new Date().toISOString()
    }],
    expenses: [],
    documents: [],
    reminders: [{
      id: `rem_${Date.now()}`,
      vehicleId,
      title: "Next oil change",
      type: "Mileage",
      dueMileage: 63250,
      dueDate: "",
      repeatMiles: 5000,
      repeatMonths: "",
      status: "Open",
      notes: "Starter reminder.",
      createdAt: new Date().toISOString()
    }]
  };
}

export function emptyDb() {
  return {
    app: "VehicleVault",
    schemaVersion: 1,
    updatedAt: "",
    vehicles: [],
    maintenance: [],
    expenses: [],
    documents: [],
    reminders: []
  };
}

export function normalizeDb(db) {
  return {
    ...emptyDb(),
    ...db,
    vehicles: Array.isArray(db?.vehicles) ? db.vehicles : [],
    maintenance: Array.isArray(db?.maintenance) ? db.maintenance : [],
    expenses: Array.isArray(db?.expenses) ? db.expenses : [],
    documents: Array.isArray(db?.documents) ? db.documents : [],
    reminders: Array.isArray(db?.reminders) ? db.reminders : [],
    updatedAt: db?.updatedAt || ""
  };
}

/* ---------- IndexedDB ---------- */

let idbPromise = null;
function idb() {
  if (!idbPromise) {
    idbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in self)) return reject(new Error("IndexedDB unavailable"));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return idbPromise;
}

async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- DB load / save ---------- */

let persistError = null;
export function lastPersistError() { return persistError; }

export async function loadDb() {
  try {
    const stored = await idbGet(STORAGE_KEY);
    if (stored) return normalizeDb(stored);
    // One-time migration from the old localStorage copy.
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = normalizeDb(JSON.parse(raw));
      await idbSet(STORAGE_KEY, db);
      localStorage.removeItem(STORAGE_KEY);
      return db;
    }
    return normalizeDb(starterDb());
  } catch (err) {
    console.warn("VehicleVault: IndexedDB unavailable, using localStorage.", err);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalizeDb(raw ? JSON.parse(raw) : starterDb());
    } catch {
      return normalizeDb(starterDb());
    }
  }
}

function persist(db) {
  idbSet(STORAGE_KEY, db).then(() => { persistError = null; }).catch(err => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      persistError = null;
    } catch (fallbackErr) {
      persistError = fallbackErr;
      console.error("VehicleVault: could not save the database on this device.", err, fallbackErr);
      alert("VehicleVault could not save to this device's storage. Export a JSON backup now so nothing is lost.");
    }
  });
}

/* Save a local change: stamps updatedAt so sync knows this copy is newest. */
export function saveDb(db) {
  const next = normalizeDb({ ...db, updatedAt: new Date().toISOString() });
  persist(next);
  return next;
}

export function setDb(db) {
  return saveDb(normalizeDb(db));
}

/* Store a copy pulled from the cloud as-is, keeping its updatedAt stamp. */
export function storeRemoteDb(db) {
  const next = normalizeDb(db);
  persist(next);
  return next;
}

export function resetDb() {
  const db = normalizeDb(starterDb());
  persist(db);
  return db;
}

/* ---------- Device settings (never synced) ---------- */

export function loadSettings() {
  try {
    return { ...defaultSettings(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export function defaultSettings() {
  return {
    githubOwner: "",
    githubRepo: "",
    githubBranch: "main",
    githubPath: "vehiclevault-db.json",
    githubToken: "",
    connected: false
  };
}
