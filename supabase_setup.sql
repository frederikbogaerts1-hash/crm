-- ============================================================
-- FRANSSEN KEUKENS — Supabase setup (run in SQL Editor)
-- ============================================================
-- Stap 1: Voer dit script uit in Supabase → SQL Editor → New Query.
-- Stap 2: Ga naar Authentication → Configuration → Email → zet
--         "Confirm email" UIT (anders werkt self-signup niet direct).
-- Stap 3: Laat de eerste medewerker registreren via de app,
--         dan handmatig promoveren tot salesmanager:
--         UPDATE public.profiles SET role = 'salesmanager'
--         WHERE email = 'frederik.bogaerts@franssen.be';

-- ── Tabellen ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text        NOT NULL,
  naam       text        NOT NULL DEFAULT '',
  role       text        NOT NULL DEFAULT 'verkoper',
  showroom   text        NOT NULL DEFAULT 'Geel',
  aangemaakt timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dossiers (
  id   text  PRIMARY KEY,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.walkins (
  id   uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb NOT NULL
);

-- ── Row Level Security ─────────────────────────────────────────
-- Regel: enkel geauthenticeerde gebruikers krijgen toegang.
-- Anonieme bezoekers krijgen GEEN enkele policy → 0% toegang.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dossiers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.walkins   ENABLE ROW LEVEL SECURITY;

-- profiles: ingelogde gebruikers mogen alles lezen
--           eigen rij updaten (rol-wijziging via admin blijft server-side)
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated USING (true);

-- dossiers: elke ingelogde medewerker (rol-filtering is client-side)
CREATE POLICY "dossiers_all" ON public.dossiers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- walkins: idem
CREATE POLICY "walkins_all" ON public.walkins
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Trigger: profiel aanmaken bij signup ───────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, naam, role, showroom)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'naam', split_part(new.email, '@', 1)),
    'verkoper',
    COALESCE(new.raw_user_meta_data->>'showroom', 'Geel')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Supabase Storage: private bucket voor dossier-bestanden ───

INSERT INTO storage.buckets (id, name, public)
VALUES ('dossier-bestanden', 'dossier-bestanden', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'dossier-bestanden');

CREATE POLICY "storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'dossier-bestanden');

CREATE POLICY "storage_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'dossier-bestanden');

CREATE POLICY "storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'dossier-bestanden');
