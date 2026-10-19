import { useState } from 'react'
import {
  listBoreholes, listRecords, listPhotosByBorehole, listProjects
} from '../db.js'
import { exportHuaningXLSX, exportPhotosZip } from '../exportUtils.js'
import { isFeatureLocked } from '../license.js'
import { exportLizhengTXT } from '../exportLizhengTxt.js'

// 导出按钮（带功能锁）
function FeatureBtn({ emoji, title, desc, onClick, loading, featureKey, status }) {
  const locked = isFeatureLocked(featureKey)
  return (
    <button onClick={onClick} disabled={!!loading || locked}
            className={`card hover:border-green-400 hover:shadow-md transition text-left ${(loading || locked) ? 'opacity-50 cursor-not-allowed' : ''} ${locked ? 'bg-slate-100 border-slate-300' : ''}`}>
      <div className="text-3xl mb-2">{locked ? '🔒' : emoji}</div>
      <div className="font-bold text-lg text-slate-800">{title}{locked && <span className="text-red-500 text-sm ml-2">（已锁定）</span>}</div>
      <div className="text-sm text-slate-500 mt-1">{locked ? '试用期结束，请联系管理员续期' : desc}</div>
      {status && !locked && <div className="text-xs text-green-600 mt-2">{status}</div>}
    </button>
  )
}

export default function ExportPage({ projects: initialProjects }) {
  const [projects, setProjects] = useState(initialProjects || [])
  const [selectedId, setSelectedId] = useState(projects[0]?.id || '')
  const [loading, setLoading] = useState('')
  const [status, setStatus] = useState({})

  async function collectProjectData(projectId) {
    const bs = await listBoreholes(projectId)
    const recordsMap = {}
    const photosMap = {}
    for (const b of bs) {
      recordsMap[b.id] = await listRecords(b.id)
      photosMap[b.id] = await listPhotosByBorehole(b.id)
    }
    return { boreholes: bs, recordsMap, photosMap }
  }

  async function handleHuaning() {
    if (!selectedId) return alert('请先选择项目')
    const p = projects.find(x => x.id === selectedId)
    setLoading('华宁 xlsx')
    const { boreholes, recordsMap } = await collectProjectData(selectedId)
    if (boreholes.length === 0) {
      alert('该项目没有钻孔数据')
      setLoading(''); return
    }
    try {
      const file = await exportHuaningXLSX(p, boreholes, recordsMap, {})
      setStatus(s => ({ ...s, huaning: `✅ 已导出 ${file}` }))
    } catch (err) {
      alert('导出失败: ' + err.message)
    }
    setLoading('')
  }

  async function handlePhotosZip() {
    if (!selectedId) return alert('请先选择项目')
    const p = projects.find(x => x.id === selectedId)
    setLoading('照片 ZIP')
    const { photosMap } = await collectProjectData(selectedId)
    const flat = Object.values(photosMap).flat()
    if (flat.length === 0) {
      alert('该项目没有照片')
      setLoading(''); return
    }
    try {
      const file = await exportPhotosZip(p, photosMap)
      setStatus(s => ({ ...s, photos: `✅ 已导出 ${file}` }))
    } catch (err) {
      alert('导出失败: ' + err.message)
    }
    setLoading('')
  }

  async function handleLizheng() {
    if (!selectedId) return alert('请先选择项目')
    const p = projects.find(x => x.id === selectedId)
    setLoading('理正接口')
    const { boreholes, recordsMap } = await collectProjectData(selectedId)
    if (boreholes.length === 0) {
      alert('该项目没有钻孔数据')
      setLoading(''); return
    }
    try {
      const r = await exportLizhengTXT(p, boreholes, recordsMap)
      setStatus(s => ({ ...s, lizheng: `✅ 已导出 ${r.fileName}（${r.lineCount} 行）` }))
    } catch (err) {
      alert('导出失败: ' + err.message)
    }
    setLoading('')
  }

  async function refresh() {
    setProjects(await listProjects())
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-5">📤 内业一键导出</h2>

      <div className="card mb-5">
        <label className="label">选择项目</label>
        <div className="flex gap-3">
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
                  className="input-field flex-1">
            <option value="">— 请选择 —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={refresh} className="btn-secondary">🔄</button>
        </div>
      </div>

      {selectedId && (
        <div className="grid md:grid-cols-3 gap-4 mb-5">
          <FeatureBtn emoji="📊" title="华宁基础数据" desc="一键导出标准 Excel（多 Sheet 结构）" onClick={handleHuaning} loading={loading} featureKey="export_huanning" status={status.huaning} />
          <FeatureBtn emoji="🖼️" title="岩心照片 ZIP" desc="将本项目所有岩心照片打包成 .zip" onClick={handlePhotosZip} loading={loading} featureKey="export_images_zip" status={status.photos} />
          <FeatureBtn emoji="📋" title="理正标准接口 .txt" desc="#GC#/#ZK#/#TC#/#BG# 标记头，Tab 分隔，理正可直接读入" onClick={handleLizheng} loading={loading} featureKey="export_lizheng" status={status.lizheng} />
        </div>
      )}

      {/* 功能锁提示 */}
      {isFeatureLocked('export_huanning') && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-5 text-sm text-red-800">
          ⚠️ 导出功能已被锁定。试用期结束后导出功能将不可用，请联系管理员续期激活码。
        </div>
      )}

      {loading && (
        <div className="text-center text-green-700 py-4 bg-green-50 rounded-lg">
          导出中：{loading}...
        </div>
      )}

      {/* 使用说明 */}
      <div className="card bg-slate-50">
        <h3 className="font-bold text-slate-700 mb-3">📖 导出格式说明</h3>
        <ul className="text-sm text-slate-600 space-y-2">
          <li>
            <strong>华宁 xlsx</strong>：严格按桌面「华宁基础数据 空模板.xlsx」的 Sheet 结构和表头字段输出。
            <br/>· 已自动填入：孔号、孔口标高、孔深、X/Y坐标；标贯 Sheet 的击数与杆长；钻孔 Sheet 的层号与孔底深度
            <br/>· 留空待内业手填：水位、勘探点类型、土工试验详细数据、水质/土质化学分析（这些需要送试验室才有）
            <br/>· 用法：打开华宁勘察软件 HNCAD 20.5 → 导入 Excel → 选择导出的文件
          </li>
          <li>
            <strong>岩心照片 ZIP</strong>：按钻孔号分子目录，文件名格式 <code className="bg-white px-1 rounded">ZK01_3.50m-5.00m_岩心.jpg</code>，直接导入内业资料文件夹即可
          </li>
          <li>
            <strong>理正标准接口 .txt</strong>：依据「理正工勘版9.0帮助 11.2.2」的纯文本接口规范输出。
            <br/>· 标记头：<code className="bg-white px-1 rounded">#GC#</code>工程表 / <code className="bg-white px-1 rounded">#ZK#</code>钻孔 / <code className="bg-white px-1 rounded">#TC#</code>土层 / <code className="bg-white px-1 rounded">#BG#</code>标贯 / <code className="bg-white px-1 rounded">#QY#</code>岩石取样
            <br/>· 分隔符：Tab，分号开头为注释，空字段也要 Tab 跳过
            <br/>· 用法：理正 CAD → 接口 → 读入理正标准接口数据 → 选择此 .txt 文件
          </li>
        </ul>
      </div>
    </div>
  )
}
