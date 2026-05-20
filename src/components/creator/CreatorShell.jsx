// CreatorShell.jsx — V3 AI 크리에이터 메인 셸
// 탭: Identity | 콘텐츠 | 영상생성 | 발행
// (PersonaSection import 유지 — Phase 2 정리 전까지 보존)

import { useState, useEffect } from 'react';
import { User, Sparkles, Video, Send } from 'lucide-react';
import PersonaSection from './persona/PersonaSection';
import IdentityLibrary from './identity/IdentityLibrary';
import ContentSetup from './content/ContentSetup';
import VideoGenerator from './video/VideoGenerator';
import PublishPanel from './finish/PublishPanel';

const TABS = [
  { key: 'identity', label: 'Identity',  icon: User },
  { key: 'content',  label: '콘텐츠',   icon: Sparkles },
  { key: 'video',    label: '영상생성',  icon: Video },
  { key: 'publish',  label: '발행',      icon: Send },
];

export default function CreatorShell() {
  const [tab, setTab] = useState('identity');

  // 선택된 페르소나 ID (PersonaSection에서 설정)
  const [activePersonaId, setActivePersonaId] = useState(null);
  const [activePersona, setActivePersona] = useState(null);

  // 생성된 드래프트 (ContentSetup → VideoGenerator → PublishPanel로 전달)
  const [draft, setDraft] = useState(null);

  // 완성된 씬별 영상 URL 목록 (VideoGenerator → PublishPanel)
  const [sceneVideos, setSceneVideos] = useState([]); // [{ order, videoUrl }]

  // 페르소나 기본 이미지 (front angle) — Kling 영상 생성에 사용
  const [personaImageUrl, setPersonaImageUrl] = useState(null);

  // draft 생성 시 영상생성 탭으로 이동
  const handleDraftCreated = (newDraft) => {
    setDraft(newDraft);
    setTab('video');
  };

  // 영상 생성 완료 시 발행 탭으로
  const handleVideosReady = (videos) => {
    setSceneVideos(videos);
    setTab('publish');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F5F7' }}>
      {/* 탭 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: '0 24px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E5EA',
        flexShrink: 0,
      }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '14px 18px',
                border: 'none',
                borderBottom: `2px solid ${active ? '#5E6AD2' : 'transparent'}`,
                background: 'transparent',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? '#5E6AD2' : '#6E6E73',
                cursor: 'pointer',
                transition: 'all 0.12s',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}

        {/* 선택된 페르소나 표시 */}
        {activePersona && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#5E6AD2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#FFF', fontWeight: 700 }}>
              {(activePersona.name || '?')[0]}
            </div>
            <span style={{ fontSize: 12, color: '#6E6E73' }}>{activePersona.name || '페르소나 미설정'}</span>
          </div>
        )}
      </div>

      {/* 탭 컨텐츠 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'identity' && (
          <IdentityLibrary identityId="mine-primary" />
        )}
        {tab === 'content' && (
          <ContentSetup
            personaId={activePersonaId}
            persona={activePersona}
            onDraftCreated={handleDraftCreated}
          />
        )}
        {tab === 'video' && (
          <VideoGenerator
            draft={draft}
            personaImageUrl={personaImageUrl}
            onVideosReady={handleVideosReady}
          />
        )}
        {tab === 'publish' && (
          <PublishPanel
            draft={draft}
            sceneVideos={sceneVideos}
            personaId={activePersonaId}
          />
        )}
      </div>
    </div>
  );
}
