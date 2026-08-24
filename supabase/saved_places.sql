-- saved_places: "맛집 담기" 버튼으로 저장한 가게 목록
-- Supabase SQL Editor에 붙여넣고 실행한다.

create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  place_name text not null,
  category text,
  address text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  unique (user_id, place_id)
);

alter table public.saved_places enable row level security;

drop policy if exists "saved_places_select_own" on public.saved_places;
create policy "saved_places_select_own"
  on public.saved_places for select
  using (auth.uid() = user_id);

drop policy if exists "saved_places_insert_own" on public.saved_places;
create policy "saved_places_insert_own"
  on public.saved_places for insert
  with check (auth.uid() = user_id);

drop policy if exists "saved_places_delete_own" on public.saved_places;
create policy "saved_places_delete_own"
  on public.saved_places for delete
  using (auth.uid() = user_id);
