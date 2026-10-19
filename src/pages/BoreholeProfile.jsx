// 钻孔柱状图 Canvas 渲染组件
// 支持：深度刻度 / 岩层色块 / 鼠标点击加分层线 / 导出 PNG
import { useEffect, useRef, useState, useCallback } from 'react'

// 岩性颜色方案（参考国内勘察软件通用配色）
const LITH_COLORS = {
  // 粘性土
  '粘土': '#8B4513',
  '粉质粘土': '#A0522D',
  '粉质粘土与粉土互层': '#B8860B',
  '淤泥质土': '#556B2F',
  '泥炭': '#3E2723',
  // 粉土
  '粉土': '#DAA520',
  // 砂土
  '砾砂': '#C9A55C',
  '粗砂': '#D4A574',
  '中砂': '#E4C69A',
  '细砂': '#EDD7B3',
  '粉砂': '#F4E4C1',
  // 碎石
  '块石': '#555555',
  '碎石': '#708090',
  '圆砾': '#8FBC8F',
  '角砾': '#8FBC8F',
  // 特殊土
  '湿陷性黄土': '#F5DEB3',
  '膨胀土': '#DEB887',
  '红黏土': '#CD5C5C',
  '红土': '#BC8F8F',
  '盐渍土': '#E0FFFF',
  // 填土
  '素填土': '#C8C8C8',
  '杂填土': '#9C9C9C',
  '开山土石': '#696969',
  // 风化
  '残积土': '#BCA882',
  '坡积土': '#9C8866',
  '全风化岩': '#B0B0B0',
  '强风化岩': '#909090',
  '中风化岩': '#606060',
  '微风化岩': '#3C3C3C',
  '其它（手动录入）': '#CCCCCC',
}
function lithColor(name) { return LITH_COLORS[name] || '#D0D0D0' }

export default function BoreholeProfile({ borehole, records, onClose }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(40)     // 像素/米，默认 40
  const [splits, setSplits] = useState([])   // 用户点击添加的分层深度
  const [hoverInfo, setHoverInfo] = useState(null)
  const W = 720
  const PAD_LEFT = 70
  const PAD_RIGHT = 260
  const PAD_TOP = 40
  const PAD_BOT = 30

  const bottomDepth = records.length > 0 ? Math.max(...records.map(r => r.endDepth || 0)) : 0
  const totalDepth = Math.max(borehole.designDepth || 0, bottomDepth || 1)

  // 合并 records + 用户添加的分层线 → 最终分层
  const allBoundaries = (() => {
    const bs = new Set([0])
    records.forEach(r => { if (r.endDepth) bs.add(r.endDepth) })
    splits.forEach(s => bs.add(s))
    return Array.from(bs).sort((a, b) => a - b)
  })()

  // 给每个分层找岩性（上一回次的）
  function lithAt(depth) {
    // 优先用用户分层之间的 records 段
    for (const r of records) {
      if (depth >= (r.startDepth ?? 0) && depth <= (r.endDepth ?? 0) + 0.01) return r
    }
    // 用最近的下层回次
    let best = null
    let bestDist = Infinity
    for (const r of records) {
      if (r.startDepth <= depth) {
        const d = depth - r.startDepth
        if (d < bestDist) { bestDist = d; best = r }
      }
    }
    return best
  }

  // ============== 绘制 ==============
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const H = PAD_TOP + totalDepth * scale + PAD_BOT
    canvas.height = H
    canvas.width = W

    ctx.clearRect(0, 0, W, H)

    // 背景
    ctx.fillStyle = '#FAFAFA'
    ctx.fillRect(0, 0, W, H)

    // 深度刻度（左侧）
    ctx.fillStyle = '#333'
    ctx.font = '12px sans-serif'
    ctx.strokeStyle = '#DDD'
    ctx.lineWidth = 1
    for (let d = 0; d <= totalDepth + 0.01; d += 5) {
      const y = PAD_TOP + d * scale
      ctx.beginPath()
      ctx.moveTo(PAD_LEFT - 4, y); ctx.lineTo(PAD_LEFT, y); ctx.stroke()
      ctx.fillText(d.toFixed(0) + 'm', 8, y + 4)
      // 淡刻度线
      ctx.strokeStyle = '#EEE'
      ctx.beginPath(); ctx.moveTo(PAD_LEFT, y); ctx.lineTo(W - PAD_RIGHT, y); ctx.stroke()
      ctx.strokeStyle = '#DDD'
    }
    // 半米刻度
    for (let d = 0; d <= totalDepth + 0.01; d += 1) {
      if (d % 5 === 0) continue
      const y = PAD_TOP + d * scale
      ctx.beginPath()
      ctx.moveTo(PAD_LEFT - 2, y); ctx.lineTo(PAD_LEFT, y); ctx.stroke()
    }

    // 钻孔柱状（左：色带区，右：名称+描述）
    const COL_LEFT = PAD_LEFT + 20
    const COL_WIDTH = 120

    // 按 boundaries 绘制分层
    for (let i = 0; i < allBoundaries.length - 1; i++) {
      const top = allBoundaries[i]
      const bot = allBoundaries[i + 1]
      const y1 = PAD_TOP + top * scale
      const y2 = PAD_TOP + bot * scale
      const h = Math.max(2, y2 - y1)
      const rec = lithAt((top + bot) / 2)

      // 填色
      const color = rec ? lithColor(rec.soilName) : '#EEE'
      ctx.fillStyle = color
      ctx.fillRect(COL_LEFT, y1, COL_WIDTH, h)

      // 层界线
      ctx.strokeStyle = '#444'
      ctx.lineWidth = i === 0 || i === allBoundaries.length - 1 ? 2 : 1
      ctx.beginPath(); ctx.moveTo(PAD_LEFT, y1); ctx.lineTo(PAD_LEFT + COL_WIDTH, y1); ctx.stroke()

      // 层号标注在柱内
      if (h > 20) {
        ctx.fillStyle = colorContrast(color)
        ctx.font = 'bold 13px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(String(i + 1), COL_LEFT + COL_WIDTH / 2, y1 + h / 2 + 4)
        ctx.textAlign = 'start'
      }

      // 右侧：岩性名称 + 深度 + 描述
      const labelX = PAD_LEFT + COL_WIDTH + 12
      const midY = (y1 + y2) / 2

      // 岩性名称
      ctx.fillStyle = '#111'
      ctx.font = 'bold 14px sans-serif'
      const name = rec ? (rec.soilName + (rec.state ? ' (' + rec.state + ')' : '')) : '—'
      ctx.fillText(name, labelX, midY - 6)

      // 深度范围
      ctx.fillStyle = '#666'
      ctx.font = '12px sans-serif'
      ctx.fillText(`${top.toFixed(2)} ~ ${bot.toFixed(2)} m`, labelX, midY + 10)

      // 性状描述（截断）
      if (rec?.description && midY + 22 < y2 - 4) {
        ctx.fillStyle = '#888'
        ctx.font = '11px sans-serif'
        const desc = rec.description.length > 40 ? rec.description.slice(0, 40) + '...' : rec.description
        ctx.fillText(desc, labelX, midY + 22)
      }
    }
    // 底部终孔线
    const yBot = PAD_TOP + allBoundaries[allBoundaries.length - 1] * scale
    ctx.strokeStyle = '#C00'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(PAD_LEFT, yBot); ctx.lineTo(PAD_LEFT + COL_WIDTH, yBot); ctx.stroke()
    ctx.fillStyle = '#C00'; ctx.font = '12px sans-serif'
    ctx.fillText('终孔 ' + allBoundaries[allBoundaries.length - 1].toFixed(2) + 'm', PAD_LEFT + COL_WIDTH + 12, yBot + 4)

    // 钻孔轴线
    ctx.strokeStyle = '#AAA'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD_LEFT, PAD_TOP); ctx.lineTo(PAD_LEFT, H - PAD_BOT); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(PAD_LEFT + COL_WIDTH, PAD_TOP); ctx.lineTo(PAD_LEFT + COL_WIDTH, H - PAD_BOT); ctx.stroke()

    // ============ 标贯点（蓝色▼ + N值 + 击数柱状条） ============
    // 标贯点在钻孔柱 **右侧** （紧贴柱子）
    records.forEach(r => {
      if (r.hammerN == null) return
      const y = PAD_TOP + (r.startDepth || 0) * scale
      if (y < PAD_TOP || y > H - PAD_BOT) return

      // 击数柱状条：从柱右边向右延伸，长度与击数正相关（按比例）
      const maxN = Math.max(...records.map(x => x.hammerN || 0), 20)
      const barLen = Math.min(180, ((r.hammerN || 0) / maxN) * 180)
      const barX0 = PAD_LEFT + COL_WIDTH + 175  // 右侧描述区的右边
      ctx.fillStyle = '#3B82F6'
      ctx.fillRect(barX0, y - 2, barLen, 4)
      // 边框
      ctx.strokeStyle = '#1D4ED8'; ctx.lineWidth = 1
      ctx.strokeRect(barX0, y - 2, barLen, 4)

      // ▼ 三角标记（蓝色）
      ctx.fillStyle = '#1D4ED8'
      ctx.beginPath()
      const triX = PAD_LEFT + COL_WIDTH + 170
      ctx.moveTo(triX - 5, y - 5)
      ctx.lineTo(triX + 5, y - 5)
      ctx.lineTo(triX, y + 3)
      ctx.closePath()
      ctx.fill()

      // N 值文字（右对齐，在柱子和描述区之间）
      ctx.fillStyle = '#1D4ED8'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`N=${r.hammerN}`, PAD_LEFT + COL_WIDTH + 165, y + 4)
      ctx.textAlign = 'start'
    })

    // ============ 取样点（黄色圆点 ● + 类型缩写） ============
    // 取样点在钻孔柱 **左侧** （深度刻度和柱子之间）
    records.forEach(r => {
      const arr = r.samples || []
      arr.forEach(s => {
        if (s.depth == null) return
        const y = PAD_TOP + s.depth * scale
        if (y < PAD_TOP - 10 || y > H - PAD_BOT + 10) return

        // 按类型选颜色
        const typeColor = {
          '原状样': '#B45309',
          '扰动样': '#CA8A04',
          '岩样': '#7C2D12',
          '水样': '#0369A1',
          '土样': '#A16207',
        }[s.type] || '#78716C'

        // ● 圆点
        ctx.fillStyle = typeColor
        ctx.beginPath()
        const dotX = PAD_LEFT + 15
        ctx.arc(dotX, y, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(dotX, y, 4.5, 0, Math.PI * 2); ctx.stroke()

        // 样号
        ctx.fillStyle = typeColor
        ctx.font = 'bold 11px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(s.sampleNo || '·', dotX - 6, y + 4)
        ctx.textAlign = 'start'

        // 类型缩写（点下方）
        ctx.fillStyle = typeColor
        ctx.font = '10px sans-serif'
        const short = s.type ? s.type[0] : ''
        ctx.fillText(short, dotX + 6, y + 4)
      })
    })

    // 标题
    ctx.fillStyle = '#166534'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`钻孔柱状图 · ${borehole.boreholeNo}`, W / 2, 22)
    ctx.textAlign = 'start'

    // 比例尺
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right'
    ctx.fillText(`比例尺 1:${Math.round(scale)}  px/m`, W - 10, H - 8)
    ctx.textAlign = 'start'

    // 孔口标高
    if (borehole.groundElev) {
      ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'
      ctx.fillText(`孔口标高 ${borehole.groundElev.toFixed(2)}m`, PAD_LEFT, PAD_TOP - 8)
    }
  }, [borehole, records, totalDepth, scale, allBoundaries])

  useEffect(() => { draw() }, [draw])

  // ============== 鼠标交互 ==============
  function handleClick(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const y = e.clientY - rect.top
    const depth = (y - PAD_TOP) / scale
    if (depth < 0 || depth > totalDepth) return
    // 不允许太近已有边界（0.3m内）
    if (allBoundaries.some(b => Math.abs(b - depth) < 0.3)) return
    setSplits(s => [...s, +depth.toFixed(2)])
  }

  function handleMove(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const y = e.clientY - rect.top
    const depth = (y - PAD_TOP) / scale
    if (depth < 0 || depth > totalDepth) { setHoverInfo(null); return }
    const rec = lithAt(depth)
    setHoverInfo({ depth: +depth.toFixed(2), rec })
  }

  function handleZoom(delta) {
    setScale(s => Math.max(15, Math.min(80, s + delta)))
  }

  function clearSplits() { setSplits([]) }

  function exportPNG() {
    const canvas = canvasRef.current
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url; a.download = `${borehole.boreholeNo}_柱状图.png`; a.click()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-slate-800">📊 钻孔柱状图 · {borehole.boreholeNo}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              🖱️ 点击图上任意位置添加分层线 · 滚轮缩放 · 右侧编辑岩层 · 左键/右键删除已加分层线
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl px-2">✕</button>
        </div>

        {/* 控制栏 */}
        <div className="p-3 bg-slate-50 border-b flex items-center gap-3 text-sm">
          <span className="text-slate-600">放大缩小：</span>
          <button onClick={() => handleZoom(5)} className="px-3 py-1 bg-white border rounded hover:bg-slate-100">➕</button>
          <button onClick={() => handleZoom(-5)} className="px-3 py-1 bg-white border rounded hover:bg-slate-100">➖</button>
          <span className="text-slate-600 ml-3">比例 {scale} px/m</span>
          {splits.length > 0 && (
            <>
              <span className="text-blue-600 ml-3">✓ 已添加 {splits.length} 条自定义分层线</span>
              <button onClick={clearSplits} className="px-3 py-1 bg-white border border-red-300 text-red-600 rounded hover:bg-red-50">
                清除自定义分层
              </button>
            </>
          )}
          <div className="flex-1" />
          <button onClick={exportPNG} className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700">
            💾 导出 PNG
          </button>
        </div>

        {/* Canvas 区 */}
        <div ref={wrapRef} className="flex-1 overflow-auto bg-slate-100 relative"
             onWheel={(e) => { e.preventDefault(); handleZoom(e.deltaY < 0 ? 4 : -4) }}>
          <div className="min-w-[720px] p-4">
            <canvas ref={canvasRef}
                    onClick={handleClick}
                    onMouseMove={handleMove}
                    className="bg-white border border-slate-300 rounded shadow cursor-crosshair" />
          </div>

          {/* 悬停提示 */}
          {hoverInfo && (
            <div className="fixed bottom-4 right-4 bg-slate-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg pointer-events-none">
              深度: {hoverInfo.depth}m
              {hoverInfo.rec && (
                <div className="mt-1 text-slate-300">
                  {hoverInfo.rec.soilName}{hoverInfo.rec.state ? ' (' + hoverInfo.rec.state + ')' : ''}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 图例 */}
        <div className="p-3 border-t bg-white">
          <div className="text-xs text-slate-600 mb-2 font-semibold">图例（岩性配色）</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {['粘土','粉质粘土','粉土','粗砂','细砂','杂填土','全风化岩','强风化岩','中风化岩','微风化岩'].map(n => (
              <span key={n} className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-3 border border-slate-300" style={{ background: lithColor(n) }} />
                {n}
              </span>
            ))}
            <span className="flex items-center gap-1.5 ml-3 text-blue-600">
              ▼ 标贯点（蓝色条=N值柱状图）
            </span>
            <span className="flex items-center gap-1.5 ml-2 text-amber-700">
              ● 取样点（棕=原状/黄=扰动/深棕=岩样）
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// 颜色对比度（白/黑字）
function colorContrast(hex) {
  const c = hex.replace('#', '')
  const r = parseInt(c.substr(0, 2), 16)
  const g = parseInt(c.substr(2, 2), 16)
  const b = parseInt(c.substr(4, 2), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 140 ? '#222' : '#FFF'
}
