// api/place-photo.js
// Vercel 서버리스 함수: GET /api/place-photo?name=places/.../photos/...
// 실제 구글 Places Photo API 호출 로직은 _placePhoto.js(server.js와 공유)에 있다.

const { fetchPlacePhoto } = require('./_placePhoto');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const result = await fetchPlacePhoto(url.searchParams);

  if (result.error) {
    res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: true, message: result.message }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': result.contentType,
    'Cache-Control': 'public, max-age=86400',
  });
  res.end(result.buffer);
};
