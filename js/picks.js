// js/picks.js — "맛집 담기" 기능 (Supabase saved_places 테이블 연동)
//
// 검색(search.js)/리뷰/AI 분석 로직은 건드리지 않고, #results 위에 별도의
// click 리스너와 MutationObserver만 얹어서 동작한다.
(function () {
  'use strict';

  if (!window.JeommetuAuth) {
    console.error('[picks] JeommetuAuth가 로드되지 않았습니다.');
    return;
  }

  const client = window.JeommetuAuth.getClient();
  const resultsEl = document.getElementById('results');
  if (!client || !resultsEl) return;

  const TABLE = 'saved_places';
  let pickedIds = new Set();

  function applyCardState(cardEl) {
    const btn = cardEl.querySelector('.pick-add-btn');
    if (!btn) return;
    const placeId = cardEl.dataset.placeId;
    const picked = !!placeId && pickedIds.has(placeId);
    btn.classList.toggle('is-picked', picked);
    btn.textContent = picked ? '담음 · 취소' : '맛집 담기';
  }

  function refreshAllButtons() {
    resultsEl.querySelectorAll('.card').forEach(applyCardState);
  }

  async function loadPickedIds(userId) {
    if (!userId) {
      pickedIds = new Set();
      refreshAllButtons();
      return;
    }
    const { data, error } = await client.from(TABLE).select('place_id');
    if (error) {
      console.error('[picks] 담은 목록을 불러오지 못했습니다.', error);
      return;
    }
    pickedIds = new Set((data || []).map((row) => row.place_id));
    refreshAllButtons();
  }

  new MutationObserver(refreshAllButtons).observe(resultsEl, { childList: true });

  resultsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.pick-add-btn');
    if (!btn) return;

    const user = window.JeommetuAuth.getUser();
    if (!user) {
      window.JeommetuAuth.requireLogin('로그인하고 맛집 담기');
      return;
    }

    const cardEl = btn.closest('.card');
    const placeId = cardEl && cardEl.dataset.placeId;
    if (!placeId || btn.disabled) return;

    btn.disabled = true;
    try {
      if (pickedIds.has(placeId)) {
        const { error } = await client
          .from(TABLE)
          .delete()
          .eq('user_id', user.id)
          .eq('place_id', placeId);
        if (error) throw error;
        pickedIds.delete(placeId);
      } else {
        const payload = {
          user_id: user.id,
          place_id: placeId,
          place_name: cardEl.dataset.name || '',
          category: cardEl.dataset.category || '',
          address: cardEl.dataset.address || '',
          lat: cardEl.dataset.lat ? Number(cardEl.dataset.lat) : null,
          lng: cardEl.dataset.lng ? Number(cardEl.dataset.lng) : null,
        };
        const { error } = await client.from(TABLE).insert(payload);
        if (error && error.code !== '23505') throw error; // 23505 = unique_violation (이미 담겨 있음)
        pickedIds.add(placeId);
      }
      applyCardState(cardEl);
    } catch (err) {
      console.error('[picks] 요청 처리 중 오류가 발생했습니다.', err);
    } finally {
      btn.disabled = false;
    }
  });

  let hasRun = false;
  let lastUserId = null;
  window.JeommetuAuth.onChange((user) => {
    const uid = user ? user.id : null;
    if (hasRun && uid === lastUserId) return;
    hasRun = true;
    lastUserId = uid;
    loadPickedIds(uid);
  });
})();
