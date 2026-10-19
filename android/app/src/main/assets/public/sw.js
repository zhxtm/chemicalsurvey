// Service Worker —— 离线缓存 + 版本控制
// 简单的 cache-first 策略：
//   1. 首次安装 → 预缓存所有 Vite 构建产物
//   2. 后续请求 → 先查缓存，没有再去网络
//   3. 新版本上线 → 自动换缓存名，老缓存清理

const CACHE_VERSION = 'v4-'
const STATIC_CACHE = CACHE_VERSION + 'static'
const RUNTIME_CACHE = CACHE_VERSION + 'runtime'

// 预缓存清单（Vite 构建后 index.html 里会注入资源列表）
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
]

// 安装
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {})  // 有些 URL 在 build 前可能不存在
  )
  self.skipWaiting()
})

// 激活（清理旧版本缓存）
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !k.startsWith(CACHE_VERSION))
            .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// 请求拦截
self.addEventListener('fetch', event => {
  // 只处理 GET
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)

  // 跨域资源（比如 CDN、Google Fonts）—— 网络优先
  if (url.origin !== self.location.origin) return

  // HTML —— 网络优先（保证拿到最新版本），失败降级缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const copy = resp.clone()
          caches.open(RUNTIME_CACHE).then(c => c.put(event.request, copy))
          return resp
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
    )
    return
  }

  // 静态资源 —— 缓存优先
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached
      return fetch(event.request).then(resp => {
        if (resp.ok && resp.type === 'basic') {
          const copy = resp.clone()
          caches.open(RUNTIME_CACHE).then(c => c.put(event.request, copy))
        }
        return resp
      })
    })
  )
})
