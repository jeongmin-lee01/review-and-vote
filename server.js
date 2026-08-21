// server.js
// 점메투 - 맛집 검색 로컬 프록시 서버
//
// 실행법:
//   1) .env.example 을 .env 로 복사하고 KAKAO_REST_API_KEY= 뒤에 카카오 REST API 키를 채워 넣는다.
//   2) node server.js
//   3) 브라우저에서 http://localhost:8811/search.html 접속
//
// 이 서버가 하는 일:
//   - .env 를 직접 파싱해서 process.env 에 채워 넣는다 (외부 패키지 사용 안 함).
//   - GET /api/search?query=키워드&category_group_code=FD6 요청을 받으면
//     서버 사이드에서만 카카오 로컬 API(keyword.json)를 Authorization: KakaoAK {키} 헤더로 호출하고
//     그 결과를 그대로 JSON으로 돌려준다. REST 키는 절대 브라우저로 내려가지 않는다.
//   - search.html 등 정적 파일도 같은 포트에서 서빙한다.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { searchKakao } = require('./api/_kakaoSearch');
const { findPlaceReviews } = require('./api/_googlePlaces');

const PORT = process.env.PORT || 8811;
const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, '.env');

// ---------- .env 파서 (외부 패키지 없이 직접 구현) ----------
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf-8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // 앞뒤 따옴표 제거 (있는 경우)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}
loadEnv(ENV_PATH);

// ---------- 정적 파일 서빙 ----------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/search.html' : pathname;
  filePath = path.normalize(path.join(ROOT, filePath));

  // 디렉터리 탈출 방지
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- /api/search 프록시 ----------
async function handleSearch(req, res, query) {
  const result = await searchKakao(query);
  res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(result.body);
}

// ---------- /api/place-reviews 프록시 ----------
async function handlePlaceReviews(req, res, query) {
  const result = await findPlaceReviews(query);
  res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(result.body);
}

// ---------- 서버 ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/search') {
    handleSearch(req, res, url.searchParams);
    return;
  }

  if (url.pathname === '/api/place-reviews') {
    handlePlaceReviews(req, res, url.searchParams);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`점메투 검색 서버 실행 중: http://localhost:${PORT}/search.html`);
  if (!process.env.KAKAO_REST_API_KEY) {
    console.warn('[경고] .env 에 KAKAO_REST_API_KEY 가 설정되어 있지 않습니다. .env.example 을 참고하세요.');
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.warn('[경고] .env 에 GOOGLE_PLACES_API_KEY 가 설정되어 있지 않습니다. .env.example 을 참고하세요.');
  }
});
