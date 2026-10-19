import { useState } from 'react'
import { createProject, deleteProject, listBoreholes } from '../db.js'

export default function ProjectList({ projects, onRefresh, onOpen }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return alert('请输入项目名称')
    try {
      // 尝试获取 GPS
      let lat = null, lng = null
      if (navigator.geolocation) {
        setLoading(true)
        await new Promise(resolve => {
          navigator.geolocation.getCurrentPosition(
            pos => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve() },
            () => resolve(),  // 不强制
            { timeout: 5000 }
          )
        })
      }
      await createProject({ name: name.trim(), location: location.trim(), lat, lng })
      setName(''); setLocation('')
      setShowForm(false); setLoading(false)
      onRefresh()
    } catch (err) {
      alert('创建失败: ' + err.message)
      setLoading(false)
    }
  }

  async function handleDelete(p) {
    if (!confirm(`确认删除项目「${p.name}」及其所有钻孔、数据？此操作不可恢复！`)) return
    await deleteProject(p.id)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-slate-800">📋 我的项目</h2>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          {showForm ? '✕ 取消' : '➕ 新建项目'}
        </button>
      </div>

      {/* 新建项目表单 */}
      {showForm && (
        <div className="card mb-5 border-green-300 bg-green-50">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="label">项目名称 *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="如：某开发区一期勘察" required />
            </div>
            <div>
              <label className="label">工程地点</label>
              <input value={location} onChange={e => setLocation(e.target.value)} className="input-field" placeholder="如：山东省青岛市黄岛区" />
            </div>
            <div className="text-xs text-slate-500">
              💡 创建时自动获取 GPS 坐标（需开启定位权限），用于后续导出
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? '获取定位中...' : '✅ 保存项目'}
            </button>
          </form>
        </div>
      )}

      {/* 空状态 */}
      {!showForm && projects.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <div className="text-6xl mb-4">🏗️</div>
          <p className="text-lg">还没有项目，点击右上角「新建项目」开始吧</p>
        </div>
      )}

      {/* 项目列表 */}
      <div className="grid gap-3 md:grid-cols-2">
        {projects.map(p => (
          <div key={p.id} className="card hover:border-green-400 hover:shadow-md transition cursor-pointer"
               onClick={() => onOpen(p)}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-slate-800 truncate">{p.name}</h3>
                {p.location && <p className="text-sm text-slate-500 mt-1">📍 {p.location}</p>}
                <p className="text-xs text-slate-400 mt-2">
                  创建于 {new Date(p.createdAt).toLocaleString()}
                  {p.lat && <span className="ml-2">· GPS已记录 ✓</span>}
                </p>
              </div>
              <button onClick={e => { e.stopPropagation(); handleDelete(p) }}
                      className="text-red-500 hover:text-red-700 p-2 ml-2" title="删除">
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
