-- get_trending_places: saved_places 전체(모든 사용자)에서 가장 많이 담긴 가게 상위 N개를 반환한다.
--
-- saved_places는 RLS로 "내 행만" 보이게 걸려 있어서 일반 select로는 전체 집계가 불가능하다.
-- 그래서 SECURITY DEFINER 함수를 별도 창구로 만들어, 이 함수 안에서만 전체 테이블을 집계하고
-- 가게 이름(place_name)과 담긴 횟수(pick_count)만 반환한다. user_id 등 "누가 담았는지"
-- 알 수 있는 정보는 반환값에 절대 포함하지 않는다. RLS 자체는 그대로 켜져 있다.
--
-- Supabase SQL Editor에 붙여넣고 실행한다. (재실행해도 안전 — create or replace)

create or replace function public.get_trending_places(limit_count int default 5)
returns table (place_name text, pick_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select place_name, count(*)::bigint as pick_count
  from public.saved_places
  group by place_name
  order by pick_count desc, place_name asc
  limit greatest(limit_count, 0);
$$;

revoke all on function public.get_trending_places(int) from public;
grant execute on function public.get_trending_places(int) to anon, authenticated;
