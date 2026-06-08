// §3 — Vercel Blob 클라이언트 직업로드 토큰 라우트
// 브라우저가 영상/이미지를 serverless 본문 한도(~4.5MB) 없이 Blob에 직접 업로드하도록
// 클라이언트 업로드 토큰을 발급한다. 파일은 우리 서버를 거치지 않고 Blob로 직행.
//
// 인증: 이 경로는 대시보드 비번 미들웨어 보호 하에 있음. 보드(인증된 브라우저)가 호출 →
//   미들웨어 통과. onUploadCompleted(서버-서버 콜백)은 미들웨어에 막히므로 사용하지 않음
//   (클라이언트 upload() 결과로 URL 을 직접 받아 저장).
import { handleUpload } from '@vercel/blob/client';

export const config = { maxDuration: 30 };

const ALLOWED = ['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 200 * 1024 * 1024; // 200MB

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED,
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: true,
      }),
      // onUploadCompleted 미사용 — 비번 미들웨어가 외부 콜백을 차단하므로.
    });
    return res.status(200).json(jsonResponse);
  } catch (e) {
    console.error('[blob-upload]', e.message);
    return res.status(400).json({ error: e.message });
  }
}
