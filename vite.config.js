import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // ← 关键！相对路径，让 Cloudflare Pages 任意子路径都能跑
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,  // ← 不生成 sourcemap！防止别人还原源码
    minify: 'esbuild', // esbuild 压缩比 terser 更快
    target: 'es2019',
    cssCodeSplit: false,  // CSS 合并成一个文件（离线缓存更友好）
    rollupOptions: {
      output: {
        // 输出文件名 hash（防缓存 + 每个版本不同）
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      }
    }
  }
})
