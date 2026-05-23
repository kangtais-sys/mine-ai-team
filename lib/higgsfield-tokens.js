// Higgsfield 토큰 단일 저장소 — Supabase(higgsfield_tokens) 기반
//
// 설계:
//   • 단일 행(id='default')에 access_token / refresh_token / expires_at 보관
//   • service_role 키로만 접근 (RLS bypass) → 다른 client 는 정책 부재로 자동 거부
//   • rotation 된 새 refresh_token 을 절대 잃지 않도록 write 실패 시 throw
//     (기존 Redis 패턴의 `.catch(() => {})` silent-fail 이 근본 원인이었음)
//   • env(HIGGSFIELD_REFRESH_TOKEN, HIGGSFIELD_CLI_TOKEN) 는 Supabase 비어있을 때
//     bootstrap 용으로만 사용. /refresh 성공 후엔 Supabase 가 source of truth.
//
// 사용처: persona-image.js / persona-soul.js / higgsfield-characters.js
// 셋 다 동일한 토큰 행을 공유 (다중 호출 중 rotation 시에도 일관)

import { getSupabaseService } from './supabase.js';

const TABLE = 'higgsfield_tokens';
const ROW_ID = 'default';
const REFRESH_ENDPOINT = 'https://fnf-device-auth.higgsfield.ai/refresh';

// access_token TTL 은 Higgsfield 응답상 3600s. 만료 5분 전부터 갱신 트리거.
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;
// /refresh 응답에 expires_in 없으면 가정값
const DEFAULT_ACCESS_TTL_SEC = 3600;

let cachedSupabase = null;
function sb() {
  if (!cachedSupabase) cachedSupabase = getSupabaseService();
  return cachedSupabase;
}

/** 현재 저장된 토큰 행 읽기. 없으면 null. */
async function readRow() {
  const { data, error } = await sb()
    .from(TABLE)
    .select('access_token, refresh_token, expires_at, updated_at')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) throw new Error(`higgsfield_tokens read 실패: ${error.message}`);
  return data || null;
}

/** 토큰 행 upsert. 실패 시 throw (silent-fail 금지). */
async function writeRow({ access_token, refresh_token, expires_at }) {
  const { error } = await sb()
    .from(TABLE)
    .upsert(
      {
        id: ROW_ID,
        access_token,
        refresh_token,
        expires_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  if (error) throw new Error(`higgsfield_tokens write 실패: ${error.message}`);
}

function isAccessTokenValid(row) {
  if (!row?.access_token || !row?.expires_at) return false;
  const expiresAtMs = new Date(row.expires_at).getTime();
  if (Number.isNaN(expiresAtMs)) return false;
  return Date.now() + REFRESH_LEEWAY_MS < expiresAtMs;
}

// ⚠️ Race 방지: refresh_token 은 rotation 이라 동시에 여러 /refresh 가 돌면
// 첫 응답 외엔 invalid 화 → cascade 401. module-level in-flight promise 공유로
// 같은 lambda 인스턴스 내 동시 호출은 단 1회 /refresh 로 수렴.
// (cross-instance race 는 callRefresh 안의 double-check 로 완화.)
let inFlightRefresh = null;

/** /refresh 1회 호출 → Supabase 동기화. refresh_token rotation 자동 처리.
 *  동시 호출은 진행 중인 promise 를 공유 (mutex). */
async function callRefresh(refreshToken, ctx = 'unknown') {
  // 1) 이미 다른 호출이 /refresh 중이면 그 결과를 공유
  if (inFlightRefresh) {
    console.log(`[higgsfield-tokens] /refresh 진행 중 → 공유 (caller=${ctx})`);
    return await inFlightRefresh;
  }

  // 2) 진행 promise 생성. finally 에서 항상 null 복원 (다음 갱신 가능하게).
  inFlightRefresh = (async () => {
    // 2-a) Double-check: 다른 lambda 인스턴스가 막 갱신했을 수도 있으니
    //      /refresh 보내기 직전에 Supabase 한 번 더 읽어서 유효한 토큰이 있으면 재사용.
    //      (in-process mutex 가 동일 인스턴스 race 는 막지만 cross-instance 는 완화 수준)
    const fresh = await readRow();
    if (isAccessTokenValid(fresh)) {
      console.log(`[higgsfield-tokens] 다른 호출이 이미 갱신함 → 재사용 (caller=${ctx})`);
      return fresh.access_token;
    }
    // double-check 시 더 새로운 refresh_token 있으면 그걸로 시도
    const tokenToUse = fresh?.refresh_token || refreshToken;

    console.log(`[higgsfield-tokens] /refresh 호출 (caller=${ctx})`);
    const res = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokenToUse }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(
        `토큰 갱신 실패 (${res.status}) [caller=${ctx}]: ${rawText.substring(0, 200)}`
      );
    }
    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`/refresh 비JSON 응답: ${rawText.substring(0, 200)}`);
    }
    const newAccess = data?.access_token;
    if (!newAccess) {
      throw new Error(`갱신 응답에 access_token 없음. keys=${Object.keys(data || {}).join(',')}`);
    }
    const newRefresh =
      data?.refresh_token || data?.refreshToken || data?.refresh || tokenToUse;
    const ttlSec = Number(data?.expires_in) || DEFAULT_ACCESS_TTL_SEC;
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

    // ⚠️ rotation 된 새 토큰을 잃으면 cascade → write 실패는 throw (절대 silent fail X)
    await writeRow({
      access_token: newAccess,
      refresh_token: newRefresh,
      expires_at: expiresAt,
    });

    if (newRefresh !== tokenToUse) {
      console.log(`[higgsfield-tokens] refresh_token rotation → Supabase 동기화 (caller=${ctx})`);
    }
    return newAccess;
  })();

  try {
    return await inFlightRefresh;
  } finally {
    // 성공/실패 모두 in-flight 슬롯 비워 다음 갱신 가능하게.
    inFlightRefresh = null;
  }
}

/** 유효한 access_token 반환.
 *  순서: Supabase 행 유효 → 즉시 반환
 *      Supabase 행 만료 임박 → refresh_token 으로 갱신
 *      Supabase 행 없음(첫 부팅) → env HIGGSFIELD_REFRESH_TOKEN bootstrap → 갱신
 */
export async function getValidToken(ctx = 'unknown') {
  const row = await readRow();
  if (isAccessTokenValid(row)) {
    return row.access_token;
  }

  // 갱신 경로 결정
  let refreshToken = row?.refresh_token;
  if (!refreshToken) {
    refreshToken = (process.env.HIGGSFIELD_REFRESH_TOKEN || '').trim();
    if (!refreshToken) {
      throw new Error(
        'Supabase higgsfield_tokens 비어있고 env HIGGSFIELD_REFRESH_TOKEN 도 없음 — bootstrap 필요'
      );
    }
    console.log('[higgsfield-tokens] Supabase 행 없음 → env bootstrap');
  }

  return await callRefresh(refreshToken, ctx);
}

/** 명시적으로 토큰 갱신 강제 (401 수신 후 사용). */
export async function refreshAccessToken(ctx = 'unknown') {
  const row = await readRow();
  let refreshToken = row?.refresh_token;
  if (!refreshToken) {
    refreshToken = (process.env.HIGGSFIELD_REFRESH_TOKEN || '').trim();
    if (!refreshToken) {
      throw new Error('refresh_token 없음 (Supabase + env 둘 다 비어있음)');
    }
  }
  return await callRefresh(refreshToken, ctx);
}

/** fnf API 공통 fetch — 401 자동 갱신 + 재시도 + (선택) timeout.
 *  options: 표준 fetch options
 *  ctx: 로그용 caller 식별자 ('persona-image' | 'persona-soul' | 'hf-characters')
 *  timeoutMs: 0 또는 falsy 면 timeout 없음
 */
export async function fnfFetch(url, options = {}, ctx = 'unknown', timeoutMs = 0) {
  const tok = await getValidToken(ctx);
  const headers = {
    Authorization: `Bearer ${tok}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const doFetch = async (bearer) => {
    if (!timeoutMs) {
      return fetch(url, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${bearer}` },
      });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${bearer}` },
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error(`fnfFetch timeout ${timeoutMs}ms: ${url}`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };

  const res = await doFetch(tok);
  if (res.status !== 401) return res;

  console.log(`[higgsfield-tokens] 401 수신 → 갱신 후 재시도 (caller=${ctx})`);
  const newTok = await refreshAccessToken(ctx);
  return await doFetch(newTok);
}
