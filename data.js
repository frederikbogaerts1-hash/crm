/* ============================================================
   FRANSSEN KEUKENS — DATA LAAG v5
   8-stage pipeline, taken, zoeken, duplicaatdetectie, rollen.
   Supabase cloud sync (hybrid: localStorage cache + cloud).
   window.FK_DATA is het enige aanspreekpunt vanuit index.html.
   ============================================================ */

"use strict";

const STATUSSEN = [
  "Lead",
  "Showroombezoek",
  "Offerte",
  "Onderhandeling",
  "Besteld",
  "Geïnstalleerd",
  "Service",
  "Verloren"
];

const ADVISEURS = ["Frederik Bogaerts", "Lisa Schulpe", "Pieter Beerten"];
const SHOWROOMS = ["Geel", "Hasselt", "Lommel", "Pelt", "Maasmechelen"];
const ROLES     = ["verkoper", "toonzaalverantwoordelijke", "salesmanager"];
const EMAIL_DOMAIN = "@franssen.be";

const MIGRATIE_MAP = {
  "Aanvraag":           "Lead",
  "Gesprek 1 Gepland":  "Showroombezoek",
  "Ontwerp":            "Offerte",
  "Thuismeting":        "Offerte",
  "Gesprek 2 Gepland":  "Offerte",
  "Opvolging":          "Onderhandeling",
  "Verkocht":           "Besteld",
  "Verloren":           "Verloren"
};

const ADVISEUR_MIGRATIE = {
  "Jan Franssen":    "Frederik Bogaerts",
  "Sophie Maes":     "Lisa Schulpe",
  "Kevin Leclercq":  "Pieter Beerten"
};
const SHOWROOM_MIGRATIE = {
  "Mol":       "Lommel",
  "Herentals": "Hasselt"
};

const FK_DATA = (() => {
  const STORAGE_KEY = "fransen_crm_data";
  const WALKIN_KEY  = "fransen_walkins";
  const AUTH_KEY    = "fk_current_user";
  const USERS_KEY   = "fk_users";

  const ym = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();

  /* ── Supabase ──────────────────────────────────────────────── */
  const SB_URL = "https://rgiaoxbhieuitczlrmbr.supabase.co";
  const SB_KEY = "sb_publishable_Ne-NdPV8CMBxIh-NdLOKuw_J5c__fyc";

  const getSb = () => {
    if (!window._sbClient && window.supabase) {
      window._sbClient = window.supabase.createClient(SB_URL, SB_KEY);
    }
    return window._sbClient || null;
  };

  const sbUpsert = (table, row) => {
    const sb = getSb(); if (!sb) return;
    sb.from(table).upsert(row).then(({ error }) => {
      if (error) console.warn(`[SB] ${table} upsert:`, error.message);
    });
  };

  const sbDelete = (table, id) => {
    const sb = getSb(); if (!sb) return;
    sb.from(table).delete().eq("id", id).then(({ error }) => {
      if (error) console.warn(`[SB] ${table} delete:`, error.message);
    });
  };

  const sbSyncWalkins = (walkins) => {
    const sb = getSb(); if (!sb) return;
    sb.from("walkins").delete().not("id", "is", null)
      .then(() => walkins.length ? sb.from("walkins").insert(walkins.map(w => ({ data: w }))) : null)
      .catch(e => console.warn("[SB] walkins sync:", e));
  };

  /* ── Mock records (seeded eenmalig) ──────────────────────── */
  const MOCK_RECORDS = [
    {
      id: "mock-001",
      naam: "Lieve en Marc Wouters",
      voornaam1: "Lieve", familienaam1: "Wouters", voornaam2: "Marc", familienaam2: "Wouters",
      straat: "Diestseweg", huisnummer: "45", postcode: "2440", stad: "Geel",
      telefoon: "0477 12 34 56", email: "wouters.lieve@telenet.be",
      adres: "Diestseweg 45, Geel",
      adviseur: "Frederik Bogaerts", showroom: "Geel", bron: "Toonzaal",
      offerteprijs: 21000, budget: 22000, materialen: "eikenhout, composiet werkblad, strak",
      volgende_actie: "2026-05-22T10:00", status: "Offerte", orderMaand: "",
      taken: [{ id: "taak-001a", titel: "Offerte nalezen met klant", vervaldatum: "2026-05-22", afgerond: false, adviseur: "Frederik Bogaerts", aangemaakt: "2026-05-10T11:00:00.000Z" }],
      aangemaakt: "2026-05-01T09:15:00.000Z",
      logboek: [
        { timestamp: "2026-05-01T09:15:00.000Z", type: "notitie",   tekst: "Koppel geïnteresseerd in U-keuken. Beiden aanwezig bij eerste gesprek." },
        { timestamp: "2026-05-08T14:30:00.000Z", type: "voicemail", tekst: "Voicemail ingesproken" },
        { timestamp: "2026-05-10T11:00:00.000Z", type: "notitie",   tekst: "Teruggebeld. Ontwerp bijna klaar, afspraak gepland voor prijspresentatie." }
      ]
    },
    {
      id: "mock-002",
      naam: "Ria Verheyen",
      voornaam1: "Ria", familienaam1: "Verheyen", voornaam2: "", familienaam2: "",
      straat: "Kerkstraat", huisnummer: "12", postcode: "3500", stad: "Hasselt",
      telefoon: "014 67 89 01", email: "ria.verheyen@gmail.com",
      adres: "Kerkstraat 12, Hasselt",
      adviseur: "Lisa Schulpe", showroom: "Hasselt", bron: "Web",
      offerteprijs: 14500, budget: 15000, materialen: "MDF gelakt wit, kwarts werkblad",
      volgende_actie: "2026-05-15T09:00", status: "Onderhandeling", orderMaand: "",
      taken: [],
      aangemaakt: "2026-04-15T10:00:00.000Z",
      logboek: [
        { timestamp: "2026-04-15T10:00:00.000Z", type: "notitie",   tekst: "Online aanvraag via website. Interesse in moderne witte keuken." },
        { timestamp: "2026-04-22T16:00:00.000Z", type: "notitie",   tekst: "Eerste gesprek goed verlopen. Offerte € 13.200 voorgesteld. Denkt nog na." },
        { timestamp: "2026-05-05T09:30:00.000Z", type: "voicemail", tekst: "Voicemail ingesproken" }
      ]
    },
    {
      id: "mock-003",
      naam: "Fam. Cools-Hermans",
      voornaam1: "", familienaam1: "Cools-Hermans", voornaam2: "", familienaam2: "",
      straat: "Nieuwbouwlaan", huisnummer: "8", postcode: "2440", stad: "Geel",
      telefoon: "0468 55 44 33", email: "jan.cools@skynet.be",
      adres: "Nieuwbouwlaan 8, Geel",
      adviseur: "Pieter Beerten", showroom: "Geel", bron: "Telefoon",
      offerteprijs: 28000, budget: null, materialen: "massief eik, natuursteen, eiland",
      volgende_actie: "2026-06-03T14:00", status: "Offerte", orderMaand: "",
      taken: [{ id: "taak-003a", titel: "Plattegrond ophalen van architect", vervaldatum: "2026-05-28", afgerond: false, adviseur: "Pieter Beerten", aangemaakt: "2026-05-06T11:00:00.000Z" }],
      aangemaakt: "2026-04-28T08:00:00.000Z",
      logboek: [
        { timestamp: "2026-04-28T08:00:00.000Z", type: "notitie", tekst: "Telefonische aanvraag. Grote open keuken met eiland, nieuwbouwwoning Geel." },
        { timestamp: "2026-05-06T11:00:00.000Z", type: "notitie", tekst: "Eerste gesprek gehad. Wensen uitgebreid besproken. Ontwerp gestart." }
      ]
    },
    {
      id: "mock-004",
      naam: "Werner Aerts",
      voornaam1: "Werner", familienaam1: "Aerts", voornaam2: "", familienaam2: "",
      straat: "Molseweg", huisnummer: "3", postcode: "3550", stad: "Lommel",
      telefoon: "0485 98 76 54", email: "w.aerts@proximus.be",
      adres: "Molseweg 3, Lommel",
      adviseur: "Pieter Beerten", showroom: "Lommel", bron: "Walk-in",
      offerteprijs: 8900, budget: 10000, materialen: "laminaat, compacte opstelling",
      volgende_actie: "", status: "Verloren", orderMaand: "",
      taken: [],
      aangemaakt: "2026-03-10T13:00:00.000Z",
      logboek: [
        { timestamp: "2026-03-10T13:00:00.000Z", type: "notitie",   tekst: "Binnengekomen in toonzaal. Interesse in compacte keuken voor appartement Lommel." },
        { timestamp: "2026-03-18T10:00:00.000Z", type: "notitie",   tekst: "Offerte gestuurd. Reageert niet meer." },
        { timestamp: "2026-04-02T09:00:00.000Z", type: "voicemail", tekst: "Voicemail ingesproken" }
      ]
    },
    {
      id: "mock-005",
      naam: "Sofie en Thomas Bogaerts",
      voornaam1: "Sofie", familienaam1: "Bogaerts", voornaam2: "Thomas", familienaam2: "Bogaerts",
      straat: "Leopoldlaan", huisnummer: "22", postcode: "3500", stad: "Hasselt",
      telefoon: "0474 11 22 33", email: "sofie.bogaerts@gmail.com",
      adres: "Leopoldlaan 22, Hasselt",
      adviseur: "Lisa Schulpe", showroom: "Hasselt", bron: "Web",
      offerteprijs: 16800, budget: 18000, materialen: "hout nerf, beige werkblad, greeploos",
      volgende_actie: "2026-05-25T11:00", status: "Besteld", orderMaand: "2026-04",
      taken: [],
      aangemaakt: "2026-03-05T09:00:00.000Z",
      logboek: [
        { timestamp: "2026-03-05T09:00:00.000Z", type: "notitie", tekst: "Aanvraag via website. Smaak zeer duidelijk: warm hout, strak, greeploos." },
        { timestamp: "2026-03-12T14:00:00.000Z", type: "notitie", tekst: "Eerste gesprek super. Ontwerp in 2 weken klaar." },
        { timestamp: "2026-04-01T10:00:00.000Z", type: "notitie", tekst: "Prijspresentatie goed ontvangen. Kleine aanpassingen gevraagd." },
        { timestamp: "2026-04-15T09:00:00.000Z", type: "notitie", tekst: "Contract getekend! Levering gepland voor augustus." }
      ]
    },
    {
      id: "mock-006",
      naam: "Mia Janssen",
      voornaam1: "Mia", familienaam1: "Janssen", voornaam2: "", familienaam2: "",
      straat: "Beekstraat", huisnummer: "7", postcode: "3900", stad: "Pelt",
      telefoon: "013 44 55 66", email: "mia.janssen@telenet.be",
      adres: "Beekstraat 7, Pelt",
      adviseur: "Frederik Bogaerts", showroom: "Pelt", bron: "Toonzaal",
      offerteprijs: null, budget: 12000, materialen: "nog te bespreken",
      volgende_actie: "2026-05-28T10:30", status: "Showroombezoek", orderMaand: "",
      taken: [],
      aangemaakt: "2026-05-14T15:00:00.000Z",
      logboek: [
        { timestamp: "2026-05-14T15:00:00.000Z", type: "notitie", tekst: "Langs geweest in de toonzaal. Keuken voor renovatie rijwoning Pelt." },
        { timestamp: "2026-05-16T09:00:00.000Z", type: "notitie", tekst: "Afspraak bevestigd voor 28 mei." }
      ]
    },
    {
      id: "mock-007",
      naam: "Patrick en Els Nijs",
      voornaam1: "Patrick", familienaam1: "Nijs", voornaam2: "Els", familienaam2: "Nijs",
      straat: "Geelseweg", huisnummer: "15", postcode: "3900", stad: "Pelt",
      telefoon: "0479 66 77 88", email: "patrick.nijs@outlook.com",
      adres: "Geelseweg 15, Pelt",
      adviseur: "Pieter Beerten", showroom: "Pelt", bron: "Telefoon",
      offerteprijs: "", budget: "", materialen: "",
      volgende_actie: "2026-05-21T14:00", status: "Lead", orderMaand: "",
      taken: [{ id: "taak-007a", titel: "Showroombezoek inplannen", vervaldatum: "2026-05-21", afgerond: false, adviseur: "Pieter Beerten", aangemaakt: "2026-05-18T10:00:00.000Z" }],
      aangemaakt: "2026-05-18T10:00:00.000Z",
      logboek: [
        { timestamp: "2026-05-18T10:00:00.000Z", type: "notitie",   tekst: "Telefonisch gecontacteerd. Nieuwbouw in Pelt, keuken volledig open." },
        { timestamp: "2026-05-19T08:30:00.000Z", type: "voicemail", tekst: "Voicemail ingesproken" }
      ]
    }
  ];

  const MOCK_WALKINS = [
    { timestamp: `${ym}-03T10:15:00.000Z`, showroom: "Geel",    adviseurEmail: "pieter.beerten@franssen.be",    adviseurNaam: "Pieter Beerten" },
    { timestamp: `${ym}-07T14:30:00.000Z`, showroom: "Hasselt", adviseurEmail: "lisa.schulpe@franssen.be",      adviseurNaam: "Lisa Schulpe" },
    { timestamp: `${ym}-12T11:00:00.000Z`, showroom: "Geel",    adviseurEmail: "frederik.bogaerts@franssen.be", adviseurNaam: "Frederik Bogaerts" }
  ];

  /* Mock users */
  const hashWw = (ww) => {
    try { return btoa(ww + "::franssen"); } catch { return ww; }
  };
  const checkHash = (ww, hash) => {
    try { return btoa(ww + "::franssen") === hash; } catch { return ww === hash; }
  };

  const MOCK_USERS = [
    { id: "user-001", email: "frederik.bogaerts@franssen.be", naam: "Frederik Bogaerts", role: "salesmanager",           showroom: "Geel", wachtwoordHash: hashWw("franssen2026"), aangemaakt: "2026-01-01T00:00:00.000Z" },
    { id: "user-002", email: "lisa.schulpe@franssen.be",      naam: "Lisa Schulpe",      role: "verkoper",               showroom: "Geel", wachtwoordHash: hashWw("franssen2026"), aangemaakt: "2026-01-01T00:00:00.000Z" },
    { id: "user-003", email: "pieter.beerten@franssen.be",    naam: "Pieter Beerten",    role: "toonzaalverantwoordelijke", showroom: "Geel", wachtwoordHash: hashWw("franssen2026"), aangemaakt: "2026-01-01T00:00:00.000Z" }
  ];

  /* ── Helpers ───────────────────────────────────────────────── */
  const newId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);

  const saveSafe = (key, data) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Opslaan mislukt: geheugen vol of geblokkeerd. Exporteer eerst je data." };
    }
  };

  /* ── IndexedDB (bestanden blobs) ──────────────────────────── */
  const IDB_NAME    = "fransen_crm";
  const IDB_STORE   = "bestanden_blobs";
  const IDB_VERSION = 1;
  let _db = null;
  const openDB = () => new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => { e.target.result.createObjectStore(IDB_STORE); };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
  const idbPut    = (key, blob) => openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(blob, key).onsuccess = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  }));
  const idbGet    = (key) => openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror   = (e) => reject(e.target.error);
  }));
  const idbDelete = (key) => openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  }));

  const MAX_BESTAND_BYTES = 25 * 1024 * 1024;
  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;

  const parseEuro = (input) => {
    if (input === null || input === undefined || input === "") return null;
    if (typeof input === "number") return isNaN(input) ? null : input;
    const parts = String(input).split(/[–\-]/);
    const raw = parts[parts.length - 1].replace(/[^\d]/g, "");
    const n = parseInt(raw, 10);
    return isNaN(n) ? null : n;
  };
  const fmtEuro = (n) => {
    const num = Number(n);
    if (!n || isNaN(num) || num === 0) return "";
    return "€ " + num.toLocaleString("nl-BE");
  };

  const addFile = (dossierId, file) => {
    if (file.size > MAX_BESTAND_BYTES)
      return Promise.resolve({ ok: false, error: `Bestand "${file.name}" is groter dan 25 MB.` });
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return Promise.resolve({ ok: false, error: "Dossier niet gevonden." });
    const id   = newId();
    const meta = { id, naam: file.name, type: file.type, grootte: file.size, geupload: new Date().toISOString() };
    all[idx] = { ...all[idx], bestanden: [...(all[idx].bestanden || []), meta] };
    const saveResult = saveSafe(STORAGE_KEY, all);
    if (!saveResult.ok) return Promise.resolve(saveResult);
    return idbPut(id, file)
      .then(() => { sbUpsert("dossiers", { id: all[idx].id, data: all[idx] }); return { ok: true, meta }; })
      .catch(e => ({ ok: false, error: `Bestand opslaan mislukt: ${e.message}` }));
  };
  const getFileBlob  = (fileId)                => idbGet(fileId);
  const renameFile   = (dossierId, fileId, n)  => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    all[idx] = { ...all[idx], bestanden: (all[idx].bestanden || []).map(b => b.id === fileId ? { ...b, naam: n } : b) };
    const result = saveSafe(STORAGE_KEY, all);
    if (result.ok) sbUpsert("dossiers", { id: all[idx].id, data: all[idx] });
    return result;
  };
  const deleteFile   = (dossierId, fileId)     => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return Promise.resolve({ ok: false, error: "Dossier niet gevonden." });
    all[idx] = { ...all[idx], bestanden: (all[idx].bestanden || []).filter(b => b.id !== fileId) };
    const saveResult = saveSafe(STORAGE_KEY, all);
    if (!saveResult.ok) return Promise.resolve(saveResult);
    return idbDelete(fileId)
      .then(() => { sbUpsert("dossiers", { id: all[idx].id, data: all[idx] }); return { ok: true }; })
      .catch(() => { sbUpsert("dossiers", { id: all[idx].id, data: all[idx] }); return { ok: true }; });
  };

  /* ── Migratie ──────────────────────────────────────────────── */
  const migreerRecord = (r) => {
    const base = {
      adres: "", adviseur: "", showroom: "", taken: [], orderMaand: "", bestanden: [],
      voornaam1: "", familienaam1: "", voornaam2: "", familienaam2: "",
      straat: "", huisnummer: "", postcode: "", stad: "",
      ...r,
      status: MIGRATIE_MAP[r.status] || (STATUSSEN.includes(r.status) ? r.status : "Lead")
    };
    if (typeof base.offerteprijs === "string") base.offerteprijs = parseEuro(base.offerteprijs);
    if (typeof base.budget       === "string") base.budget       = parseEuro(base.budget);
    if (ADVISEUR_MIGRATIE[base.adviseur]) base.adviseur = ADVISEUR_MIGRATIE[base.adviseur];
    if (SHOWROOM_MIGRATIE[base.showroom]) base.showroom = SHOWROOM_MIGRATIE[base.showroom];
    return base;
  };
  const migreer = (records) => records.map(migreerRecord);
  const heeftOudeStatussen  = (r) => r.some(x => Object.prototype.hasOwnProperty.call(MIGRATIE_MAP, x.status));
  const heeftStringPrijs    = (r) => r.some(x => typeof x.offerteprijs === "string" && x.offerteprijs !== "");
  const heeftOudeAdviseurs  = (r) => r.some(x => ADVISEUR_MIGRATIE[x.adviseur]);

  /* ── Users ─────────────────────────────────────────────────── */
  const getUsersRaw = () => {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || "null"); }
    catch { return null; }
  };
  const USERS_VERSION = "v2";
  const initUsers = () => {
    const raw = getUsersRaw();
    if (!raw || localStorage.getItem(USERS_KEY + "_v") !== USERS_VERSION) {
      const extra = raw ? raw.filter(u => !MOCK_USERS.find(m => m.id === u.id)) : [];
      localStorage.setItem(USERS_KEY, JSON.stringify([...MOCK_USERS, ...extra]));
      localStorage.setItem(USERS_KEY + "_v", USERS_VERSION);
    }
  };
  const getUsers = () => { initUsers(); return getUsersRaw() || []; };
  const getUserByEmail = (email) => getUsers().find(u => u.email.toLowerCase() === email.toLowerCase().trim()) || null;
  const addUser = (u) => {
    if (!u.email.toLowerCase().endsWith(EMAIL_DOMAIN))
      return { ok: false, error: `E-mail moet eindigen op ${EMAIL_DOMAIN}.` };
    if (getUserByEmail(u.email))
      return { ok: false, error: "E-mailadres al in gebruik." };
    const nieuw = {
      id: newId(), email: u.email.toLowerCase().trim(),
      naam: u.naam || u.email.split("@")[0],
      role: ROLES.includes(u.role) ? u.role : "verkoper",
      showroom: u.showroom || "Geel",
      wachtwoordHash: hashWw(u.wachtwoord || "franssen2026"),
      aangemaakt: new Date().toISOString()
    };
    const all = getUsers();
    all.push(nieuw);
    const r = saveSafe(USERS_KEY, all);
    if (r.ok) sbUpsert("crm_users", { id: nieuw.id, data: nieuw });
    return r.ok ? { ok: true, user: nieuw } : r;
  };
  const updateUser = (id, patch) => {
    const all = getUsers();
    const idx = all.findIndex(u => u.id === id);
    if (idx === -1) return { ok: false, error: "Gebruiker niet gevonden." };
    if (patch.wachtwoord) { patch = { ...patch, wachtwoordHash: hashWw(patch.wachtwoord) }; delete patch.wachtwoord; }
    all[idx] = { ...all[idx], ...patch };
    const result = saveSafe(USERS_KEY, all);
    if (result.ok) sbUpsert("crm_users", { id: all[idx].id, data: all[idx] });
    return result;
  };
  const deleteUser = (id) => {
    const result = saveSafe(USERS_KEY, getUsers().filter(u => u.id !== id));
    if (result.ok) sbDelete("crm_users", id);
    return result;
  };

  /* ── Auth ──────────────────────────────────────────────────── */
  const login = (email, ww) => {
    const u = getUserByEmail(email);
    if (!u) return { ok: false, error: "Geen account gevonden met dit e-mailadres." };
    if (!checkHash(ww, u.wachtwoordHash)) return { ok: false, error: "Fout wachtwoord. Probeer het opnieuw." };
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(u));
    return { ok: true, user: u };
  };
  const signup = (email, naam, ww, showroom) => {
    if (!email.toLowerCase().endsWith(EMAIL_DOMAIN))
      return { ok: false, error: `E-mail moet eindigen op ${EMAIL_DOMAIN}.` };
    return addUser({ email, naam, wachtwoord: ww, role: "verkoper", showroom: showroom || "Geel" });
  };
  const currentUser = () => {
    try {
      const raw = sessionStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      const u = JSON.parse(raw);
      const fresh = getUserByEmail(u.email);
      if (fresh) { sessionStorage.setItem(AUTH_KEY, JSON.stringify(fresh)); return fresh; }
      return u;
    } catch { return null; }
  };
  const logout = () => sessionStorage.removeItem(AUTH_KEY);

  const checkPassword = (pw) => pw === "franssen2026";
  const isAuthenticated = () => !!currentUser();
  const setAuthenticated = () => {};

  /* ── Records ───────────────────────────────────────────────── */
  const getAllRaw = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  };
  const getWalkinsRaw = () => {
    try { return JSON.parse(localStorage.getItem(WALKIN_KEY) || "[]"); }
    catch { return []; }
  };
  const initMockData = () => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_RECORDS));
    } else {
      const raw = getAllRaw();
      if (heeftOudeStatussen(raw) || heeftStringPrijs(raw) || heeftOudeAdviseurs(raw)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migreer(raw)));
      }
    }
    if (!localStorage.getItem(WALKIN_KEY)) {
      localStorage.setItem(WALKIN_KEY, JSON.stringify(MOCK_WALKINS));
    }
    initUsers();
  };
  const getAll = () => { initMockData(); return getAllRaw(); };

  const add = (velden) => {
    const all = getAllRaw();
    const nieuw = {
      id: newId(), naam: "", telefoon: "", email: "", adres: "",
      voornaam1: "", familienaam1: "", voornaam2: "", familienaam2: "",
      straat: "", huisnummer: "", postcode: "", stad: "",
      adviseur: "", showroom: "Geel", bron: "Web", offerteprijs: null,
      budget: null, materialen: "", volgende_actie: "", status: "Lead",
      orderMaand: "", taken: [], bestanden: [], aangemaakt: new Date().toISOString(), logboek: [],
      ...velden
    };
    const result = saveSafe(STORAGE_KEY, [nieuw, ...all]);
    if (result.ok) sbUpsert("dossiers", { id: nieuw.id, data: nieuw });
    return result.ok ? { ok: true, record: nieuw } : result;
  };
  const update = (id, velden) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    all[idx] = { ...all[idx], ...velden };
    const result = saveSafe(STORAGE_KEY, all);
    if (result.ok) sbUpsert("dossiers", { id: all[idx].id, data: all[idx] });
    return result;
  };
  const del = (id) => {
    const result = saveSafe(STORAGE_KEY, getAllRaw().filter(r => r.id !== id));
    if (result.ok) sbDelete("dossiers", id);
    return result;
  };
  const addLogEntry = (id, type, tekst) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    all[idx] = { ...all[idx], logboek: [...(all[idx].logboek || []), { timestamp: new Date().toISOString(), type, tekst }] };
    const result = saveSafe(STORAGE_KEY, all);
    if (result.ok) sbUpsert("dossiers", { id: all[idx].id, data: all[idx] });
    return result;
  };

  /* ── Rolfilter ─────────────────────────────────────────────── */
  const filterByRole = (records, user) => {
    if (!user) return [];
    if (user.role === "salesmanager") return records;
    if (user.role === "toonzaalverantwoordelijke")
      return records.filter(r => r.showroom === user.showroom);
    return records.filter(r => r.adviseur === user.naam);
  };

  /* ── Zoeken & duplicaten ───────────────────────────────────── */
  const search = (query, user) => {
    if (!query || !query.trim()) return [];
    const q   = query.toLowerCase().trim();
    const qNS = q.replace(/\s/g, "");
    const base = user ? filterByRole(getAllRaw(), user) : getAllRaw();
    return base.filter(r =>
      (r.naam     || "").toLowerCase().includes(q) ||
      (r.email    || "").toLowerCase().includes(q) ||
      (r.telefoon || "").toLowerCase().replace(/\s/g, "").includes(qNS) ||
      (r.adres    || "").toLowerCase().includes(q) ||
      (r.id       || "").toLowerCase().includes(q)
    );
  };
  const findDuplicates = (email, telefoon, adres) => {
    const e = (email    || "").toLowerCase().trim();
    const t = (telefoon || "").replace(/\s/g, "");
    const a = (adres    || "").toLowerCase().trim();
    return getAllRaw().filter(r => {
      if (e && (r.email    || "").toLowerCase().trim()         === e) return true;
      if (t && (r.telefoon || "").replace(/\s/g, "")           === t) return true;
      if (a && (r.adres    || "").toLowerCase().trim()         === a) return true;
      return false;
    });
  };

  /* ── Taken ─────────────────────────────────────────────────── */
  const addTask = (dossierId, taak) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const nieuweTaak = { id: newId(), titel: taak.titel || "", type: taak.type || "",
      vervaldatum: taak.vervaldatum || "", afgerond: false, adviseur: taak.adviseur || "",
      aangemaakt: new Date().toISOString() };
    all[idx] = { ...all[idx], taken: [...(all[idx].taken || []), nieuweTaak] };
    const result = saveSafe(STORAGE_KEY, all);
    if (result.ok) sbUpsert("dossiers", { id: all[idx].id, data: all[idx] });
    return result;
  };
  const updateTask = (dossierId, taakId, updates) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    all[idx] = { ...all[idx], taken: (all[idx].taken || []).map(t => t.id === taakId ? { ...t, ...updates } : t) };
    const result = saveSafe(STORAGE_KEY, all);
    if (result.ok) sbUpsert("dossiers", { id: all[idx].id, data: all[idx] });
    return result;
  };
  const deleteTask = (dossierId, taakId) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    all[idx] = { ...all[idx], taken: (all[idx].taken || []).filter(t => t.id !== taakId) };
    const result = saveSafe(STORAGE_KEY, all);
    if (result.ok) sbUpsert("dossiers", { id: all[idx].id, data: all[idx] });
    return result;
  };

  /* ── Walk-ins ──────────────────────────────────────────────── */
  const getWalkins = () => {
    initMockData();
    try { return JSON.parse(localStorage.getItem(WALKIN_KEY) || "[]"); }
    catch { return []; }
  };
  const addWalkin = (opts) => {
    const { aantal = 1, user } = opts || {};
    const all = getWalkins();
    const nu = new Date().toISOString();
    for (let i = 0; i < Math.max(1, Math.min(aantal, 200)); i++) {
      all.push({
        timestamp:    nu,
        showroom:     user ? user.showroom : "Geel",
        adviseurEmail: user ? user.email : null,
        adviseurNaam:  user ? user.naam  : null
      });
    }
    const result = saveSafe(WALKIN_KEY, all);
    if (result.ok) sbSyncWalkins(all);
    return result;
  };
  const removeLastWalkin = (user) => {
    const all = getWalkins();
    const vandaagStr = new Date().toISOString().slice(0, 10);
    for (let i = all.length - 1; i >= 0; i--) {
      const isVandaag = all[i].timestamp.slice(0, 10) === vandaagStr;
      const isEigenaar = user
        ? (all[i].adviseurEmail === user.email || (!all[i].adviseurEmail && user.role === "salesmanager"))
        : true;
      if (isVandaag && isEigenaar) {
        all.splice(i, 1);
        const result = saveSafe(WALKIN_KEY, all);
        if (result.ok) sbSyncWalkins(all);
        return result;
      }
    }
    return { ok: false, error: "Geen walk-in van vandaag gevonden om te verwijderen." };
  };
  const walkinsFiltered = (walkins, user) => {
    if (!user) return [];
    if (user.role === "salesmanager") return walkins;
    if (user.role === "toonzaalverantwoordelijke")
      return walkins.filter(w => (w.showroom || "Geel") === user.showroom);
    return walkins.filter(w => w.adviseurEmail === user.email);
  };

  const { jaar: _hJaar, maand: _hMaand } = (() => { const nu = new Date(); return { jaar: nu.getFullYear(), maand: nu.getMonth() }; })();
  const walkinsDezeMaand = (walkins, user) => {
    const lijst = user ? walkinsFiltered(walkins, user) : walkins;
    return lijst.filter(w => {
      const d = new Date(w.timestamp);
      return d.getFullYear() === _hJaar && d.getMonth() === _hMaand;
    }).length;
  };
  const walkinsDezeWeek = (walkins, user) => {
    const lijst = user ? walkinsFiltered(walkins, user) : walkins;
    const nu    = new Date();
    const dag   = nu.getDay() === 0 ? 6 : nu.getDay() - 1;
    const start = new Date(nu); start.setHours(0,0,0,0); start.setDate(start.getDate() - dag);
    return lijst.filter(w => new Date(w.timestamp) >= start).length;
  };
  const dossiersDezeMaand = (records) => {
    return records.filter(r => {
      const d = new Date(r.aangemaakt);
      return d.getFullYear() === _hJaar && d.getMonth() === _hMaand;
    }).length;
  };
  const heeftWalkinVandaag = (walkins, user) => {
    const vandaagStr = new Date().toISOString().slice(0, 10);
    const lijst = user ? walkinsFiltered(walkins, user) : walkins;
    return lijst.some(w => w.timestamp.slice(0, 10) === vandaagStr);
  };

  /* ── Conversieratio ────────────────────────────────────────── */
  const conversieRatio = (records) => {
    const wins   = records.filter(r => ["Besteld","Geïnstalleerd","Service"].includes(r.status)).length;
    const quotes = records.filter(r => ["Offerte","Onderhandeling","Besteld","Geïnstalleerd","Service","Verloren"].includes(r.status)).length;
    return { wins, quotes, ratio: quotes === 0 ? 0 : (wins / quotes) * 100 };
  };

  /* ── Datum helpers ─────────────────────────────────────────── */
  const isOvertijd = (datetimeStr) => {
    if (!datetimeStr) return "leeg";
    const d = new Date(datetimeStr);
    const nu = new Date();
    const dagStart = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
    const dagEinde = new Date(dagStart.getTime() + 86400000);
    if (d < dagStart) return "overtijd";
    if (d < dagEinde) return "vandaag";
    return "toekomst";
  };
  const fmtDatum    = (iso) => iso ? new Date(iso).toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const fmtDatetime = (iso) => iso ? new Date(iso).toLocaleString("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const fmtDate     = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /* ── Excel export ──────────────────────────────────────────── */
  const exportExcel = (records) => {
    const XLSX = window.XLSX;
    if (!XLSX) return { ok: false, error: "SheetJS niet geladen." };
    const rijen = records.map(r => ({
      "Naam": r.naam, "Status": r.status, "Showroom": r.showroom, "Adviseur": r.adviseur,
      "Bron": r.bron, "Telefoon": r.telefoon, "E-mail": r.email, "Adres": r.adres,
      "Offerteprijs": r.offerteprijs, "Budget": r.budget, "Materialen": r.materialen,
      "Volgende actie": r.volgende_actie ? fmtDatetime(r.volgende_actie) : "",
      "Besteldmaand": r.orderMaand,
      "Open taken": (r.taken || []).filter(t => !t.afgerond).length,
      "Aangemaakt": fmtDatum(r.aangemaakt),
      "Logboek": (r.logboek || []).map(l => `[${fmtDatetime(l.timestamp)}] ${l.type === "voicemail" ? "Tel" : "Notitie"}: ${l.tekst}`).join(" | ")
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rijen);
    ws["!cols"] = [{wch:26},{wch:18},{wch:12},{wch:16},{wch:12},{wch:16},{wch:28},{wch:28},{wch:20},{wch:16},{wch:24},{wch:20},{wch:12},{wch:10},{wch:14},{wch:60}];
    XLSX.utils.book_append_sheet(wb, ws, "Alle Dossiers");
    XLSX.writeFile(wb, `FranssenKeukens_CRM_${new Date().toISOString().slice(0,10)}.xlsx`);
    return { ok: true };
  };

  /* ── Excel import ──────────────────────────────────────────── */
  const importExcel = (file) => new Promise((resolve, reject) => {
    const XLSX = window.XLSX;
    if (!XLSX) { reject("SheetJS niet geladen."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb    = XLSX.read(e.target.result, { type: "array" });
        const ws    = wb.Sheets[wb.SheetNames[0]];
        const rijen = XLSX.utils.sheet_to_json(ws);
        const records = rijen.map(r => ({
          id: newId(), naam: r["Naam"] || "", telefoon: r["Telefoon"] || "",
          email: r["E-mail"] || "", adres: r["Adres"] || "",
          adviseur: ADVISEUR_MIGRATIE[r["Adviseur"]] || r["Adviseur"] || "",
          showroom: SHOWROOM_MIGRATIE[r["Showroom"]] || r["Showroom"] || "Geel",
          bron: r["Bron"] || "Web",
          offerteprijs: r["Offerteprijs"] || "", budget: r["Budget"] || "",
          materialen: r["Materialen"] || "", volgende_actie: "",
          status: MIGRATIE_MAP[r["Status"]] || (STATUSSEN.includes(r["Status"]) ? r["Status"] : "Lead"),
          orderMaand: r["Besteldmaand"] || "", taken: [],
          aangemaakt: new Date().toISOString(), logboek: []
        }));
        resolve({ records, aantal: records.length });
      } catch { reject("Bestand kon niet worden gelezen. Controleer of het een geldig .xlsx-bestand is."); }
    };
    reader.onerror = () => reject("Bestand lezen mislukt.");
    reader.readAsArrayBuffer(file);
  });

  /* ── Cloud sync ────────────────────────────────────────────── */
  const syncFromCloud = async () => {
    const sb = getSb();
    if (!sb) return;
    try {
      const [dr, wr, ur] = await Promise.all([
        sb.from("dossiers").select("id, data"),
        sb.from("walkins").select("data"),
        sb.from("crm_users").select("id, data")
      ]);

      // Dossiers
      if (!dr.error) {
        if (dr.data.length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dr.data.map(r => r.data)));
        } else {
          const local = getAllRaw();
          const seed  = local.length > 0 ? local : MOCK_RECORDS;
          if (!local.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
          await sb.from("dossiers").upsert(seed.map(r => ({ id: r.id, data: r })));
        }
      }

      // Walkins
      if (!wr.error) {
        if (wr.data.length > 0) {
          localStorage.setItem(WALKIN_KEY, JSON.stringify(wr.data.map(r => r.data)));
        } else {
          const local = getWalkinsRaw();
          const seed  = local.length > 0 ? local : MOCK_WALKINS;
          if (!local.length) localStorage.setItem(WALKIN_KEY, JSON.stringify(seed));
          if (seed.length) await sb.from("walkins").insert(seed.map(w => ({ data: w })));
        }
      }

      // Users
      if (!ur.error) {
        if (ur.data.length > 0) {
          localStorage.setItem(USERS_KEY, JSON.stringify(ur.data.map(r => r.data)));
          localStorage.setItem(USERS_KEY + "_v", USERS_VERSION);
        } else {
          initUsers();
          const local = getUsersRaw() || [];
          await sb.from("crm_users").upsert(local.map(u => ({ id: u.id, data: u })));
        }
      }
    } catch (e) {
      console.warn("[SB] syncFromCloud fout:", e.message || e);
    }
  };

  /* ── Publieke API ──────────────────────────────────────────── */
  return {
    STATUSSEN, ADVISEURS, SHOWROOMS, ROLES, EMAIL_DOMAIN,
    // Auth & users
    login, signup, currentUser, logout,
    checkPassword, isAuthenticated, setAuthenticated,
    users: { list: getUsers, getByEmail: getUserByEmail, add: addUser, update: updateUser, delete: deleteUser },
    // Records
    getAll, getAllRaw, add, update, delete: del, addLogEntry,
    filterByRole,
    search, findDuplicates,
    // Taken
    addTask, updateTask, deleteTask,
    // Walk-ins
    getWalkins, addWalkin, removeLastWalkin, walkinsFiltered,
    walkinsDezeMaand, walkinsDezeWeek, dossiersDezeMaand, heeftWalkinVandaag,
    // KPI
    conversieRatio,
    // Datum
    isOvertijd, fmtDatum, fmtDatetime, fmtDate,
    // Excel
    exportExcel, importExcel,
    // Overig
    saveSafe,
    addFile, getFileBlob, renameFile, deleteFile, fmtBytes,
    parseEuro, fmtEuro,
    // Cloud
    syncFromCloud
  };
})();

window.FK_DATA = FK_DATA;
