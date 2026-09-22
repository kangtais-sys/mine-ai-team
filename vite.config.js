import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 로컬에 API 서버를 띄우지 않고 배포본 API 로 화면만 확인할 때:
    //   API_PROXY=https://mine-ai-team.vercel.app npm run dev
    proxy: {
      '/api': {
        target: process.env.API_PROXY || 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
