#!/usr/bin/env node
/**
 * 올리브영 미스트/오일 카테고리 랭킹 수집 → Upstash Redis 푸시
 *
 * 올리브영은 Imperva 봇 차단으로 일반 fetch 가 403 → 실제 브라우저(Playwright) 필요.
 * 그래서 Vercel 크론이 아니라 "내 맥"에서 주기적으로 실행한다. (launchd/cron)
 *
 * 사전 준비 (최초 1회):
 *   npm i -D playwright dotenv
 *   npx playwright install chromium
 *
 * 실행:
 *   node scripts/oliveyoung-rank.mjs
 *   (또는 npm run rank:oliveyoung)
 *
 * .env.local 의 KV_REST_API_URL / KV_REST_API_TOKEN 을 사용.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chromium } from 'playwright';
import { Redis } from '@upstash/redis';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') }); // .env.local 우선

const GOODS_NO = process.env.OLIVEYOUNG_MIST_GOODSNO || 'A000000255334';
const CATEGORY = '미스트/오일';
const FLT_CAT = '100000100010010'; // 스킨케어 > 미스트/오일
const RANK_URL = `https://www.oliveyoung.co.kr/store/main/getBestList.do?dispCatNo=900000100100001&fltDispCatNo=${FLT_CAT}&pageIdx=1&rowsPerPage=100`;
const PRODUCT_URL = `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${GOODS_NO}`;

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function extractFromPage(page, goodsNo) {
  return page.evaluate((gn) => {
    const items = [];
    document.querySelectorAll('.thumb_flag.best').forEach((badge) => {
      // 같은 카드 안에서 goodsNo 찾기 (최대 6단계 위로)
      let card = badge;
      let code = null;
      for (let i = 0; i < 6 && card; i++) {
        const m = (card.outerHTML || '').match(/[A-Z]\d{12}/);
        if (m) { code = m[0]; break; }
        card = card.parentElement;
      }
      if (!card || !code) return;
      const rank = parseInt((badge.innerText || '').replace(/[^0-9]/g, ''), 10);
      const brand = (card.querySelector('.tx_brand')?.innerText || '').trim();
      const name = (card.querySelector('.tx_name')?.innerText || '').trim();
      items.push({ rank, goodsNo: code, brand, name });
    });
    const seen = new Set();
    const list = items.filter((x) => x.goodsNo && !seen.has(x.goodsNo) && seen.add(x.goodsNo))
      .sort((a, b) => a.rank - b.rank);
    const ours = list.find((x) => x.goodsNo === gn) || null;
    return { count: list.length, ours, top3: list.slice(0, 3) };
  }, goodsNo);
}

// Imperva 봇 차단/챌린지는 간헐적 → 최대 3회 재시도, 챌린지 감지 시 대기 후 reload
async function scrapeRank() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: 'ko-KR',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9' },
  });
  const page = await ctx.newPage();
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(RANK_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        // 상품 카드 or Imperva 인터스티셜 중 먼저 나오는 것 대기
        await page.waitForSelector('.thumb_flag.best', { timeout: 15000 }).catch(() => {});

        // Imperva "잠시만 기다려 주세요" 챌린지 감지 → JS 챌린지 자동해결 대기 후 reload
        const title = await page.title().catch(() => '');
        const blocked = /잠시만|Pardon|Request unsuccessful|robot/i.test(title);
        if (blocked) {
          console.warn(`   [재시도 ${attempt}] Imperva 챌린지 감지 ("${title}") — 6초 대기 후 reload`);
          await sleep(6000);
          await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
          await page.waitForSelector('.thumb_flag.best', { timeout: 15000 }).catch(() => {});
        }

        const data = await extractFromPage(page, GOODS_NO);
        if (data.count > 0) return data;

        console.warn(`   [재시도 ${attempt}] 상품 0개 — ${3 - attempt > 0 ? '재시도' : '중단'}`);
        await sleep(4000 * attempt); // 백오프
      } catch (e) {
        console.warn(`   [재시도 ${attempt}] 오류: ${e.message}`);
        await sleep(4000 * attempt);
      }
    }
    return { count: 0, ours: null, top3: [] };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)) {
    console.error('❌ Redis 환경변수(KV_REST_API_URL/TOKEN) 없음 — .env.local 확인');
    process.exit(1);
  }

  console.log(`[올영랭킹] 수집 시작 → ${RANK_URL}`);
  let data;
  try {
    data = await scrapeRank();
  } catch (e) {
    console.error('❌ 스크래핑 실패:', e.message);
    process.exit(1);
  }

  if (!data?.ours) {
    console.error(`❌ 우리 제품(${GOODS_NO})을 미스트 랭킹 100위 안에서 못 찾음. (count=${data?.count ?? 0})`);
    // 랭킹 밖이면 100+ 로 기록하지 않고 종료 (기존 값 유지)
    process.exit(2);
  }

  const rank = data.ours.rank;
  const name = data.ours.name || '밀리밀리 500달톤 프로틴 콜라겐 미스트 55ml';

  // 전일 대비 변동
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
  let prevRank = null;
  try {
    const last = await redis.get('ranking:oliveyoung:lastsnap');
    if (last && last.date !== today) prevRank = last.rank;
  } catch { /* noop */ }

  const result = {
    platform: '올리브영',
    flag: '🇰🇷',
    category: CATEGORY,
    name,
    rank,
    prevRank,
    change: prevRank != null ? prevRank - rank : 0,
    ours: true,
    url: PRODUCT_URL,
    source: 'local-scrape',
    updatedAt: new Date().toISOString(),
  };

  await redis.set('ranking:oliveyoung', result, { ex: 172800 }); // 48h
  await redis.set(`ranking:oliveyoung:${today}`, rank, { ex: 60 * 60 * 24 * 40 });
  await redis.set('ranking:oliveyoung:lastsnap', { date: today, rank }, { ex: 60 * 60 * 24 * 40 });

  const arrow = result.change > 0 ? `▲${result.change}` : result.change < 0 ? `▼${-result.change}` : '—';
  console.log(`✅ 올리브영 미스트 ${rank}위 (전일 ${prevRank ?? '-'} ${arrow}) — ${name}`);
  console.log(`   Top3: ${data.top3.map((t) => `${t.rank}.${t.brand}`).join(' / ')}`);
  console.log('   Redis 푸시 완료 (ranking:oliveyoung)');
  process.exit(0);
}

main();
