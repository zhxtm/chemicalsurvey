// 剖面图 —— Canvas 多孔柱状拼接
// 核心：按剖线顺序排列钻孔，孔口标高对齐，地层颜色沿深度自然延续
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  listBoreholes, listSectionLines, listLayers, listRecords
} from '../db.js'

// 岩性颜色方案（与 BoreholeProfile 保持一致）
const LITH_COLORS = {
  '粘土': '#8B4513', '粉质粘土': '#A0522D', '淤泥质土': '#556B2F', '泥炭': '#3E2723',
  '粉土': '#DAA520', '砾砂': '#C9A55C', '粗砂': '#D4A574', '中砂': '#E4C69A',
  '细砂': '#EDD7B3', '粉砂': '#F4E4C1', '块石': '#555555', '碎石': '#708090',
  '圆砾': '#8FBC8F', '角砾': '#8FBC8F', '湿陷性黄土': '#F5DEB3', '膨胀土': '#DEB887',
  '红黏土': '#CD5C5C', '红土': '#BC8F8F', '素填土': '#C8C8C8', '杂填土': '#9C9C9C',
  '开山土石': '#696969', '残积土': '#BCA882', '坡积土': '#9C8866',
  '全风化岩': '#B0B0B0', '强风化岩': '#909090', '中风化岩': '#606060', '微风化岩': '#3C3C3C',
  '其它（手动录入）': '#CCCCCC',
}
function lithColor(name) { return LITH_COLORS[name] || '#D0D0D0' }

export default function ProfilePage({ projectId, onBack }) {
  const [lines, setLines] = useState([])
  const [boreholes, setBoreholes] = useState([])
  const [selectedLineId, setSelectedLineId] = useState(null)
  const canvasRef = useRef(null)
  const [vScale, setVScale] = useState(30)   // 垂直：像素/米
  const [hScale, setHScale] = useState(20)   // 水平：孔间距 1m = 20px
  const [showTerrain, setShowTerrain] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [holeData, setHoleData] = useState([])   // [{borehole, layers}]

  useEffect(() => { load() }, [projectId])

  async function load() {
    const ls = await listSectionLines(projectId)
    const bs = await listBoreholes(projectId)
    setLines(ls)
    setBoreholes(bs)
    if (ls.length > 0 && !selectedLineId) setSelectedLineId(ls[0].id)
  }

  const selectedLine = lines.find(l => l.id === selectedLineId)
  const lineBoreholes = useMemo(() => {
    if (!selectedLine) return []
    return selectedLine.boreholeNos
      .map(no => boreholes.find(b => b.boreholeNo === no))
      .filter(Boolean)
  }, [selectedLine, boreholes])

  // 异步加载每个孔的分层数据（useMemo 不能 async，改为 useState + useEffect）
  useEffect(() => {
    let cancelled = false
    async function fetchLayers() {
      const result = []
      for (const b of lineBoreholes) {
        let layers = await listLayers(b.id)
        if (layers.length === 0) {
          const records = await listRecords(b.id)
          layers = stratifyRecords(records)
        }
        result.push({ borehole: b, layers })
      }
      if (!cancelled) setHoleData(result)
    }
    fetchLayers()
    return () => { cancelled = true }
  }, [lineBoreholes])

  // 孔间距计算
  const spacings = useMemo(() => {
    if (!selectedLine || lineBoreholes.length < 2) return []
    if (selectedLine.spacings?.length >= lineBoreholes.length - 1) {
      return selectedLine.spacings.slice(0, lineBoreholes.length - 1).map(Number)
    }
    // 自动检测坐标量纲：看坐标**绝对值**，经纬度 |lng|≤180/|lat|≤90，工程坐标（米）通常 > 1000
    const allX = lineBoreholes.map(b => b.lng || 0)
    const allY = lineBoreholes.map(b => b.lat || 0)
    const maxAbsCoord = Math.max(...allX.map(Math.abs), ...allY.map(Math.abs))
    const isProjectCoord = maxAbsCoord > 500   // 经纬度绝对不会超过 180，过 500 就是米级工程坐标
    // 按 X/Y 坐标自动计算（勾股距离）
    const result = []
    for (let i = 1; i < lineBoreholes.length; i++) {
      const a = lineBoreholes[i - 1]
      const b = lineBoreholes[i]
      const dx = (b.lng || 0) - (a.lng || 0)
      const dy = (b.lat || 0) - (a.lat || 0)
      let dxM, dyM
      if (isProjectCoord) {
        dxM = dx; dyM = dy
      } else {
        const latMid = ((a.lat || 0) + (b.lat || 0)) / 2 * Math.PI / 180
        const mPerDegX = 111320 * Math.cos(latMid)
        dxM = dx * mPerDegX
        dyM = dy * 111320
      }
      result.push(Math.sqrt(dxM * dxM + dyM * dyM))
    }
    return result
  }, [selectedLine, lineBoreholes])

  // ====== 绘制 ======
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !selectedLine || lineBoreholes.length === 0) return
    const ctx = canvas.getContext('2d')

    const hd = holeData
    if (hd.length === 0) return

    const PAD_LEFT = 80
    const PAD_RIGHT = 120
    const PAD_TOP = 60
    const PAD_BOT = 80

    // 画布尺寸
    const totalH = Math.max(...hd.map(h => h.layers.length > 0 ? Math.max(...h.layers.map(l => l.bottomDepth || 0)) : 0), 10) + 2
    const maxDepth = Math.max(...hd.map(h => h.borehole.designDepth || totalH), totalH)

    // 孔口标高处理：取平均值作为"0 深度"基准
    const groundElevs = hd.map(h => h.borehole.groundElev ?? 0)
    const elevAvg = groundElevs.reduce((a, b) => a + b, 0) / groundElevs.length

    // 垂直基准：所有孔相对 elevAvg 向下量
    const V_BASE = PAD_TOP + (elevAvg - Math.min(...groundElevs)) * vScale  // 地形线最高处

    // 水平：计算孔中心 X 坐标
    const holeCenters = [] // [x, borehole, groundOffsetY]
    let cx = PAD_LEFT
    for (let i = 0; i < hd.length; i++) {
      const spacingM = spacings[i - 1] || 0
      cx += spacingM * hScale
      const groundOffset = groundElevs[i] - elevAvg  // 正 = 地形线下，负 = 上
      holeCenters.push({ x: cx, hd: hd[i], groundOffset })
    }
    // 总宽
    const W = cx + PAD_RIGHT
    // 总高
    const H = V_BASE + maxDepth * vScale + PAD_BOT

    canvas.width = Math.max(W, 600)
    canvas.height = Math.max(H, 400)

    // 背景
    ctx.fillStyle = '#FAFAFA'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 深度刻度（左侧）
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'
    ctx.strokeStyle = '#DDD'; ctx.lineWidth = 1
    for (let d = 0; d <= maxDepth + 0.01; d += 5) {
      const y = V_BASE + d * vScale
      ctx.beginPath()
      ctx.moveTo(PAD_LEFT - 4, y); ctx.lineTo(PAD_LEFT, y); ctx.stroke()
      ctx.fillText(d.toFixed(0) + 'm', 8, y + 4)
      ctx.strokeStyle = '#EEE'
      ctx.beginPath()
      ctx.moveTo(PAD_LEFT, y); ctx.lineTo(canvas.width - PAD_RIGHT, y); ctx.stroke()
      ctx.strokeStyle = '#DDD'
    }
    // 1m 小刻度
    for (let d = 0; d <= maxDepth + 0.01; d += 1) {
      if (d % 5 === 0) continue
      const y = V_BASE + d * vScale
      ctx.beginPath()
      ctx.moveTo(PAD_LEFT - 2, y); ctx.lineTo(PAD_LEFT, y); ctx.stroke()
    }

    // ============ 地形线 ============
    if (showTerrain && groundElevs.some(e => e != null)) {
      ctx.strokeStyle = '#B91C1C'; ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      let first = true
      for (const hc of holeCenters) {
        const y = V_BASE - hc.groundOffset * vScale
        if (first) { ctx.moveTo(hc.x - 40, y); first = false }
        ctx.lineTo(hc.x, y)
      }
      ctx.lineTo(holeCenters[holeCenters.length - 1].x + 40,
                 V_BASE - holeCenters[holeCenters.length - 1].groundOffset * vScale)
      ctx.stroke()
      ctx.setLineDash([])
      // 地形线标注
      ctx.fillStyle = '#B91C1C'; ctx.font = '11px sans-serif'
      ctx.fillText('▬▬ 地形线（孔口标高连线）', PAD_LEFT, V_BASE - 20)
    }

    // ============ 钻孔柱状 ============
    const COL_W = 80  // 每个钻孔的柱状宽度

    for (const hc of holeCenters) {
      const colL = hc.x - COL_W / 2
      const groundY = V_BASE - hc.groundOffset * vScale

      // 钻孔轴线（地形线以下）
      ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(colL, groundY); ctx.lineTo(colL, H - PAD_BOT); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(colL + COL_W, groundY); ctx.lineTo(colL + COL_W, H - PAD_BOT); ctx.stroke()

      // 按分层绘制
      for (let i = 0; i < hc.hd.layers.length; i++) {
        const l = hc.hd.layers[i]
        const y1 = groundY + l.topDepth * vScale
        const y2 = groundY + l.bottomDepth * vScale
        const h = Math.max(2, y2 - y1)

        // 填色
        ctx.fillStyle = lithColor(l.soilName)
        ctx.fillRect(colL, y1, COL_W, h)

        // 层界线（顶）
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(colL, y1); ctx.lineTo(colL + COL_W, y1); ctx.stroke()

        // 柱内层号
        if (h > 18 && showLabels) {
          ctx.fillStyle = colorContrast(lithColor(l.soilName))
          ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'
          ctx.fillText(layerLabel(l, i + 1), hc.x, y1 + h / 2 + 4)
          ctx.textAlign = 'start'
        }
      }
      // 钻孔底
      const bottomDepth = hc.hd.borehole.designDepth || (hc.hd.layers.length > 0 ? Math.max(...hc.hd.layers.map(l => l.bottomDepth)) : 0)
      const yBot = groundY + bottomDepth * vScale
      ctx.strokeStyle = '#C00'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(colL, yBot); ctx.lineTo(colL + COL_W, yBot); ctx.stroke()

      // 孔号标注（柱下方）
      ctx.fillStyle = '#1E40AF'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(hc.hd.borehole.boreholeNo, hc.x, groundY - 10)
      if (hc.hd.borehole.groundElev != null) {
        ctx.fillStyle = '#64748B'; ctx.font = '10px sans-serif'
        ctx.fillText(`孔口 ${hc.hd.borehole.groundElev.toFixed(2)}m`, hc.x, groundY - 25)
      }
      ctx.textAlign = 'start'
    }

    // ============ 标题 + 比例尺 ============
    ctx.fillStyle = '#166534'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`剖面柱状图 · ${selectedLine.lineNo || '未命名'}`, canvas.width / 2, 30)
    ctx.textAlign = 'start'

    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`垂直比例尺 1:${Math.round(vScale)} px/m · 水平 1:${hScale} px/m`, canvas.width - 10, canvas.height - 10)
    ctx.textAlign = 'start'

    // 剖线孔位顺序
    ctx.fillStyle = '#475569'; ctx.font = '13px sans-serif'
    ctx.fillText('孔序：' + lineBoreholes.map(b => b.boreholeNo).join(' → '), PAD_LEFT + 10, PAD_TOP - 20)
    if (selectedLine.azimuth) {
      ctx.fillText(`方位角 ${selectedLine.azimuth}°`, canvas.width - 150, PAD_TOP - 20)
    }
  }, [selectedLine, holeData, spacings, vScale, hScale, showTerrain, showLabels, lineBoreholes])

  useEffect(() => { draw() }, [draw])

  function exportPNG() {
    const canvas = canvasRef.current
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url; a.download = `剖面柱状图_${selectedLine?.lineNo || '未命名'}.png`; a.click()
  }

  // ====== UI ======
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-green-600">← 返回</button>
        <h2 className="text-xl font-bold text-slate-800">📐 剖面柱状图</h2>
        <div className="flex gap-2">
          <button onClick={exportPNG} className="btn-primary text-sm">📷 导出 PNG</button>
        </div>
      </div>

      {/* 剖线选择 + 比例尺 */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <label className="text-sm text-slate-600 mr-2">剖线：</label>
            <select value={selectedLineId || ''} onChange={e => setSelectedLineId(e.target.value)}
                    className="input-field text-sm w-40">
              {lines.length === 0 && <option value="">— 暂无剖线，请先到平面图添加 —</option>}
              {lines.map(l => (
                <option key={l.id} value={l.id}>
                  {l.lineNo || '未命名'} · {l.boreholeNos?.length || 0}孔 · {(l.boreholeNos || []).join(' → ')}
                </option>
              ))}
            </select>
          </div>
          <div className="border-l border-slate-200 pl-3">
            <label className="text-sm text-slate-600 mr-2">垂直 px/m：</label>
            <input type="number" value={vScale} onChange={e => setVScale(+e.target.value || 30)}
                   className="input-field text-sm w-20" />
          </div>
          <div>
            <label className="text-sm text-slate-600 mr-2">水平 px/m：</label>
            <input type="number" value={hScale} onChange={e => setHScale(+e.target.value || 20)}
                   className="input-field text-sm w-20" />
          </div>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={showTerrain} onChange={e => setShowTerrain(e.target.checked)} />
            地形线
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
            层号
          </label>
        </div>
      </div>

      {/* 画布 */}
      <div className="card p-3 overflow-auto">
        {lineBoreholes.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            请在平面图中先添加剖线，并确保剖线上的钻孔已录入坐标
          </div>
        ) : (
          <canvas ref={canvasRef} className="bg-white border border-slate-300 rounded shadow" />
        )}
      </div>
    </div>
  )
}

// ============ 辅助 ============
function layerLabel(layer, idx) {
  const name = layer.soilName || `层${idx}`
  // 简化：只保留前 4 字
  const short = name.length > 4 ? name.slice(0, 4) : name
  return short
}

// 颜色对比度（用于文字填充）
function colorContrast(hex) {
  const c = hex.replace('#', '')
  const r = parseInt(c.substr(0, 2), 16)
  const g = parseInt(c.substr(2, 2), 16)
  const b = parseInt(c.substr(4, 2), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 140 ? '#222' : '#FFF'
}

// 简化的 stratifyRecords（避免循环依赖，与 stratify.js 里逻辑相同）
function stratifyRecords(records) {
  if (!records || records.length === 0) return []
  const sorted = [...records].sort((a, b) => (a.startDepth ?? 0) - (b.startDepth ?? 0))
  const layers = []
  let cur = null
  for (const r of sorted) {
    const top = r.startDepth ?? 0
    const bot = r.endDepth ?? top
    if (bot <= top + 0.001) continue
    const key = [(r.soilName || '').trim(), (r.state || '').trim(), (r.moisture || '').trim(), (r.color || '').trim()].join('|')
    if (!cur) {
      cur = { topDepth: top, bottomDepth: bot, soilName: r.soilName || '', state: r.state || '', moisture: r.moisture || '', color: r.color || '', description: r.description || '' }
      continue
    }
    const sameKey = key === [cur.soilName, cur.state, cur.moisture, cur.color].join('|')
    const continuous = Math.abs(top - cur.bottomDepth) < 0.01
    if (sameKey && continuous) {
      cur.bottomDepth = Math.max(cur.bottomDepth, bot)
      if (r.description && !cur.description.includes(r.description)) cur.description = (cur.description + '；' + r.description).replace(/^；/, '')
    } else {
      layers.push({ ...cur, thickness: Math.max(0, cur.bottomDepth - cur.topDepth) })
      cur = { topDepth: top, bottomDepth: bot, soilName: r.soilName || '', state: r.state || '', moisture: r.moisture || '', color: r.color || '', description: r.description || '' }
    }
  }
  if (cur) layers.push({ ...cur, thickness: Math.max(0, cur.bottomDepth - cur.topDepth) })
  return layers
}
