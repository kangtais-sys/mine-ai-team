// 캡컷 작업 패키지 — 블루프린트를 담당자가 캡컷에서 바로 쓸 수 있는 형태로 바꾼다.
//
// POST /api/content/capcut-pack   { slot }   → { filename, srt, sheet, checklist, timeline }
//
// 왜 필요한가: 영상 편집은 캡컷 수작업으로 간다(MINE 확정 2026-09-22).
//   그러면 병목은 "무엇을 만들지"가 아니라 **자막을 손으로 치는 시간**이다.
//   캡컷은 SRT 가져오기를 공식 지원하므로, 컷마다 1개인 자막을 SRT 로 미리 만들어 주면
//   가장 오래 걸리는 단계가 통째로 사라진다. 담당자는 컷만 붙이면 된다.
//
// LLM 0콜. 블루프린트(이미 생성된 cuts)를 계산으로 변환할 뿐이다.
//
// 골격 근거: docs/ad-creative-system.md §8 — CapCut 프로젝트 28건 실측.
//   1080x1920 · 12~17초 · 8컷 · 컷당 1.9초 · 전환 없음(하드컷) · SFX 0 · BGM 있음 · 자막 컷마다 1개.

export const config = { maxDuration: 30 };

const STRUCTURE = {
  A: '하단 B&A 삽입 — 상단 실인물 / 하단 1/3 비포&애프터',
  B: '전면 좌우 분할 — 좌 칙칙 / 우 글래스스킨',
  C: 'PIP 삽입 — 큰 얼굴 위 작은 창으로 다른 컷',
  D: '구조 없음 — 셀피 + 텍스트 (리스티클 등 예외)',
};

const srtTime = (sec) => {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};

// 컷 리스트 → 누적 타임라인. sec 가 비면 1.9초(실측 중앙값)로 채운다.
export function timelineOf(cuts = []) {
  let t = 0;
  return cuts.map((c, i) => {
    const dur = Number(c.sec) > 0 ? Number(c.sec) : 1.9;
    const row = { n: c.n || i + 1, start: t, end: t + dur, sec: dur, shot: c.shot || '', sub: c.sub || '' };
    t += dur;
    return row;
  });
}

export function buildSrt(timeline) {
  return timeline
    .filter(r => r.sub.trim())
    .map((r, i) => `${i + 1}\n${srtTime(r.start)} --> ${srtTime(r.end)}\n${r.sub.trim()}`)
    .join('\n\n') + '\n';
}

function buildSheet({ slot, bp, timeline, total }) {
  const st = String(bp.structure || '').trim()[0];
  const L = [];
  L.push(`■ ${slot.assetCode}`);
  L.push(`  캡컷 프로젝트명 · 내보내기 파일명 · Meta 광고 이름 — 전부 이 값 그대로.`);
  L.push(`  (이름이 바뀌면 성과가 자동으로 안 붙는다)`);
  L.push('');
  L.push(`유형    ${slot.title}`);
  L.push(`캔버스  1080×1920 · ${total.toFixed(1)}초 · ${timeline.length}컷 · 전환 없음(하드컷)`);
  L.push(`구조    ${st ? `${st} — ${STRUCTURE[st]}` : '미지정'}`);
  L.push(`BGM     ${bp.bgm || '미지정'}  ⚠️ 원곡 금지. 생성음·로열티프리만.`);
  L.push(`        트렌딩 사운드는 굽지 말고 발행할 때 틱톡/IG 앱에서 입힌다.`);
  L.push(`SFX     없음 (실측 28건 중 0건)`);
  L.push(`페르소나 ${slot.personaLabel || '—'}`);
  L.push('');
  L.push(`훅(첫 자막)  KR ${bp.hookKr || '—'}`);
  L.push(`             US ${bp.hookUs || '—'}`);
  L.push(`궁금증       ${bp.curiosity || '—'}`);
  L.push(`대세감       ${bp.momentum || '—'}`);
  L.push('');
  L.push('── 컷 시트 ──────────────────────────────────');
  for (const r of timeline) {
    L.push(`컷${String(r.n).padStart(2)} ${r.start.toFixed(1)}–${r.end.toFixed(1)}s (${r.sec.toFixed(1)}s)`);
    L.push(`      화면  ${r.shot}`);
    L.push(`      자막  ${r.sub}`);
  }
  L.push('');
  L.push('── 캡션(업로드용 — 화면 자막과 다르다) ──────');
  L.push(`  ${bp.claim || '—'}`);
  if (bp.comment) L.push(`  댓글: ${bp.comment}`);
  if (bp.save) L.push(`  저장: ${bp.save}`);
  if (bp.share) L.push(`  공유: ${bp.share}`);
  L.push('');
  L.push('── footage 생성 프롬프트 (Higgsfield) ───────');
  L.push(`  ${bp.visualPrompt || '—'}`);
  return L.join('\n');
}

// 코드가 검사할 수 있는 것만 체크리스트에 넣는다. 나머지는 담당자 눈으로.
function buildChecklist({ slot, bp, timeline, total }) {
  const has = (v) => !!(v && String(v).trim());
  const capLabel = timeline.some(r => /라벨|label|bottle close|제품\s*클로즈/i.test(r.shot));
  return [
    { ok: total >= 6.8 && total <= 19.5, text: `총 ${total.toFixed(1)}초 — 실측 범위 6.8~19.5초` },
    { ok: timeline.length >= 6, text: `${timeline.length}컷 — 기준 8컷` },
    { ok: timeline.every(r => has(r.sub)), text: '컷마다 자막 1개' },
    { ok: ['A', 'B', 'C', 'D'].includes(String(bp.structure || '').trim()[0]), text: '시각 구조 지정됨' },
    { ok: !capLabel, text: '모션 컷에 제품 라벨 클로즈업 없음 (AI 가 글자를 뭉갠다)' },
    { ok: has(bp.curiosity) && has(bp.momentum), text: '궁금증 갭 + 대세감 둘 다 있음' },
    { ok: true, text: '엔드카드(마지막 컷)는 실제 제품컷 — 라벨 정확해야 함', manual: true },
    { ok: true, text: '내보내기 파일명 = 소재코드 = Meta 광고 이름', manual: true },
  ];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const slot = body.slot;
    const bp = slot?.blueprint || body.blueprint;
    if (!slot?.assetCode) return res.status(400).json({ error: 'slot.assetCode 필요' });
    if (!bp) return res.status(400).json({ error: '블루프린트 먼저 생성해야 한다' });
    if (slot.track === 'image') return res.status(400).json({ error: '이미지 소재는 캡컷 대상이 아니다 (정적 렌더러 경로)' });

    const cuts = Array.isArray(bp.cuts) ? bp.cuts : [];
    if (!cuts.length) return res.status(400).json({ error: 'cuts 없음 — 블루프린트를 다시 생성해야 한다' });

    const timeline = timelineOf(cuts);
    const total = timeline.reduce((s, r) => s + r.sec, 0);

    return res.status(200).json({
      status: 'ok',
      filename: `${slot.assetCode}.mp4`,
      srtFilename: `${slot.assetCode}.srt`,
      srt: buildSrt(timeline),
      sheet: buildSheet({ slot, bp, timeline, total }),
      checklist: buildChecklist({ slot, bp, timeline, total }),
      timeline, totalSec: Number(total.toFixed(1)),
      importHint: '캡컷 → 자막 → 로컬 자막 가져오기 → 이 .srt 선택. 컷 붙인 뒤 타이밍만 미세조정.',
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
