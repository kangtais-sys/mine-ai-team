import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const CS_SYSTEM_PROMPT = `당신은 K뷰티 브랜드 MILLIMILLI(밀리밀리)의 전문 CS 상담원입니다.

=== 브랜드 정보 ===
- 브랜드: MILLIMILLI (밀리밀리)
- 업종: K뷰티 화장품 + 의류
- 판매채널: 올리브영, 스마트스토어, 카페24 자사몰, 아마존, 쇼피

=== 상담 원칙 ===
- 존댓말 사용, 따뜻하고 정중한 톤
- 공감 먼저, 해결 다음
- "고객님"으로 호칭
- 마무리: "더 궁금하신 점 있으시면 언제든 말씀해주세요 😊"

=== 상담 유형별 대응 ===
1. 주문문의: 주문번호 확인 → 상태 안내
2. 배송문의: 송장번호/배송사 안내, 지연 시 사과+예상일정
3. 교환: 수령 후 7일 이내, 택배비 안내, 접수 방법 안내
4. 환불: 수령 후 7일 이내, 환불 소요기간 안내 (카드 3~5일, 현금 5~7일)
5. 제품문의: 성분, 사용법, 피부타입별 추천
6. 이벤트: 현재 진행중 이벤트 안내
7. 제휴제안: 담당자 이메일 안내 (biz@millimilli.co.kr)

=== 에스컬레이션 ===
다음의 경우 "실무 확인이 필요하여 담당자에게 전달드리겠습니다"라고 안내:
- 환불 금액이 5만원 이상
- 불량/파손 클레임
- 법적 문제 언급
- 개인정보 관련
- 대량 주문 (10개 이상)

=== 정보 수집 ===
교환/환불/배송 문의 시 아래 정보 요청:
- 성함
- 연락처
- 주문번호 (모르면 주문 시 사용한 이름+연락처)

항상 한국어로 응답하세요.`;

// Slack notification helper
async function notifySlack(message) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  }).catch(err => console.error('[Slack] Notification failed:', err.message));
}

// Google Sheets append helper
async function appendToSheet(rowData) {
  const { google } = await import('googleapis');
  const sheetId = process.env.CS_GOOGLE_SHEET_ID;
  if (!sheetId) { console.warn('[CS] CS_GOOGLE_SHEET_ID not set'); return; }

  let auth;
  if (process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID) {
    auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  } else if (process.env.GOOGLE_CLIENT_EMAIL) {
    auth = new google.auth.GoogleAuth({
      credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } else { return; }

  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'A:M',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [rowData] },
  });
}

// Classify consultation type
function classifyType(content) {
  const lower = content.toLowerCase();
  if (/주문|결제|구매/.test(lower)) return '주문';
  if (/배송|택배|송장|도착/.test(lower)) return '배송';
  if (/교환|사이즈|변경/.test(lower)) return '교환';
  if (/환불|취소|반품/.test(lower)) return '환불';
  if (/성분|사용|추천|피부|건성|지성/.test(lower)) return '제품문의';
  if (/이벤트|할인|쿠폰|세일/.test(lower)) return '이벤트';
  if (/제휴|협찬|콜라보|비즈니스/.test(lower)) return '제휴제안';
  return '기타';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userRequest } = req.body;
    const userMessage = userRequest?.utterance || userRequest?.block?.blockId || req.body.message || '';
    const userId = userRequest?.user?.id || req.body.userId || 'unknown';

    if (!userMessage) {
      return res.status(200).json({
        version: '2.0',
        template: { outputs: [{ simpleText: { text: '안녕하세요! MILLIMILLI입니다 😊 무엇을 도와드릴까요?' } }] },
      });
    }

    // Generate AI response
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: CS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const reply = aiResponse.content[0]?.text || '죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

    // Analyze and log to sheet
    const now = new Date();
    const date = now.toLocaleDateString('ko-KR');
    const time = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const consultType = classifyType(userMessage);
    const needsEscalation = /실무 확인|담당자에게 전달/.test(reply);

    // Summarize with Claude
    let summary = userMessage.substring(0, 100);
    let action = '상담완료';
    try {
      const summaryRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: `다음 상담 내용을 한 줄로 요약하고, 마무리액션을 정해주세요.\n고객: ${userMessage}\n상담원: ${reply}\nJSON으로 응답: {"summary": "...", "action": "상담완료|재상담안내|적립금지급|교환처리|환불처리|기타"}` }],
      });
      const parsed = JSON.parse(summaryRes.content[0]?.text?.match(/\{[\s\S]*\}/)?.[0] || '{}');
      if (parsed.summary) summary = parsed.summary;
      if (parsed.action) action = parsed.action;
    } catch (e) { /* keep defaults */ }

    // Append to Google Sheets (A~M)
    const rowData = [
      date, time, userId, '', '', '', consultType,
      summary, action,
      needsEscalation ? '추가상담필요' : '완료',
      needsEscalation ? 'Y' : 'N',
      needsEscalation ? '대표' : '',
      '',
    ];
    await appendToSheet(rowData).catch(e => console.error('[CS] Sheet append failed:', e.message));

    // Slack notification if escalation needed
    if (needsEscalation) {
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.CS_GOOGLE_SHEET_ID}`;
      await notifySlack(
        `⚠️ 실무 확인 필요 [밀리밀리 CS]\n──────────────────\n고객: (${userId})\n상담종류: ${consultType}\n내용: ${summary}\n필요액션: ${action}\n2차담당: 대표\n⏰ ${date} ${time}\n📋 시트 바로가기: ${sheetUrl}`
      );
    }

    // Return Kakao response format
    return res.status(200).json({
      version: '2.0',
      template: {
        outputs: [{ simpleText: { text: reply } }],
      },
    });
  } catch (error) {
    console.error('[CS] Kakao webhook error:', error.message);
    return res.status(200).json({
      version: '2.0',
      template: {
        outputs: [{ simpleText: { text: '죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요 🙏' } }],
      },
    });
  }
}
