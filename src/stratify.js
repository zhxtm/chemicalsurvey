// 自动分层引擎 —— 两种策略：
//   1. 回次 → 地层合并（外业采集数据 → 精细地层）
//   2. CPT 静力触探自动分层（qc 梯度阈值法）
//
// 设计原则：
//   - 算法纯函数，无依赖、无副作用、可单元测试
//   - 两种策略可独立调用，也可组合（回次优先 + CPT 辅助修正）
//   - 边界精度用 0.001 阈值避免浮点残留

const EPS = 0.001

// ========== 策略一：回次 → 地层合并 ==========
// 把外业 records（按 roundNo 升序）合并成地层表
// 合并条件：连续回次的 soilName + state + moisture + color 四个字段**完全相同**
// 输出：[{ topDepth, bottomDepth, thickness, soilName, state, moisture, color, description }]
export function stratifyFromRecords(records) {
  if (!records || records.length === 0) return []

  // 按起始深度排序（兼容 roundNo 或 endDepth）
  const sorted = [...records].sort((a, b) => {
    const aTop = a.startDepth ?? 0
    const bTop = b.startDepth ?? 0
    return aTop - bTop
  })

  // 去重 + 连续化：如果两条记录首尾有间隙（> EPS），在中间插入一层同名过渡层（少见但要防御）
  // 合并循环
  const layers = []
  let current = null

  for (const rec of sorted) {
    const top = rec.startDepth ?? 0
    const bot = rec.endDepth ?? top
    if (bot <= top + EPS) continue // 跳过无效回次

    const key = [
      (rec.soilName || '').trim(),
      (rec.state || '').trim(),
      (rec.moisture || '').trim(),
      (rec.color || '').trim(),
    ].join('|')

    if (!current) {
      current = {
        topDepth: top,
        bottomDepth: bot,
        soilName: rec.soilName || '',
        state: rec.state || '',
        moisture: rec.moisture || '',
        color: rec.color || '',
        descriptions: rec.description ? [rec.description] : [],
        roundNos: [rec.roundNo],
      }
      continue
    }

    // 检查是否能与当前层合并
    const sameKey = key === [
      current.soilName, current.state, current.moisture, current.color
    ].join('|')

    // 检查深度连续性（当前层底 ≈ 下回次顶）
    const depthContinuous = Math.abs(top - current.bottomDepth) < EPS

    if (sameKey && depthContinuous) {
      current.bottomDepth = Math.max(current.bottomDepth, bot)
      if (rec.description && !current.descriptions.includes(rec.description)) {
        current.descriptions.push(rec.description)
      }
      if (rec.roundNo != null) current.roundNos.push(rec.roundNo)
    } else {
      // 结算上一层
      layers.push({
        topDepth: current.topDepth,
        bottomDepth: current.bottomDepth,
        thickness: Math.max(0, current.bottomDepth - current.topDepth),
        soilName: current.soilName,
        state: current.state,
        moisture: current.moisture,
        color: current.color,
        description: current.descriptions.filter(Boolean).join('；'),
      })
      current = {
        topDepth: top,
        bottomDepth: bot,
        soilName: rec.soilName || '',
        state: rec.state || '',
        moisture: rec.moisture || '',
        color: rec.color || '',
        descriptions: rec.description ? [rec.description] : [],
        roundNos: rec.roundNo != null ? [rec.roundNo] : [],
      }
    }
  }

  if (current) {
    layers.push({
      topDepth: current.topDepth,
      bottomDepth: current.bottomDepth,
      thickness: Math.max(0, current.bottomDepth - current.topDepth),
      soilName: current.soilName,
      state: current.state,
      moisture: current.moisture,
      color: current.color,
      description: current.descriptions.filter(Boolean).join('；'),
    })
  }

  return layers
}

// ========== 策略二：CPT 自动分层 ==========
// 输入：cptPoints [{ depth, qc, fs }] （按 depth 升序）
// 输出：[{ topDepth, bottomDepth, qcMean, fsMean, psMean, nPoints, soilGuess }]
//
// 算法：qc 梯度阈值法
//   1. 计算 qc 相对梯度：grad[i] = |qc[i+1] - qc[i]| / max((qc[i]+qc[i+1])/2, 0.01)
//   2. 用滑动窗口做平滑（避免单点噪声），窗口大小根据数据间距自适应
//   3. 找出所有 grad 超过阈值 (默认 0.25 = 25%) 的点作为候选分层界面
//   4. 去重合并（相邻候选点 < 0.2m 视为同一界面）
//   5. 在候选界面处切分，聚合各区间统计量
export function stratifyFromCPT(cptPoints, options = {}) {
  const threshold = options.threshold ?? 0.25    // 相对梯度阈值 25%
  const minLayerThickness = options.minLayerThickness ?? 0.2  // 最小层厚 0.2m
  const minGap = options.minGap ?? 0.2           // 相邻界面临近合并阈值

  if (!cptPoints || cptPoints.length < 3) return []

  // 升序 + 去重
  const pts = [...cptPoints]
    .sort((a, b) => a.depth - b.depth)
    .filter((p, i, arr) => i === 0 || Math.abs(p.depth - arr[i-1].depth) > 1e-6)
  const N = pts.length
  if (N < 3) return []

  // (1) 一阶差分
  const diff = new Array(N - 1)
  for (let i = 0; i < N - 1; i++) {
    const dq = pts[i+1].qc - pts[i].qc
    const midQc = (pts[i+1].qc + pts[i].qc) / 2
    diff[i] = {
      depth: pts[i].depth,
      midpointDepth: (pts[i].depth + pts[i+1].depth) / 2,
      grad: Math.abs(dq) / Math.max(midQc, 0.01),
    }
  }

  // (2) 滑动平均平滑（窗口=3）
  const smooth = diff.map((d, i, arr) => {
    let sum = d.grad, cnt = 1
    if (i > 0) { sum += arr[i-1].grad; cnt++ }
    if (i < arr.length - 1) { sum += arr[i+1].grad; cnt++ }
    return { ...d, grad: sum / cnt }
  })

  // (3) 找显著变化点
  const breakCandidates = []
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i].grad >= threshold) {
      breakCandidates.push(smooth[i].midpointDepth)
    }
  }

  // (4) 首尾边界加入，构造完整分段
  const boundaries = [pts[0].depth, ...breakCandidates, pts[N - 1].depth]

  // (5) 去重 + 按深度排序
  const uniq = []
  boundaries.sort((a, b) => a - b)
  for (const b of boundaries) {
    if (uniq.length === 0 || b - uniq[uniq.length - 1] > minGap) {
      uniq.push(b)
    }
  }

  // (6) 按边界切分，聚合统计量
  const layers = []
  for (let i = 0; i < uniq.length - 1; i++) {
    const top = uniq[i]
    const bot = uniq[i + 1]
    if (bot - top < minLayerThickness) continue // 层厚过小跳过

    const seg = pts.filter(p => p.depth >= top - EPS && p.depth <= bot + EPS)
    if (seg.length < 2) continue

    const qcSum = seg.reduce((s, p) => s + (p.qc || 0), 0)
    const fsSum = seg.reduce((s, p) => s + (p.fs || 0), 0)
    const qcMean = qcSum / seg.length
    const fsMean = fsSum / seg.length
    const psMean = qcMean + 0.87 * fsMean

    layers.push({
      topDepth: top,
      bottomDepth: bot,
      thickness: bot - top,
      nPoints: seg.length,
      qcMean: +qcMean.toFixed(3),
      fsMean: +fsMean.toFixed(3),
      psMean: +psMean.toFixed(3),
      soilGuess: guessSoilFromCPT(psMean, fsMean / qcMean),
    })
  }

  return layers
}

// 土性判别（双桥比贯入阻力 Ps + 摩阻比 Rf = fs/qc）
// 依据常见 CPT 经验：
//   Ps < 1 MPa     → 软粘性土 / 淤泥质土
//   1-2 MPa        → 一般粘性土 / 粉质粘土
//   2-5 MPa        → 硬塑粘性土 / 中密粉土
//   5-10 MPa       → 中密~密实粉土 / 稍密砂土
//   10-20 MPa      → 密实粉土 / 中密砂土 / 软岩
//   > 20 MPa       → 硬岩
//   Rf 高（> 3%）  → 粘性土
//   Rf 低（< 1%）  → 纯净砂土
function guessSoilFromCPT(ps, rf) {
  if (ps <= 0) return '—'
  let base = ''
  if (ps < 1)       base = '软粘性土/淤泥'
  else if (ps < 2)  base = '一般粘性土/粉质粘土'
  else if (ps < 5)  base = '硬塑粘性土/中密粉土'
  else if (ps < 10) base = '密实粉土/稍密砂土'
  else if (ps < 20) base = '密实砂土/软岩'
  else              base = '硬岩'

  // 用摩阻比辅助修正
  if (rf != null && rf > 0) {
    if (rf > 0.03 && !base.includes('粘性')) base = base.replace('粉土', '粘性土').replace('砂土', '粘性土')
    if (rf < 0.01 && !base.includes('砂')) base = base + '(砂土倾向)'
  }
  return base
}

// ========== 组合入口：回次优先 + CPT 辅助 ==========
// 如果有外业回次 → 先合并成地层作为骨架
// 如果有 CPT 数据 → 把 CPT 分层结果作为参考附加信息（不覆盖，便于人工对比）
export function buildFinalLayers(records, cptPoints, options = {}) {
  const mergedFromRecords = stratifyFromRecords(records)
  const cptLayers = cptPoints && cptPoints.length >= 3 ? stratifyFromCPT(cptPoints, options) : []
  return { mergedFromRecords, cptLayers }
}

// ========== 工具：地层颜色分配（用于柱状图可视化） ==========
// 按岩土名匹配颜色，返回颜色字符串（Tailwind 风格 hex）
export function soilColor(name) {
  if (!name) return '#d1d5db'
  const n = String(name)
  if (n.includes('淤泥'))    return '#6b7280'
  if (n.includes('粘土'))    return '#a3a3a3'   // 灰
  if (n.includes('粉质粘土')) return '#bfbfbf'  // 浅灰
  if (n.includes('粉土'))    return '#d4d4d8'   // 淡灰
  if (n.includes('细砂'))    return '#fde68a'
  if (n.includes('粉砂'))    return '#fcd34d'
  if (n.includes('中砂'))    return '#fbbf24'
  if (n.includes('粗砂'))    return '#f59e0b'
  if (n.includes('砾'))      return '#a16207'
  if (n.includes('卵石'))    return '#7c2d12'
  if (n.includes('碎石'))    return '#78350f'
  if (n.includes('风化'))    return '#9ca3af'
  if (n.includes('灰岩'))    return '#4b5563'
  if (n.includes('花岗岩'))  return '#78716c'
  if (n.includes('页岩'))    return '#57534e'
  if (n.includes('砂岩'))    return '#78716c'
  if (n.includes('填土') || n.includes('素填土')) return '#e5e7eb'
  if (n.includes('耕'))      return '#fef3c7'
  return '#e5e7eb'
}
