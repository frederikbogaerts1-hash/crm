/* ============================================================
   FRANSSEN KEUKENS — DATA LAAG v3
   8-stage pipeline, taken, zoeken, duplicaatdetectie.
   window.FK_DATA is het enige aanspreekpunt vanuit app.jsx.
   ============================================================ */

"use strict";

const STATUSSEN = [
  "Lead",
  "Showroombezoek",
  "Thuismeting",
  "Offerte",
  "Onderhandeling",
  "Besteld",
  "Geïnstalleerd",
  "Service",
  "Verloren"
];

const ADVISEURS = ["Jan Franssen", "Sophie Maes", "Kevin Leclercq"];
const SHOWROOMS = ["Geel", "Mol", "Herentals"];

const MIGRATIE_MAP = {
  "Aanvraag":           "Lead",
  "Gesprek 1 Gepland":  "Showroombezoek",
  "Ontwerp":            "Thuismeting",
  "Gesprek 2 Gepland":  "Offerte",
  "Opvolging":          "Onderhandeling",
  "Verkocht":           "Besteld",
  "Verloren":           "Verloren"
};

const FK_DATA = (() => {
  const STORAGE_KEY = "fransen_crm_data";
  const WALKIN_KEY  = "fransen_walkins";
  const AUTH_KEY    = "fk_auth";
  const PASSWORD    = "franssen2026";

  const ym = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();

  const MOCK_RECORDS = [
    {
      id: "mock-001",
      naam: "Lieve en Marc Wouters",
      voornaam1: "Lieve", familienaam1: "Wouters", voornaam2: "Marc", familienaam2: "Wouters",
      straat: "Diestseweg", huisnummer: "45", postcode: "2440", stad: "Geel",
      telefoon: "0477 12 34 56",
      email: "wouters.lieve@telenet.be",
      adres: "Diestseweg 45, Geel",
      adviseur: "Jan Franssen",
      showroom: "Geel",
      bron: "Toonzaal",
      offerteprijs: "€ 18.500 – 21.000",
      budget: "tot € 22.000",
      materialen: "eikenhout, composiet werkblad, strak",
      volgende_actie: "2026-05-22T10:00",
      status: "Offerte",
      orderMaand: "",
      taken: [
        { id: "taak-001a", titel: "Offerte nalezen met klant", vervaldatum: "2026-05-22", afgerond: false, adviseur: "Jan Franssen", aangemaakt: "2026-05-10T11:00:00.000Z" }
      ],
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
      straat: "Kerkstraat", huisnummer: "12", postcode: "2200", stad: "Herentals",
      telefoon: "014 67 89 01",
      email: "ria.verheyen@gmail.com",
      adres: "Kerkstraat 12, Herentals",
      adviseur: "Sophie Maes",
      showroom: "Herentals",
      bron: "Web",
      offerteprijs: "€ 12.000 – 14.500",
      budget: "tot € 15.000",
      materialen: "MDF gelakt wit, kwarts werkblad",
      volgende_actie: "2026-05-15T09:00",
      status: "Onderhandeling",
      orderMaand: "",
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
      telefoon: "0468 55 44 33",
      email: "jan.cools@skynet.be",
      adres: "Nieuwbouwlaan 8, Geel",
      adviseur: "Kevin Leclercq",
      showroom: "Geel",
      bron: "Telefoon",
      offerteprijs: "€ 24.000 – 28.000",
      budget: "Ruim budget",
      materialen: "massief eik, natuursteen, eiland",
      volgende_actie: "2026-06-03T14:00",
      status: "Thuismeting",
      orderMaand: "",
      taken: [
        { id: "taak-003a", titel: "Plattegrond ophalen van architect", vervaldatum: "2026-05-28", afgerond: false, adviseur: "Kevin Leclercq", aangemaakt: "2026-05-06T11:00:00.000Z" }
      ],
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
      straat: "Molseweg", huisnummer: "3", postcode: "2400", stad: "Mol",
      telefoon: "0485 98 76 54",
      email: "w.aerts@proximus.be",
      adres: "Molseweg 3, Mol",
      adviseur: "Jan Franssen",
      showroom: "Mol",
      bron: "Walk-in",
      offerteprijs: "€ 8.900",
      budget: "tot € 10.000",
      materialen: "laminaat, compacte opstelling",
      volgende_actie: "",
      status: "Verloren",
      orderMaand: "",
      taken: [],
      aangemaakt: "2026-03-10T13:00:00.000Z",
      logboek: [
        { timestamp: "2026-03-10T13:00:00.000Z", type: "notitie",   tekst: "Binnengekomen in toonzaal. Interesse in compacte keuken voor appartement Mol." },
        { timestamp: "2026-03-18T10:00:00.000Z", type: "notitie",   tekst: "Offerte gestuurd. Reageert niet meer." },
        { timestamp: "2026-04-02T09:00:00.000Z", type: "voicemail", tekst: "Voicemail ingesproken" }
      ]
    },
    {
      id: "mock-005",
      naam: "Sofie en Thomas Bogaerts",
      voornaam1: "Sofie", familienaam1: "Bogaerts", voornaam2: "Thomas", familienaam2: "Bogaerts",
      straat: "Leopoldlaan", huisnummer: "22", postcode: "2200", stad: "Herentals",
      telefoon: "0474 11 22 33",
      email: "sofie.bogaerts@gmail.com",
      adres: "Leopoldlaan 22, Herentals",
      adviseur: "Sophie Maes",
      showroom: "Herentals",
      bron: "Web",
      offerteprijs: "€ 16.800",
      budget: "tot € 18.000",
      materialen: "hout nerf, beige werkblad, greeploos",
      volgende_actie: "2026-05-25T11:00",
      status: "Besteld",
      orderMaand: "2026-04",
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
      straat: "Beekstraat", huisnummer: "7", postcode: "2400", stad: "Mol",
      telefoon: "013 44 55 66",
      email: "mia.janssen@telenet.be",
      adres: "Beekstraat 7, Mol",
      adviseur: "Kevin Leclercq",
      showroom: "Mol",
      bron: "Toonzaal",
      offerteprijs: "",
      budget: "tot € 12.000",
      materialen: "nog te bespreken",
      volgende_actie: "2026-05-28T10:30",
      status: "Showroombezoek",
      orderMaand: "",
      taken: [],
      aangemaakt: "2026-05-14T15:00:00.000Z",
      logboek: [
        { timestamp: "2026-05-14T15:00:00.000Z", type: "notitie", tekst: "Langs geweest in de toonzaal. Keuken voor renovatie rijwoning Tessenderlo." },
        { timestamp: "2026-05-16T09:00:00.000Z", type: "notitie", tekst: "Afspraak bevestigd voor 28 mei." }
      ]
    },
    {
      id: "mock-007",
      naam: "Patrick en Els Nijs",
      voornaam1: "Patrick", familienaam1: "Nijs", voornaam2: "Els", familienaam2: "Nijs",
      straat: "Geelseweg", huisnummer: "15", postcode: "2400", stad: "Mol",
      telefoon: "0479 66 77 88",
      email: "patrick.nijs@outlook.com",
      adres: "Geelseweg 15, Mol",
      adviseur: "Jan Franssen",
      showroom: "Mol",
      bron: "Telefoon",
      offerteprijs: "",
      budget: "",
      materialen: "",
      volgende_actie: "2026-05-21T14:00",
      status: "Lead",
      orderMaand: "",
      taken: [
        { id: "taak-007a", titel: "Showroombezoek inplannen", vervaldatum: "2026-05-21", afgerond: false, adviseur: "Jan Franssen", aangemaakt: "2026-05-18T10:00:00.000Z" }
      ],
      aangemaakt: "2026-05-18T10:00:00.000Z",
      logboek: [
        { timestamp: "2026-05-18T10:00:00.000Z", type: "notitie",   tekst: "Telefonisch gecontacteerd. Nieuwbouw in Mol, keuken volledig open." },
        { timestamp: "2026-05-19T08:30:00.000Z", type: "voicemail", tekst: "Voicemail ingesproken" }
      ]
    }
  ];

  const MOCK_WALKINS = [
    { timestamp: `${ym}-03T10:15:00.000Z` },
    { timestamp: `${ym}-07T14:30:00.000Z` },
    { timestamp: `${ym}-12T11:00:00.000Z` }
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
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });

  const idbPut = (key, blob) => openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put(blob, key);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  }));

  const idbGet = (key) => openDB().then(db => new Promise((resolve, reject) => {
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

  const fmtBytes = (n) => {
    if (n < 1024)        return `${n} B`;
    if (n < 1048576)     return `${(n/1024).toFixed(1)} KB`;
    return `${(n/1048576).toFixed(1)} MB`;
  };

  const addFile = (dossierId, file) => {
    if (file.size > MAX_BESTAND_BYTES) {
      return Promise.resolve({ ok: false, error: `Bestand "${file.name}" is groter dan 25 MB. Verklein het of upload een ander bestand.` });
    }
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return Promise.resolve({ ok: false, error: "Dossier niet gevonden." });
    const id = newId();
    const meta = { id, naam: file.name, type: file.type, grootte: file.size, geupload: new Date().toISOString() };
    all[idx] = { ...all[idx], bestanden: [...(all[idx].bestanden || []), meta] };
    const saveResult = saveSafe(STORAGE_KEY, all);
    if (!saveResult.ok) return Promise.resolve(saveResult);
    return idbPut(id, file).then(() => ({ ok: true, meta })).catch(e => ({ ok: false, error: `Bestand opslaan mislukt: ${e.message}` }));
  };

  const getFileBlob = (fileId) => idbGet(fileId);

  const renameFile = (dossierId, fileId, nieuweNaam) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const bestanden = (all[idx].bestanden || []).map(b => b.id === fileId ? { ...b, naam: nieuweNaam } : b);
    all[idx] = { ...all[idx], bestanden };
    return saveSafe(STORAGE_KEY, all);
  };

  const deleteFile = (dossierId, fileId) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return Promise.resolve({ ok: false, error: "Dossier niet gevonden." });
    all[idx] = { ...all[idx], bestanden: (all[idx].bestanden || []).filter(b => b.id !== fileId) };
    const saveResult = saveSafe(STORAGE_KEY, all);
    if (!saveResult.ok) return Promise.resolve(saveResult);
    return idbDelete(fileId).then(() => ({ ok: true })).catch(() => ({ ok: true }));
  };

  /* ── Migratie ──────────────────────────────────────────────── */
  const migreer = (records) => records.map(r => ({
    adres: "", adviseur: "", showroom: "", taken: [], orderMaand: "", bestanden: [],
    voornaam1: "", familienaam1: "", voornaam2: "", familienaam2: "",
    straat: "", huisnummer: "", postcode: "", stad: "",
    ...r,
    status: MIGRATIE_MAP[r.status] || (STATUSSEN.includes(r.status) ? r.status : "Lead")
  }));

  const heeftOudeStatussen = (records) =>
    records.some(r => Object.prototype.hasOwnProperty.call(MIGRATIE_MAP, r.status));

  /* ── Auth ──────────────────────────────────────────────────── */
  const checkPassword    = (pw) => pw === PASSWORD;
  const isAuthenticated  = ()   => sessionStorage.getItem(AUTH_KEY) === "1";
  const setAuthenticated = ()   => sessionStorage.setItem(AUTH_KEY, "1");
  const logout           = ()   => sessionStorage.removeItem(AUTH_KEY);

  /* ── Records ───────────────────────────────────────────────── */
  const getAllRaw = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  };

  const initMockData = () => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_RECORDS));
    } else {
      const raw = getAllRaw();
      if (heeftOudeStatussen(raw)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migreer(raw)));
      }
    }
    if (!localStorage.getItem(WALKIN_KEY)) {
      localStorage.setItem(WALKIN_KEY, JSON.stringify(MOCK_WALKINS));
    }
  };

  const getAll = () => { initMockData(); return getAllRaw(); };

  const add = (velden) => {
    const all = getAllRaw();
    const nieuw = {
      id: newId(), naam: "", telefoon: "", email: "", adres: "",
      voornaam1: "", familienaam1: "", voornaam2: "", familienaam2: "",
      straat: "", huisnummer: "", postcode: "", stad: "",
      adviseur: "", showroom: "", bron: "Web", offerteprijs: "",
      budget: "", materialen: "", volgende_actie: "", status: "Lead",
      orderMaand: "", taken: [], bestanden: [], aangemaakt: new Date().toISOString(), logboek: [],
      ...velden
    };
    const result = saveSafe(STORAGE_KEY, [nieuw, ...all]);
    return result.ok ? { ok: true, record: nieuw } : result;
  };

  const update = (id, velden) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    all[idx] = { ...all[idx], ...velden };
    return saveSafe(STORAGE_KEY, all);
  };

  const del = (id) => saveSafe(STORAGE_KEY, getAllRaw().filter(r => r.id !== id));

  const addLogEntry = (id, type, tekst) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const entry = { timestamp: new Date().toISOString(), type, tekst };
    all[idx] = { ...all[idx], logboek: [...(all[idx].logboek || []), entry] };
    return saveSafe(STORAGE_KEY, all);
  };

  /* ── Zoeken & duplicaten ───────────────────────────────────── */
  const search = (query) => {
    if (!query || !query.trim()) return [];
    const q = query.toLowerCase().trim();
    const qNS = q.replace(/\s/g, "");
    return getAllRaw().filter(r =>
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
      if (e && (r.email || "").toLowerCase().trim() === e) return true;
      if (t && (r.telefoon || "").replace(/\s/g, "") === t) return true;
      if (a && (r.adres || "").toLowerCase().trim() === a) return true;
      return false;
    });
  };

  /* ── Taken ─────────────────────────────────────────────────── */
  const addTask = (dossierId, taak) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const nieuweTaak = {
      id: newId(), titel: taak.titel || "", type: taak.type || "", vervaldatum: taak.vervaldatum || "",
      afgerond: false, adviseur: taak.adviseur || "", aangemaakt: new Date().toISOString()
    };
    all[idx] = { ...all[idx], taken: [...(all[idx].taken || []), nieuweTaak] };
    return saveSafe(STORAGE_KEY, all);
  };

  const updateTask = (dossierId, taakId, updates) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const taken = (all[idx].taken || []).map(t => t.id === taakId ? { ...t, ...updates } : t);
    all[idx] = { ...all[idx], taken };
    return saveSafe(STORAGE_KEY, all);
  };

  const deleteTask = (dossierId, taakId) => {
    const all = getAllRaw();
    const idx = all.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    all[idx] = { ...all[idx], taken: (all[idx].taken || []).filter(t => t.id !== taakId) };
    return saveSafe(STORAGE_KEY, all);
  };

  /* ── Walk-ins ──────────────────────────────────────────────── */
  const getWalkins = () => {
    initMockData();
    try { return JSON.parse(localStorage.getItem(WALKIN_KEY) || "[]"); }
    catch { return []; }
  };

  const addWalkin = () => {
    const all = getWalkins();
    all.push({ timestamp: new Date().toISOString() });
    return saveSafe(WALKIN_KEY, all);
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

  const fmtDatum = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const fmtDatetime = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleString("nl-BE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
      .toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /* ── Statistieken ──────────────────────────────────────────── */
  const huidigeMaand = () => {
    const nu = new Date();
    return { jaar: nu.getFullYear(), maand: nu.getMonth() };
  };

  const walkinsDezeMaand = (walkins) => {
    const { jaar, maand } = huidigeMaand();
    return walkins.filter(w => {
      const d = new Date(w.timestamp);
      return d.getFullYear() === jaar && d.getMonth() === maand;
    }).length;
  };

  const dossiersDezeMaand = (records) => {
    const { jaar, maand } = huidigeMaand();
    return records.filter(r => {
      const d = new Date(r.aangemaakt);
      return d.getFullYear() === jaar && d.getMonth() === maand;
    }).length;
  };

  /* ── Excel export ──────────────────────────────────────────── */
  const exportExcel = (records) => {
    const XLSX = window.XLSX;
    if (!XLSX) return { ok: false, error: "SheetJS niet geladen." };

    const rijen = records.map(r => ({
      "Naam":           r.naam,
      "Status":         r.status,
      "Showroom":       r.showroom,
      "Adviseur":       r.adviseur,
      "Bron":           r.bron,
      "Telefoon":       r.telefoon,
      "E-mail":         r.email,
      "Adres":          r.adres,
      "Offerteprijs":   r.offerteprijs,
      "Budget":         r.budget,
      "Materialen":     r.materialen,
      "Volgende actie": r.volgende_actie ? fmtDatetime(r.volgende_actie) : "",
      "Besteldmaand":   r.orderMaand,
      "Open taken":     (r.taken || []).filter(t => !t.afgerond).length,
      "Aangemaakt":     fmtDatum(r.aangemaakt),
      "Logboek":        (r.logboek || [])
                          .map(l => `[${fmtDatetime(l.timestamp)}] ${l.type === "voicemail" ? "Tel" : "Notitie"}: ${l.tekst}`)
                          .join(" | ")
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rijen);
    ws["!cols"] = [
      {wch:26},{wch:18},{wch:12},{wch:16},{wch:12},{wch:16},{wch:28},
      {wch:28},{wch:20},{wch:16},{wch:24},{wch:20},{wch:12},{wch:10},{wch:14},{wch:60}
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Alle Dossiers");
    const datum = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `FranssenKeukens_CRM_${datum}.xlsx`);
    return { ok: true };
  };

  /* ── Excel import ──────────────────────────────────────────── */
  const importExcel = (file) => {
    return new Promise((resolve, reject) => {
      const XLSX = window.XLSX;
      if (!XLSX) { reject("SheetJS niet geladen."); return; }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb    = XLSX.read(e.target.result, { type: "array" });
          const ws    = wb.Sheets[wb.SheetNames[0]];
          const rijen = XLSX.utils.sheet_to_json(ws);

          const records = rijen.map(r => ({
            id:             newId(),
            naam:           r["Naam"]         || "",
            telefoon:       r["Telefoon"]     || "",
            email:          r["E-mail"]       || "",
            adres:          r["Adres"]        || "",
            adviseur:       r["Adviseur"]     || "",
            showroom:       r["Showroom"]     || "",
            bron:           r["Bron"]         || "Web",
            offerteprijs:   r["Offerteprijs"] || "",
            budget:         r["Budget"]       || "",
            materialen:     r["Materialen"]   || "",
            volgende_actie: "",
            status:         MIGRATIE_MAP[r["Status"]] ||
                            (STATUSSEN.includes(r["Status"]) ? r["Status"] : "Lead"),
            orderMaand:     r["Besteldmaand"] || "",
            taken:          [],
            aangemaakt:     new Date().toISOString(),
            logboek:        []
          }));

          resolve({ records, aantal: records.length });
        } catch {
          reject("Bestand kon niet worden gelezen. Controleer of het een geldig .xlsx-bestand is.");
        }
      };
      reader.onerror = () => reject("Bestand lezen mislukt.");
      reader.readAsArrayBuffer(file);
    });
  };

  /* ── Publieke API ──────────────────────────────────────────── */
  return {
    STATUSSEN, ADVISEURS, SHOWROOMS,
    checkPassword, isAuthenticated, setAuthenticated, logout,
    getAll, getAllRaw, add, update, delete: del, addLogEntry,
    search, findDuplicates,
    addTask, updateTask, deleteTask,
    getWalkins, addWalkin,
    isOvertijd, fmtDatum, fmtDatetime, fmtDate,
    walkinsDezeMaand, dossiersDezeMaand,
    exportExcel, importExcel,
    saveSafe,
    addFile, getFileBlob, renameFile, deleteFile, fmtBytes
  };
})();

window.FK_DATA = FK_DATA;
