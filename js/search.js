// js/search.js
// 점메투 - 맛집 검색 클라이언트 로직
//
// 중요: 이 파일은 카카오 API를 절대 직접 호출하지 않는다.
// 반드시 같은 오리진의 로컬 프록시(/api/search)만 호출한다.
// REST API 키는 서버(server.js)에만 존재하며 브라우저로 내려오지 않는다.

(function () {
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  const categorySelect = document.getElementById('category-select');
  const resultsEl = document.getElementById('results');
  const statusEl = document.getElementById('status');

  // 이 페이지가 /api/search 프록시 없이(예: npx serve 같은 정적 서버로) 열려 있을 때
  // 공통으로 보여줄 안내 메시지. node server.js 하나만 실행하면
  // 랜딩페이지(index.html)·투표 데모(vote.html)·이 검색 페이지가 전부 같은 포트(기본 8811)에서 동작한다.
  const WRONG_SERVER_MESSAGE =
    '<p class="status-msg status-error dot">검색 API 서버(/api/search)에 연결되지 않았습니다.</p>' +
    '<p class="status-sub">이 페이지가 정적 파일 서버(예: npx serve)로 열려 있는 것 같습니다. ' +
    '터미널에서 <strong>node server.js</strong> 를 실행한 뒤 http://localhost:8811/search.html 로 다시 접속해 주세요. ' +
    '(node server.js 하나만 실행하면 랜딩페이지·투표 데모·검색이 모두 같은 서버에서 동작합니다.)</p>';

  // 페이지 진입 시 /api/search 가 실제로 응답 가능한지 가볍게 헬스체크한다.
  // 쿼리 없이 호출하면 카카오 API를 호출하지 않고 즉시 400 JSON을 돌려주므로 비용이 거의 없다.
  // 정적 서버로 열려 있으면 JSON이 아닌 HTML(404)이 돌아오므로 그 시점에 바로 안내 배너를 띄운다.
  async function checkServerHealth() {
    try {
      const res = await fetch('/api/search');
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setStatus(WRONG_SERVER_MESSAGE);
      }
    } catch (err) {
      setStatus(WRONG_SERVER_MESSAGE);
    }
  }

  function setStatus(html) {
    statusEl.innerHTML = html;
    statusEl.hidden = false;
  }

  function clearStatus() {
    statusEl.innerHTML = '';
    statusEl.hidden = true;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatDistance(meters) {
    const n = Number(meters);
    if (!n) return '';
    if (n < 1000) return `${n}m`;
    return `${(n / 1000).toFixed(1)}km`;
  }

  function renderCard(place) {
    const name = escapeHtml(place.place_name || '이름 없음');
    const category = escapeHtml(place.category_name || '카테고리 정보 없음');
    const address = escapeHtml(place.road_address_name || place.address_name || '주소 정보 없음');
    const phone = escapeHtml(place.phone || '전화번호 없음');
    const distance = place.distance ? formatDistance(place.distance) : '';
    const url = place.place_url || '#';

    return `
      <li class="card">
        <h3 class="card-name dot">${name}</h3>
        <p class="card-category">${category}</p>
        <dl class="card-meta">
          <div class="card-meta-row">
            <dt>주소</dt>
            <dd>${address}</dd>
          </div>
          <div class="card-meta-row">
            <dt>전화</dt>
            <dd>${phone}</dd>
          </div>
          ${distance ? `<div class="card-meta-row"><dt>거리</dt><dd>${distance}</dd></div>` : ''}
        </dl>
        <a class="card-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">카카오맵에서 보기 →</a>
      </li>
    `;
  }

  function renderResults(places) {
    resultsEl.innerHTML = places.map(renderCard).join('');
  }

  async function search(keyword, categoryGroupCode) {
    resultsEl.innerHTML = '';
    setStatus('<p class="status-msg dot">검색 중...</p>');

    const params = new URLSearchParams({ query: keyword });
    if (categoryGroupCode) params.set('category_group_code', categoryGroupCode);

    let res;
    try {
      res = await fetch(`/api/search?${params.toString()}`);
    } catch (err) {
      setStatus(WRONG_SERVER_MESSAGE);
      return;
    }

    // npx serve 같은 정적 서버로 열려 있으면 /api/search 요청도 "성공"은 하지만
    // JSON이 아니라 HTML(404) 페이지를 돌려준다. fetch 자체는 에러를 던지지 않으므로
    // 응답의 Content-Type을 먼저 확인해 "정적 서버로 열려 있음"을 구분해서 안내한다.
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      setStatus(WRONG_SERVER_MESSAGE);
      return;
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      setStatus('<p class="status-msg status-error dot">응답을 처리하지 못했습니다.</p>');
      return;
    }

    if (!res.ok) {
      if (data && data.error === 'MISSING_API_KEY') {
        setStatus(
          '<p class="status-msg status-error dot">API 키가 설정되지 않았습니다.</p>' +
            '<p class="status-sub">.env 파일에 KAKAO_REST_API_KEY 값을 채운 뒤 서버를 다시 시작해 주세요. (.env.example 참고)</p>'
        );
        return;
      }
      setStatus(
        `<p class="status-msg status-error dot">검색 중 오류가 발생했습니다.</p><p class="status-sub">${escapeHtml(
          (data && data.message) || '잠시 후 다시 시도해 주세요.'
        )}</p>`
      );
      return;
    }

    const places = (data && data.documents) || [];
    if (places.length === 0) {
      setStatus('<p class="status-msg dot">검색 결과가 없습니다.</p><p class="status-sub">다른 키워드로 다시 검색해 보세요.</p>');
      return;
    }

    clearStatus();
    renderResults(places);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const keyword = input.value.trim();
    if (!keyword) {
      setStatus('<p class="status-msg status-error dot">검색어를 입력해 주세요.</p>');
      return;
    }
    search(keyword, categorySelect.value);
  });

  checkServerHealth();
})();
