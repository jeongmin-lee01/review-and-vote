// js/mypage.js — 마이페이지: 내가 담은 맛집 목록
//
// saved_places는 RLS로 "내 행"만 보이게 걸려 있으므로, 조회 시 user_id
// 조건을 직접 걸지 않고 전체를 요청한다 (Supabase가 알아서 걸러줌).
(function () {
  'use strict';

  if (!window.JeommetuAuth) {
    console.error('[mypage] JeommetuAuth가 로드되지 않았습니다.');
    return;
  }

  const client = window.JeommetuAuth.getClient();
  const statusEl = document.getElementById('status');
  const listEl = document.getElementById('picks');
  if (!client || !statusEl || !listEl) return;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  }

  function mapsUrl(row) {
    if (row.lat != null && row.lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.place_name || '')}`;
  }

  function setStatus(html) {
    statusEl.innerHTML = html;
    statusEl.hidden = false;
  }

  function clearStatus() {
    statusEl.innerHTML = '';
    statusEl.hidden = true;
  }

  function renderCard(row) {
    const name = escapeHtml(row.place_name || '이름 없음');
    const category = escapeHtml(row.category || '카테고리 정보 없음');
    const address = escapeHtml(row.address || '주소 정보 없음');
    const when = formatDate(row.created_at);

    return `
      <li class="card" data-id="${escapeHtml(row.id)}">
        <button type="button" class="card-delete-btn dot" aria-label="목록에서 삭제">×</button>
        <h3 class="card-name dot">${name}</h3>
        <p class="card-category">${category}</p>
        <dl class="card-meta">
          <div class="card-meta-row"><dt>주소</dt><dd>${address}</dd></div>
          <div class="card-meta-row"><dt>담은 날</dt><dd>${when}</dd></div>
        </dl>
        <a class="card-link" href="${mapsUrl(row)}" target="_blank" rel="noopener noreferrer">구글맵 보기 →</a>
      </li>
    `;
  }

  function renderEmpty() {
    listEl.innerHTML = '';
    setStatus(
      '<p class="status-msg dot">아직 담은 맛집이 없어요.</p>' +
        '<a class="btn" href="search.html">맛집 검색하러 가기</a>'
    );
  }

  function renderNeedsLogin() {
    listEl.innerHTML = '';
    setStatus('<p class="status-msg dot">로그인이 필요합니다.</p>');
  }

  function renderList(rows) {
    if (!rows.length) {
      renderEmpty();
      return;
    }
    clearStatus();
    listEl.innerHTML = rows.map(renderCard).join('');
  }

  async function loadPicks() {
    setStatus('<p class="status-msg dot">불러오는 중..</p>');
    const { data, error } = await client
      .from('saved_places')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[mypage] 목록을 불러오지 못했습니다.', error);
      setStatus('<p class="status-msg status-error dot">목록을 불러오지 못했습니다.</p>');
      return;
    }
    renderList(data || []);
  }

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.card-delete-btn');
    if (!btn || btn.disabled) return;

    const cardEl = btn.closest('.card');
    const id = cardEl && cardEl.dataset.id;
    if (!id) return;

    btn.disabled = true;
    const { error } = await client.from('saved_places').delete().eq('id', id);
    if (error) {
      console.error('[mypage] 삭제하지 못했습니다.', error);
      btn.disabled = false;
      return;
    }
    cardEl.remove();
    if (!listEl.children.length) renderEmpty();
  });

  setStatus('<p class="status-msg dot">불러오는 중..</p>');

  window.JeommetuAuth.onChange((user) => {
    if (user) {
      loadPicks();
    } else {
      renderNeedsLogin();
      window.JeommetuAuth.requireLogin('로그인하고 마이페이지 보기');
    }
  });
})();
