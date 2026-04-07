# n8n 워크플로우 업데이트 가이드

## 워크플로우: Google Drive to YouTube Shorts & TikTok
**ID**: `SGHhOsshxLqG9EMj`
**URL**: https://peerstory.app.n8n.cloud

## 현재 흐름
```
Watch Google Drive Folder → Download Video → Generate Title (Claude) → Parse → Upload to TikTok (Zernio)
```

## 변경 후 흐름
```
Watch Google Drive Folder → Download Video → Video Analyze API → Upload to TikTok (Zernio)
```

---

## Step 1: "Video Analyze" HTTP Request 노드 추가

Download Video 노드 다음에 HTTP Request 노드를 추가합니다.

### 노드 설정

| 항목 | 값 |
|------|-----|
| Method | POST |
| URL | `https://mine-ai-team.vercel.app/api/video-analyze` |
| Authentication | None (공개 엔드포인트) |
| Body Content Type | JSON |

### Body (JSON):
```json
{
  "videoUrl": "{{ $json.webContentLink }}"
}
```

> `$json.webContentLink`은 Download Video 노드에서 출력되는 Google Drive 다운로드 링크입니다.
> 만약 이 필드가 없으면 `$json.webViewLink` 또는 직접 Drive URL을 사용:
> ```json
> { "videoUrl": "https://drive.google.com/file/d/{{ $json.id }}/view" }
> ```

### 예상 응답:
```json
{
  "success": true,
  "youtube_title": "500달톤으로 피부가 달라진다? 프로틴 미스트 한 달 후기",
  "youtube_description": "밀리밀리 500달톤 프로틴 미스트를 한 달간 사용해봤습니다...",
  "tiktok_caption": "이거 쓰고 피부 광 장난 아님 ✨ 500달톤 초저분자 단백질의 힘 💪",
  "hashtags": ["#밀리밀리", "#500달톤", "#K뷰티", "#스킨케어", "#프로틴미스트", "#kbeauty", "#skincare", "#millimilli", "#화장품추천", "#뷰티"],
  "thumbnail_text": "피부 광폭탄"
}
```

---

## Step 2: "Generate Title and Description" 노드 제거 또는 수정

Video Analyze API가 이미 title/description/caption을 생성하므로, 기존 Claude 노드는 **제거** 가능합니다.

만약 유지하려면 프롬프트를 수정:
```
영상 분석 결과를 기반으로 최종 메타데이터를 확정해줘.

분석 결과:
- 제목: {{ $json.youtube_title }}
- 설명: {{ $json.youtube_description }}
- 틱톡 캡션: {{ $json.tiktok_caption }}
- 해시태그: {{ $json.hashtags.join(' ') }}

위 내용을 그대로 사용하거나 더 나은 버전으로 수정해줘.
JSON 형식으로 응답:
{"title": "...", "description": "...", "caption": "...", "hashtags": [...]}
```

---

## Step 3: "Parse Title and Description" 노드 수정

### Set 노드로 매핑:
```
title = {{ $json.youtube_title }}
description = {{ $json.youtube_description }}
caption = {{ $json.tiktok_caption }}
hashtags = {{ $json.hashtags.join(' ') }}
```

또는 Expression으로:
- `caption`: `{{ $json.tiktok_caption }}\n{{ $json.hashtags.join(' ') }}`
- `title`: `{{ $json.youtube_title }}`
- `description`: `{{ $json.youtube_description }}`

---

## Step 4: "Upload to TikTok" (Zernio) 노드 수정

Body JSON:
```json
{
  "profileId": "69d08807986d57bb8f72f7e6",
  "platforms": ["tiktok", "youtube"],
  "text": "{{ $json.caption }}",
  "mediaUrl": "{{ $json.videoUrl }}"
}
```

> `text` 필드에 tiktok_caption + hashtags를 합쳐서 전달

---

## API로 워크플로우 업데이트 (선택)

n8n API로 직접 노드를 추가할 수도 있습니다:

```bash
export N8N_API_KEY="your-api-key"

# 1. 현재 워크플로우 가져오기
curl -s "https://peerstory.app.n8n.cloud/api/v1/workflows/SGHhOsshxLqG9EMj" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > workflow.json

# 2. workflow.json 수정 (노드 추가/수정)
# 3. PUT으로 업데이트
curl -X PUT "https://peerstory.app.n8n.cloud/api/v1/workflows/SGHhOsshxLqG9EMj" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @workflow.json
```

### Video Analyze 노드 JSON (복사해서 n8n에 붙여넣기):
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://mine-ai-team.vercel.app/api/video-analyze",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={ \"videoUrl\": \"https://drive.google.com/file/d/{{ $json.id }}/view\" }",
    "options": {
      "response": {
        "response": {
          "responseFormat": "json"
        }
      }
    }
  },
  "name": "Video Analyze",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.4,
  "position": [1200, 400]
}
```

---

## 테스트

배포 후 직접 테스트:
```bash
curl -X POST https://mine-ai-team.vercel.app/api/video-analyze \
  -H "Content-Type: application/json" \
  -d '{"videoUrl": "https://drive.google.com/file/d/YOUR_FILE_ID/view"}'
```

또는 이미지로 테스트:
```bash
curl -X POST https://mine-ai-team.vercel.app/api/video-analyze \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/product-image.jpg"}'
```
