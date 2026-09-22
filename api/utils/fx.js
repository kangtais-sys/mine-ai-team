// 환율 — 시장별 광고비를 한 통화로 합칠 때만 쓴다.
// 배경: 밀리밀리_US 는 **미국 계정인데 청구 통화가 KRW**(2026-09-22 실측). 아마존 매출은 USD.
//       변환 없이 더하면 숫자가 1,400배 틀어진다.
// 원칙: 소재끼리 비교할 땐 변환하지 말 것(같은 통화끼리 비교가 정확). 변환값은 합산·교차시장 비교 전용.

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'fx:usd';
const FALLBACK_USD_KRW = Number(process.env.USD_KRW) || 1400;

/**
 * USD 기준 환율표. { rates:{KRW,JPY,...}, source, at }
 * 실패해도 절대 throw 하지 않음 — 환율 때문에 광고 리포트 전체가 죽으면 안 됨.
 * source:'fallback' 이면 추정치라는 뜻이니 화면에 그렇게 표시할 것.
 */
export async function getUsdRates() {
  try {
    const cached = await redis.get(KEY);
    if (cached) return cached;
  } catch { /* 캐시 실패는 무시하고 원본 조회 */ }

  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    if (d?.result === 'success' && d.rates?.KRW) {
      const out = { rates: d.rates, source: 'open.er-api.com', at: new Date().toISOString() };
      try { await redis.set(KEY, out, { ex: 43200 }); } catch { /* 캐시 실패 무시 */ }
      return out;
    }
  } catch { /* 네트워크 실패 → 폴백 */ }

  return { rates: { USD: 1, KRW: FALLBACK_USD_KRW }, source: 'fallback', at: new Date().toISOString() };
}

/** 임의 통화 금액 → USD. 환율을 모르면 null(0 으로 뭉개지 말 것 — 없는 값과 0은 다름). */
export function toUsd(amount, currency, rates) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const cur = String(currency || 'USD').toUpperCase();
  if (cur === 'USD') return Number(n.toFixed(2));
  const rate = rates?.[cur];
  if (!rate) return null;
  return Number((n / rate).toFixed(2));
}
