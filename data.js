/* ============================================================
   FRANSSEN KEUKENS — DATA LAAG v7
   Supabase cloud-first. In-memory cache voor sync reads.
   Supabase Auth voor login. Admin-ops via Edge Function.
   window.FK_DATA is het enige aanspreekpunt vanuit index.html.
   ============================================================ */

"use strict";

const STATUSSEN = [
  "Lead", "Showroombezoek", "Offerte", "Onderhandeling",
  "Besteld", "Geïnstalleerd", "Service", "Verloren"
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
  "Jan Franssen":   "Frederik Bogaerts",
  "Sophie Maes":    "Lisa Schulpe",
  "Kevin Leclercq": "Pieter Beerten"
};
const SHOWROOM_MIGRATIE = { "Mol": "Lommel", "Herentals": "Hasselt" };

const FK_DATA = (() => {
  const SB_URL = "https://rgiaoxbhieuitczlrmbr.supabase.co";
  const SB_KEY = "sb_publishable_Ne-NdPV8CMBxIh-NdLOKuw_J5c__fyc";
  const BUCKET = "dossier-bestanden";

  const ym = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();

  /* ── In-memory cache ─────────────────────────────────────── */
  let _records  = [];
  let _walkins  = [];
  let _profiles = [];
  let _user     = null;

  /* ── Supabase client ─────────────────────────────────────── */
  const getSb = () => {
    if (!window._sbClient && window.supabase) {
      window._sbClient = window.supabase.createClient(SB_URL, SB_KEY);
    }
    return window._sbClient || null;
  };

  /* ── Mock records (seed lege cloud na eerste login) ───────── */
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
      bestanden: [], aangemaakt: "2026-05-01T09:15:00.000Z",
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
      taken: [], bestanden: [], aangemaakt: "2026-04-15T10:00:00.000Z",
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
      bestanden: [], aangemaakt: "2026-04-28T08:00:00.000Z",
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
      taken: [], bestanden: [], aangemaakt: "2026-03-10T13:00:00.000Z",
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
      taken: [], bestanden: [], aangemaakt: "2026-03-05T09:00:00.000Z",
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
      taken: [], bestanden: [], aangemaakt: "2026-05-14T15:00:00.000Z",
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
      offerteprijs: null, budget: null, materialen: "",
      volgende_actie: "2026-05-21T14:00", status: "Lead", orderMaand: "",
      taken: [{ id: "taak-007a", titel: "Showroombezoek inplannen", vervaldatum: "2026-05-21", afgerond: false, adviseur: "Pieter Beerten", aangemaakt: "2026-05-18T10:00:00.000Z" }],
      bestanden: [], aangemaakt: "2026-05-18T10:00:00.000Z",
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

  /* ── Helpers ─────────────────────────────────────────────── */
  const newId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);

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

  const MAX_BESTAND_BYTES = 15 * 1024 * 1024;
  const TOEGESTANE_TYPES  = ["image/jpeg", "image/png", "application/pdf"];
  const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

  /* ── Supabase fire-and-forget ────────────────────────────── */
  const sbUpsertDossier = (record) => {
    const sb = getSb(); if (!sb) return;
    sb.from("dossiers").upsert({ id: record.id, data: record })
      .then(({ error }) => { if (error) console.warn("[SB] dossier upsert:", error.message); });
  };

  const sbDeleteDossier = (id) => {
    const sb = getSb(); if (!sb) return;
    sb.from("dossiers").delete().eq("id", id)
      .then(({ error }) => { if (error) console.warn("[SB] dossier delete:", error.message); });
  };

  /* ── Auth ────────────────────────────────────────────────── */
  const _loadProfile = async (userId) => {
    const sb = getSb();
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).single();
    if (error || !data) return null;
    return data;
  };

  const login = async (email, ww) => {
    const sb = getSb();
    if (!sb) return { ok: false, error: "Geen verbinding met cloud." };
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: ww });
    if (error) return { ok: false, error: "Fout e-mailadres of wachtwoord. Probeer het opnieuw." };
    const profile = await _loadProfile(data.user.id);
    if (!profile) {
      await sb.auth.signOut();
      return { ok: false, error: "Account gevonden maar profiel ontbreekt. Contacteer de beheerder." };
    }
    _user = profile;
    await loadAll();
    return { ok: true, user: profile };
  };


  const logout = async () => {
    const sb = getSb();
    if (sb) await sb.auth.signOut();
    _records = []; _walkins = []; _profiles = []; _user = null;
  };

  const currentUser     = () => _user;
  const isAuthenticated = () => !!_user;

  const init = async () => {
    const sb = getSb();
    if (!sb) return false;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return false;
    const profile = await _loadProfile(session.user.id);
    if (!profile) { await sb.auth.signOut(); return false; }
    _user = profile;
    await loadAll();
    return true;
  };

  const onAuthChange = (cb) => {
    const sb = getSb(); if (!sb) return;
    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        _records = []; _walkins = []; _profiles = []; _user = null;
        cb(null);
      }
    });
  };

  /* ── loadAll: laad alles in cache ────────────────────────── */
  const loadAll = async () => {
    const sb = getSb(); if (!sb) return;
    const [dr, wr, pr] = await Promise.all([
      sb.from("dossiers").select("id, data"),
      sb.from("walkins").select("data"),
      sb.from("profiles").select("*")
    ]);

    if (!dr.error) {
      if (dr.data.length > 0) {
        _records = dr.data.map(r => r.data);
      } else {
        _records = MOCK_RECORDS;
        sb.from("dossiers").upsert(MOCK_RECORDS.map(r => ({ id: r.id, data: r })))
          .then(({ error }) => { if (error) console.warn("[SB] mock-seed dossiers:", error.message); });
      }
    }

    if (!wr.error) {
      if (wr.data.length > 0) {
        _walkins = wr.data.map(r => r.data);
      } else {
        _walkins = MOCK_WALKINS;
        if (MOCK_WALKINS.length) {
          sb.from("walkins").insert(MOCK_WALKINS.map(w => ({ data: w })))
            .then(({ error }) => { if (error) console.warn("[SB] mock-seed walkins:", error.message); });
        }
      }
    }

    if (!pr.error) _profiles = pr.data || [];
  };

  /* ── Records ─────────────────────────────────────────────── */
  const getAll   = () => _records;
  const getAllRaw = () => _records;

  const add = (velden) => {
    const nieuw = {
      id: newId(), naam: "", telefoon: "", email: "", adres: "",
      voornaam1: "", familienaam1: "", voornaam2: "", familienaam2: "",
      straat: "", huisnummer: "", postcode: "", stad: "",
      adviseur: "", showroom: "Geel", bron: "Web", offerteprijs: null,
      budget: null, materialen: "", volgende_actie: "", status: "Lead",
      offerte_datum: "", orderMaand: "", taken: [], bestanden: [], aangemaakt: new Date().toISOString(), logboek: [],
      ...velden
    };
    _records = [nieuw, ..._records];
    sbUpsertDossier(nieuw);
    return { ok: true, record: nieuw };
  };

  const update = (id, velden) => {
    const idx = _records.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const updated = { ..._records[idx], ...velden };
    _records = _records.map((r, i) => i === idx ? updated : r);
    sbUpsertDossier(updated);
    return { ok: true };
  };

  const del = (id) => {
    _records = _records.filter(r => r.id !== id);
    sbDeleteDossier(id);
    return { ok: true };
  };

  const addLogEntry = (id, type, tekst) => {
    const idx = _records.findIndex(r => r.id === id);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const entry = { timestamp: new Date().toISOString(), type, tekst };
    const updated = { ..._records[idx], logboek: [...(_records[idx].logboek || []), entry] };
    _records = _records.map((r, i) => i === idx ? updated : r);
    sbUpsertDossier(updated);
    return { ok: true };
  };

  /* ── Rolfilter ───────────────────────────────────────────── */
  const filterByRole = (records, user) => {
    if (!user) return [];
    if (user.role === "salesmanager") return records;
    if (user.role === "toonzaalverantwoordelijke")
      return records.filter(r => r.showroom === user.showroom);
    return records.filter(r => r.adviseur === user.naam);
  };

  /* ── Zoeken & duplicaten ─────────────────────────────────── */
  const search = (query, user) => {
    if (!query || !query.trim()) return [];
    const q   = query.toLowerCase().trim();
    const qNS = q.replace(/\s/g, "");
    const base = user ? filterByRole(_records, user) : _records;
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
    return _records.filter(r => {
      if (e && (r.email    || "").toLowerCase().trim()   === e) return true;
      if (t && (r.telefoon || "").replace(/\s/g, "")     === t) return true;
      if (a && (r.adres    || "").toLowerCase().trim()   === a) return true;
      return false;
    });
  };

  /* ── Taken ───────────────────────────────────────────────── */
  const addTask = (dossierId, taak) => {
    const idx = _records.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const nieuweTaak = {
      id: newId(), titel: taak.titel || "", type: taak.type || "",
      vervaldatum: taak.vervaldatum || "", afgerond: false,
      adviseur: taak.adviseur || "", aangemaakt: new Date().toISOString()
    };
    const updated = { ..._records[idx], taken: [...(_records[idx].taken || []), nieuweTaak] };
    _records = _records.map((r, i) => i === idx ? updated : r);
    sbUpsertDossier(updated);
    return { ok: true };
  };

  const updateTask = (dossierId, taakId, updates) => {
    const idx = _records.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const updated = {
      ..._records[idx],
      taken: (_records[idx].taken || []).map(t => t.id === taakId ? { ...t, ...updates } : t)
    };
    _records = _records.map((r, i) => i === idx ? updated : r);
    sbUpsertDossier(updated);
    return { ok: true };
  };

  const deleteTask = (dossierId, taakId) => {
    const idx = _records.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const updated = { ..._records[idx], taken: (_records[idx].taken || []).filter(t => t.id !== taakId) };
    _records = _records.map((r, i) => i === idx ? updated : r);
    sbUpsertDossier(updated);
    return { ok: true };
  };

  /* ── Users (profiles) ────────────────────────────────────── */
  const getUsers       = () => _profiles;
  const getUserByEmail = (email) =>
    _profiles.find(u => u.email.toLowerCase() === email.toLowerCase().trim()) || null;

  const addUser = async (u) => {
    if (!u.email.toLowerCase().endsWith(EMAIL_DOMAIN))
      return { ok: false, error: `E-mail moet eindigen op ${EMAIL_DOMAIN}.` };
    const sb = getSb();
    if (!sb) return { ok: false, error: "Geen verbinding met cloud." };
    const { data, error } = await sb.functions.invoke("admin-users", {
      body: {
        action:   "create",
        email:    u.email.trim().toLowerCase(),
        naam:     u.naam || u.email.split("@")[0],
        role:     ROLES.includes(u.role) ? u.role : "verkoper",
        showroom: u.showroom || "Geel",
        wachtwoord: u.wachtwoord || "Franssen2026!"
      }
    });
    if (error) return { ok: false, error: error.message };
    if (data && !data.ok) return { ok: false, error: data.error || "Aanmaken mislukt." };
    const nieuw = data.user;
    _profiles = [..._profiles.filter(p => p.id !== nieuw.id), nieuw];
    return { ok: true, user: nieuw };
  };

  const updateUser = async (id, patch) => {
    const idx = _profiles.findIndex(u => u.id === id);
    if (idx === -1) return { ok: false, error: "Gebruiker niet gevonden." };
    const { wachtwoord, ...safePatch } = patch;
    const sb = getSb();
    const { error } = await sb.from("profiles").update(safePatch).eq("id", id);
    if (error) return { ok: false, error: error.message };
    const updated = { ..._profiles[idx], ...safePatch };
    _profiles = _profiles.map((u, i) => i === idx ? updated : u);
    if (_user && _user.id === id) _user = updated;
    return { ok: true };
  };

  const deleteUser = async (id) => {
    const sb = getSb();
    if (!sb) return { ok: false, error: "Geen verbinding met cloud." };
    const { data, error } = await sb.functions.invoke("admin-users", {
      body: { action: "delete", id }
    });
    if (error) return { ok: false, error: error.message };
    if (data && !data.ok) return { ok: false, error: data.error || "Verwijderen mislukt." };
    _profiles = _profiles.filter(u => u.id !== id);
    return { ok: true };
  };

  /* ── Walk-ins ────────────────────────────────────────────── */
  const getWalkins = () => _walkins;

  const addWalkin = (opts) => {
    const { aantal = 1, user } = opts || {};
    const nu = new Date().toISOString();
    const nieuw = [];
    for (let i = 0; i < Math.max(1, Math.min(aantal, 200)); i++) {
      nieuw.push({
        timestamp:     nu,
        showroom:      user ? user.showroom : "Geel",
        adviseurEmail: user ? user.email    : null,
        adviseurNaam:  user ? user.naam     : null
      });
    }
    _walkins = [..._walkins, ...nieuw];
    const sb = getSb(); if (!sb) return { ok: true };
    sb.from("walkins").insert(nieuw.map(w => ({ data: w })))
      .then(({ error }) => { if (error) console.warn("[SB] walkin insert:", error.message); });
    return { ok: true };
  };

  const removeLastWalkin = (user) => {
    const vandaagStr = new Date().toISOString().slice(0, 10);
    const updated = [..._walkins];
    for (let i = updated.length - 1; i >= 0; i--) {
      const isVandaag  = updated[i].timestamp.slice(0, 10) === vandaagStr;
      const isEigenaar = user
        ? (updated[i].adviseurEmail === user.email || (!updated[i].adviseurEmail && user.role === "salesmanager"))
        : true;
      if (isVandaag && isEigenaar) {
        updated.splice(i, 1);
        _walkins = updated;
        const sb = getSb(); if (!sb) return { ok: true };
        sb.from("walkins").delete().not("id", "is", null)
          .then(() => _walkins.length ? sb.from("walkins").insert(_walkins.map(w => ({ data: w }))) : null)
          .catch(e => console.warn("[SB] walkins resync:", e));
        return { ok: true };
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

  const { jaar: _hJaar, maand: _hMaand } = (() => {
    const nu = new Date(); return { jaar: nu.getFullYear(), maand: nu.getMonth() };
  })();

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
    const start = new Date(nu); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - dag);
    return lijst.filter(w => new Date(w.timestamp) >= start).length;
  };

  const dossiersDezeMaand = (records) =>
    records.filter(r => {
      const d = new Date(r.aangemaakt);
      return d.getFullYear() === _hJaar && d.getMonth() === _hMaand;
    }).length;

  const heeftWalkinVandaag = (walkins, user) => {
    const vandaagStr = new Date().toISOString().slice(0, 10);
    const lijst = user ? walkinsFiltered(walkins, user) : walkins;
    return lijst.some(w => w.timestamp.slice(0, 10) === vandaagStr);
  };

  /* ── Conversieratio ──────────────────────────────────────── */
  const conversieRatio = (records) => {
    const wins   = records.filter(r => ["Besteld", "Geïnstalleerd", "Service"].includes(r.status)).length;
    const quotes = records.filter(r => ["Offerte", "Onderhandeling", "Besteld", "Geïnstalleerd", "Service", "Verloren"].includes(r.status)).length;
    return { wins, quotes, ratio: quotes === 0 ? 0 : (wins / quotes) * 100 };
  };

  /* ── Datum helpers ───────────────────────────────────────── */
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
  const fmtDatetime = (iso) => iso ? new Date(iso).toLocaleString("nl-BE",     { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const fmtDate     = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
      .toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  /* ── Offerte-opvolging ──────────────────────────────────── */
  // Geeft aantal dagen since offerte_datum als status opvolging vraagt, anders null.
  const isOfferteOpvolgen = (record) => {
    const OPVOLG_STATUSSEN = ["Offerte", "Onderhandeling", "Showroombezoek"];
    if (!OPVOLG_STATUSSEN.includes(record.status)) return null;
    if (!record.offerte_datum) return null;
    const dagen = Math.floor((Date.now() - new Date(record.offerte_datum)) / 86400000);
    return dagen >= 7 ? dagen : null;
  };

  // Geeft aantal dagen sinds laatste activiteit (laatste logboek-entry of aangemaakt).
  const dealLeeftijd = (record) => {
    const log = record.logboek || [];
    const laatste = log.length > 0
      ? Math.max(...log.map(e => new Date(e.timestamp).getTime()))
      : new Date(record.aangemaakt).getTime();
    return Math.floor((Date.now() - laatste) / 86400000);
  };

  /* ── Excel export ────────────────────────────────────────── */
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
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.json_to_sheet(rijen);
    ws["!cols"] = [{wch:26},{wch:18},{wch:12},{wch:16},{wch:12},{wch:16},{wch:28},{wch:28},{wch:20},{wch:16},{wch:24},{wch:20},{wch:12},{wch:10},{wch:14},{wch:60}];
    window.XLSX.utils.book_append_sheet(wb, ws, "Alle Dossiers");
    window.XLSX.writeFile(wb, `FranssenKeukens_CRM_${new Date().toISOString().slice(0, 10)}.xlsx`);
    return { ok: true };
  };

  /* ── Excel import ────────────────────────────────────────── */
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
          offerteprijs: r["Offerteprijs"] || null, budget: r["Budget"] || null,
          materialen: r["Materialen"] || "", volgende_actie: "",
          status: MIGRATIE_MAP[r["Status"]] || (STATUSSEN.includes(r["Status"]) ? r["Status"] : "Lead"),
          orderMaand: r["Besteldmaand"] || "", taken: [], bestanden: [],
          aangemaakt: new Date().toISOString(), logboek: []
        }));
        resolve({ records, aantal: records.length });
      } catch { reject("Bestand kon niet worden gelezen. Controleer of het een geldig .xlsx-bestand is."); }
    };
    reader.onerror = () => reject("Bestand lezen mislukt.");
    reader.readAsArrayBuffer(file);
  });

  /* ── Bestanden (Supabase Storage) ────────────────────────── */
  const addFile = async (dossierId, file) => {
    if (!TOEGESTANE_TYPES.includes(file.type))
      return { ok: false, error: `Bestandstype niet toegestaan. Alleen JPG, PNG of PDF.` };
    if (file.size > MAX_BESTAND_BYTES)
      return { ok: false, error: `Bestand "${file.name}" is groter dan 15 MB.` };
    const idx = _records.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const sb = getSb();
    if (!sb) return { ok: false, error: "Geen verbinding met cloud." };
    const fileId     = newId();
    const veiligNaam = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pad        = `${dossierId}/${fileId}_${veiligNaam}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(pad, file);
    if (upErr) return { ok: false, error: `Upload mislukt: ${upErr.message}` };
    const meta    = { id: fileId, naam: file.name, type: file.type, grootte: file.size, geupload: new Date().toISOString(), pad };
    const updated = { ..._records[idx], bestanden: [...(_records[idx].bestanden || []), meta] };
    _records = _records.map((r, i) => i === idx ? updated : r);
    sbUpsertDossier(updated);
    return { ok: true, meta };
  };

  // meta = het volledige bestand-metadata-object (met meta.pad voor Storage-path)
  const getFileBlob = async (meta) => {
    const sb = getSb();
    if (!sb || !meta || !meta.pad) return null;
    const { data, error } = await sb.storage.from(BUCKET).download(meta.pad);
    if (error) { console.warn("[SB] file download:", error.message); return null; }
    return data;
  };

  const renameFile = (dossierId, fileId, n) => {
    const idx = _records.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const updated = {
      ..._records[idx],
      bestanden: (_records[idx].bestanden || []).map(b => b.id === fileId ? { ...b, naam: n } : b)
    };
    _records = _records.map((r, i) => i === idx ? updated : r);
    sbUpsertDossier(updated);
    return { ok: true };
  };

  const deleteFile = async (dossierId, fileId) => {
    const idx = _records.findIndex(r => r.id === dossierId);
    if (idx === -1) return { ok: false, error: "Dossier niet gevonden." };
    const dossier = _records[idx];
    const meta    = (dossier.bestanden || []).find(b => b.id === fileId);
    if (meta && meta.pad) {
      const sb = getSb();
      if (sb) {
        const { error } = await sb.storage.from(BUCKET).remove([meta.pad]);
        if (error) console.warn("[SB] storage delete:", error.message);
      }
    }
    const updated = { ...dossier, bestanden: (dossier.bestanden || []).filter(b => b.id !== fileId) };
    _records = _records.map((r, i) => i === idx ? updated : r);
    sbUpsertDossier(updated);
    return { ok: true };
  };

  /* ── Publieke API ────────────────────────────────────────── */
  return {
    STATUSSEN, ADVISEURS, SHOWROOMS, ROLES, EMAIL_DOMAIN,
    // Boot
    init, onAuthChange,
    // Auth
    login, currentUser, logout, isAuthenticated,
    // Users (profiles) — add/update/delete zijn async
    users: { list: getUsers, getByEmail: getUserByEmail, add: addUser, update: updateUser, delete: deleteUser },
    // Records (sync reads uit in-memory cache)
    getAll, getAllRaw, add, update, delete: del, addLogEntry,
    filterByRole, search, findDuplicates,
    // Taken
    addTask, updateTask, deleteTask,
    // Walk-ins
    getWalkins, addWalkin, removeLastWalkin, walkinsFiltered,
    walkinsDezeMaand, walkinsDezeWeek, dossiersDezeMaand, heeftWalkinVandaag,
    // KPI
    conversieRatio,
    // Datum
    isOvertijd, fmtDatum, fmtDatetime, fmtDate,
    isOfferteOpvolgen, dealLeeftijd,
    // Excel
    exportExcel, importExcel,
    // Bestanden
    addFile, getFileBlob, renameFile, deleteFile, fmtBytes,
    parseEuro, fmtEuro
  };
})();

window.FK_DATA = FK_DATA;
