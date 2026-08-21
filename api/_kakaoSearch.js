// api/_kakaoSearch.js
// 카카오 로컬 검색 API 호출 공통 로직.
// server.js(로컬 프록시)와 api/search.js(Vercel 서버리스 함수)가 함께 사용한다.

const KAKAO_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

async function searchKakao(searchParams) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      body: JSON.stringify({
        error: 'MISSING_API_KEY',
        message: 'KAKAO_REST_API_KEY 환경변수가 설정되어 있지 않습니다.',
      }),
    };
  }

  const keyword = searchParams.get('query');
  if (!keyword || !keyword.trim()) {
    return {
      status: 400,
      body: JSON.stringify({ error: 'MISSING_QUERY', message: '검색어(query)가 필요합니다.' }),
    };
  }

  const kakaoUrl = new URL(KAKAO_SEARCH_URL);
  kakaoUrl.searchParams.set('query', keyword);
  ['category_group_code', 'page', 'size'].forEach((key) => {
    const value = searchParams.get(key);
    if (value) kakaoUrl.searchParams.set(key, value);
  });

  try {
    const kakaoRes = await fetch(kakaoUrl, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    });
    const body = await kakaoRes.text();
    return { status: kakaoRes.status, body };
  } catch (err) {
    return {
      status: 502,
      body: JSON.stringify({
        error: 'UPSTREAM_ERROR',
        message: '카카오 API 호출 중 오류가 발생했습니다.',
        detail: String(err && err.message ? err.message : err),
      }),
    };
  }
}

module.exports = { searchKakao };
