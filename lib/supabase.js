import { createClient } from '@supabase/supabase-js';

/** anon key 기반 클라이언트 — RLS 정책 적용됨 */
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY 미설정');
  return createClient(url, key);
}

/** service_role key 기반 클라이언트 — RLS bypass.
 *  서버 코드(API/cron)에서만 사용. 절대 클라이언트로 노출 금지.
 *  현재 사용처: higgsfield_tokens (싱글-행 토큰 저장소). */
export function getSupabaseService() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
