// 华宁勘察数据库专用解析器（通用版）
// 已验证：
//   - D:\HNSJ\2013-21-K065X  后缀 .FJ  18孔·125层·44标贯·114土试
//   - D:\HNSJ\2013-21-K055X  后缀 .kynhq  2孔·16层·51标贯·79土试
//
// 设计原则：
//   1. 后缀不固定（.FJ / .kynhq / 工程简称由技术人员自定），按"结构名前缀"匹配
//   2. 核心结构名（字母骨架）不变：DK / DCSJ / ZN* / BGT* / TGSJ* / DCSHA
//   3. ZN 文件的孔号关联：文件名 ZN{...} → 去掉 ZN 前缀 + 去掉扩展名 = 孔号
//      （K065X: ZN354.FJ → 孔号 "354"；K055X: ZN1.kynhq → 孔号 "1"）
//   4. 数据内部格式统一：逗号分隔 CSV，延续式孔号，END 终止行
//   5. 编码：GBK（浏览器需 TextDecoder('gbk')）

function parseNum(s) {
  if (s == null) return null
  s = String(s).trim()
  if (!s || s.toUpperCase() === 'END' || s === '>50' || s === '') return null
  const n = Number(s)
  return isNaN(n) ? null : n
}

function splitCsv(text) {
  return text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l)
}

// 把文件名拆成：结构名前缀（去掉扩展名） + 原始扩展名
// 例如："ZN354.FJ"  → { stem: "ZN354", ext: ".FJ" }
//       "DK.kynhq"  → { stem: "DK",   ext: ".kynhq" }
function splitName(fname) {
  const lastDot = fname.lastIndexOf('.')
  if (lastDot <= 0) return { stem: fname.toUpperCase(), ext: '' }
  return {
    stem: fname.slice(0, lastDot).toUpperCase(),
    ext: fname.slice(lastDot).toUpperCase(),
  }
}

// ========== 主入口 ==========
// files: Array<{name: string, text: string}>
// 返回: { project, boreholes }
export function parseHuNingFJ(files) {
  // 按"结构名前缀"建索引，值是数组（同名结构可能出现多次）
  // byStem['DK'] = [ { stem, ext, text, fullName }, ... ]
  const byStem = {}
  for (const f of files) {
    const { stem, ext } = splitName(f.name)
    if (!stem) continue
    if (!byStem[stem]) byStem[stem] = []
    byStem[stem].push({ stem, ext, text: f.text, fullName: f.name })
  }

  // --- 关键文件定位 ---
  const dkEntry = byStem['DK']?.[0]
  const dcsjEntry = byStem['DCSJ']?.[0]
  if (!dkEntry) {
    throw new Error('未找到钻孔基本信息表（结构名前缀 DK），这是华宁数据库的入口文件')
  }

  // ---------- 1. DK 钻孔基本信息 ----------
  const dkLines = splitCsv(dkEntry.text)
  const boreholes = []
  for (const line of dkLines) {
    if (line.includes('END')) break
    const p = line.split(',')
    if (!p[0]?.trim()) continue
    boreholes.push({
      boreholeNo: p[0].trim(),
      groundElev: parseNum(p[1]),
      depth: parseNum(p[2]),
      waterLevelFirst: parseNum(p[3]),
      waterLevelStable: parseNum(p[4]),
      date: p[5]?.trim() || '',
      coordX: parseNum(p[7]),
      coordY: parseNum(p[8]),
      layers: [],
      hammerTests: [],
      soilTests: [],
    })
  }

  // ---------- 2. ZN* 单孔层号→岩名映射 ----------
  // 匹配：stem 以 "ZN" 开头且后面至少一个非空字符（孔号/序号）
  //  K065X: stem="ZN354" → bhNo="354"
  //  K055X: stem="ZN1"   → bhNo="1"
  const layerRockMap = {}
  for (const [stem, entries] of Object.entries(byStem)) {
    const m = stem.match(/^ZN(.+)$/)
    if (!m) continue
    const bhNo = m[1]
    if (!bhNo) continue
    const mapping = {}
    for (const entry of entries) {
      for (const line of splitCsv(entry.text)) {
        if (!line.includes(',')) continue
        const idx = line.indexOf(',')
        const lh = line.slice(0, idx).trim()
        if (!lh || lh.includes('END')) continue
        const rest = line.slice(idx + 1)
        const colonIdx = rest.indexOf(':')
        let rock = '', desc = ''
        if (colonIdx >= 0) {
          rock = rest.slice(0, colonIdx).trim()
          desc = rest.slice(colonIdx + 1).trim()
        } else {
          rock = rest.trim()
        }
        mapping[lh] = { rock, desc }
      }
    }
    if (Object.keys(mapping).length > 0) layerRockMap[bhNo] = mapping
  }

  // ---------- 3. DCSJ 地层分层（延续式孔号） ----------
  if (dcsjEntry) {
    const lines = splitCsv(dcsjEntry.text)
    const byHole = {}
    let curHole = null
    for (const line of lines) {
      if (line.includes('END')) break
      const p = line.split(',')
      if (p[0]?.trim()) curHole = p[0].trim()
      if (!curHole) continue
      const lh = p[1]?.trim() || ''
      const bot = parseNum(p[2])
      const rockInfo = layerRockMap[curHole]?.[lh] || { rock: `层${lh}`, desc: '' }
      if (!byHole[curHole]) byHole[curHole] = []
      byHole[curHole].push({
        layerNo: lh,
        bottomDepth: bot,
        soilName: rockInfo.rock,
        description: rockInfo.desc,
      })
    }

    for (const bh of boreholes) {
      const layers = byHole[bh.boreholeNo] || []
      let top = 0
      for (const l of layers) {
        if (l.bottomDepth == null) l.bottomDepth = bh.depth
        l.topDepth = top
        l.thickness = +(l.bottomDepth - top).toFixed(3)
        top = l.bottomDepth
      }
      bh.layers = layers
    }
  }

  // ---------- 4. BGT* 标贯试验 ----------
  // 匹配：stem 以 "BGT" 开头（后面可以是数字+字母如 BGT1A / BGT1B / BGT2 / BGTO）
  const byHoleHammer = {}
  for (const [stem, entries] of Object.entries(byStem)) {
    if (!stem.startsWith('BGT')) continue
    for (const entry of entries) {
      for (const line of splitCsv(entry.text)) {
        if (line.includes('END')) continue
        const p = line.split(',')
        if (p.length < 4) continue
        const testId = p[0].trim()
        const bhNo = testId.includes('-') ? testId.split('-')[0] : testId
        const depth = parseNum(p[1])
        const rodLen = parseNum(p[2])
        const hitsRaw = (p[3] || '').trim()
        let hits = null
        if (hitsRaw.includes('>')) hits = 50
        else hits = parseNum(hitsRaw)
        if (hits != null) {
          if (!byHoleHammer[bhNo]) byHoleHammer[bhNo] = []
          byHoleHammer[bhNo].push({
            testNo: testId, depth, rodLength: rodLen, n63_5: hits,
          })
        }
      }
    }
  }
  for (const bh of boreholes) {
    bh.hammerTests = byHoleHammer[bh.boreholeNo] || []
    bh.hammerTests.sort((a, b) => a.depth - b.depth)
  }

  // ---------- 5. TGSJ* 土工试验 ----------
  // 主表匹配：stem === "TGSJ"（不是 TGSJA / TGSJ1 / TGSJA2 这些分项）
  const tgsjMainEntry = byStem['TGSJ']?.[0]
  if (tgsjMainEntry) {
    const lines = splitCsv(tgsjMainEntry.text)
    for (const bh of boreholes) bh.soilTests = []
    for (const line of lines) {
      if (line.includes('END')) continue
      const p = line.split(',')
      if (p.length < 15) continue
      const testId = p[1]?.trim() || ''
      if (!testId) continue
      const bhNo = testId.includes('-') ? testId.split('-')[0] : ''
      const bh = boreholes.find(b => b.boreholeNo === bhNo)
      if (!bh) continue
      bh.soilTests.push({
        sampleNo: testId,
        depth: parseNum(p[2]),
        gamma: parseNum(p[9]),
        Gs: parseNum(p[10]),
        gammad: parseNum(p[11]),
        w: parseNum(p[12]),
        e0: parseNum(p[13]),
        soilName: p[14]?.trim() || '',
        wL: parseNum(p[16]),
        wp: parseNum(p[17]),
        Ip: parseNum(p[18]),
        IL: parseNum(p[19]),
        a1_2: parseNum(p[20]),
      })
    }
    for (const bh of boreholes) bh.soilTests.sort((a, b) => (a.depth || 0) - (b.depth || 0))
  }

  return {
    project: {
      name: '华宁数据库导入工程',
      location: '',
      groundElev: null,
      notes: '',
      fromHuNing: true,
    },
    boreholes,
  }
}

// ========== 辅助：判断一组文件是不是华宁数据库 ==========
// 检查：至少有一个 stem 是 "DK"，至少有一个 stem 是 "DCSJ"
export function isHuNingFJFileList(files) {
  const stems = new Set(files.map(f => splitName(f.name).stem))
  return stems.has('DK') && stems.has('DCSJ')
}

// ========== 辅助：列出所有结构名前缀（用于调试/日志） ==========
export function listAllStems(files) {
  const map = {}
  for (const f of files) {
    const { stem, ext } = splitName(f.name)
    if (!stem) continue
    if (!map[stem]) map[stem] = 0
    map[stem] += 1
  }
  return map
}

// ========== 辅助：浏览器 GBK 解码 ==========
export async function decodeGBK(buffer) {
  try {
    return new TextDecoder('gbk', { fatal: false }).decode(buffer)
  } catch (e) {
    try {
      return new TextDecoder('gb18030', { fatal: false }).decode(buffer)
    } catch (_) {
      return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    }
  }
}
