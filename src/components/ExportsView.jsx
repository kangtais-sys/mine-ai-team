import { useState, useEffect } from 'react';
import { Globe, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';

const CARD = { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, padding: '18px 20px' };
const fmtKRW = (v) => v > 0 ? `${v.toLocaleString('ko-KR')}원` : '-';
const fmtUSD = (v) => v > 0 ? `$${v.toLocaleString('ko-KR')}` : '-';

const COUNTRIES = [
  { flag: '🇺🇸', name: '미국', channels: ['Amazon US', 'TikTok Shop US'], key: 'us' },
  { flag: '🇸🇬', name: '싱가포르', channels: ['Shopee SG', 'Qoo10 SG'], key: 'sg' },
  { flag: '🇲🇾', name: '말레이시아', channels: ['Shopee MY'], key: 'my' },
  { flag: '🇹🇭', name: '태국', channels: ['Shopee TH'], key: 'th' },
  { flag: '🇵🇭', name: '필리핀', channels: ['Shopee PH'], key: 'ph' },
  { flag: '🇮🇩', name: '인도네시아', channels: ['Shopee ID'], key: 'id' },
  { flag: '🇻🇳', name: '베트남', channels: ['Shopee VN'], key: 'vn' },
  { flag: '🇯🇵', name: '일본', channels: ['Qoo10 JP'], key: 'jp' },
];

const EXPORT_CHANNELS = [
  { name: 'Amazon US', region: '미국', status: 'pending', note: 'Amazon Selling Partner API 연결 필요' },
  { name: 'TikTok Shop US', region: '미국', status: 'pending', note: 'TikTok API 심사 대기 중' },
  { name: 'Shopee', region: '동남아 6개국', status: 'pending', note: 'Shopee Open Platform API 연결 필요' },
  { name: 'Qoo10 JP/SG', region: '일본·싱가포르', status: 'pending', note: 'Qoo10 API 연결 필요' },
];

function nowKST() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

export default function ExportsView() {
  const [exportData, setExportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/exports')
      .then(r => r.json())
      .then(d => { setExportData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const countryData = exportData?.byCountry || {};
  const monthlyData = exportData?.monthly || [];
  const totalYTD = exportData?.totalYTD || 0;
  const totalMonth = exportData?.totalMonth || 0;

  return (
    <>
      {/* Header */}
      <div style={{ height: 50, padding: '0 24px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #E5E5EA', background: '#FFFFFF', flexShrink: 0, gap: 10 }}>
        <Globe size={15} strokeWidth={1.8} color="#5E6AD2" />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F' }}>수출 현황</span>
        <span style={{ fontSize: 11, color: '#AEAEB2' }}>· {nowKST()} 기준</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 32px' }}>

        {/* 수출 요약 — 전일/당월/연간 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>수출 매출 요약</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: '전일 마감', value: exportData?.yesterday || 0, sub: '전체 수출 합산', usd: true },
              { label: '당월 누적', value: totalMonth, sub: `${new Date(Date.now() + 9*3600000).getUTCMonth() + 1}월 합산`, usd: true },
              { label: '2026년 YTD', value: totalYTD, sub: '연간 누적', usd: true },
            ].map((k, i) => (
              <div key={i} style={{ ...CARD }}>
                <div style={{ fontSize: 10.5, color: '#AEAEB2', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: totalYTD > 0 ? '#1D1D1F' : '#AEAEB2', letterSpacing: '-0.03em' }}>
                  {totalYTD > 0 ? fmtUSD(k.value) : '-'}
                </div>
                <div style={{ fontSize: 10.5, color: '#AEAEB2', marginTop: 4 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 국가별 매출 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>국가별 매출</div>
          <div style={CARD}>
            {totalYTD === 0 ? (
              <div style={{ padding: '20px 0' }}>
                <div style={{ fontSize: 12.5, color: '#AEAEB2', marginBottom: 16 }}>수출 채널 API 연결 후 국가별 매출이 자동 집계됩니다.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {COUNTRIES.map((c) => (
                    <div key={c.key} style={{ background: '#F5F5F7', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 20, marginBottom: 6 }}>{c.flag}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', marginBottom: 3 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: '#AEAEB2', marginBottom: 6 }}>{c.channels.join(' · ')}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#AEAEB2' }}>연결 대기 중</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                {/* Header row */}
                <div style={{ display: 'flex', gap: 8, padding: '0 0 8px', borderBottom: '1px solid #F2F2F5', marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, color: '#AEAEB2', width: 100 }}>국가</span>
                  <span style={{ fontSize: 10.5, color: '#AEAEB2', flex: 1 }}>채널</span>
                  <span style={{ fontSize: 10.5, color: '#AEAEB2', width: 90, textAlign: 'right' }}>당월</span>
                  <span style={{ fontSize: 10.5, color: '#AEAEB2', width: 90, textAlign: 'right' }}>연간YTD</span>
                  <span style={{ fontSize: 10.5, color: '#AEAEB2', width: 60, textAlign: 'right' }}>비중</span>
                </div>
                {COUNTRIES.map((c) => {
                  const d = countryData[c.key] || {};
                  return (
                    <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #F5F5F7' }}>
                      <div style={{ width: 100 }}>
                        <span style={{ marginRight: 6 }}>{c.flag}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>{c.name}</span>
                      </div>
                      <span style={{ fontSize: 11, color: '#6E6E73', flex: 1 }}>{c.channels.join(', ')}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F', width: 90, textAlign: 'right' }}>{fmtUSD(d.month || 0)}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5E6AD2', width: 90, textAlign: 'right' }}>{fmtUSD(d.ytd || 0)}</span>
                      <span style={{ fontSize: 11, color: '#AEAEB2', width: 60, textAlign: 'right' }}>
                        {totalYTD > 0 ? `${((d.ytd || 0) / totalYTD * 100).toFixed(1)}%` : '-'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 채널 연결 현황 */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>수출 채널 연결 현황</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {EXPORT_CHANNELS.map((ch, i) => (
              <div key={i} style={{ ...CARD, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: ch.status === 'connected' ? '#34C759' : '#D1D1D6', marginTop: 4, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F' }}>{ch.name}</span>
                    <span style={{ fontSize: 10.5, background: '#F5F5F7', color: '#6E6E73', padding: '2px 7px', borderRadius: 4 }}>{ch.region}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#AEAEB2' }}>{ch.note}</div>
                </div>
                <span style={{ fontSize: 11, color: '#AEAEB2', flexShrink: 0 }}>
                  {ch.status === 'connected' ? '연결됨' : '미연결'}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
