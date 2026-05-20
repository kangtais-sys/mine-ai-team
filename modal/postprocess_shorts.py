"""
MINE AI V3 — K-뷰티 숏츠 후처리 (Modal.com)

입력:
  - raw_video_url: 모델 출력 영상 URL (HeyGen / Veo / Kling / Seedance)
  - language: 'en' | 'zh' | 'ja' | 'ko' (자막 burn-in 언어)
  - lut_preset: 'k-beauty-warm-apricot-pale' (기본값)
  - subtitle_text: 자막 텍스트 (해당 언어로 번역 완료된 상태)
  - draft_id, scene_index: 결과 파일명/Storage 경로용

출력:
  - final_video_url: Supabase Storage에 업로드된 최종 영상 URL
  - duration_sec, cost_usd, processed_at

파이프라인:
  1. raw 영상 다운로드
  2. 9:16 크롭 (16:9 입력 시 인물 중심 크롭)
  3. K-뷰티 LUT 적용 (따뜻한 살구 + 페일)
     - 톤매핑: Highlight +8, Shadow -5
     - 컬러: R +12, G +5, B -3
     - Saturation -10
     - Toe lift +0.05 (페일 느낌)
  4. 필름 그레인 추가 (intensity 10)
  5. 약한 모션 블러 (실제 카메라 흉내)
  6. 자막 burn-in (언어별 폰트/위치)
  7. Supabase Storage 업로드 → URL 반환

언어별 폰트:
  - en: Inter-SemiBold
  - zh: NotoSansSC-Bold
  - ja: NotoSansJP-Bold
  - ko: Pretendard-SemiBold
"""

import modal

app = modal.App("mine-postprocess-shorts")

ffmpeg_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "fonts-noto-cjk", "fonts-noto-cjk-extra")
    .pip_install("requests==2.32.3", "supabase==2.8.0")
)

# K-뷰티 살구+페일 LUT — FFmpeg curves/colorbalance 파라미터로 표현
# (정식 .cube LUT 파일은 Phase 4 튜닝 시 교체)
KBEAUTY_LUT_FILTER = (
    # 1) 톤매핑: Highlight +8, Shadow -5
    "curves=preset=lighter:"
    # 2) 살구 톤: R +12, G +5, B -3
    "colorbalance=rs=0.12:gs=0.05:bs=-0.03:"
    "rm=0.08:gm=0.03:bm=-0.02:"
    # 3) Saturation -10 (페일)
    "eq=saturation=0.90:"
    # 4) Toe lift +0.05 (페일 느낌, 검정을 살짝 띄움)
    "curves=all='0/0.05 0.5/0.5 1/1'"
)

GRAIN_FILTER = "noise=alls=10:allf=t+u"

MOTION_BLUR_FILTER = "tblend=all_mode=average,framerate=fps=30"

CROP_9_16_FILTER = (
    "crop='if(gt(iw/ih,9/16),ih*9/16,iw)':'if(gt(iw/ih,9/16),ih,iw*16/9)',"
    "scale=1080:1920"
)

FONT_BY_LANG = {
    "en": "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    "zh": "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "ja": "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "ko": "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
}


def build_subtitle_filter(subtitle_text: str, language: str) -> str:
    font = FONT_BY_LANG.get(language, FONT_BY_LANG["en"])
    safe_text = subtitle_text.replace("'", r"\'").replace(":", r"\:")
    return (
        f"drawtext=fontfile={font}:"
        f"text='{safe_text}':"
        "fontcolor=white:fontsize=54:"
        "box=1:boxcolor=black@0.45:boxborderw=14:"
        "x=(w-text_w)/2:y=h-text_h-160"
    )


@app.function(
    image=ffmpeg_image,
    secrets=[modal.Secret.from_name("supabase-service-role")],
    timeout=600,
    gpu=None,
)
def postprocess_video(
    raw_video_url: str,
    language: str,
    subtitle_text: str,
    draft_id: str,
    scene_index: int,
    lut_preset: str = "k-beauty-warm-apricot-pale",
) -> dict:
    import os
    import subprocess
    import tempfile
    import time

    import requests
    from supabase import create_client

    started_at = time.time()

    with tempfile.TemporaryDirectory() as tmp:
        raw_path = os.path.join(tmp, "raw.mp4")
        out_path = os.path.join(tmp, "final.mp4")

        with requests.get(raw_video_url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(raw_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    f.write(chunk)

        filter_chain = ",".join([
            CROP_9_16_FILTER,
            KBEAUTY_LUT_FILTER,
            GRAIN_FILTER,
            MOTION_BLUR_FILTER,
            build_subtitle_filter(subtitle_text, language),
        ])

        cmd = [
            "ffmpeg", "-y",
            "-i", raw_path,
            "-vf", filter_chain,
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            out_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        supabase = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
        storage_path = f"renders/{draft_id}/scene-{scene_index}-{language}.mp4"
        with open(out_path, "rb") as f:
            supabase.storage.from_("creator-videos").upload(
                path=storage_path,
                file=f.read(),
                file_options={"content-type": "video/mp4", "upsert": "true"},
            )
        final_url = supabase.storage.from_("creator-videos").get_public_url(storage_path)

    duration = round(time.time() - started_at, 2)
    return {
        "final_video_url": final_url,
        "duration_sec": duration,
        "cost_usd": round(duration / 60 * 0.05, 4),
        "language": language,
        "lut_preset": lut_preset,
    }


@app.local_entrypoint()
def smoke():
    """로컬 호출 테스트: modal run modal/postprocess_shorts.py"""
    result = postprocess_video.remote(
        raw_video_url="https://example.com/sample.mp4",
        language="en",
        subtitle_text="Hello from MINE",
        draft_id="smoke-test",
        scene_index=0,
    )
    print(result)
