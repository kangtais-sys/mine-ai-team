// 브라우저용 Supabase 클라이언트 — Storage 직접 업로드 전용
// 서버 라우트는 lib/supabase.js (process.env) 사용. 여기는 Vite 환경변수.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('[supabaseClient] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 누락');
}

export const supabaseBrowser = createClient(url, anonKey, {
  auth: { persistSession: false },
});
