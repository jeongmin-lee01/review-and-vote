-- saved_places 더미 데이터 100건 시드 스크립트
--
-- "지금 뜨고 있는 맛집"(get_trending_places) TOP5 랭킹을 테스트해보기 위한 것이다.
-- saved_places.user_id는 auth.users(id)를 참조하는 FK라서, 실제 로그인 가능한 내 계정이
-- 아니라 로그인은 불가능한 placeholder 계정 25개를 먼저 만들고 그 아래로 데이터를 나눠 담는다.
-- (내 실제 계정의 마이페이지·추천 결과에는 영향이 없다 — 전부 다른 user_id를 쓰기 때문.)
--
-- Supabase SQL Editor에 붙여넣고 실행한다.

-- 1) placeholder 유저 25명 (로그인 불가, FK 충족용)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'dummy_place_seed_' || gs || '@example.invalid',
  'not-a-real-password',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  '', '', '', ''
from generate_series(1, 25) as gs
on conflict (email) do nothing;

-- 2) 가게 14곳 + 가중치(합계 100)로 saved_places 100건 삽입
--    (같은 가게를 여러 placeholder 유저가 나눠 담는 방식 — 실제 사용 패턴과 비슷하게)
with place_catalog(place_id, place_name, category, lat, lng) as (
  values
    ('dummy-01', '강남집밥',     '음식점 > 한식 > 가정식',    37.4979, 127.0276),
    ('dummy-02', '홍대파스타',   '음식점 > 양식 > 파스타',    37.5563, 126.9226),
    ('dummy-03', '을지로숯불집', '음식점 > 한식 > 고기,구이', 37.5663, 126.9910),
    ('dummy-04', '성수동브런치', '음식점 > 양식 > 브런치',    37.5445, 127.0559),
    ('dummy-05', '연남동타코',   '음식점 > 양식 > 멕시칸',    37.5638, 126.9256),
    ('dummy-06', '여의도라멘',   '음식점 > 일식 > 라멘',      37.5219, 126.9245),
    ('dummy-07', '망원동떡볶이', '음식점 > 분식 > 떡볶이',    37.5561, 126.9013),
    ('dummy-08', '건대양꼬치',   '음식점 > 중식 > 양꼬치',    37.5407, 127.0693),
    ('dummy-09', '신촌삼겹살',   '음식점 > 한식 > 고기,구이', 37.5559, 126.9368),
    ('dummy-10', '이태원버거',   '음식점 > 양식 > 버거',      37.5344, 126.9946),
    ('dummy-11', '서촌한정식',   '음식점 > 한식 > 한정식',    37.5773, 126.9700),
    ('dummy-12', '압구정스시',   '음식점 > 일식 > 스시',      37.5274, 127.0286),
    ('dummy-13', '잠실치킨',     '음식점 > 한식 > 치킨',      37.5133, 127.1000),
    ('dummy-14', '노원국밥',     '음식점 > 한식 > 국밥',      37.6542, 127.0568)
),
weighted(place_id, weight) as (
  values
    ('dummy-01', 22), ('dummy-02', 18), ('dummy-03', 14), ('dummy-04', 11),
    ('dummy-05', 9),  ('dummy-06', 7),  ('dummy-07', 5),  ('dummy-08', 4),
    ('dummy-09', 3),  ('dummy-10', 2),  ('dummy-11', 2),  ('dummy-12', 1),
    ('dummy-13', 1),  ('dummy-14', 1)
),
expanded as (
  select w.place_id, row_number() over (partition by w.place_id) as rn
  from weighted w, generate_series(1, w.weight)
),
dummy_users as (
  select id, row_number() over (order by email) as rn
  from auth.users
  where email like 'dummy_place_seed_%@example.invalid'
)
insert into public.saved_places (user_id, place_id, place_name, category, address, lat, lng, created_at)
select
  du.id,
  pc.place_id,
  pc.place_name,
  pc.category,
  '서울 어딘가 ' || e.rn || '번지',
  pc.lat + (random() - 0.5) * 0.01,
  pc.lng + (random() - 0.5) * 0.01,
  now() - (random() * interval '30 days')
from expanded e
join place_catalog pc on pc.place_id = e.place_id
join dummy_users du on du.rn = ((e.rn - 1) % 25) + 1
on conflict (user_id, place_id) do nothing;

-- ── 나중에 이 더미 데이터를 지우고 싶으면 아래 두 줄을 따로 실행 ──
-- delete from public.saved_places where user_id in (select id from auth.users where email like 'dummy_place_seed_%@example.invalid');
-- delete from auth.users where email like 'dummy_place_seed_%@example.invalid';
