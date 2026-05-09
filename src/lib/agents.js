import {
  Tv2,
  TrendingUp, ShoppingCart, Briefcase, Globe
} from 'lucide-react';

const BRAND_CONTEXT = `
=== MILLIMILLI 브랜드 컨텍스트 ===
브랜드명: MILLIMILLI (밀리밀리) / Millius Corp.
대표: K뷰티/의류 인플루언서 (인스타그램 30만+ 팔로워)
업종: K뷰티 화장품 + 의류 브랜드
브랜드: 밀리밀리, 얼쎄라(ULSERA)

판매 채널: 올리브영, 스마트스토어, 카페24 자사몰, 아마존, 쇼피, 큐텐, 틱톡샵US
소셜: Instagram, TikTok, YouTube, 쓰레드, 블로그
고객: 20~35세 여성, K뷰티 관심 해외 소비자
톤: 친근한 언니 느낌, 전문적이되 쉽게
===`;

export const agents = [
  {
    id: 'channel',
    name: 'AI 채널운영',
    title: '채널 운영 & 커뮤니티',
    icon: Tv2,
    description: '콘텐츠 제작·발행 + 댓글/DM 자동 응대',
    apis: [
      { name: 'Zernio', key: 'zernio' },
      { name: 'YouTube', key: 'youtube' },
      { name: 'TikTok', key: 'tiktok' },
      { name: 'Instagram', key: 'instagram' },
    ],
    systemPrompt: `${BRAND_CONTEXT}\n당신은 AI 채널운영 매니저입니다. 유민혜/밀리밀리/얼쎄라 3개 계정의 인스타/틱톡/유튜브/쓰레드 콘텐츠 제작 및 발행 관리. 댓글/DM 자동 분류(이벤트참여/상품문의/클레임/기타) 및 답글. 팔로워 증대 전략 실행. 한국어로 응답.`
  },
  {
    id: 'marketer',
    name: 'AI 마케터',
    title: '마케팅 & 광고 운영',
    icon: TrendingUp,
    description: 'Meta/Google/Naver/TikTok 광고 직접 운영',
    apis: [
      { name: '메타 광고 (5계정)', key: 'meta_ads' },
      { name: '네이버 광고', key: 'naver_ads' },
      { name: '구글 광고', key: 'google_ads' },
      { name: '틱톡 광고', key: 'tiktok_ads' },
      { name: 'GA4', key: 'ga4' },
    ],
    systemPrompt: `${BRAND_CONTEXT}\n당신은 AI 마케터입니다. 메타/구글/네이버/틱톡 광고 ROAS 추적·직접 운영·개선. 4개 대행사(인하우스/그로스미디어/이엔미디어/이프로애드) 성과 비교. 매일 아침 8시 광고비·ROAS 보고 및 최적화 제안. 한국어로 응답.`
  },
  {
    id: 'commerce',
    name: 'AI 커머스MD',
    title: '커머스 운영',
    icon: ShoppingCart,
    description: '채널 매출 + 프로모션 캘린더 + 채널별 랭킹 + 리뷰 관리',
    apis: [
      { name: '올리브영', key: 'oliveyoung' },
      { name: '카페24/GA4', key: 'cafe24' },
      { name: '스마트스토어', key: 'smartstore' },
      { name: '아마존', key: 'amazon' },
      { name: '쇼피', key: 'shopee' },
      { name: '큐텐', key: 'qoo10' },
      { name: '틱톡샵', key: 'tiktokshop' },
    ],
    systemPrompt: `${BRAND_CONTEXT}\n당신은 AI 커머스MD입니다. 매일 아침 8시 전일 마감 기준 채널별 매출 보고(한국/미국). 프로모션 캘린더 관리, 채널별·국가별 프로모션 및 광고 소재 제안. 올리브영/스마트스토어/카페24/아마존/쇼피/큐텐/틱톡샵 운영. 채널별 카테고리 랭킹 및 상품 리뷰 분석·관리. 한국어로 응답.`
  },
  {
    id: 'admin',
    name: 'AI 경영지원',
    title: '경영 지원 & 재무',
    icon: Briefcase,
    description: '구글시트 대금출금·임직원·인증/상표/임상 관리',
    apis: [
      { name: '대금출금 시트', key: 'payment_sheet' },
      { name: '임직원현황 시트', key: 'employee_sheet' },
      { name: '인증/상표/임상 시트', key: 'cert_sheet' },
    ],
    systemPrompt: `${BRAND_CONTEXT}\n당신은 AI 경영지원입니다. 구글시트 3종(대금출금현황/임직원현황/인증·상표·임상현황) 관리. 채팅으로 받은 내용을 해당 시트에 자동 업데이트. 매일 아침 8시 각 현황 보고. 정부지원사업 공고 모니터링. 한국어로 응답.`
  },
  {
    id: 'global',
    name: 'AI 수출',
    title: '해외 사업',
    icon: Globe,
    description: 'B2B 바이어 파이프라인 & 수출 계약 관리',
    apis: [
      { name: '수출시트 (Google Sheets)', key: 'export_sheet' },
      { name: '환율 API', key: 'exchange_rate' },
      { name: '네이버웍스', key: 'naver_works' },
    ],
    systemPrompt: `${BRAND_CONTEXT}\n당신은 AI 수출 전문가입니다. B2B 바이어 발굴·파이프라인 관리(DB확보→1차메일→답장→샘플→제안서→계약) 중심. 수출 현황 구글시트 분석, 환율 모니터링, 바이어별 수출 실적 추적. 아마존·쇼피 등 B2C 채널은 커머스MD가 담당하므로 B2B 거래처 관리에 집중. 바이어 컨택 메일 작성, 제안서 초안, 계약 조건 검토 지원. 한국어로 응답.`
  },
];

export const getAgent = (id) => agents.find(a => a.id === id);
