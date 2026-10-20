// 导入入口页：理正标准接口 .txt / 华宁数据库 / 静探原始数据 / XLSX
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { parseLizhengTXT, parseCPTRawText, validateLizhengText } from '../importLizhengTxt.js'
import { parseHuNingFJ, isHuNingFJFileList, decodeGBK, listAllStems } from '../importHuNingFJ.js'
import { createProject, createBorehole, createRecord, upsertCPTPoints, upsertLayers, genId } from '../db.js'

export default function ImportPage({ projects, onRefresh }) {
  const [mode, setMode] = useState(null)         // 'lizheng' | 'cpt'
  const [parsed, setParsed] = useState(null)
  const [targetProject, setTargetProject] = useState('new')  // 'new' | projectId
  const [newProjectName, setNewProjectName] = useState('')
  const [log, setLog] = useState([])
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)  // 华宁数据库文件夹选择

  function logMsg(msg, type = 'info') {
    setLog(l => [...l, { msg, type, t: Date.now() }])
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // 华宁 / 通用 xlsx
      reader.onload = async () => {
        try {
          const wb = XLSX.read(reader.result, { type: 'array' })
          const result = await importHuNingXlsx(wb)
          setParsed(result)
          logMsg(`✓ 解析 ${file.name}：发现 ${result.boreholes?.length || 0} 个钻孔`, 'success')
        } catch (err) {
          logMsg(`✗ XLSX 解析失败：${err.message}`, 'error')
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      // 默认按文本处理，先判断是理正接口还是 CPT 原始
      reader.onload = async () => {
        const text = reader.result
        if (validateLizhengText(text)) {
          const result = parseLizhengTXT(text)
          setParsed(result)
          setMode('lizheng')
          logMsg(`✓ 识别为理正标准接口：${result.boreholes.length} 个钻孔`, 'success')
        } else {
          const points = parseCPTRawText(text)
          setParsed({ cptPoints: points })
          setMode('cpt')
          logMsg(`✓ 识别为 CPT 原始数据：${points.length} 个数据点`, 'success')
        }
      }
      reader.readAsText(file, 'utf-8')
    }
    e.target.value = ''
  }

  // ============== 华宁数据库文件夹导入 ==============
  async function handleHuNingFolder(e) {
    // 华宁的原始数据库文件后缀**不固定**（.FJ / .kynhq / 工程简称）
    // 但报告类文件有明显后缀：.TXT / .XLS / .XLSX
    // 所以策略：排除报告类，剩下的全是数据库原始文件
    const EXCLUDE = ['.TXT', '.XLS', '.XLSX']
    const files = Array.from(e.target.files || [])
      .filter(f => !EXCLUDE.some(ext => f.name.toUpperCase().endsWith(ext)))
    if (files.length === 0) {
      logMsg('✗ 文件夹里没有找到数据库文件（排除了 .TXT/.XLS/.XLSX 报告）', 'error'); return
    }

    try {
      logMsg(`📁 发现 ${files.length} 个数据库相关文件，开始 GBK 解码...`)
      const decoded = []
      for (const f of files) {
        const buf = await f.arrayBuffer()
        const text = await decodeGBK(buf)
        decoded.push({ name: f.name, text })
      }
      logMsg(`✓ 全部 GBK 解码完成`)

      const stemMap = listAllStems(decoded)
      logMsg(`📋 结构名清单: ${Object.entries(stemMap).map(([k,v]) => `${k}×${v}`).join(' ')}`)

      if (!isHuNingFJFileList(decoded)) {
        logMsg('⚠️ 未检测到 DK + DCSJ 核心文件，不是华宁数据库', 'error')
        return
      }

      const result = parseHuNingFJ(decoded)
      setMode('huning')
      setParsed(result)
      const totalHammer = result.boreholes.reduce((s, b) => s + (b.hammerTests?.length || 0), 0)
      const totalSoil = result.boreholes.reduce((s, b) => s + (b.soilTests?.length || 0), 0)
      const totalLayers = result.boreholes.reduce((s, b) => s + (b.layers?.length || 0), 0)
      logMsg(`✓ 华宁数据库解析成功！${result.boreholes.length} 孔 · ${totalLayers} 层 · ${totalHammer} 标贯 · ${totalSoil} 土工试验`, 'success')
    } catch (err) {
      logMsg(`✗ 解析失败：${err.message}`, 'error')
      console.error(err)
    }
    e.target.value = ''
  }

  // ============== 华宁 → 落库 ==============
  async function commitHuNingImport() {
    if (!parsed) return

    let projectId
    if (targetProject === 'new') {
      const name = newProjectName || parsed.project?.name || '华宁数据库导入工程'
      const p = await createProject({
        name, location: parsed.project?.location || '',
        groundElev: null, notes: `华宁数据库导入 · ${new Date().toLocaleString()}`
      })
      projectId = p.id
      logMsg(`✓ 新建项目：${name}`, 'success')
    } else {
      projectId = targetProject
      logMsg(`→ 合并到现有项目：${projects.find(p => p.id === projectId)?.name}`, 'info')
    }

    for (const b of parsed.boreholes) {
      const bid = genId()
      const depth = b.depth ?? Math.max(...(b.layers?.map(l => l.bottomDepth || 0) || [0]))

      // 1. 钻孔基本信息（华宁 coordX/coordY 是工程坐标，同时复制到 lng/lat 供平面图相对变换使用）
      await createBorehole({
        id: bid, projectId,
        boreholeNo: b.boreholeNo,
        designDepth: depth || 0,
        groundElev: b.groundElev ?? 0,
        waterLevelFirst: b.waterLevelFirst ?? null,
        waterLevelStable: b.waterLevelStable ?? null,
        coordE: b.coordX, coordN: b.coordY,
        coordX: b.coordX, coordY: b.coordY,
        lng: b.coordX, lat: b.coordY,       // 平面图用（相对变换不关心实际单位）
        boreholeType: b.hammerTests?.length > 0 ? '标贯孔' : '取土孔',
      })

      // 2. 内业分层（华宁 DCSJ 直接就是分层结果）
      if (b.layers?.length > 0) {
        await upsertLayers(bid, b.layers.map(l => ({
          topDepth: l.topDepth, bottomDepth: l.bottomDepth, thickness: l.thickness,
          soilName: l.soilName, description: l.description,
        })))
      }

      // 3. 外业回次（把华宁分层映射成回次）
      if (b.layers?.length > 0) {
        for (let i = 0; i < b.layers.length; i++) {
          const l = b.layers[i]
          const hammerHere = b.hammerTests?.find(h =>
            h.depth != null && l.topDepth != null && h.depth >= l.topDepth && h.depth < l.bottomDepth
          )
          await createRecord({
            boreholeId: bid, roundNo: i + 1,
            startDepth: l.topDepth, endDepth: l.bottomDepth,
            soilName: l.soilName, color: '灰',
            state: '', moisture: '稍湿',
            description: l.description || '',
            hammerN: hammerHere?.n63_5 ?? null,
            hammerRod: hammerHere?.rodLength ?? null,
            isRock: (l.soilName || '').includes('岩'),
            samples: [],
          })
        }
      }

      const hCount = b.hammerTests?.length || 0
      const sCount = b.soilTests?.length || 0
      logMsg(`  ✓ ${b.boreholeNo}：${b.layers?.length || 0} 层 · ${hCount} 标贯 · ${sCount} 土工`, 'success')
    }

    logMsg(`🎉 华宁导入完成！共 ${parsed.boreholes.length} 个钻孔`, 'success')
    onRefresh?.()
  }

  // ============== 理正接口 → 落库 ==============
  async function commitLizhengImport() {
    if (!parsed) return
    const gid = genId()

    // 1. 新建或取现有项目
    let projectId
    if (targetProject === 'new') {
      const name = newProjectName || parsed.project?.name || '从理正接口导入'
      const p = await createProject({
        name,
        location: parsed.project?.location || '',
        groundElev: parsed.project?.groundElev ?? 0,
        notes: `理正接口导入 · ${new Date().toLocaleString()}`
      })
      projectId = p.id
      logMsg(`✓ 新建项目：${name}`, 'success')
    } else {
      projectId = targetProject
      logMsg(`→ 合并到现有项目：${projects.find(p => p.id === projectId)?.name}`, 'info')
    }

    // 2. 逐个钻孔创建 + 写回次 / 地层 / CPT
    const boreholeIdMap = {}  // zkNo → 新 boreholeId

    for (const b of parsed.boreholes) {
      const bid = genId()
      boreholeIdMap[b.boreholeNo] = bid
      const depth = b.depth ?? b.layers?.length ? Math.max(...b.layers.map(l => l.bottomDepth || 0)) : 0

      // 写钻孔
      await createBorehole({
        id: bid,
        projectId,
        boreholeNo: b.boreholeNo,
        designDepth: depth || 0,
        groundElev: b.groundElev ?? 0,
        waterLevelFirst: b.waterElev ?? null,
        coordE: b.lng,
        coordN: b.lat,
        lng: b.lng,
        lat: b.lat,
        boreholeType: b.holeType || '钻孔',
      })

      // 写回次（外业记录）：把地层表 #TC# 映射为回次
      if (b.layers?.length > 0) {
        let prev = 0
        for (let i = 0; i < b.layers.length; i++) {
          const l = b.layers[i]
          await createRecord({
            boreholeId: bid,
            roundNo: i + 1,
            startDepth: l.topDepth ?? prev,
            endDepth: l.bottomDepth,
            soilName: l.soilName,
            color: l.color || '灰',
            state: l.state || '',
            moisture: l.moisture || '稍湿',
            description: l.description || '',
            hammerN: b.hammer?.filter(h => Math.abs(h.depth - l.bottomDepth) < 0.05)?.[0]?.n63_5 ?? null,
            hammerRod: b.hammer?.filter(h => Math.abs(h.depth - l.bottomDepth) < 0.05)?.[0]?.rodLen ?? null,
            isRock: (l.soilName || '').includes('岩'),
            samples: [],
          })
          prev = l.bottomDepth
        }
      }

      // 直接用地层数据写 layers store（跳过自动分层，理正的 TC 表本身就是分层结果）
      if (b.layers?.length > 0) {
        await upsertLayers(bid, b.layers)
      }

      // 写 CPT 数据
      if (b.cpt?.length > 0) {
        await upsertCPTPoints(bid, b.cpt.map(p => ({
          depth: p.depth, qc: p.qc, fs: p.fs, type: p.type
        })))
      }

      logMsg(`  ✓ ${b.boreholeNo}：${b.layers?.length || 0} 层 · ${b.cpt?.length || 0} 个 CPT 点`, 'success')
    }

    setProjectIdMap(boreholeIdMap)
    logMsg(`🎉 导入完成！共 ${parsed.boreholes.length} 个钻孔`, 'success')
    onRefresh?.()
  }

  // ============== 静态导入（CPT 原始 txt/xlsx）= 在选项目卡中执行 ==============
  async function commitStaticCPT() {
    // 单个钻孔的 CPT 点落库到所选 borehole（通过项目选中后手动指定）
    alert('CPT 原始数据请选"理正接口完整导入"或在钻孔详情页内手动上传。\n后续会在 BoreholeDetail 增加 CPT 导入入口。')
  }

  // ============== 华宁 xlsx 解析（简化版） ==============
  async function importHuNingXlsx(wb) {
    // 尝试匹配常见 Sheet 名
    const sheetNames = wb.SheetNames
    const boreholeSheet = sheetNames.find(n => /钻(孔|探点)/.test(n)) || sheetNames[0]
    const layersSheet = sheetNames.find(n => /(地层|土层|分层)/.test(n))
    const cptSheet = sheetNames.find(n => /(静探|CPT|静力触探)/.test(n))

    const boreholes = []
    const data = XLSX.utils.sheet_to_json(wb.Sheets[boreholeSheet], { defval: '' })

    // 字段名模糊匹配（华宁 xlsx 表头各版本有差异）
    const BOREHOLE_NO_KEYS = ['钻孔编号', '孔号', '勘探点编号', '编号', 'ZK']
    const DEPTH_KEYS = ['孔深', '设计孔深', '深度']
    const ELEV_KEYS = ['孔口标高', '孔口高程', '孔口']
    const X_KEYS = ['X坐标', 'X', '东', '经度']
    const Y_KEYS = ['Y坐标', 'Y', '北', '纬度']

    function getVal(row, candidates) {
      for (const k of candidates) {
        if (row[k] !== undefined && row[k] !== '') return row[k]
        // 模糊
        const key = Object.keys(row).find(kk => kk.includes(k))
        if (key && row[key] !== undefined && row[key] !== '') return row[key]
      }
      return null
    }

    for (const row of data) {
      const no = getVal(row, BOREHOLE_NO_KEYS)
      if (!no || String(no).toLowerCase() === '钻孔编号') continue
      boreholes.push({
        boreholeNo: String(no),
        depth: +(getVal(row, DEPTH_KEYS) || 0),
        groundElev: +(getVal(row, ELEV_KEYS) || 0),
        lng: +(getVal(row, X_KEYS) || 0),
        lat: +(getVal(row, Y_KEYS) || 0),
        holeType: '钻孔',
        layers: [], cpt: [], hammer: [], samples: []
      })
    }

    // 地层 Sheet（按钻孔号 + 顶深/底深）
    if (layersSheet) {
      const ldata = XLSX.utils.sheet_to_json(wb.Sheets[layersSheet], { defval: '' })
      const NO_KEYS = ['钻孔编号', '孔号', '编号']
      const TOP_KEYS = ['顶深', '起始深度', '层顶', '层顶深度']
      const BOT_KEYS = ['底深', '终止深度', '层底', '层底深度']
      const NAME_KEYS = ['岩土名称', '分层名称', '名称']
      for (const row of ldata) {
        const no = String(getVal(row, NO_KEYS) || '')
        const hole = boreholes.find(b => b.boreholeNo === no)
        if (!hole) continue
        hole.layers.push({
          topDepth: +(getVal(row, TOP_KEYS) || 0),
          bottomDepth: +(getVal(row, BOT_KEYS) || 0),
          soilName: getVal(row, NAME_KEYS) || '',
          state: '', moisture: '稍湿', color: '', description: ''
        })
      }
    }

    return { project: { name: '华宁 XLSX 导入' }, boreholes }
  }

  // ============== 渲染 ==============
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-800 mb-4">📥 数据导入</h2>

      {/* 文件选择 */}
      <div className="card mb-4">
        <h3 className="font-bold text-slate-700 mb-2">选择导入源</h3>
        <div className="text-sm text-slate-500 mb-3">
          支持：
          <span className="mx-1 px-2 py-0.5 bg-green-100 text-green-700 rounded">理正 .txt</span>
          <span className="mx-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded">华宁 XLSX</span>
          <span className="mx-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded font-semibold">华宁数据库 🆕</span>
          <span className="mx-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded">CPT 原始</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => fileInputRef.current?.click()} className="btn-primary">📂 选择文件</button>
          <button onClick={() => folderInputRef.current?.click()}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded-md font-semibold shadow-sm">
            📁 选择华宁数据库文件夹
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls" hidden onChange={handleFile} />
        <input ref={folderInputRef} type="file" // webkitdirectory 允许选整个文件夹
               /* @ts-ignore */ webkitdirectory="" directory="" multiple hidden
               onChange={handleHuNingFolder} />
        <div className="text-xs text-slate-400 mt-2">
          💡 选文件夹后浏览器会列出里面所有文件，代码自动识别核心结构名（DK/DCSJ/ZN/BGT/TGSJ）
        </div>
      </div>

      {/* 预览 + 目标项目选择 */}
      {parsed && (
        <div className="card mb-4">
          <h3 className="font-bold text-slate-700 mb-3">
            📊 解析结果预览
            {mode === 'lizheng' && <span className="ml-2 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">理正接口</span>}
            {mode === 'huning' && <span className="ml-2 text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded">华宁数据库</span>}
            {mode === 'cpt' && <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">CPT 原始</span>}
          </h3>

          {parsed.boreholes && (
            <>
              <table className="w-full text-sm mb-3">
                <thead className="text-xs text-slate-500 border-b">
                  <tr>
                    <th className="text-left py-1">钻孔编号</th>
                    <th className="text-right py-1">孔深(m)</th>
                    <th className="text-right py-1">孔口标高</th>
                    <th className="text-right py-1">{'coordX' in parsed.boreholes[0] ? '工程X' : 'X'}</th>
                    <th className="text-right py-1">{'coordY' in parsed.boreholes[0] ? '工程Y' : 'Y'}</th>
                    <th className="text-right py-1">地层</th>
                    <th className="text-right py-1">标贯</th>
                    <th className="text-right py-1">土工试验</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.boreholes.map(b => (
                    <tr key={b.boreholeNo} className="border-b border-slate-100">
                      <td className="py-1 font-semibold">{b.boreholeNo}</td>
                      <td className="text-right">{b.depth?.toFixed(2) || '—'}</td>
                      <td className="text-right">{b.groundElev?.toFixed(2) || '—'}</td>
                      <td className="text-right">
                        {(b.coordX ?? b.lng)?.toFixed(2) || '—'}
                      </td>
                      <td className="text-right">
                        {(b.coordY ?? b.lat)?.toFixed(2) || '—'}
                      </td>
                      <td className="text-right">{b.layers?.length || 0}</td>
                      <td className="text-right">{(b.hammerTests ?? b.hammer)?.length || 0}</td>
                      <td className="text-right">{(b.soilTests ?? b.samples)?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 目标项目选择 */}
              <div className="border-t border-slate-200 pt-3">
                <label className="font-bold text-sm text-slate-700">导入到：</label>
                <div className="flex flex-wrap gap-3 mt-2 items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={targetProject === 'new'} onChange={() => setTargetProject('new')} />
                    🆕 新建项目
                  </label>
                  <input disabled={targetProject !== 'new'}
                         placeholder="新项目名"
                         value={newProjectName}
                         onChange={e => setNewProjectName(e.target.value)}
                         className={`input-field text-sm w-48 ${targetProject !== 'new' ? 'opacity-50' : ''}`} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={targetProject !== 'new'} onChange={() => setTargetProject(projects[0]?.id || '')} />
                    🔗 合并到现有项目
                  </label>
                  <select disabled={targetProject === 'new'}
                          value={targetProject === 'new' ? '' : targetProject}
                          onChange={e => setTargetProject(e.target.value)}
                          className={`input-field text-sm ${targetProject === 'new' ? 'opacity-50' : ''}`}>
                    <option value="">— 选项目 —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="mt-4">
                  <button onClick={mode === 'huning' ? commitHuNingImport : commitLizhengImport} className="btn-primary">
                    🚀 确认导入 ({parsed.boreholes.length} 个钻孔)
                  </button>
                </div>
              </div>
            </>
          )}

          {parsed.cptPoints && (
            <>
              <div className="text-sm text-slate-600 mb-3">
                发现 <span className="font-bold text-amber-700">{parsed.cptPoints.length}</span> 个 CPT 数据点
                （深度 {parsed.cptPoints[0]?.depth?.toFixed(2)} ~ {parsed.cptPoints[parsed.cptPoints.length-1]?.depth?.toFixed(2)} m）
              </div>
              <div className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded p-3">
                💡 纯 CPT 原始数据暂不支持单独导入（因为不知道归属哪个钻孔）。<br/>
                请使用「理正接口完整导入」把 CPT 数据和钻孔关联一起导入，或在钻孔详情页内手动上传。
              </div>
            </>
          )}
        </div>
      )}

      {/* 日志 */}
      {log.length > 0 && (
        <div className="card bg-slate-900 text-green-400 font-mono text-xs max-h-64 overflow-auto">
          <div className="text-slate-400 mb-2">🔧 操作日志</div>
          {log.map((l, i) => (
            <div key={i} className={l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-green-400' : 'text-slate-300'}>
              {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
