import { readSheet } from '../utils/sheets.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = { employees: null, payments: null, refunds: null, freelancers: null };

  // A. Employee management
  if (process.env.EMPLOYEE_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.EMPLOYEE_SHEET_ID);
      const headers = rows[0] || [];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 86400000);
      const active = data.filter(e => !e['퇴직일'] && !e['퇴직']);
      const expiring = active.filter(e => {
        const endDate = e['계약종료일'] || e['계��만료일'];
        if (!endDate) return false;
        const d = new Date(endDate);
        return d >= now && d <= in30Days;
      });
      result.employees = {
        status: 'connected',
        total: data.length,
        active: active.length,
        expiringSoon: expiring.map(e => ({ name: e['이름'] || e['성명'], endDate: e['계약종료일'] || e['계약만료일'] })),
      };
    } catch (e) { result.employees = { status: 'error', error: e.message }; }
  } else {
    result.employees = { status: 'disconnected', message: '직원관리 시트 연결 필요' };
  }

  // B. Payment
  if (process.env.PAYMENT_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.PAYMENT_SHEET_ID);
      const headers = rows[0] || [];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthlyData = data.filter(r => (r['지급일'] || r['결제일'] || '').startsWith(thisMonth));
      const pending = data.filter(r => r['상태'] === '미지급' || r['지급여부'] === 'N');
      result.payments = { status: 'connected', totalRows: data.length, thisMonth: monthlyData.length, pending: pending.length };
    } catch (e) { result.payments = { status: 'error', error: e.message }; }
  } else {
    result.payments = { status: 'disconnected', message: '대금결제 시트 연결 필요' };
  }

  // C. Refunds
  if (process.env.REFUND_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.REFUND_SHEET_ID);
      const headers = rows[0] || [];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthly = data.filter(r => (r['환불일'] || r['날짜'] || '').startsWith(thisMonth));
      const totalAmount = monthly.reduce((s, r) => s + (Number((r['환불금액'] || r['금액'] || '0').replace(/[^0-9.-]/g, '')) || 0), 0);
      result.refunds = { status: 'connected', thisMonth: { count: monthly.length, amount: totalAmount } };
    } catch (e) { result.refunds = { status: 'error', error: e.message }; }
  } else {
    result.refunds = { status: 'disconnected', message: '환불현황 시트 연�� 필요' };
  }

  // D. Freelancers
  if (process.env.FREELANCER_SHEET_ID) {
    try {
      const rows = await readSheet(process.env.FREELANCER_SHEET_ID);
      const headers = rows[0] || [];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      });
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthly = data.filter(r => (r['지급일'] || r['날짜'] || '').startsWith(thisMonth));
      const totalAmount = monthly.reduce((s, r) => s + (Number((r['지급액'] || r['금액'] || '0').replace(/[^0-9.-]/g, '')) || 0), 0);
      result.freelancers = { status: 'connected', thisMonth: { count: monthly.length, amount: totalAmount } };
    } catch (e) { result.freelancers = { status: 'error', error: e.message }; }
  } else {
    result.freelancers = { status: 'disconnected', message: '프리랜서 지급 시트 연결 필요' };
  }

  return res.status(200).json(result);
}
