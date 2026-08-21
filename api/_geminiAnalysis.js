// api/_geminiAnalysis.js
// Gemini API로 구글 리뷰를 분석(감정 비율/키워드/총평)하는 공통 로직.
// server.js(로컬 프록시)와 api/analyze-reviews.js(Vercel 서버리스 함수)가 함께 사용한다.

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_REVIEWS = 5;
const MAX_REVIEW_TEXT_LEN = 1000;
const MAX_KEYWORDS = 15;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sentiment: {
      type: 'OBJECT',
      properties: {
        positive: { type: 'INTEGER' },
        neutral: { type: 'INTEGER' },
        negative: { type: 'INTEGER' },
      },
      required: ['positive', 'neutral', 'negative'],
    },
    keywords: {
      type: 'ARRAY',
      minItems: 8,
      maxItems: 15,
      items: {
        type: 'OBJECT',
        properties: {
          word: { type: 'STRING' },
          score: { type: 'INTEGER', minimum: 1, maximum: 10 },
          context: { type: 'STRING', enum: ['positive', 'negative'] },
        },
        required: ['word', 'score', 'context'],
      },
    },
    summary: { type: 'STRING' },
  },
  required: ['sentiment', 'keywords', 'summary'],
};

function buildPrompt(name, reviews) {
  const body = reviews
    .map((r, i) => `[리뷰 ${i + 1}] 평점: ${r.rating != null ? r.rating : '정보없음'}점 / 내용: ${r.text}`)
    .join('\n');

  return `당신은 한국어 맛집 리뷰 분석가입니다. 아래는 "${name || '이 식당'}"에 대한 구글 리뷰 ${reviews.length}개입니다.

${body}

위 리뷰들을 분석해서 다음 JSON 형식으로만 답하세요.

1. sentiment: 리뷰 ${reviews.length}개 각각을 긍정(positive)/중립(neutral)/부정(negative) 중 하나로 분류하고, 각 항목의 리뷰 개수를 세어 주세요. positive+neutral+negative의 합은 ${reviews.length}와 같아야 합니다.
2. keywords: 리뷰에서 자주 언급되는 핵심 키워드를 8개 이상 15개 이하로 뽑아 주세요. 음식 이름, 맛, 분위기, 서비스 관련 단어를 우선하고 한 단어 또는 짧은 구(2~4글자 내외)로 뽑아 주세요.
   - word: 키워드(한국어)
   - score: 리뷰에서 이 키워드가 얼마나 중요하게/자주 언급되는지 1~10 사이 정수(10이 가장 중요)
   - context: 주로 긍정적 맥락이면 "positive", 부정적 맥락이면 "negative"
3. summary: 리뷰 전체를 종합한 이 식당에 대한 총평을 한 문장으로, 존댓말로, 40자 내외로 요약해 주세요.

반드시 지정된 JSON 스키마 형식으로만 응답하고 그 외 텍스트는 포함하지 마세요.`;
}

function clampInt(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function sanitizeAnalysis(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const s = parsed.sentiment || {};
  const sentiment = {
    positive: clampInt(s.positive, 0, 9999, 0),
    neutral: clampInt(s.neutral, 0, 9999, 0),
    negative: clampInt(s.negative, 0, 9999, 0),
  };

  const rawKeywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
  const keywords = rawKeywords
    .filter((k) => k && typeof k.word === 'string' && k.word.trim())
    .slice(0, MAX_KEYWORDS)
    .map((k) => ({
      word: k.word.trim().slice(0, 20),
      score: clampInt(k.score, 1, 10, 5),
      context: k.context === 'negative' ? 'negative' : 'positive',
    }));

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 200) : '';
  if (!keywords.length || !summary) return null;

  return { sentiment, keywords, summary };
}

async function analyzeReviews(payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      body: JSON.stringify({
        error: 'MISSING_API_KEY',
        message: 'GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.',
      }),
    };
  }

  const rawReviews = payload && Array.isArray(payload.reviews) ? payload.reviews : [];
  const reviews = rawReviews
    .filter((r) => r && typeof r.text === 'string' && r.text.trim())
    .slice(0, MAX_REVIEWS)
    .map((r) => ({
      rating: typeof r.rating === 'number' ? r.rating : null,
      text: r.text.trim().slice(0, MAX_REVIEW_TEXT_LEN),
    }));

  if (!reviews.length) {
    return {
      status: 400,
      body: JSON.stringify({
        error: 'MISSING_QUERY',
        message: '분석할 리뷰(reviews)가 없습니다.',
      }),
    };
  }

  const name = typeof (payload && payload.name) === 'string' ? payload.name : '';

  let geminiRes;
  let data;
  try {
    geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(name, reviews) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
        },
      }),
    });
    data = await geminiRes.json();
  } catch (err) {
    return {
      status: 502,
      body: JSON.stringify({
        error: 'UPSTREAM_ERROR',
        message: 'Gemini API 호출 중 오류가 발생했습니다.',
        detail: String(err && err.message ? err.message : err),
      }),
    };
  }

  if (!geminiRes.ok) {
    return {
      status: 502,
      body: JSON.stringify({
        error: 'UPSTREAM_ERROR',
        message: 'Gemini API가 오류를 반환했습니다.',
        detail: (data && data.error && data.error.message) || '',
      }),
    };
  }

  const candidateText =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  let parsed;
  try {
    parsed = candidateText ? JSON.parse(candidateText) : null;
  } catch (err) {
    parsed = null;
  }

  const result = sanitizeAnalysis(parsed);
  if (!result) {
    return {
      status: 502,
      body: JSON.stringify({
        error: 'UPSTREAM_ERROR',
        message: 'Gemini 응답을 해석하지 못했습니다.',
        detail: candidateText ? String(candidateText).slice(0, 300) : '',
      }),
    };
  }

  return { status: 200, body: JSON.stringify(result) };
}

// POST 본문(JSON)을 파싱한다. Vercel Node.js 런타임이 자동으로 req.body에 파싱해
// 넣어주는 경우를 우선 쓰고, server.js(순수 http.Server)처럼 자동 파싱이 없으면
// 스트림을 직접 읽는다.
function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined) {
      if (typeof req.body === 'string') {
        try {
          resolve(JSON.parse(req.body));
        } catch (err) {
          resolve(null);
        }
      } else {
        resolve(req.body);
      }
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch (err) {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

module.exports = { analyzeReviews, readJsonBody };
