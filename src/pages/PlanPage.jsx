// 勘察平面图 —— SVG 渲染钻孔点位 + 剖线 + 坐标 + 比例尺 + 导出 PNG
// 坐标变换：X/Y → SVG 画布，自动缩放适配
import { useState, useEffect, useRef, useMemo } from 'react'
import { listBoreholes, listSectionLines, createSectionLine, updateSectionLine, deleteSectionLine, listLayers } from '../db.js'
import { soilColor } from '../stratify.js'

const W = 900   // 画布宽
const H = 600   // 画布高
const PAD = 80  // 边距

export default function PlanPage({ projectId, onBack }) {
  const [boreholes, setBoreholes] = useState([])
  const [lines, setLines] = useState([])
  const [scale, setScale] = useState(1)        // 画布缩放
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const svgRef = useRef(null)

  // 兜底：旧版导入数据可能只有 coordX/coordY 没有 lng/lat
  const getLng = (b) => b.lng ?? b.coordX
  const getLat = (b) => b.lat ?? b.coordY

  useEffect(() => { load() }, [projectId])

  async function load() {
    const bs = await listBoreholes(projectId)
    const ls = await listSectionLines(projectId)
    // 过滤掉无坐标的钻孔
    const validBs = bs.filter(b => {
      const lng = getLng(b), lat = getLat(b)
      return lng != null && lat != null && lng !== 0 && lat !== 0
    })
    setBoreholes(validBs)
    setLines(ls)
  }

  // 坐标变换：真实 (lng, lat) → SVG (x, y)
  // 自动检测坐标量纲：
  //   若 X 范围 > 1000 → 工程坐标（单位已是米），直接用
  //   若 X 范围 < 1   → 经纬度，需换算成米
  const transform = useMemo(() => {
    if (boreholes.length === 0) return null
    const xs = boreholes.map(b => getLng(b))
    const ys = boreholes.map(b => getLat(b))
    let minX = Math.min(...xs), maxX = Math.max(...xs)
    let minY = Math.min(...ys), maxY = Math.max(...ys)
    if (maxX - minX < 0.001) { maxX = minX + 0.01 }
    if (maxY - minY < 0.001) { maxY = minY + 0.01 }
    const xRange = maxX - minX
    const yRange = maxY - minY

    // 判断量纲：看坐标**绝对值**，经纬度 |lng|≤180/|lat|≤90，工程坐标（米）通常 > 1000
    const maxAbsCoord = Math.max(Math.abs(maxX), Math.abs(minX), Math.abs(maxY), Math.abs(minY))
    const isProjectCoord = maxAbsCoord > 500
    const latMid = (minY + maxY) / 2
    const mPerUnit = isProjectCoord
      ? 1                                    // 1 单位 = 1 米
      : 111320 * Math.cos(latMid * Math.PI / 180)  // 经纬度→米

    const sx = (W - 2 * PAD) / (xRange * mPerUnit)
    const sy = (H - 2 * PAD) / (yRange * mPerUnit)
    const s = Math.min(sx, sy)
    const ox = PAD + (W - 2 * PAD - (xRange * mPerUnit) * s) / 2
    const oy = PAD + (H - 2 * PAD - (yRange * mPerUnit) * s) / 2
    return { minX, minY, s, ox, oy, mPerUnit, isProjectCoord }
  }, [boreholes])

  function toXY(lng, lat) {
    if (!transform) return [W/2, H/2]
    const x = transform.ox + (lng - transform.minX) * transform.mPerUnit * transform.s
    const y = H - (transform.oy + (lat - transform.minY) * transform.mPerUnit * transform.s)
    return [x, y]
  }

  // 比例尺计算：transform.s 现在是 px/米（已经过 mPerUnit 换算）
  function scaleBarInfo() {
    if (!transform) return { label: '—', px: 0 }
    const pxPerMeter = transform.s
    const candidates = [10, 20, 50, 100, 200, 500, 1000, 2000]
    let pick = candidates[0]
    for (const c of candidates) {
      if (pxPerMeter * c >= 60) { pick = c; break }
    }
    return {
      label: `${pick} m${transform.isProjectCoord ? '（工程坐标）' : ''}`,
      px: pxPerMeter * pick,
    }
  }

  // 剖线钻孔坐标
  function getLineCoords(line) {
    return (line.boreholeNos || [])
      .map(no => boreholes.find(b => b.boreholeNo === no))
      .filter(Boolean)
      .map(b => ({ borehole: b, xy: toXY(getLng(b), getLat(b)) }))
  }

  // ====== 新增剖线 ======
  const [newLineNo, setNewLineNo] = useState('');
  const [selectedNos, setSelectedNos] = useState([])

  function toggleSelect(no) {
    setSelectedNos(nos => nos.includes(no) ? nos.filter(x => x !== no) : [...nos, no])
  }
  async function addNewLine() {
    if (selectedNos.length < 2) { alert('请至少选择 2 个钻孔连成剖线'); return }
    const no = newLineNo || `剖线${lines.length + 1}`
    await createSectionLine({
      projectId,
      lineNo: no,
      boreholeNos: selectedNos,
    })
    setNewLineNo('')
    setSelectedNos([])
    await load()
  }
  async function removeLine(id) {
    if (!confirm('删除此剖线？')) return
    await deleteSectionLine(id)
    await load()
  }

  // ====== 导出 PNG ======
  function exportPNG() {
    const svg = svgRef.current
    const svgStr = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, W, H)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(b)
        a.download = `钻孔平面图_${new Date().toISOString().slice(0, 10)}.png`
        a.click()
      })
    }
    img.src = url
  }

  // ====== 拖拽平移（rAF 节流，避免每帧多次 setState）======
  const rafRef = useRef(null)
  const pendingOffset = useRef(null)
  function onMouseDown(e) {
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, off: { ...offset } }
  }
  function onMouseMove(e) {
    if (!dragging || !dragStart.current) return
    pendingOffset.current = {
      x: dragStart.current.off.x + (e.clientX - dragStart.current.x),
      y: dragStart.current.off.y + (e.clientY - dragStart.current.y),
    }
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (pendingOffset.current) {
          setOffset(pendingOffset.current)
          pendingOffset.current = null
        }
      })
    }
  }
  function onMouseUp() {
    setDragging(false); dragStart.current = null
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }
  function onWheel(e) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(s => Math.max(0.3, Math.min(5, s * delta)))
  }

  // ====== 渲染 ======
  if (boreholes.length === 0) {
    return (
      <div>
        <button onClick={onBack} className="text-green-600 mb-4">← 返回</button>
        <div className="card text-center py-16">
          <div className="text-6xl mb-4">🗺️</div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">无法生成平面图</h3>
          <p className="text-slate-500">项目中没有已录入坐标的钻孔。<br/>请先在钻孔基础信息里填写坐标，或通过「📥 导入」从理正接口导入完整数据。</p>
        </div>
      </div>
    )
  }

  const sb = scaleBarInfo()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-green-600">← 返回</button>
        <h2 className="text-xl font-bold text-slate-800">🗺️ 钻孔平面图</h2>
        <div className="flex gap-2">
          <button onClick={() => { setScale(1); setOffset({x:0,y:0}) }} className="btn-secondary text-sm">🔄 复位</button>
          <button onClick={exportPNG} className="btn-primary text-sm">📷 导出 PNG</button>
        </div>
      </div>

      {/* 画布 */}
      <div className="card p-3 overflow-hidden">
        <div className="relative select-none"
             style={{ cursor: dragging ? 'grabbing' : 'grab' }}
             onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
             onWheel={onWheel}>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%"
               style={{ transform: `scale(${scale}) translate(${offset.x/scale}px, ${offset.y/scale}px)`, transformOrigin: 'center' }}>
            {/* 背景 + 边框 */}
            <rect x="0" y="0" width={W} height={H} fill="#fafafa" stroke="#cbd5e1" strokeWidth="2" />

            {/* 网格：最多 ~40 条线，按实际量纲自适应步长 */}
            {transform && (() => {
              // 自适应步长：让网格线间距在 20~60 px 之间
              const xPxRange = (W - 2 * PAD)
              const yPxRange = (H - 2 * PAD)
              const xStep = Math.max(20, Math.min(60, xPxRange / 40))   // px
              const yStep = Math.max(20, Math.min(60, yPxRange / 30))   // px
              // 换算回"原始坐标单位"（可能是米或度）
              const xStepRaw = xStep / (transform.mPerUnit * transform.s)
              const yStepRaw = yStep / (transform.mPerUnit * transform.s)
              // 对齐到步长
              const x0 = Math.ceil(transform.minX / xStepRaw) * xStepRaw
              const y0 = Math.ceil(transform.minY / yStepRaw) * yStepRaw
              const xs = []; const ys = []
              for (let gx = x0; gx <= transform.minX + xPxRange / (transform.mPerUnit * transform.s); gx += xStepRaw) {
                const [x] = toXY(gx, transform.minY); xs.push(x)
              }
              for (let gy = y0; gy <= transform.minY + yPxRange / (transform.mPerUnit * transform.s); gy += yStepRaw) {
                const [, y] = toXY(transform.minX, gy); ys.push(y)
              }
              return (
                <g>
                  {xs.map((x, i) => <line key={`gx${i}`} x1={x} y1={PAD} x2={x} y2={H-PAD} stroke="#e2e8f0" strokeDasharray="2 4" />)}
                  {ys.map((y, i) => <line key={`gy${i}`} x1={PAD} y1={y} x2={W-PAD} y2={y} stroke="#e2e8f0" strokeDasharray="2 4" />)}
                </g>
              )
            })()}

            {/* 剖线 */}
            {lines.map(line => {
              const coords = getLineCoords(line)
              if (coords.length < 2) return null
              const d = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.xy[0] + ' ' + c.xy[1]).join(' ')
              return (
                <g key={line.id}>
                  <path d={d} stroke="#ef4444" strokeWidth="2" fill="none" strokeDasharray="8 4" />
                  <circle cx={coords[0].xy[0]} cy={coords[0].xy[1]} r="5" fill="#ef4444" />
                  <circle cx={coords[coords.length-1].xy[0]} cy={coords[coords.length-1].xy[1]} r="5" fill="#ef4444" />
                  <text x={(coords[0].xy[0] + coords[coords.length-1].xy[0]) / 2}
                        y={(coords[0].xy[1] + coords[coords.length-1].xy[1]) / 2 - 10}
                        fill="#ef4444" fontSize="14" fontWeight="bold"
                        textAnchor="middle">{line.lineNo}</text>
                </g>
              )
            })}

            {/* 钻孔点位 */}
            {boreholes.map(b => {
              const [x, y] = toXY(getLng(b), getLat(b))
              return (
                <g key={b.id}>
                  <circle cx={x} cy={y} r="8" fill="white" stroke="#059669" strokeWidth="2" />
                  <circle cx={x} cy={y} r="3" fill="#059669" />
                  <text x={x + 12} y={y - 4} fontSize="13" fontWeight="bold" fill="#065f46">{b.boreholeNo}</text>
                  {b.groundElev != null && (
                    <text x={x + 12} y={y + 12} fontSize="11" fill="#475569">
                      ▼ {b.groundElev.toFixed(2)}m
                    </text>
                  )}
                </g>
              )
            })}

            {/* 比例尺 */}
            <g transform={`translate(${PAD}, ${H - 30})`}>
              <line x1="0" y1="0" x2={sb.px} y2="0" stroke="#0f172a" strokeWidth="2" />
              <line x1="0" y1="-4" x2="0" y2="4" stroke="#0f172a" strokeWidth="2" />
              <line x1={sb.px} y1="-4" x2={sb.px} y2="4" stroke="#0f172a" strokeWidth="2" />
              <text x={sb.px / 2} y="-8" fontSize="11" fill="#0f172a" textAnchor="middle">{sb.label}</text>
            </g>

            {/* 指南针 N */}
            <g transform={`translate(${W - 40}, ${PAD + 20})`}>
              <circle cx="0" cy="0" r="18" fill="white" stroke="#0f172a" strokeWidth="1" />
              <polygon points="0,-14 4,0 -4,0" fill="#ef4444" />
              <polygon points="0,14 4,0 -4,0" fill="#0f172a" />
              <text x="0" y="-20" fontSize="12" fill="#0f172a" textAnchor="middle" fontWeight="bold">N</text>
            </g>

            {/* 标题 */}
            <text x={W/2} y="30" fontSize="18" fontWeight="bold" fill="#0f172a" textAnchor="middle">钻孔平面布置图</text>
          </svg>
        </div>
        <div className="text-xs text-slate-500 mt-2">💡 滚轮缩放 · 拖动平移 · 点击下方钻孔勾选可添加剖线</div>
      </div>

      {/* 剖线管理 */}
      <div className="card mt-4">
        <h3 className="font-bold text-slate-700 mb-3">📐 剖线管理</h3>

        {lines.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-slate-500 mb-1">已有剖线：</div>
            <div className="space-y-1">
              {lines.map(line => (
                <div key={line.id} className="flex items-center gap-3 text-sm bg-slate-50 px-3 py-1 rounded">
                  <span className="font-bold text-red-600">{line.lineNo}</span>
                  <span className="text-slate-600">{line.boreholeNos?.length || 0} 孔</span>
                  <span className="text-slate-500">{(line.boreholeNos || []).join(' → ')}</span>
                  <button onClick={() => removeLine(line.id)} className="ml-auto text-red-500 text-xs">🗑️ 删除</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 pt-3">
          <div className="text-xs font-bold text-slate-600 mb-2">添加新剖线：</div>
          <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-6">
            {boreholes.map(b => (
              <label key={b.id} className={`flex items-center gap-1 text-sm px-2 py-1 rounded cursor-pointer border ${selectedNos.includes(b.boreholeNo) ? 'bg-green-100 border-green-400 text-green-800' : 'bg-white border-slate-200'}`}>
                <input type="checkbox" checked={selectedNos.includes(b.boreholeNo)} onChange={() => toggleSelect(b.boreholeNo)} />
                {b.boreholeNo}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2 items-center">
            <input placeholder="剖线编号（如 I-I'）" value={newLineNo}
                   onChange={e => setNewLineNo(e.target.value)}
                   className="input-field text-sm w-48" />
            <span className="text-xs text-slate-500">已选 {selectedNos.length} 个钻孔 · 按选择顺序连线</span>
            <button onClick={addNewLine} className="btn-primary text-sm ml-auto">＋ 新建剖线</button>
          </div>
        </div>
      </div>
    </div>
  )
}
