// api/_googlePlaces.js
// 구글 Places API (New)로 가게 리뷰를 조회하는 공통 로직.
// server.js(로컬 프록시)와 api/place-reviews.js(Vercel 서버리스 함수)가 함께 사용한다.

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK =
  'places.displayName,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.reviews';
const DEFAULT_RADIUS_METERS = 100;

// 하버사인 공식으로 두 좌표 사이의 거리(미터)를 계산한다.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatPlace(place) {
  return {
    found: true,
    name: (place.displayName && place.displayName.text) || '',
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: place.userRatingCount || 0,
    reviews: (place.reviews || []).map((r) => ({
      author: (r.authorAttribution && r.authorAttribution.displayName) || '익명',
      rating: typeof r.rating === 'number' ? r.rating : null,
      when: r.relativePublishTimeDescription || '',
      text: (r.text && r.text.text) || (r.originalText && r.originalText.text) || '',
    })),
    mapsUrl: place.googleMapsUri || '',
  };
}

async function findPlaceReviews(searchParams) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      body: JSON.stringify({
        error: 'MISSING_API_KEY',
        message: 'GOOGLE_PLACES_API_KEY 환경변수가 설정되어 있지 않습니다.',
      }),
    };
  }

  const name = searchParams.get('name');
  const lat = parseFloat(searchParams.get('lat'));
  const lng = parseFloat(searchParams.get('lng'));
  if (!name || !name.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
    return {
      status: 400,
      body: JSON.stringify({
        error: 'MISSING_QUERY',
        message: '가게 이름(name)과 좌표(lat, lng)가 필요합니다.',
      }),
    };
  }

  const radiusParam = parseFloat(searchParams.get('radius'));
  const radius = Number.isFinite(radiusParam) && radiusParam > 0 ? radiusParam : DEFAULT_RADIUS_METERS;

  let googleRes;
  let data;
  try {
    googleRes = await fetch(TEXT_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: name,
        languageCode: 'ko',
        maxResultCount: 5,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius,
          },
        },
      }),
    });
    data = await googleRes.json();
  } catch (err) {
    return {
      status: 502,
      body: JSON.stringify({
        error: 'UPSTREAM_ERROR',
        message: '구글 Places API 호출 중 오류가 발생했습니다.',
        detail: String(err && err.message ? err.message : err),
      }),
    };
  }

  if (!googleRes.ok) {
    return {
      status: 502,
      body: JSON.stringify({
        error: 'UPSTREAM_ERROR',
        message: '구글 Places API가 오류를 반환했습니다.',
        detail: (data && data.error && data.error.message) || '',
      }),
    };
  }

  const candidates = data.places || [];
  const match = candidates.find((place) => {
    if (!place.location) return false;
    const d = distanceMeters(lat, lng, place.location.latitude, place.location.longitude);
    return d <= radius;
  });

  if (!match) {
    return {
      status: 200,
      body: JSON.stringify({
        found: false,
        message: '해당 위치 근처에서 가게를 찾지 못했습니다.',
      }),
    };
  }

  return { status: 200, body: JSON.stringify(formatPlace(match)) };
}

module.exports = { findPlaceReviews };
