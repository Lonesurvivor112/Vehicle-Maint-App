const STORAGE_KEY = "vehiclevault-db-v1";
const SETTINGS_KEY = "vehiclevault-settings-v1";

export function starterDb() {
  const vehicleId = `veh_${Date.now()}`;
  return {
    app: "VehicleVault",
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
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
    updatedAt: new Date().toISOString(),
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
    updatedAt: db?.updatedAt || new Date().toISOString()
  };
}

export function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeDb(raw ? JSON.parse(raw) : starterDb());
  } catch {
    return starterDb();
  }
}

export function saveDb(db) {
  const next = normalizeDb({ ...db, updatedAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function setDb(db) {
  return saveDb(normalizeDb(db));
}

export function resetDb() {
  localStorage.removeItem(STORAGE_KEY);
  return starterDb();
}

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || defaultSettings();
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
    githubToken: ""
  };
}
