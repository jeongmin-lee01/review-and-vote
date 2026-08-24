// api/_placePhoto.js
// 구글 Places Photo (New)로 사진 바이너리를 대신 받아오는 공통 로직.
// server.js(로컬 프록시)와 api/place-photo.js(Vercel 서버리스 함수)가 함께 사용한다.
//
// _googlePlaces.js가 돌려주는 photoName(예: "places/ChIJ.../photos/AeJ...")을 받아
// 구글에 API 키와 함께 요청하고, 이미지 바이트를 그대로 프론트로 돌려준다.
// API 키가 URL에 들어가야 하는 요청이므로 반드시 서버에서만 호출해야 한다.

const PHOTO_MEDIA_BASE = 'https://places.googleapis.com/v1';
const PHOTO_NAME_PATTERN = /^places\/[^/]+\/photos\/[^/]+$/;
const MAX_WIDTH_PX = 800;

async function fetchPlacePhoto(searchParams) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      error: true,
      message: 'GOOGLE_PLACES_API_KEY 환경변수가 설정되어 있지 않습니다.',
    };
  }

  const name = searchParams.get('name');
  if (!name || !PHOTO_NAME_PATTERN.test(name)) {
    return {
      status: 400,
      error: true,
      message: '유효하지 않은 사진 리소스입니다.',
    };
  }

  const url = `${PHOTO_MEDIA_BASE}/${name}/media?maxWidthPx=${MAX_WIDTH_PX}&key=${apiKey}`;

  let googleRes;
  try {
    googleRes = await fetch(url);
  } catch (err) {
    return {
      status: 502,
      error: true,
      message: '구글 Places 사진 API 호출 중 오류가 발생했습니다.',
    };
  }

  if (!googleRes.ok) {
    return {
      status: 502,
      error: true,
      message: '구글 Places 사진 API가 오류를 반환했습니다.',
    };
  }

  const contentType = googleRes.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await googleRes.arrayBuffer();

  return {
    status: 200,
    error: false,
    contentType,
    buffer: Buffer.from(arrayBuffer),
  };
}

module.exports = { fetchPlacePhoto };
