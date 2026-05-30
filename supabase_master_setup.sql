-- ============================================================
-- FRANSSEN KEUKENS — MASTER SUPABASE SETUP (idempotent)
-- Veilig uitvoeren op bestaande database: geen data-verlies.
-- Gebruik: plak in Supabase SQL Editor en voer uit.
-- ============================================================

-- ── EXTENSIES ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── TABELLEN ──────────────────────────────────────────────

create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  naam      text not null default '',
  role      text not null default 'verkoper'
              check (role in ('verkoper','toonzaalverantwoordelijke','salesmanager')),
  showroom  text not null default 'Geel',
  aangemaakt timestamptz not null default now()
);

create table if not exists public.dossiers (
  id   text primary key,
  data jsonb not null
);

create table if not exists public.walkins (
  id   uuid primary key default gen_random_uuid(),
  data jsonb not null
);

create table if not exists public.logboek (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  actie        text not null,
  doel_id      text,
  detail       jsonb,
  moment       timestamptz not null default now()
);

-- ── RLS INSCHAKELEN ───────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.dossiers  enable row level security;
alter table public.walkins   enable row level security;
alter table public.logboek   enable row level security;

-- ── HELPER FUNCTIE: is_admin ──────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'salesmanager'
  );
$$;

-- ── RLS POLICIES: profiles ────────────────────────────────

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_eigen" on public.profiles;
create policy "profiles_update_eigen"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete
  to authenticated
  using (public.is_admin() and id <> auth.uid());

-- ── HELPER: dossier zichtbaar voor huidige gebruiker ─────
-- salesmanager ziet alles; toonzaalverantwoordelijke ziet eigen showroom;
-- verkoper ziet enkel eigen dossiers (op naam).

create or replace function public.dossier_toegang(d jsonb)
returns boolean
language sql
security definer
stable
as $$
  select case (select role from public.profiles where id = auth.uid())
    when 'salesmanager'              then true
    when 'toonzaalverantwoordelijke' then d->>'showroom' = (select showroom from public.profiles where id = auth.uid())
    when 'verkoper'                  then d->>'adviseur' = (select naam     from public.profiles where id = auth.uid())
    else false
  end;
$$;

-- ── RLS POLICIES: dossiers ────────────────────────────────

drop policy if exists "dossiers_all_authenticated" on public.dossiers;
drop policy if exists "dossiers_scoped"            on public.dossiers;
create policy "dossiers_scoped"
  on public.dossiers for all
  to authenticated
  using  (public.dossier_toegang(data))
  with check (public.dossier_toegang(data));

-- ── HELPER: walkin zichtbaar voor huidige gebruiker ───────
-- salesmanager ziet alles; toonzaalverantwoordelijke/verkoper ziet eigen showroom.

create or replace function public.walkin_toegang(w jsonb)
returns boolean
language sql
security definer
stable
as $$
  select case (select role from public.profiles where id = auth.uid())
    when 'salesmanager'              then true
    when 'toonzaalverantwoordelijke' then w->>'showroom'     = (select showroom from public.profiles where id = auth.uid())
    when 'verkoper'                  then w->>'adviseurEmail' = (select email    from public.profiles where id = auth.uid())
    else false
  end;
$$;

-- ── RLS POLICIES: walkins ─────────────────────────────────

drop policy if exists "walkins_all_authenticated" on public.walkins;
drop policy if exists "walkins_scoped"            on public.walkins;
create policy "walkins_scoped"
  on public.walkins for all
  to authenticated
  using  (public.walkin_toegang(data))
  with check (public.walkin_toegang(data));

-- ── RLS POLICIES: logboek ─────────────────────────────────

drop policy if exists "logboek_insert_authenticated" on public.logboek;
create policy "logboek_insert_authenticated"
  on public.logboek for insert
  to authenticated
  with check (true);

drop policy if exists "logboek_select_admin" on public.logboek;
create policy "logboek_select_admin"
  on public.logboek for select
  to authenticated
  using (public.is_admin());

-- ── TRIGGER: auto-create profile bij signup ───────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, naam, role, showroom)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'naam', split_part(new.email,'@',1)),
    'verkoper',
    coalesce(new.raw_user_meta_data->>'showroom', 'Geel')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── STORAGE BUCKET ────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dossier-bestanden',
  'dossier-bestanden',
  false,
  15728640,  -- 15 MB in bytes
  array['image/jpeg','image/png','application/pdf']
)
on conflict (id) do update
  set file_size_limit    = 15728640,
      allowed_mime_types = array['image/jpeg','image/png','application/pdf'];

-- ── RLS POLICIES: storage ────────────────────────────────

drop policy if exists "storage_select_authenticated" on storage.objects;
create policy "storage_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'dossier-bestanden');

drop policy if exists "storage_insert_authenticated" on storage.objects;
create policy "storage_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'dossier-bestanden');

drop policy if exists "storage_delete_authenticated" on storage.objects;
create policy "storage_delete_authenticated"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'dossier-bestanden');

-- ── INDEXEN ───────────────────────────────────────────────

create index if not exists logboek_actor_idx  on public.logboek (actor_id);
create index if not exists logboek_moment_idx on public.logboek (moment desc);
create index if not exists logboek_actie_idx  on public.logboek (actie);
