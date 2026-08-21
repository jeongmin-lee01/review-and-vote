// api/place-reviews.js
// Vercel 서버리스 함수: GET /api/place-reviews
// 실제 구글 Places API 호출 로직은 _googlePlaces.js(server.js와 공유)에 있다.

const { findPlaceReviews } = require('./_googlePlaces');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const result = await findPlaceReviews(url.searchParams);

  res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(result.body);
};
