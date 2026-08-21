// api/analyze-reviews.js
// Vercel 서버리스 함수: POST /api/analyze-reviews
// 실제 Gemini API 호출 로직은 _geminiAnalysis.js(server.js와 공유)에 있다.
//
// 다른 두 라우트(/api/search, /api/place-reviews)는 GET + 짧은 쿼리 파라미터를 쓰지만,
// 이 라우트는 리뷰 본문(최대 5개, 각각 최대 1000자)을 실어 날라야 하므로
// POST + JSON 본문을 쓴다.

const { analyzeReviews, readJsonBody } = require('./_geminiAnalysis');

module.exports = async function handler(req, res) {
  const payload = await readJsonBody(req);
  const result = await analyzeReviews(payload);

  res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(result.body);
};
