import { readSheet } from '../utils/sheets.js';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { exportVoucher: null, govAnnouncements: null, employees: null, payments: null, refunds: null, freelancers: null };

  // A. Export voucher status
  result.exportVoucher = {
    status: '진행 중',
    steps: [
      { name: '선정', status: 'done' },
      { name: '계획 제출', status: 'done' },
      { name: '진행 중', status: 'active' },
      { name: '정산', status: 'pending' },
    ],
    programs: [
      { name: '해외마케팅', status: 'active', color: '#22C55E' },
      { name: 'IP/인증 획득', status: 'active', color: '#22C55E' },
    ],
  };

  // B. Government announcements (from KV, populated by cron)
  try {
    const cached = await redis.get('gov:announcements');
    const data = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : null;
    result.govAnnouncements = data ? { status: 'connected', ...data } : { status: 'no_data', message: '다음 크론 실행 대기' };
  } catch { result.govAnnouncements = { status: 'error' }; }

  // C-F. Sheets data (kept for background access)
  if (process.env.EMPLOYEE_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.EMPLOYEE_SHEET_ID);
      const data = rows.slice(1);
      const active = data.filter(e => !e[0]?.includes('퇴직'));
      result.employees = { status: 'connected', total: data.length, active: active.length };
    } catch (e) { result.employees = { status: 'error', error: e.message }; }
  }

  if (process.env.PAYMENT_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.PAYMENT_SHEET_ID);
      result.payments = { status: 'connected', totalRows: rows.length - 1 };
    } catch (e) { result.payments = { status: 'error', error: e.message }; }
  }

  if (process.env.REFUND_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.REFUND_SHEET_ID);
      result.refunds = { status: 'connected', totalRows: rows.length - 1 };
    } catch (e) { result.refunds = { status: 'error', error: e.message }; }
  }

  if (process.env.FREELANCER_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.FREELANCER_SHEET_ID);
      result.freelancers = { status: 'connected', totalRows: rows.length - 1 };
    } catch (e) { result.freelancers = { status: 'error', error: e.message }; }
  }

  return res.status(200).json(result);
}
