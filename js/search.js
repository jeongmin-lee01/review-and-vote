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
    const placeId = escapeHtml(place.id || '');
    const lat = place.y || '';
    const lng = place.x || '';

    return `
      <li class="card" data-place-id="${placeId}" data-name="${name}" data-category="${category}" data-address="${address}" data-lat="${lat}" data-lng="${lng}" aria-expanded="false">
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
        <div class="card-actions">
          <a class="card-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">카카오맵에서 보기 →</a>
          <div class="card-btn-group">
            <button type="button" class="pick-add-btn dot">맛집 담기</button>
            <button type="button" class="vote-add-btn dot">투표에 넣기</button>
          </div>
        </div>
        <button type="button" class="review-toggle dot">▸ 구글 리뷰 보기</button>
      </li>
    `;
  }

  function renderResults(places) {
    resultsEl.innerHTML = places.map(renderCard).join('');
  }

  // ---------- 리뷰 패널 (구글 Places API) ----------
  const REVIEW_CACHE_PREFIX = 'jeommetu:place-reviews:';
  const reviewRequests = new Map(); // placeId -> in-flight Promise (중복 요청 방지)

  function getCachedReviews(placeId) {
    try {
      const raw = localStorage.getItem(REVIEW_CACHE_PREFIX + placeId);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function setCachedReviews(placeId, data) {
    try {
      localStorage.setItem(REVIEW_CACHE_PREFIX + placeId, JSON.stringify(data));
    } catch (err) {
      // 시크릿 모드 등으로 localStorage를 못 쓰면 캐시만 건너뛴다.
    }
  }

  function renderReviewItem(review) {
    const author = escapeHtml(review.author || '익명');
    const when = escapeHtml(review.when || '');
    const text = escapeHtml(review.text || '');
    const star = typeof review.rating === 'number' ? `⭐ ${review.rating}` : '';
    return `
      <li class="review-item">
        <div class="review-meta">
          <span class="review-author">${author}</span>
          ${star ? `<span class="review-star">${star}</span>` : ''}
          <span class="review-when">${when}</span>
        </div>
        <p class="review-text">${text}</p>
      </li>
    `;
  }

  function renderReviewPanelContent(data) {
    if (!data || data.found === false) {
      return '<p class="status-msg status-error dot">이 가게의 구글 리뷰를 찾지 못했습니다.</p>';
    }

    const name = escapeHtml(data.name || '');
    const rating = typeof data.rating === 'number' ? data.rating.toFixed(1) : '?';
    const reviewCount = Number(data.reviewCount) || 0;
    const reviews = data.reviews || [];
    const mapsUrl = data.mapsUrl || '#';

    const reviewsHtml = reviews.length
      ? `<ul class="review-list">${reviews.map(renderReviewItem).join('')}</ul>`
      : '<p class="status-sub">등록된 리뷰가 없습니다.</p>';

    return `
      <div class="review-header">
        <span class="review-label dot">구글 리뷰 · ${name}</span>
        <span class="review-rating">⭐ <b class="amber-num">${rating}</b> · 리뷰 ${reviewCount}개</span>
      </div>
      ${reviewsHtml}
      <a class="card-link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">구글 지도에서 전체 리뷰 보기 →</a>
      ${reviews.length ? '<div class="ai-analysis" data-state="idle"></div>' : ''}
    `;
  }

  function setReviewToggleLabel(cardEl, isOpen) {
    const toggleEl = cardEl.querySelector('.review-toggle');
    if (toggleEl) toggleEl.textContent = isOpen ? '▲ 리뷰 접기' : '▸ 구글 리뷰 보기';
  }

  function closeReviewPanel(cardEl) {
    const panel = cardEl.querySelector('.review-panel');
    if (panel) panel.remove();
    cardEl.setAttribute('aria-expanded', 'false');
    setReviewToggleLabel(cardEl, false);
  }

  function openReviewPanel(cardEl, innerHtml) {
    let panel = cardEl.querySelector('.review-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'review-panel';
      cardEl.appendChild(panel);
    }
    panel.innerHTML = innerHtml;
    cardEl.setAttribute('aria-expanded', 'true');
    setReviewToggleLabel(cardEl, true);
  }

  async function toggleReviewPanel(cardEl) {
    if (cardEl.getAttribute('aria-expanded') === 'true') {
      closeReviewPanel(cardEl);
      return;
    }

    const placeId = cardEl.dataset.placeId;
    const name = cardEl.dataset.name;
    const lat = cardEl.dataset.lat;
    const lng = cardEl.dataset.lng;

    if (!lat || !lng) {
      openReviewPanel(
        cardEl,
        '<p class="status-msg status-error dot">좌표 정보가 없어 리뷰를 조회할 수 없습니다.</p>'
      );
      return;
    }

    const cached = placeId ? getCachedReviews(placeId) : null;
    if (cached) {
      openReviewPanel(cardEl, renderReviewPanelContent(cached));
      if (cached.found !== false && cached.reviews && cached.reviews.length > 0) {
        analyzePlaceReviews(cardEl, placeId, name, cached);
      }
      return;
    }

    openReviewPanel(cardEl, '<p class="status-msg dot">리뷰를 불러오는 중..</p>');

    let requestPromise = placeId ? reviewRequests.get(placeId) : null;
    if (!requestPromise) {
      const params = new URLSearchParams({ name, lat, lng });
      requestPromise = fetch(`/api/place-reviews?${params.toString()}`)
        .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
        .finally(() => {
          if (placeId) reviewRequests.delete(placeId);
        });
      if (placeId) reviewRequests.set(placeId, requestPromise);
    }

    let result;
    try {
      result = await requestPromise;
    } catch (err) {
      if (cardEl.getAttribute('aria-expanded') === 'true') {
        openReviewPanel(cardEl, '<p class="status-msg status-error dot">리뷰를 불러오지 못했습니다.</p>');
      }
      return;
    }

    // 응답을 기다리는 동안 패널이 다시 닫혔으면 그대로 둔다.
    if (cardEl.getAttribute('aria-expanded') !== 'true') return;

    const { ok, data } = result;
    if (!ok) {
      openReviewPanel(
        cardEl,
        `<p class="status-msg status-error dot">${escapeHtml(
          (data && data.message) || '리뷰를 불러오지 못했습니다.'
        )}</p>`
      );
      return;
    }

    if (placeId) setCachedReviews(placeId, data);
    openReviewPanel(cardEl, renderReviewPanelContent(data));
    if (data.found !== false && data.reviews && data.reviews.length > 0) {
      analyzePlaceReviews(cardEl, placeId, name, data);
    }
  }

  // ---------- AI 분석 (Gemini) ----------
  const ANALYSIS_CACHE_PREFIX = 'jeommetu:place-analysis:';
  const analysisRequests = new Map(); // placeId -> in-flight Promise (중복 요청 방지)
  const AI_LOADING_HTML = '<p class="status-msg dot">AI가 리뷰를 분석하고 있어요..</p>';

  function getCachedAnalysis(placeId) {
    try {
      const raw = localStorage.getItem(ANALYSIS_CACHE_PREFIX + placeId);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function setCachedAnalysis(placeId, data) {
    try {
      localStorage.setItem(ANALYSIS_CACHE_PREFIX + placeId, JSON.stringify(data));
    } catch (err) {
      // 시크릿 모드 등으로 localStorage를 못 쓰면 캐시만 건너뛴다.
    }
  }

  function setAnalysisPanelState(cardEl, state, html) {
    const el = cardEl.querySelector('.ai-analysis');
    if (!el) return; // 패널이 닫혔거나 리뷰가 없어 컨테이너가 없는 경우
    el.dataset.state = state;
    el.innerHTML = html;
  }

  function renderSentimentBar(sentiment) {
    const pos = Math.max(0, Number(sentiment.positive) || 0);
    const neu = Math.max(0, Number(sentiment.neutral) || 0);
    const neg = Math.max(0, Number(sentiment.negative) || 0);
    const total = pos + neu + neg;
    if (total === 0) return '';

    const posPct = (pos / total) * 100;
    const neuPct = (neu / total) * 100;
    const negPct = (neg / total) * 100;

    return `
      <div class="sentiment-bar" role="img" aria-label="긍정 ${pos}개, 중립 ${neu}개, 부정 ${neg}개">
        <span class="sentiment-seg sentiment-pos" style="width:${posPct}%"></span>
        <span class="sentiment-seg sentiment-neu" style="width:${neuPct}%"></span>
        <span class="sentiment-seg sentiment-neg" style="width:${negPct}%"></span>
      </div>
      <div class="sentiment-legend">
        <span class="sentiment-legend-item"><i class="sentiment-dot sentiment-dot-pos"></i>긍정 ${pos}</span>
        <span class="sentiment-legend-item"><i class="sentiment-dot sentiment-dot-neu"></i>중립 ${neu}</span>
        <span class="sentiment-legend-item"><i class="sentiment-dot sentiment-dot-neg"></i>부정 ${neg}</span>
      </div>
    `;
  }

  function renderWordCloud(keywords) {
    const valid = (keywords || []).filter((k) => k && k.word);
    if (!valid.length) return '';
    return `
      <div class="word-cloud">
        ${valid
          .map((k) => {
            const score = Math.min(10, Math.max(1, Number(k.score) || 1));
            const isNegative = k.context === 'negative';
            const fontSize = 12 + (score - 1) * 2; // 1점=12px ~ 10점=30px 선형 스케일
            return `<span class="word-cloud-item ${
              isNegative ? 'word-negative' : 'word-positive'
            }" style="font-size:${fontSize}px">${escapeHtml(k.word)}</span>`;
          })
          .join('')}
      </div>
    `;
  }

  function renderVerdictBubble(summary) {
    if (!summary) return '';
    return `
      <div class="ai-verdict">
        <span class="review-label dot">AI총평</span>
        <div class="verdict-bubble">
          <p class="verdict-text">${escapeHtml(summary)}</p>
        </div>
      </div>
    `;
  }

  function renderAnalysisResult(data) {
    const sentiment = (data && data.sentiment) || { positive: 0, neutral: 0, negative: 0 };
    const keywords = (data && data.keywords) || [];
    const summary = (data && data.summary) || '';

    return `
      <div class="ai-analysis-inner">
        <span class="review-label dot">AI 리뷰 분석</span>
        ${renderSentimentBar(sentiment)}
        ${renderWordCloud(keywords)}
        ${renderVerdictBubble(summary)}
      </div>
    `;
  }

  async function analyzePlaceReviews(cardEl, placeId, name, reviewsData) {
    const reviews = (reviewsData && reviewsData.reviews) || [];
    if (!reviews.length) return; // 방어적 재확인 (호출부에서도 가드함)

    const cached = placeId ? getCachedAnalysis(placeId) : null;
    if (cached) {
      setAnalysisPanelState(cardEl, 'done', renderAnalysisResult(cached));
      return;
    }

    setAnalysisPanelState(cardEl, 'loading', AI_LOADING_HTML);

    let requestPromise = placeId ? analysisRequests.get(placeId) : null;
    if (!requestPromise) {
      requestPromise = fetch('/api/analyze-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId,
          name,
          reviews: reviews.map((r) => ({ rating: r.rating, text: r.text })),
        }),
      })
        .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
        .finally(() => {
          if (placeId) analysisRequests.delete(placeId);
        });
      if (placeId) analysisRequests.set(placeId, requestPromise);
    }

    let result;
    try {
      result = await requestPromise;
    } catch (err) {
      setAnalysisPanelState(cardEl, 'error', '<p class="status-sub">AI 분석을 불러오지 못했어요.</p>');
      return;
    }

    // 응답을 기다리는 동안 패널이 다시 닫혔으면 그대로 둔다.
    if (cardEl.getAttribute('aria-expanded') !== 'true') return;

    const { ok, data } = result;
    if (!ok) {
      setAnalysisPanelState(cardEl, 'error', '<p class="status-sub">AI 분석을 불러오지 못했어요.</p>');
      return;
    }

    if (placeId) setCachedAnalysis(placeId, data);
    setAnalysisPanelState(cardEl, 'done', renderAnalysisResult(data));
  }

  resultsEl.addEventListener('click', (e) => {
    if (e.target.closest('.card-link')) return;
    if (e.target.closest('.pick-add-btn')) return;
    if (e.target.closest('.vote-add-btn')) {
      if (window.JeommetuAuth) window.JeommetuAuth.requireLogin();
      return;
    }
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    toggleReviewPanel(cardEl);
  });

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
