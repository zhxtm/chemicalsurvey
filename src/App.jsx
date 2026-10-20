import { useState, useEffect, useMemo, useRef } from 'react'
import { listProjects, deleteProjectCascade, clearAll } from './db.js'
import ProjectList from './pages/ProjectList.jsx'
import BoreholeList from './pages/BoreholeList.jsx'
import BoreholeDetail from './pages/BoreholeDetail.jsx'
import ExportPage from './pages/ExportPage.jsx'
import ImportPage from './pages/ImportPage.jsx'
import PlanPage from './pages/PlanPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import { getLicense, setLicense, daysRemaining, clearLicense } from './license.js'

// Hash 路由（分两大并列系统）：
//  外业采集系统 /field
//    /field                          → 项目列表
//    /field/:pid                     → 钻孔列表
//    /field/:pid/borehole/:bid       → 钻孔详情
//
//  数据处理系统 /office
//    /office                         → 数据处理首页（导入入口 + 项目卡片）
//    /office/:pid/plan               → 平面图
//    /office/:pid/profiles           → 剖面图
//    /office/:pid/export             → 导出
//
//  反馈 feedback（弹窗，不在路由里）

function parseHash() {
  const h = window.location.hash.replace(/^#/, '')
  const s = h.split('/').filter(Boolean)
  if (s.length === 0) return { mode: 'field', page: 'home', params: [] }
  const mode = s[0]

  // 外业路由：/field | /field/:pid | /field/:pid/borehole/:bid
  if (mode === 'field') {
    const r = s.slice(1)
    if (r.length === 0) return { mode, page: 'home', params: [] }
    if (r[1] === 'borehole') return { mode, page: 'borehole', params: [r[0], r[2]] }
    return { mode, page: 'project', params: [r[0]] }
  }

  // 内业路由：/office | /office/import | /office/:pid/plan | /office/:pid/profiles | /office/:pid/export
  if (mode === 'office') {
    const r = s.slice(1)
    if (r.length === 0) return { mode, page: 'home', params: [] }
    if (r[0] === 'import') return { mode, page: 'import', params: [] }
    if (r[1]) return { mode, page: r[1], params: [r[0]] }  // /office/:pid/:type
    return { mode, page: 'home', params: [r[0]] }
  }

  // 旧路由兼容（无 mode）：默认当 field
  const r = s.slice(0)
  if (r[0] === 'import') return { mode: 'field', page: 'import', params: [] }
  if (r[0] === 'export') return { mode: 'field', page: 'export', params: [] }
  if (r[0] === 'plan') return { mode: 'office', page: 'plan', params: r.slice(1) }
  if (r[0] === 'profiles') return { mode: 'office', page: 'profiles', params: r.slice(1) }
  if (r[1] === 'borehole') return { mode: 'field', page: 'borehole', params: [r[0], r[2]] }
  if (r[0]) return { mode: 'field', page: 'project', params: [r[0]] }
  return { mode: 'field', page: 'home', params: [] }
}

// ============= 激活码弹窗 =============
function LicenseGate({ onActivated }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const lic = getLicense()
  const days = daysRemaining()

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
          <h1 className="text-2xl font-bold text-slate-800">化学智勘</h1>
          <p className="text-sm text-slate-500 mt-1">外业采集 + 内业数据处理一体化</p>
          <p className="text-xs text-slate-400 mt-0.5">请输入激活码开始使用</p>
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

// ============= 底部导航按钮 =============
function TabButton({ active, onClick, icon, label, color }) {
  const colorCls = active ? (color === 'blue' ? 'text-blue-700' : color === 'indigo' ? 'text-indigo-700' : 'text-green-700') : ''
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${active ? colorCls : 'text-slate-500 hover:text-slate-700'}`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className={`text-xs ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
    </button>
  )
}

// ============= 数据处理首页（office home） =============
function OfficeHome({ projects, navigate, onShowFeedback, onRefresh }) {
  async function handleDeleteProject(p) {
    if (!confirm(`确定删除项目「${p.name}」？\n\n将同时删除其下所有钻孔、分层、回次、标贯、土工试验、剖线——不可恢复。`)) return
    try {
      await deleteProjectCascade(p.id)
      await onRefresh?.()
    } catch (e) {
      alert('删除失败：' + e.message)
    }
  }
  async function handleClearAll() {
    if (!confirm('⚠️ 危险操作\n\n确定清空数据库里的所有项目数据？\n\n会删除：所有项目、钻孔、分层、回次、剖线、土工试验、CPT 数据。\n\n不可恢复！请谨慎。')) return
    if (!confirm('二次确认：真的要清空全部数据吗？')) return
    try {
      await clearAll()
      await onRefresh?.()
    } catch (e) {
      alert('清空失败：' + e.message)
    }
  }

  return (
    <div className="space-y-5">
      {/* 数据导入 */}
      <div className="card">
        <h3 className="font-bold text-slate-700 mb-3">📥 数据导入</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <button onClick={() => navigate('/office/import')}
                  className="p-4 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 text-left transition">
            <div className="text-2xl mb-1">📁</div>
            <div className="font-bold text-slate-800">导入外部数据</div>
            <div className="text-xs text-slate-500 mt-0.5">理正接口 / 华宁数据库 / XLSX</div>
          </button>
          <button onClick={onShowFeedback}
                  className="p-4 border border-slate-200 bg-slate-50 rounded-lg hover:bg-slate-100 text-left transition">
            <div className="text-2xl mb-1">💬</div>
            <div className="font-bold text-slate-700">帮助与反馈</div>
            <div className="text-xs text-slate-500 mt-0.5">联系作者 / 续期激活码</div>
          </button>
        </div>
      </div>

      {/* 已导入项目 → 选择进入平面图/剖面图 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-700">🗺️ 已导入项目（生成图件）</h3>
          {projects.length > 0 && (
            <button onClick={handleClearAll}
                    className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-200 rounded hover:bg-red-50">
              🗑️ 清空全部数据
            </button>
          )}
        </div>
        {projects.length === 0 ? (
          <div className="card text-center py-10 text-slate-400">
            <div className="text-4xl mb-2">📭</div>
            <p className="text-sm">还没有导入任何数据</p>
            <p className="text-xs mt-1">点击上方「📁 导入外部数据」开始</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {projects.map(p => (
              <div key={p.id} className="card hover:border-blue-400 hover:shadow-md transition relative">
                <button onClick={() => handleDeleteProject(p)}
                        title="删除此项目（连同钻孔/分层/剖线一起删）"
                        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                  🗑️
                </button>
                <h4 className="font-bold text-slate-800 mb-2 pr-8">{p.name}</h4>
                {p.location && <div className="text-xs text-slate-500 mb-2">📍 {p.location}</div>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => navigate(`/office/${p.id}/plan`)}
                          className="flex-1 py-1.5 text-xs bg-sky-600 hover:bg-sky-700 text-white rounded font-semibold">
                    🗺️ 平面图
                  </button>
                  <button onClick={() => navigate(`/office/${p.id}/profiles`)}
                          className="flex-1 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold">
                    📐 剖面图
                  </button>
                  <button onClick={() => navigate(`/office/${p.id}/export`)}
                          className="flex-1 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold">
                    📤 导出
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============= 联系作者 / 意见反馈 =============
const CONTACT_EMAIL = 'ewarren@126.com'

function FeedbackModal({ onClose, onReactivate }) {
  const [status, setStatus] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const emailRef = useRef(null)

  function selectEmail() {
    const el = emailRef.current
    if (el) { el.focus(); el.setSelectionRange(0, el.value.length) }
  }
  async function copyEmail() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(CONTACT_EMAIL)
        setStatus('copied'); setTimeout(() => setStatus(''), 2000); return
      }
    } catch {}
    selectEmail(); setStatus('manual')
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[999] px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-800">意见反馈 / 联系作者</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none px-2">×</button>
        </div>
        <p className="text-sm text-slate-600 mb-3">
          使用中遇到问题、有改进建议，或需要续期激活码，欢迎邮件联系作者：
        </p>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-3">
          <input ref={emailRef} readOnly value={CONTACT_EMAIL} onClick={selectEmail}
                 className="flex-1 bg-transparent font-mono text-sm md:text-base text-slate-800 outline-none" />
          <button onClick={copyEmail} className="shrink-0 px-3 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium">
            {status === 'copied' ? '✓ 已复制' : '复制'}
          </button>
        </div>
        {status === 'manual' && <p className="text-xs text-amber-600 mt-2">邮箱已选中，请长按选择「复制」</p>}
        <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('化学智勘 - 意见反馈')}`}
           className="mt-4 block w-full text-center py-3 bg-green-600 text-white font-bold rounded-lg">✉️ 发送邮件</a>
        <button onClick={onClose} className="mt-2 w-full py-3 bg-slate-100 text-slate-600 font-medium rounded-lg">关闭</button>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)}
                  className="mt-3 w-full py-2.5 bg-white border border-slate-200 text-slate-500 text-sm rounded-lg">🔑 重新激活 / 更换激活码</button>
        ) : (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left">
            <p className="text-xs text-amber-700 mb-2">仅清除本机激活信息（已录入的项目数据不受影响），清除后需重新输入激活码。</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReset(false)} className="flex-1 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm">取消</button>
              <button onClick={onReactivate} className="flex-1 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold">确定清除</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============= 主组件 =============
export default function App() {
  const [route, setRoute] = useState(parseHash())
  const [projects, setProjects] = useState([])
  const [licenseChecked, setLicenseChecked] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [licVersion, setLicVersion] = useState(0)

  useEffect(() => {
    if (import.meta.env.DEV && !getLicense()) {
      const d = new Date(); d.setDate(d.getDate() + 365)
      const devCode = 'HXZK-' + `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}` + '-DEV00001'
      try { setLicense(devCode) } catch {}
    }
    setLicenseChecked(true)
  }, [])

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash())
      loadProjects()
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    setProjects(await listProjects())
  }

  function navigate(path) {
    window.location.hash = path
  }

  const lic = useMemo(() => getLicense(), [licVersion])
  if (!licenseChecked) return <div className="min-h-screen bg-white" />
  if (!lic || lic.expired) {
    return <LicenseGate onActivated={() => setLicVersion(v => v + 1)} />
  }

  const { mode, page, params } = route

  // 顶部标题：根据当前系统切换
  const isField = mode === 'field' || !mode
  const topTitle = isField ? '化学智勘 · 外业采集' : '化学智勘 · 数据处理'
  const topIcon = isField ? '⛰️' : '📊'
  const topColorCls = isField ? 'text-green-800' : 'text-indigo-800'

  return (
    <div className="min-h-screen flex flex-col"
         style={{
           paddingTop: 'max(env(safe-area-inset-top), 30px)',
           paddingBottom: 'calc(62px + max(env(safe-area-inset-bottom), 0px))',
         }}>

      {/* 顶部标题条 */}
      <div className="max-w-6xl w-full mx-auto px-4 pt-2 pb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 cursor-pointer"
             onClick={() => navigate(isField ? '/field' : '/office')}>
          <span className="text-xl">{topIcon}</span>
          <h1 className={`text-base md:text-xl font-bold ${topColorCls}`}>{topTitle}</h1>
        </div>
        {(() => {
          const d = daysRemaining()
          const exp = lic?.expireDate ? new Date(lic.expireDate) : null
          const expStr = exp ? `${exp.getFullYear()}-${String(exp.getMonth()+1).padStart(2,'0')}-${String(exp.getDate()).padStart(2,'0')}` : ''
          const cls = d <= 7 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-800 border-green-200'
          return (
            <span className={`text-xs border ${cls} px-2 py-0.5 rounded-full whitespace-nowrap`}>
              剩余 {d} 天<span className="hidden sm:inline">（至 {expStr}）</span>
            </span>
          )
        })()}
      </div>

      {/* 主内容区 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 md:px-4 py-3">
        {/* ====== 外业采集系统 ====== */}
        {mode === 'field' && page === 'home' && (
          <ProjectList
            projects={projects}
            onRefresh={loadProjects}
            onOpen={(p) => navigate(`/field/${p.id}`)}
          />
        )}
        {mode === 'field' && page && params[0] && !params[1] && (
          <BoreholeList
            projectId={params[0]}
            onBack={() => navigate('/field')}
            onRefresh={loadProjects}
            onOpen={(id) => navigate(`/field/${params[0]}/borehole/${id}`)}
          />
        )}
        {mode === 'field' && page === 'borehole' && params[1] && (
          <BoreholeDetail
            boreholeId={params[1]}
            onBack={() => navigate(`/field/${params[0]}`)}
          />
        )}

        {/* ====== 数据处理系统 ====== */}
        {mode === 'office' && page === 'home' && (
          <OfficeHome projects={projects} navigate={navigate} onShowFeedback={() => setShowFeedback(true)} onRefresh={loadProjects} />
        )}
        {mode === 'office' && page === 'import' && (
          <ImportPage projects={projects} onRefresh={loadProjects} />
        )}
        {mode === 'office' && page === 'plan' && params[0] && (
          <PlanPage projectId={params[0]} onBack={() => navigate(`/office`)} />
        )}
        {mode === 'office' && page === 'profiles' && params[0] && (
          <ProfilePage projectId={params[0]} onBack={() => navigate(`/office`)} />
        )}
        {mode === 'office' && page === 'export' && params[0] && (
          <ExportPage projects={projects} />
        )}

        {/* 空路由 → 外业首页（向后兼容） */}
        {!mode && (
          <ProjectList
            projects={projects}
            onRefresh={loadProjects}
            onOpen={(p) => navigate(`/field/${p.id}`)}
          />
        )}
      </main>

      <footer className="text-center text-xs text-slate-400 py-3">
        化学智勘 · 外业采集与内业数据处理 · 2026
      </footer>

      {/* 底部固定导航栏 —— 外业 / 内业 两大系统并列 */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
           style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}>
        <div className="max-w-6xl mx-auto flex">
          <TabButton active={mode === 'field' || !mode} onClick={() => navigate('/field')} icon="⛰️" label="外业采集" color="green" />
          <TabButton active={mode === 'office'} onClick={() => navigate('/office')} icon="📊" label="数据处理" color="indigo" />
          <TabButton active={false} onClick={() => setShowFeedback(true)} icon="✉️" label="反馈" color="slate" />
        </div>
      </nav>

      {showFeedback && (
        <FeedbackModal
          onClose={() => setShowFeedback(false)}
          onReactivate={() => {
            clearLicense(); setShowFeedback(false); setLicVersion(v => v + 1)
          }}
        />
      )}
    </div>
  )
}
