// js/trending.js — 홈 히어로의 "지금 뜨고 있는 맛집" TOP5 (모든 사용자 합산)
//
// saved_places는 RLS로 "내 행만" 보이므로 직접 집계할 수 없다. 대신 Supabase에
// 만들어둔 SECURITY DEFINER 함수 get_trending_places를 호출한다 — 이 함수는
// 가게 이름과 담긴 횟수만 반환하고 누가 담았는지는 절대 알려주지 않는다.
(function () {
  'use strict';

  if (!window.JeommetuAuth) {
    console.error('[trending] JeommetuAuth가 로드되지 않았습니다.');
    return;
  }

  const client = window.JeommetuAuth.getClient();
  const listEl = document.getElementById('heroTrendingList');
  if (!client || !listEl) return;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function renderItem(row, rank) {
    return `
      <li class="hero-trending-item">
        <span class="hero-trending-rank dot">${rank}위</span>
        <span class="hero-trending-name">${escapeHtml(row.place_name)}</span>
      </li>
    `;
  }

  async function load() {
    const { data, error } = await client.rpc('get_trending_places', { limit_count: 5 });
    if (error) {
      console.error('[trending] 인기 목록을 불러오지 못했습니다.', error);
      return; // 실패 시 정적 기본값(더미 3곳)을 그대로 둔다.
    }
    if (!data || !data.length) return;
    listEl.innerHTML = data.map((row, i) => renderItem(row, i + 1)).join('');
  }

  load();
})();
