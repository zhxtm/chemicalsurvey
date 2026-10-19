import { useState, useEffect, useRef } from 'react'
import { createBorehole, listBoreholes } from '../db.js'
import { parseBoreholeExcel } from '../boreholeImport.js'

export default function BoreholeList({ projectId, onBack, onRefresh, onOpen }) {
  const [boreholes, setBoreholes] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [boreholeNo, setBoreholeNo] = useState('')
  const [designDepth, setDesignDepth] = useState('')
  const [groundElev, setGroundElev] = useState('')
  // Excel 导入相关
  const [importPreview, setImportPreview] = useState([])
  const [importLoading, setImportLoading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => { load() }, [projectId])

  async function load() {
    const bs = await listBoreholes(projectId)
    // 同时计算每个钻孔的回次数
    const enriched = await Promise.all(bs.map(async b => {
      const { listRecords } = await import('../db.js')
      const rs = await listRecords(b.id)
      return { ...b, recordCount: rs.length }
    }))
    setBoreholes(enriched)
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!boreholeNo.trim() || !designDepth) return alert('请填写孔号和设计孔深')
    let lat = null, lng = null
    if (navigator.geolocation) {
      await new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
          pos => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve() },
          () => resolve(), { timeout: 5000 }
        )
      })
    }
    await createBorehole({
      projectId, boreholeNo: boreholeNo.trim(),
      designDepth: Number(designDepth),
      groundElev: groundElev ? Number(groundElev) : null,
      lat, lng
    })
    setBoreholeNo(''); setDesignDepth(''); setGroundElev('')
    setShowForm(false); load(); onRefresh()
  }

  // 自动建议下一个孔号
  function suggestNext() {
    const nums = boreholes.map(b => {
      const m = b.boreholeNo.match(/(\d+)/)
      return m ? parseInt(m[1]) : 0
    }).filter(n => n > 0)
    const next = nums.length ? Math.max(...nums) + 1 : 1
    setBoreholeNo(`ZK${String(next).padStart(2, '0')}`)
  }

  // ============ Excel 导入 ============
  async function handleFilePick(e) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      setImportLoading(true)
      const data = await parseBoreholeExcel(f)
      if (data.length === 0) {
        alert('没识别到钻孔数据！请检查 Excel 是否有「孔号」列。\n支持中英文表头：孔号/Borehole No./BH No. 等')
        setImportLoading(false); return
      }
      setImportPreview(data)
    } catch (err) {
      alert('解析失败: ' + err.message)
      setImportLoading(false)
    }
    e.target.value = ''
  }

  async function confirmImport() {
    let count = 0
    for (const raw of importPreview) {
      await createBorehole({
        projectId,
        boreholeNo: raw.boreholeNo,
        designDepth: raw.designDepth || 30,
        groundElev: raw.groundElev,
        boreholeType: raw.boreholeType,
        coordE: raw.coordE,
        coordN: raw.coordN,
        remarks: raw.remarks || raw.unitName || '',
        lat: null, lng: null,  // 项目已有GPS坐标（可后续在详情页补齐）
      })
      count++
    }
    alert(`✅ 成功导入 ${count} 个钻孔！`)
    setImportPreview([]); setImportLoading(false)
    load(); onRefresh()
  }

  return (
    <div>
      <button onClick={onBack} className="text-green-600 hover:text-green-800 mb-4">← 返回项目列表</button>

      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-slate-800">🕳️ 钻孔管理</h2>
        <div className="flex gap-2">
          <button onClick={() => fileInputRef.current.click()}
                  className="btn-secondary">📥 导入钻孔表</button>
          <button onClick={() => { setShowForm(v => !v); if (!showForm) suggestNext() }} className="btn-primary">
            {showForm ? '✕ 取消' : '➕ 新建钻孔'}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleFilePick} />
        </div>
      </div>

      {showForm && (
        <div className="card mb-5 border-green-300 bg-green-50">
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">孔号 *</label>
              <input value={boreholeNo} onChange={e => setBoreholeNo(e.target.value)}
                     className="input-field" placeholder="ZK01" required />
            </div>
            <div>
              <label className="label">设计孔深 (m) *</label>
              <input type="number" step="0.01" value={designDepth}
                     onChange={e => setDesignDepth(e.target.value)}
                     className="input-field" placeholder="如：30.00" required />
            </div>
            <div>
              <label className="label">孔口高程 (m)</label>
              <input type="number" step="0.01" value={groundElev}
                     onChange={e => setGroundElev(e.target.value)}
                     className="input-field" placeholder="如：52.30" />
            </div>
            <button type="submit" className="btn-primary md:col-span-3 w-full">✅ 创建钻孔（自动记录GPS）</button>
          </form>
        </div>
      )}

      {boreholes.length === 0 && !showForm ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-lg">还没有钻孔，创建第一个吧</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {boreholes.map(b => (
            <div key={b.id} className="card hover:border-green-400 hover:shadow-md transition cursor-pointer"
                 onClick={() => onOpen(b.id)}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-xl text-slate-800">{b.boreholeNo}</h3>
                {b.recordCount > 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{b.recordCount} 回次</span>}
              </div>
              <div className="text-sm text-slate-500 space-y-1">
                <div>📐 设计孔深：{b.designDepth?.toFixed(2) || '—'} m</div>
                <div>🏔️ 孔口高程：{b.groundElev?.toFixed(2) || '—'} m</div>
                {b.lat && <div>📍 GPS: {b.lat.toFixed(5)}, {b.lng.toFixed(5)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== 导入预览 Modal ===== */}
      {importPreview.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-800">📋 钻孔一览表预览</h3>
                <p className="text-sm text-slate-500">识别到 {importPreview.length} 个钻孔，确认后批量创建</p>
              </div>
              <button onClick={() => { setImportPreview([]); setImportLoading(false) }}
                      className="text-slate-400 hover:text-slate-600 text-2xl">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm border border-slate-200">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="border border-slate-300 px-2 py-2">孔号</th>
                    <th className="border border-slate-300 px-2 py-2">孔深(m)</th>
                    <th className="border border-slate-300 px-2 py-2">孔口标高</th>
                    <th className="border border-slate-300 px-2 py-2">孔类别</th>
                    <th className="border border-slate-300 px-2 py-2">坐标E</th>
                    <th className="border border-slate-300 px-2 py-2">坐标N</th>
                    <th className="border border-slate-300 px-2 py-2">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-2 py-1.5 font-semibold">{r.boreholeNo}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">{r.designDepth ?? '—'}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">{r.groundElev ?? '—'}</td>
                      <td className="border border-slate-200 px-2 py-1.5">{r.boreholeType || '—'}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-xs">{r.coordE ?? '—'}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-xs">{r.coordN ?? '—'}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-xs">{r.remarks || r.unitName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
              <button onClick={() => { setImportPreview([]); setImportLoading(false) }}
                      className="btn-secondary">取消</button>
              <button onClick={confirmImport}
                      className="btn-primary">✅ 确认导入 {importPreview.length} 个钻孔</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
