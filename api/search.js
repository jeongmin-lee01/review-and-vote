// api/search.js
// Vercel 서버리스 함수: GET /api/search
// 실제 카카오 API 호출 로직은 _kakaoSearch.js(server.js와 공유)에 있다.

const { searchKakao } = require('./_kakaoSearch');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const result = await searchKakao(url.searchParams);

  res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(result.body);
};
