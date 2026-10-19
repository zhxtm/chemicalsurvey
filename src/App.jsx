import { useState, useEffect } from 'react'
import { listProjects } from './db.js'
import ProjectList from './pages/ProjectList.jsx'
import BoreholeList from './pages/BoreholeList.jsx'
import BoreholeDetail from './pages/BoreholeDetail.jsx'
import ExportPage from './pages/ExportPage.jsx'
import { getLicense, setLicense, daysRemaining, clearLicense } from './license.js'

// Hash 路由：/  |  /project/:id  |  /borehole/:id  |  /export
function parseHash() {
  const h = window.location.hash.replace(/^#/, '')
  const segments = h.split('/').filter(Boolean)
  return { page: segments[0] || 'home', params: segments.slice(1) }
}

// ============= 激活码弹窗 =============
function LicenseGate({ onActivated }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const lic = getLicense()
  const days = daysRemaining()

  // 开发模式：允许直接跳过（注释掉下面这行，启用后就是强制激活）
  // if (import.meta.env.DEV && lic?.activatedAt === undefined) { /* 允许开发跳过 */ }

  function handleActivate() {
    const r = setLicense(code)
    if (r.ok) {
      onActivated()
    } else {
      setError(r.reason || '激活失败')
    }
  }

  if (lic) {
    const exp = new Date(lic.expireDate)
    const expStr = `${exp.getFullYear()}-${String(exp.getMonth()+1).padStart(2,'0')}-${String(exp.getDate()).padStart(2,'0')}`
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-[999]">
        <div className="max-w-md w-full mx-4 bg-white rounded-xl shadow-2xl border border-slate-200 p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-slate-800">已激活</h2>
          <p className="text-sm text-slate-500 mt-2">有效期至 <span className="font-mono text-slate-700">{expStr}</span></p>
          <p className={`mt-2 font-bold ${days <= 7 ? 'text-red-600' : 'text-slate-600'}`}>
            剩余 {days} 天
          </p>
          {days <= 3 && <p className="text-xs text-red-500 mt-1">⚠️ 试用期即将结束，请及时续期</p>}
          <button onClick={() => { clearLicense(); window.location.reload() }}
                  className="mt-4 text-xs text-slate-400 hover:text-slate-600 underline">清除激活信息</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center z-[999]">
      <div className="max-w-md w-full mx-4 bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🧪</div>
          <h1 className="text-2xl font-bold text-slate-800">化学智勘 · 外业采集</h1>
          <p className="text-sm text-slate-500 mt-1">请输入激活码开始使用</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-slate-600 block mb-1">激活码</label>
            <input value={code} onChange={e => { setCode(e.target.value); setError('') }}
                   placeholder="HXZK-YYYYMMDD-XXXXXXXX"
                   className="w-full px-4 py-3 text-lg font-mono border border-slate-300 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                   onKeyDown={e => e.key === 'Enter' && handleActivate()}
                   autoFocus />
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded text-center">{error}</div>}

          <button onClick={handleActivate}
                  className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors">
            激活
          </button>

          <div className="text-center text-xs text-slate-400 pt-4 border-t">
            激活码由管理员发放 · 格式：HXZK-日期-校验码
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState(parseHash())
  const [active, setActive] = useState(parseHash().page)
  const [projects, setProjects] = useState([])
  const [licenseChecked, setLicenseChecked] = useState(false)

  // 检查激活状态
  useEffect(() => {
    // 开发模式允许跳过
    if (import.meta.env.DEV && !getLicense()) {
      // dev 模式下给一个免费激活码（30天），方便开发测试
      const devCode = 'HXZK-' + (() => {
        const d = new Date(); d.setDate(d.getDate() + 365);
        return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
      })() + '-' + (() => {
        // 临时给个固定码，dev 用
        const salts = '8f3a2b7cde91f042'
        let h = 0
        const s = (() => {
          const d = new Date(); d.setDate(d.getDate() + 365)
          return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
        })()
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
        return Math.abs(h).toString(16).toUpperCase().padStart(8,'0').slice(0,8)
      })()
      try { setLicense(devCode) } catch {}
    }
    setLicenseChecked(true)
  }, [])

  useEffect(() => {
    const onHash = () => {
      const r = parseHash()
      setRoute(r)
      setActive(r.page)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setProjects(await listProjects())
  }

  function navigate(path) {
    window.location.hash = path
  }

  // 许可证 Gate
  const lic = getLicense()
  if (!licenseChecked) return <div className="min-h-screen bg-white" />
  if (!lic || lic.expired) {
    return <LicenseGate onActivated={() => setLicenseChecked(true)} />
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-green-700 text-white shadow-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <span className="text-2xl">⛰️</span>
            <h1 className="text-lg md:text-xl font-bold">化学智勘 · 外业采集</h1>
          </div>
          <nav className="flex gap-1 md:gap-2 items-center">
            {(() => {
              const d = daysRemaining()
              if (d <= 7) return <span className="text-xs bg-red-500/80 px-2 py-0.5 rounded-full">剩余 {d} 天</span>
              return null
            })()}
            <button
              onClick={() => navigate('/')}
              className={`px-3 py-2 rounded-lg text-sm md:text-base transition ${active === 'home' ? 'bg-green-900' : 'hover:bg-green-600'}`}
            >🏠 项目</button>
            <button
              onClick={() => navigate('/export')}
              className={`px-3 py-2 rounded-lg text-sm md:text-base transition ${active === 'export' ? 'bg-green-900' : 'hover:bg-green-600'}`}
            >📤 导出</button>
          </nav>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 md:px-4 py-4">
        {active === 'home' && (
          <ProjectList
            projects={projects}
            onRefresh={loadProjects}
            onOpen={(p) => navigate(`/project/${p.id}`)}
          />
        )}
        {active === 'project' && route.params[0] && (
          <BoreholeList
            projectId={route.params[0]}
            onBack={() => navigate('/')}
            onRefresh={loadProjects}
            onOpen={(id) => navigate(`/borehole/${id}`)}
          />
        )}
        {active === 'borehole' && route.params[0] && (
          <BoreholeDetail
            boreholeId={route.params[0]}
            onBack={() => navigate(`/project/${route.params[1]}`)}
          />
        )}
        {active === 'export' && (
          <ExportPage projects={projects} />
        )}
      </main>

      <footer className="text-center text-xs text-slate-400 py-4">
        化学智勘外业采集系统 · 数据离线安全存储 · 2026
      </footer>
    </div>
  )
}
