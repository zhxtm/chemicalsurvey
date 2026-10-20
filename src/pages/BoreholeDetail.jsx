import { useState, useEffect, useRef } from 'react'
import {
  getBorehole, listRecords, createRecord, updateRecord, deleteRecord,
  listPhotosByRecord, addPhoto, deletePhoto, updateBorehole,
  listLayers, upsertLayers, listCPTByBorehole
} from '../db.js'
import { BOREHOLE_TYPES, MOISTURES, SECTION_GLOSS, SHAKE_REACTION, generateDescription, fmtDepth } from '../dataDict.js'
import { SOIL_NAME_LIST, STATES, COLORS } from '../dataDict.js'
import BoreholeProfile from './BoreholeProfile.jsx'
import { stratifyFromRecords, stratifyFromCPT, soilColor } from '../stratify.js'

export default function BoreholeDetail({ boreholeId, onBack }) {
  const [borehole, setBorehole] = useState(null)
  const [records, setRecords] = useState([])
  const [currentRecord, setCurrentRecord] = useState(null)  // 当前编辑/新建的回次
  const [photos, setPhotos] = useState([])
  const [showProfile, setShowProfile] = useState(false)
  const fileInputRef = useRef(null)

  // ==== v2 内业扩展：地层 tab + CPT ====
  const [activeTab, setActiveTab] = useState('records')    // 'records' | 'layers'
  const [layers, setLayers] = useState([])                  // 已保存的地层
  const [cptPoints, setCptPoints] = useState([])
  const [cptLayers, setCptLayers] = useState([])            // CPT 自动分层结果（只读参考）
  const [layersDirty, setLayersDirty] = useState(false)

  useEffect(() => { load() }, [boreholeId])

  async function load() {
    const b = await getBorehole(boreholeId)
    const rs = await listRecords(boreholeId)
    const ly = await listLayers(boreholeId)
    const cpt = await listCPTByBorehole(boreholeId)
    const cptL = cpt.length >= 3 ? stratifyFromCPT(cpt) : []
    setBorehole(b); setRecords(rs); setLayers(ly); setCptPoints(cpt); setCptLayers(cptL); setLayersDirty(false)
  }

  // ==== 自动分层：回次 → 地层 ====
  function doAutoStratify() {
    if (records.length === 0) { alert('没有回次数据，无法自动分层'); return }
    const result = stratifyFromRecords(records)
    if (result.length === 0) { alert('自动分层结果为空'); return }
    setLayers(result.map(l => ({ ...l })))
    setLayersDirty(true)
  }

  function doSaveLayers() {
    if (!confirm(`保存 ${layers.length} 层地层到钻孔 ${borehole.boreholeNo}？`)) return
    upsertLayers(boreholeId, layers.map(l => ({
      topDepth: l.topDepth, bottomDepth: l.bottomDepth,
      soilName: l.soilName, state: l.state, moisture: l.moisture, color: l.color,
      subLayerNo: l.subLayerNo || '', genDesc: l.genDesc || '',
      description: l.description || ''
    }))).then(() => load())
  }

  function doResetLayers() {
    if (!confirm('恢复为已保存的地层？未保存的修改将丢失')) return
    load()
  }

  function moveLayer(idx, dir) {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= layers.length) return
    const arr = [...layers]
    // 交换位置 + 重新对齐深度
    const [a, b] = [arr[idx], arr[newIdx]]
    arr[idx] = b; arr[newIdx] = a
    realignDepths(arr)
    setLayers(arr); setLayersDirty(true)
  }

  function deleteLayer(idx) {
    if (!confirm('删除该层？')) return
    const arr = layers.filter((_, i) => i !== idx)
    realignDepths(arr)
    setLayers(arr); setLayersDirty(true)
  }

  function addLayerAfter(idx) {
    const arr = [...layers]
    const prev = arr[idx]
    const top = prev ? prev.bottomDepth : 0
    const bot = prev ? top + (prev.bottomDepth - prev.topDepth || 1.5) : 1.5
    arr.splice(idx + 1, 0, {
      topDepth: top, bottomDepth: bot, thickness: bot - top,
      soilName: '', state: '', moisture: '稍湿', color: '灰', description: ''
    })
    realignDepths(arr)
    setLayers(arr); setLayersDirty(true)
  }

  function updateLayerField(idx, key, val) {
    const arr = [...layers]
    arr[idx] = { ...arr[idx], [key]: val }
    if (key === 'bottomDepth' || key === 'topDepth') {
      arr[idx].thickness = Math.max(0, arr[idx].bottomDepth - arr[idx].topDepth)
      realignDepths(arr)
    }
    setLayers(arr); setLayersDirty(true)
  }

  // 让相邻层的顶深 = 上一层底深，保证连续不重叠
  function realignDepths(arr) {
    for (let i = 1; i < arr.length; i++) {
      arr[i].topDepth = arr[i - 1].bottomDepth
    }
    for (const l of arr) l.thickness = Math.max(0, l.bottomDepth - l.topDepth)
  }

  // ============ 新建回次 ============
  function startNewRound() {
    const nextNo = records.length + 1
    const prevEnd = records.length > 0 ? records[records.length - 1].endDepth : 0
    // 防错：起始深度自动 = 上一回次终止深度
    setCurrentRecord({
      id: null, roundNo: nextNo,
      startDepth: prevEnd, endDepth: prevEnd + 1.5,  // 默认1.5m进尺
      soilName: '', state: '', color: '灰', moisture: '稍湿',
      description: '',
      isRock: false, rqd: null,
      takeRate: null,  // 取芯率 %
      hammerN: null,    // 标贯击数
      hammerRod: null,  // 标贯杆长
      remarks: ''
    })
  }

  // ============ 编辑已有回次 ============
  async function startEdit(r) {
    const ps = await listPhotosByRecord(r.id)
    setPhotos(ps)
    setCurrentRecord({ ...r })
  }

  async function saveRecord(autoNext = true) {
    if (!validateRecord(currentRecord)) return false
    const payload = { ...currentRecord, boreholeId }
    let saved
    if (currentRecord.id) {
      await updateRecord(currentRecord.id, payload)
      saved = currentRecord
    } else {
      saved = await createRecord(payload)
    }
    await load()

    // 自动续录：创建下一个回次
    if (autoNext) {
      const allRecs = await listRecords(boreholeId)
      if (allRecs.length === 0) {
        setCurrentRecord(null); setPhotos([]); return true
      }
      const last = allRecs[allRecs.length - 1]
      if (!last) { setCurrentRecord(null); setPhotos([]); return true }
      const newNo = allRecs.length + 1
      const bottomDepth = last.endDepth || 0
      const remain = (borehole.designDepth || 0) - bottomDepth
      if (remain <= 0.001) {
        // 达到设计孔深
        alert(`🎉 已达设计孔深 ${borehole.designDepth} m！\n共录 ${allRecs.length} 个回次，钻孔完成。`)
        setCurrentRecord(null); setPhotos([])
      } else {
        // 默认每回次进尺 1.5m 或剩余深度（留 0.1m 余量避免浮点残留）
        const step = Math.min(1.5, Math.max(0.1, remain - 0.05))
        const nextStart = +bottomDepth.toFixed(2)
        const nextEnd = +(bottomDepth + step).toFixed(2)
        setCurrentRecord({
          id: null, roundNo: newNo,
          startDepth: nextStart,
          endDepth: nextEnd,
          soilName: '', state: '', color: '灰', moisture: '稍湿',
          description: '', isRock: false, rqd: null,
          takeRate: null, hammerN: null, hammerRod: null, remarks: '', samples: []
        })
        setPhotos([])
      }
    } else {
      setCurrentRecord(null); setPhotos([])
    }
    return true
  }

  async function removeRecord(id) {
    if (!confirm('删除该回次及其照片？')) return
    await deleteRecord(id)
    if (currentRecord?.id === id) { setCurrentRecord(null); setPhotos([]) }
    await load()
  }

  // ============ 防错校验 ============
  function validateRecord(r) {
    if (r.endDepth <= r.startDepth) {
      alert('❌ 终止深度不能小于起始深度！')
      return false
    }
    if (borehole.designDepth && r.endDepth > borehole.designDepth) {
      if (!confirm(`⚠️ 终止深度 ${r.endDepth}m 超过设计孔深 ${borehole.designDepth}m，继续保存？`)) return false
    }
    // 起始深度必须等于上一回次终止深度（除了第一个回次）
    if (!r.id) {
      const prev = records[records.length - 1]
      const expectedStart = prev ? prev.endDepth : 0
      if (Math.abs((r.startDepth || 0) - expectedStart) > 0.01) {
        alert(`⚠️ 深度不连续！\n当前起始深度：${r.startDepth}m\n上一回次终止深度：${expectedStart}m\n请修正起始深度。`)
        return false
      }
    } else {
      // 编辑态：检查与相邻回次是否连续
      const idx = records.findIndex(x => x.id === r.id)
      if (idx > 0) {
        const prev = records[idx - 1]
        if (Math.abs((r.startDepth || 0) - prev.endDepth) > 0.01) {
          alert(`⚠️ 起始深度 ${r.startDepth}m 与上一回次终止深度 ${prev.endDepth}m 不连续！`)
          return false
        }
      }
      if (idx < records.length - 1) {
        const next = records[idx + 1]
        if (Math.abs((r.endDepth || 0) - next.startDepth) > 0.01) {
          alert(`⚠️ 终止深度 ${r.endDepth}m 与下一回次起始深度 ${next.startDepth}m 不连续！`)
          return false
        }
      }
    }
    return true
  }

  // ============ 智能联想 ============
  function onSoilNameChange(name) {
    const s = STATES[name]?.[0] || STATES._default[0] || ''
    setCurrentRecord(r => ({
      ...r, soilName: name, state: s,
      description: generateDescription(name, s, r.color, buildOpts(r))
    }))
  }
  function onStateChange(state) {
    setCurrentRecord(r => ({
      ...r, state,
      description: generateDescription(r.soilName, state, r.color, buildOpts(r))
    }))
  }
  function onColorChange(color) {
    setCurrentRecord(r => ({
      ...r, color,
      description: generateDescription(r.soilName, r.state, color, buildOpts(r))
    }))
  }
  function onMoistureChange(moisture) {
    setCurrentRecord(r => ({
      ...r, moisture,
      description: generateDescription(r.soilName, r.state, r.color, buildOpts(r))
    }))
  }
  function onExtraChange(key, val) {
    setCurrentRecord(r => {
      const next = { ...r, [key]: val }
      return {
        ...next,
        description: generateDescription(next.soilName, next.state, next.color, buildOpts(next))
      }
    })
  }
  function buildOpts(r) {
    return {
      moisture: r.moisture || '稍湿',
      sectionGloss: r.sectionGloss || '',
      shakeReaction: r.shakeReaction || '',
      inclusions: r.inclusions || ''
    }
  }

  // ============ 照片 ============
  async function handlePhoto(file) {
    if (!currentRecord?.id) {
      if (!confirm('💡 需要先保存本回次才能关联照片，是否先保存？')) return
      const saved = await saveRecord(false)
      if (!saved) return
    }
    // 自动重命名: ZK01_3.50m-5.00m_岩心.jpg
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const newName = `${borehole.boreholeNo}_${fmtDepth(currentRecord.startDepth)}m-${fmtDepth(currentRecord.endDepth)}m_岩心.${ext}`
    const blob = file.slice(0, file.size, file.type)
    const p = await addPhoto({
      boreholeId, recordId: currentRecord.id,
      fileName: newName, originalName: file.name,
      blob, size: file.size
    })
    // 读取现有照片
    const ps = await listPhotosByRecord(currentRecord.id)
    setPhotos(ps)
  }
  async function removePhoto(photo) {
    if (!confirm(`删除照片「${photo.fileName}」？`)) return
    await deletePhoto(photo.id)
    const ps = await listPhotosByRecord(currentRecord.id)
    setPhotos(ps)
  }

  if (!borehole) return <div className="text-center py-10">加载中...</div>

  return (
    <div>
      <button onClick={onBack} className="text-green-600 hover:text-green-800 mb-4">← 返回钻孔列表</button>

      {/* 钻孔基础信息 —— 可手动编辑 */}
      <BoreholeHeader
        borehole={borehole}
        records={records}
        onSave={async (patch) => {
          await updateBorehole(boreholeId, patch)
          const fresh = await getBorehole(boreholeId)
          setBorehole(fresh)
        }}
        onAddRound={startNewRound}
        onShowProfile={() => setShowProfile(true)}
      />

      {/* Tab 切换条 */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-lg">
        <button onClick={() => setActiveTab('records')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${activeTab === 'records' ? 'bg-white shadow text-green-700' : 'text-slate-500'}`}>
          📋 回次 (外业)
        </button>
        <button onClick={() => setActiveTab('layers')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${activeTab === 'layers' ? 'bg-white shadow text-green-700' : 'text-slate-500'}`}>
          🧱 地层 (内业)
          {layersDirty && <span className="ml-1 text-amber-600">●</span>}
          {layers.length > 0 && !layersDirty && <span className="ml-1 text-xs text-slate-400">{layers.length}层</span>}
        </button>
      </div>

      {/* ========== 回次视图（原内容） ========== */}
      {activeTab === 'records' && (
        <>

      {/* 回次列表 */}
      <div className="mb-5">
        <h3 className="font-bold text-slate-700 mb-2">📋 回次记录 ({records.length})</h3>
        {records.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm bg-white rounded-lg border border-dashed border-slate-300">
            还没有回次，点击上方「新增回次」开始录入
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((r, i) => (
              <div key={r.id} className={`card py-3 px-4 cursor-pointer transition ${currentRecord?.id === r.id ? 'bg-green-50 border-green-400' : 'hover:border-green-300'}`}
                   onClick={() => startEdit(r)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-700 text-white text-xs px-2 py-0.5 rounded-full">回次 {r.roundNo}</span>
                      <span className="font-bold text-slate-800">{r.soilName || '—'}</span>
                      {r.state && <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{r.state}</span>}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {fmtDepth(r.startDepth)}m → <strong className="text-green-700">{fmtDepth(r.endDepth)}m</strong> · 
                      进尺 {((r.endDepth || 0) - (r.startDepth || 0)).toFixed(2)} m
                      {r.hammerN != null && <span className="ml-2">· {fmtDepth(r.startDepth)}m N={r.hammerN}</span>}
                      {r.takeRate != null && <span className="ml-2">· 芯率 {r.takeRate}%</span>}
                      {r.isRock && r.rqd != null && <span className="ml-2 text-amber-700">· RQD {r.rqd}%</span>}
                      {(r.samples || []).length > 0 && <span className="ml-2 text-amber-700">· 🧪 {(r.samples || []).length}样</span>}
                    </div>
                  </div>
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => startEdit(r)} className="text-green-600 hover:text-green-800 text-sm px-2">✏️</button>
                    <button onClick={() => removeRecord(r.id)} className="text-red-500 hover:text-red-700 text-sm px-2">🗑️</button>
                  </div>
                </div>
                {/* 深度连续性提示 */}
                {i > 0 && Math.abs(r.startDepth - records[i-1].endDepth) > 0.01 && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                    ⚠️ 与上一回次深度不连续！上一回终 {records[i-1].endDepth?.toFixed(2)}m，本回起 {r.startDepth?.toFixed(2)}m
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 回次编辑表单 */}
      {currentRecord && (
        <div className="card border-green-400 bg-green-50/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-green-800">
              {currentRecord.id ? '✏️ 编辑回次' : '➕ 新增回次'}
            </h3>
            <button onClick={() => { setCurrentRecord(null); setPhotos([]) }} className="text-slate-500 hover:text-slate-700">✕</button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {/* 深度：自动联动 */}
            <div>
              <label className="label">起始深度 (m) *</label>
              <input type="number" step="0.01" min="0"
                     value={currentRecord.startDepth ?? ''}
                     onChange={e => setCurrentRecord(r => ({ ...r, startDepth: parseFloat(e.target.value) || 0 }))}
                     className="input-field" />
              <div className="text-xs text-slate-400 mt-1">⚠️ 应等于上一回终止深度</div>
            </div>
            <div>
              <label className="label">终止深度 (m) *</label>
              <input type="number" step="0.01" min="0"
                     value={currentRecord.endDepth ?? ''}
                     onChange={e => setCurrentRecord(r => ({ ...r, endDepth: parseFloat(e.target.value) || 0 }))}
                     className="input-field" />
              <div className="text-xs text-green-600 mt-1">进尺: {((currentRecord.endDepth || 0) - (currentRecord.startDepth || 0)).toFixed(2)} m</div>
            </div>
            <div>
              <label className="label">回次号</label>
              <input type="number" value={currentRecord.roundNo}
                     onChange={e => setCurrentRecord(r => ({ ...r, roundNo: Number(e.target.value) }))}
                     className="input-field" />
            </div>
            <div className="pt-6">
              <label className="inline-flex items-center gap-2 text-base">
                <input type="checkbox" checked={currentRecord.isRock}
                       onChange={e => setCurrentRecord(r => ({ ...r, isRock: e.target.checked }))} />
                <span>岩石（测 RQD）</span>
              </label>
            </div>

            {/* 智能联想字段 */}
            <div className="md:col-span-2">
              <label className="label">岩土名称 *（选后自动生成描述）</label>
              {currentRecord.soilName === '其它（手动录入）' ? (
                <input value={currentRecord.soilNameManual || ''}
                       onChange={e => {
                         const v = e.target.value
                         setCurrentRecord(r => ({ ...r, soilName: v || '其它（手动录入）', soilNameManual: v }))
                       }}
                       className="input-field"
                       placeholder="如：煤矸石、岩溶充填物、建筑垃圾..." />
              ) : (
                <select value={currentRecord.soilName}
                        onChange={e => onSoilNameChange(e.target.value)}
                        className="input-field">
                  <option value="">— 请选择 —</option>
                  {SOIL_NAME_LIST.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="label">稠度/密实度</label>
              <select value={currentRecord.state}
                      onChange={e => onStateChange(e.target.value)}
                      className="input-field">
                <option value="">—</option>
                {(STATES[currentRecord.soilName] || STATES._default).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">湿度</label>
              <select value={currentRecord.moisture || '稍湿'}
                      onChange={e => onMoistureChange(e.target.value)}
                      className="input-field">
                {MOISTURES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">颜色</label>
              <select value={currentRecord.color}
                      onChange={e => onColorChange(e.target.value)}
                      className="input-field">
                {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* 现场鉴别辅助（根据岩土类型条件显示） */}
            {['粘土', '粉质粘土', '粉土', '淤泥质土'].includes(currentRecord.soilName) && (
              <>
                <div>
                  <label className="label">切面光泽</label>
                  <select value={currentRecord.sectionGloss || ''} onChange={e => onExtraChange('sectionGloss', e.target.value)} className="input-field">
                    <option value="">—</option>{SECTION_GLOSS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                {currentRecord.soilName === '粉土' && (
                  <div>
                    <label className="label">摇振反应</label>
                    <select value={currentRecord.shakeReaction || ''} onChange={e => onExtraChange('shakeReaction', e.target.value)} className="input-field">
                      <option value="">—</option>{SHAKE_REACTION.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
            <div className="md:col-span-2">
              <label className="label">夹含物 / 备注描述</label>
              <input value={currentRecord.inclusions || ''} onChange={e => onExtraChange('inclusions', e.target.value)}
                     className="input-field" placeholder="如：夹少量碎石、铁锰结核、腐殖质..." />
            </div>

            <div className="md:col-span-4">
              <label className="label">性状描述</label>
              <textarea rows="3"
                        value={currentRecord.description}
                        onChange={e => setCurrentRecord(r => ({ ...r, description: e.target.value }))}
                        className="input-field" placeholder="选中岩土名称后自动生成模板，可手动修改..." />
            </div>

            {/* 额外参数 */}
            <div>
              <label className="label">取芯率 (%)</label>
              <input type="number" value={currentRecord.takeRate ?? ''}
                     onChange={e => setCurrentRecord(r => ({ ...r, takeRate: e.target.value ? Number(e.target.value) : null }))}
                     className="input-field" placeholder="如 95" />
            </div>
            {currentRecord.isRock && (
              <div>
                <label className="label">RQD (%)</label>
                <input type="number" value={currentRecord.rqd ?? ''}
                       onChange={e => setCurrentRecord(r => ({ ...r, rqd: e.target.value ? Number(e.target.value) : null }))}
                       className="input-field" placeholder="如 70" />
              </div>
            )}
            <div>
              <label className="label">标贯击数 N</label>
              <input type="number" value={currentRecord.hammerN ?? ''}
                     onChange={e => setCurrentRecord(r => ({ ...r, hammerN: e.target.value ? Number(e.target.value) : null }))}
                     className="input-field" placeholder="如 12" />
            </div>
            <div>
              <label className="label">标贯杆长 (m)</label>
              <input type="number" step="0.1" value={currentRecord.hammerRod ?? ''}
                     onChange={e => setCurrentRecord(r => ({ ...r, hammerRod: e.target.value ? Number(e.target.value) : null }))}
                     className="input-field" placeholder="如 3.0" />
            </div>

            <div className="md:col-span-4">
              <label className="label">备注 / 异常记载</label>
              <input value={currentRecord.remarks || ''}
                     onChange={e => setCurrentRecord(r => ({ ...r, remarks: e.target.value }))}
                     className="input-field" placeholder="如：遇空洞、破碎带、漏水等异常情况" />
            </div>
          </div>

          {/* 取样记录 */}
          <div className="md:col-span-4 bg-amber-50/50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">🧪 取样记录（本回次内可多个）</label>
              <button type="button" onClick={() => setCurrentRecord(r => ({
                ...r,
                samples: [...(r.samples || []), { sampleNo: '', depth: r.startDepth || null, type: '原状样', length: null }]
              }))} className="text-sm bg-amber-500 text-white px-3 py-1 rounded hover:bg-amber-600">＋ 添加取样</button>
            </div>
            {(currentRecord.samples || []).length === 0 ? (
              <div className="text-xs text-slate-400 py-2 text-center border border-dashed border-slate-300 rounded">本回次未取样，点「＋ 添加取样」录入</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr><th className="text-left py-1">样号</th><th className="text-left py-1">取样深度(m)</th><th className="text-left py-1">类型</th><th className="text-left py-1">样长(cm)</th><th></th></tr>
                </thead>
                <tbody>
                  {(currentRecord.samples || []).map((s, idx) => (
                    <tr key={idx} className="border-t border-amber-200">
                      <td className="py-1">
                        <input value={s.sampleNo || ''} onChange={e => {
                          const arr = [...currentRecord.samples]; arr[idx] = { ...s, sampleNo: e.target.value };
                          setCurrentRecord(r => ({ ...r, samples: arr }))
                        }} className="w-16 px-2 py-1 border rounded" placeholder="1" />
                      </td>
                      <td className="py-1">
                        <input type="number" step="0.01" value={s.depth ?? ''} onChange={e => {
                          const v = parseFloat(e.target.value)
                          const arr = [...currentRecord.samples]; arr[idx] = { ...s, depth: isNaN(v) ? null : v };
                          setCurrentRecord(r => ({ ...r, samples: arr }))
                        }} className="w-24 px-2 py-1 border rounded" placeholder="12.35" />
                      </td>
                      <td className="py-1">
                        <select value={s.type} onChange={e => {
                          const arr = [...currentRecord.samples]; arr[idx] = { ...s, type: e.target.value };
                          setCurrentRecord(r => ({ ...r, samples: arr }))
                        }} className="px-2 py-1 border rounded">
                          <option value="原状样">原状样</option>
                          <option value="扰动样">扰动样</option>
                          <option value="岩样">岩样</option>
                          <option value="水样">水样</option>
                          <option value="土样">土样</option>
                        </select>
                      </td>
                      <td className="py-1">
                        <input type="number" step="0.5" value={s.length ?? ''} onChange={e => {
                          const v = parseFloat(e.target.value)
                          const arr = [...currentRecord.samples]; arr[idx] = { ...s, length: isNaN(v) ? null : v };
                          setCurrentRecord(r => ({ ...r, samples: arr }))
                        }} className="w-20 px-2 py-1 border rounded" placeholder="20" />
                      </td>
                      <td className="py-1">
                        <button type="button" onClick={() => setCurrentRecord(r => ({ ...r, samples: r.samples.filter((_, i) => i !== idx) }))}
                                className="text-red-500 hover:text-red-700 px-2">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 照片区 —— 可选，约每5m拍一次 */}
          <div className="mt-5 pt-4 border-t-2 border-dashed border-green-300">
            <h4 className="font-semibold text-slate-700 mb-2">📷 岩心照片 <span className="text-xs text-slate-400 font-normal">（可选，约每 5m 拍一次即可）</span></h4>
            <div className="text-xs text-slate-500 mb-2">
              自动命名为：<code className="bg-slate-100 px-1 rounded">{borehole.boreholeNo}_{fmtDepth(currentRecord.startDepth)}m-{fmtDepth(currentRecord.endDepth)}m_岩心.jpg</code>
            </div>
            {/* 每5m提醒 */}
            {(() => {
              const midDepth = (+currentRecord.startDepth + +currentRecord.endDepth) / 2
              const nearest5 = Math.round(midDepth / 5) * 5
              if (Math.abs(midDepth - nearest5) < 1.5 && photos.length === 0) {
                return <div className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded mb-3">💡 深度接近 {nearest5}m，建议在此处拍一张岩心照片记录</div>
              }
              return null
            })()}
            <div className="grid gap-3 grid-cols-3 md:grid-cols-6 mb-3">
              {photos.map(p => (
                <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                  <img src={URL.createObjectURL(p.blob)} className="w-full h-full object-cover" alt={p.fileName} />
                  <button onClick={() => removePhoto(p)}
                          className="absolute top-1 right-1 bg-red-600 text-white w-7 h-7 rounded-full opacity-0 group-hover:opacity-100 transition text-sm">✕</button>
                </div>
              ))}
              <button onClick={() => fileInputRef.current.click()}
                      className="aspect-square rounded-lg border-2 border-dashed border-slate-400 text-slate-500 hover:border-green-500 hover:text-green-600 text-2xl flex items-center justify-center bg-white transition">
                +
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden
                   onChange={e => {
                     Array.from(e.target.files).forEach(f => handlePhoto(f))
                     e.target.value = ''
                   }} />
            {!currentRecord.id && photos.length === 0 && (
              <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded">💡 保存本回次后可在此添加照片</div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 mt-5">
            <button onClick={() => saveRecord(true)} className="btn-primary flex-1">
              ▶️ 保存并继续下一回
            </button>
            <button onClick={() => saveRecord(false)} className="btn-secondary">
              ✅ 保存并终止
            </button>
          </div>
        </div>
      )}

      {/* 钻孔柱状图 Modal */}
      {showProfile && records.length > 0 && (
        <BoreholeProfile
          borehole={borehole}
          records={records}
          layers={layers.length > 0 ? layers : stratifyFromRecords(records)}
          onClose={() => setShowProfile(false)}
        />
      )}
      {showProfile && records.length === 0 && (
        alert('请先录入至少 1 个回次，才能生成柱状图！') || setShowProfile(false)
      )}

        </>
      )}

      {/* ========== 地层视图（内业） ========== */}
      {activeTab === 'layers' && (
        <div className="space-y-4">
          {/* 操作栏 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <h3 className="font-bold text-slate-700 flex-1">🧱 地层分层（内业精细化）</h3>
              <button onClick={doAutoStratify}
                      className="btn-primary text-sm"
                      title="按外业回次的岩土名+状态+湿度变化自动合并生成地层">
                🤖 自动分层（基于外业回次）
              </button>
              {layersDirty && (
                <>
                  <button onClick={doSaveLayers} className="btn-primary text-sm">💾 保存地层</button>
                  <button onClick={doResetLayers} className="btn-secondary text-sm">↩️ 取消修改</button>
                </>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              💡 自动分层规则：连续回次的「岩土名称 + 状态 + 湿度 + 颜色」四个字段全部相同则合并为一层。相邻层深度自动对齐（上层底 = 下层顶）。
            </div>
          </div>

          {/* CPT 数据参考（如果有） */}
          {cptPoints.length > 0 && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                🎯 静力触探 (CPT) 自动分层参考
                <span className="text-xs font-normal text-blue-600">（仅供参考，不自动合并到地层表）</span>
              </h4>
              <div className="text-xs text-blue-700 mb-2">
                {cptPoints.length} 个 CPT 数据点 · 梯度阈值 25% · 识别出 {cptLayers.length} 层
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-blue-700 border-b border-blue-300">
                    <tr>
                      <th className="py-1 text-left">层号</th>
                      <th className="py-1 text-left">顶深(m)</th>
                      <th className="py-1 text-left">底深(m)</th>
                      <th className="py-1 text-right">层厚(m)</th>
                      <th className="py-1 text-right">qc均值(MPa)</th>
                      <th className="py-1 text-right">fs均值(kPa)</th>
                      <th className="py-1 text-right">Ps均值(MPa)</th>
                      <th className="py-1 text-left">推断土性</th>
                    </tr>
                  </thead>
                  <tbody className="text-blue-900">
                    {cptLayers.map((l, i) => (
                      <tr key={i} className="border-t border-blue-100">
                        <td className="py-1">{i+1}</td>
                        <td>{l.topDepth.toFixed(2)}</td>
                        <td>{l.bottomDepth.toFixed(2)}</td>
                        <td className="text-right">{l.thickness.toFixed(2)}</td>
                        <td className="text-right">{l.qcMean}</td>
                        <td className="text-right">{l.fsMean}</td>
                        <td className="text-right font-semibold">{l.psMean}</td>
                        <td className="text-emerald-700 font-semibold">{l.soilGuess}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 地层表 */}
          {layers.length === 0 ? (
            <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
              {records.length > 0 ? (
                <>
                  <div className="text-4xl mb-3">🧱</div>
                  <p className="mb-3">还没有分层，点击上方「🤖 自动分层」基于外业 {records.length} 个回次生成地层</p>
                </>
              ) : (
                <p>请先录入外业回次数据，才能生成地层</p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* 表头 */}
              <div className="grid gap-1 px-3 py-2 bg-slate-100 text-xs font-bold text-slate-600 border-b border-slate-200"
                   style={{ gridTemplateColumns: '36px 60px 1fr 70px 50px 50px 50px 100px 60px 60px 60px' }}>
                <div className="text-center">#</div>
                <div>顶深(m)</div>
                <div>岩土名称</div>
                <div>底深(m)</div>
                <div>层厚</div>
                <div>状态</div>
                <div>湿度</div>
                <div>描述</div>
                <div></div>
                <div></div>
                <div></div>
              </div>

              {/* 行 */}
              {layers.map((l, i) => (
                <div key={i} className={`grid gap-1 px-3 py-2 text-sm items-center border-b border-slate-100 ${layersDirty ? 'bg-amber-50/30' : ''}`}
                     style={{ gridTemplateColumns: '36px 60px 1fr 70px 50px 50px 50px 100px 60px 60px 60px' }}>
                  <div className="text-center">
                    <span className="inline-block w-6 h-6 rounded text-xs font-bold text-white text-center leading-6"
                          style={{ background: soilColor(l.soilName) }}>{i+1}</span>
                  </div>
                  <input type="number" step="0.01" value={l.topDepth ?? ''}
                         onChange={e => updateLayerField(i, 'topDepth', parseFloat(e.target.value) || 0)}
                         className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs" />
                  <input value={l.soilName}
                         onChange={e => updateLayerField(i, 'soilName', e.target.value)}
                         className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs" />
                  <input type="number" step="0.01" value={l.bottomDepth ?? ''}
                         onChange={e => updateLayerField(i, 'bottomDepth', parseFloat(e.target.value) || 0)}
                         className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs" />
                  <div className="text-center text-slate-600">{l.thickness?.toFixed(2) || '—'}</div>
                  <input value={l.state}
                         onChange={e => updateLayerField(i, 'state', e.target.value)}
                         className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs" />
                  <input value={l.moisture}
                         onChange={e => updateLayerField(i, 'moisture', e.target.value)}
                         className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs" />
                  <input value={l.description}
                         onChange={e => updateLayerField(i, 'description', e.target.value)}
                         className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs" />
                  <div className="flex gap-1 justify-center">
                    <button onClick={() => moveLayer(i, -1)} disabled={i === 0}
                            className="text-slate-400 hover:text-green-600 disabled:opacity-30 text-xs">↑</button>
                    <button onClick={() => moveLayer(i, +1)} disabled={i === layers.length - 1}
                            className="text-slate-400 hover:text-green-600 disabled:opacity-30 text-xs">↓</button>
                  </div>
                  <button onClick={() => addLayerAfter(i)}
                          className="text-blue-500 hover:text-blue-700 text-xs">＋</button>
                  <button onClick={() => deleteLayer(i)}
                          className="text-red-500 hover:text-red-700 text-xs">✕</button>
                </div>
              ))}

              {/* 层厚汇总 */}
              <div className="px-3 py-2 bg-slate-50 text-xs text-slate-500 border-t border-slate-200">
                共 {layers.length} 层 · 累计厚度 {layers.reduce((s, l) => s + (l.thickness || 0), 0).toFixed(2)} m
                {borehole.designDepth && <> · 设计孔深 {borehole.designDepth} m</>}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ============ 钻孔基础信息 —— 可手动编辑卡片 ============
function BoreholeHeader({ borehole, records, onSave, onAddRound, onShowProfile }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(borehole)
  useEffect(() => { setForm(borehole) }, [borehole])

  function save() {
    onSave({
      boreholeType: form.boreholeType || '',
      designDepth: toNum(form.designDepth),
      groundElev: toNum(form.groundElev),
      waterLevelFirst: toNum(form.waterLevelFirst),
      waterLevelStable: toNum(form.waterLevelStable),
      coordE: toNum(form.coordE),
      coordN: toNum(form.coordN),
      lat: toNum(form.lat),
      lng: toNum(form.lng),
      remarks: form.remarks || '',
    })
    setEditing(false)
  }
  function toNum(v) {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v); return isNaN(n) ? null : n
  }
  function upd(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const bottomDepth = records.length > 0 ? Math.max(...records.map(r => r.endDepth || 0)) : 0
  const reached = borehole.designDepth && bottomDepth >= borehole.designDepth

  return (
    <div className="card bg-gradient-to-r from-green-50 to-white mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-green-800">🕳️ {borehole.boreholeNo}</h2>
            {borehole.boreholeType && (
              <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">{borehole.boreholeType}</span>
            )}
            {records.length > 0 && (
              <span className="bg-slate-200 text-slate-700 text-xs px-2 py-1 rounded-full">{records.length} 回次</span>
            )}
          </div>
          {!editing && (
            <div className="text-sm text-slate-600 mt-2 space-x-3 flex flex-wrap">
              <span>📐 孔深 {borehole.designDepth?.toFixed(2) || '—'}m</span>
              <span>🏔️ 孔口标高 {borehole.groundElev?.toFixed(2) || '—'}m</span>
              {borehole.waterLevelFirst != null && <span>💧 初见水位 {borehole.waterLevelFirst?.toFixed(2)}m</span>}
              {borehole.waterLevelStable != null && <span>💧 稳定水位 {borehole.waterLevelStable?.toFixed(2)}m</span>}
              {(borehole.coordE != null || borehole.coordN != null) && (
                <span>📍 E {borehole.coordE ?? '—'} / N {borehole.coordN ?? '—'}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setEditing(e => !e)} className="btn-secondary text-sm py-2 px-3">
            {editing ? '✕ 取消' : '✏️ 编辑'}
          </button>
          {!editing && (
            <>
              <button onClick={onShowProfile} className="btn-secondary text-sm py-2 px-3" title="查看/编辑柱状图分层">📊 柱状图</button>
              <button onClick={onAddRound} className="btn-primary">➕ 新增回次</button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="grid gap-3 md:grid-cols-4 bg-white p-4 rounded-lg border border-green-200">
          <div>
            <label className="label">孔类型</label>
            <select value={form.boreholeType || ''} onChange={e => upd('boreholeType', e.target.value)} className="input-field">
              <option value="">— 未指定 —</option>
              {BOREHOLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">设计孔深 (m)</label>
            <input type="number" step="0.01" value={form.designDepth ?? ''} onChange={e => upd('designDepth', e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">孔口标高 (m)</label>
            <input type="number" step="0.01" value={form.groundElev ?? ''} onChange={e => upd('groundElev', e.target.value)} className="input-field" placeholder="可留空" />
          </div>
          <div>
            <label className="label">初见水位 (m)</label>
            <input type="number" step="0.01" value={form.waterLevelFirst ?? ''} onChange={e => upd('waterLevelFirst', e.target.value)} className="input-field" placeholder="可留空" />
          </div>
          <div>
            <label className="label">稳定水位 (m)</label>
            <input type="number" step="0.01" value={form.waterLevelStable ?? ''} onChange={e => upd('waterLevelStable', e.target.value)} className="input-field" placeholder="可留空" />
          </div>
          <div>
            <label className="label">坐标 E (X)</label>
            <input type="number" step="0.001" value={form.coordE ?? ''} onChange={e => upd('coordE', e.target.value)} className="input-field" placeholder="可留空" />
          </div>
          <div>
            <label className="label">坐标 N (Y)</label>
            <input type="number" step="0.001" value={form.coordN ?? ''} onChange={e => upd('coordN', e.target.value)} className="input-field" placeholder="可留空" />
          </div>
          <div>
            <label className="label">备注</label>
            <input value={form.remarks || ''} onChange={e => upd('remarks', e.target.value)} className="input-field" placeholder="如：海上孔、进入持力层≥10m" />
          </div>
          <div className="md:col-span-4 flex gap-3">
            <button onClick={save} className="btn-primary flex-1">💾 保存</button>
            <button onClick={() => setEditing(false)} className="btn-secondary">取消</button>
          </div>
        </div>
      )}

      {!editing && records.length > 0 && (
        <div className="mt-2 flex items-center gap-3 text-sm">
          <span className="text-slate-500">理论孔底:</span>
          <span className="font-bold text-green-700">{bottomDepth.toFixed(2)} m</span>
          {borehole.designDepth && (
            reached
              ? <span className="text-green-600 font-semibold">✓ 已达设计孔深</span>
              : <span className="text-amber-600">还差 {(borehole.designDepth - bottomDepth).toFixed(2)} m</span>
          )}
        </div>
      )}
    </div>
  )
}
