// js/recommend.js — 로그인 사용자를 위한 "나를 위한 추천" (홈 히어로)
//
// 내가 담은 가게들(RLS로 이미 "내 것"만 조회됨)의 카테고리 중 가장 자주 담은
// 카테고리를 찾아, 같은 카테고리 키워드로 /api/search(카카오 검색 프록시, search.js와
// 동일한 서버 라우트)를 호출해 후보를 가져오고, 이미 담은 가게는 제외해서 보여준다.
(function () {
  'use strict';

  if (!window.JeommetuAuth) {
    console.error('[recommend] JeommetuAuth가 로드되지 않았습니다.');
    return;
  }

  const client = window.JeommetuAuth.getClient();
  const panelEl = document.getElementById('heroRecommend');
  const listEl = document.getElementById('heroRecommendList');
  if (!client || !panelEl || !listEl) return;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // "음식점 > 일식 > 돈까스,우동 > 긴자료코" 같은 카카오 카테고리 문자열에서
  // 대분류(두 번째 조각)를 추천 검색 키워드로 쓴다.
  function categoryKey(category) {
    if (!category) return null;
    const parts = category.split('>').map((s) => s.trim()).filter(Boolean);
    return parts[1] || parts[0] || null;
  }

  function mostFrequent(keys) {
    const counts = new Map();
    keys.forEach((key) => {
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    let best = null;
    let bestCount = 0;
    counts.forEach((count, key) => {
      if (count > bestCount) {
        best = key;
        bestCount = count;
      }
    });
    return best;
  }

  function renderItem(place) {
    const name = escapeHtml(place.place_name || '이름 없음');
    const url = escapeHtml(place.place_url || '#');
    return `
      <li class="hero-trending-item">
        <span class="hero-trending-rank dot">▸</span>
        <a class="hero-trending-name hero-trending-name-link" href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>
      </li>
    `;
  }

  function hide() {
    panelEl.hidden = true;
    listEl.innerHTML = '';
  }

  async function buildRecommendations() {
    const { data: picks, error } = await client.from('saved_places').select('category, place_id');
    if (error) {
      console.error('[recommend] 담은 목록을 불러오지 못했습니다.', error);
      hide();
      return;
    }
    if (!picks || !picks.length) {
      hide();
      return;
    }

    const key = mostFrequent(picks.map((p) => categoryKey(p.category)));
    if (!key) {
      hide();
      return;
    }

    const savedIds = new Set(picks.map((p) => p.place_id));

    let res;
    try {
      res = await fetch(`/api/search?${new URLSearchParams({ query: key })}`);
    } catch (err) {
      hide();
      return;
    }
    if (!res.ok) {
      hide();
      return;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      hide();
      return;
    }

    const data = await res.json();
    const candidates = ((data && data.documents) || []).filter((p) => !savedIds.has(p.id));

    if (!candidates.length) {
      hide();
      return;
    }

    listEl.innerHTML = candidates.slice(0, 5).map(renderItem).join('');
    panelEl.hidden = false;
  }

  window.JeommetuAuth.onChange((user) => {
    if (user) {
      buildRecommendations();
    } else {
      hide();
    }
  });
})();
