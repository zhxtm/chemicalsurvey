// 理正工程地质勘察CAD 9.0 标准接口 .txt 解析器
// 反向工程自 exportLizhengTxt.js，字段顺序严格对齐 lizheng_interfaces.txt 规范
//
// 返回结构：
//   {
//     project: { name, location, groundElev, executionStandard, ... },
//     boreholes: [
//       {
//         boreholeNo, holeType, lng, lat, offset, groundElev, waterElev,
//         depth, shaftDepth, diameter, startDate, endDate,
//         layers:    [{ topDepth, bottomDepth, soilName, thickness, color, state, moisture, description }],
//         cpt:       [{ depth, type, qc, fs, ps }],
//         hammer:    [{ depth, rodLength, length, count, n63_5 }],
//         samples:   [{ sampleNo, topDepth, length, rockName, rqd, description }]
//       }
//     ]
//   }

const TAB = '\t'

function parseNum(v) {
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function parseLines(text) {
  // 统一换行
  const raw = text.replace(/\r\n?/g, '\n')
  return raw.split('\n')
}

function tokenize(line) {
  // TAB 分隔，空字段保留（避免 shift 造成字段错位）
  return line.split(TAB)
}

// ========== 各数据表的头标记 ==========
const SECTION_HEADERS = ['#GC#', '#ZK#', '#TC#', '#JT#', '#BG#', '#DT#', '#QY#', '#GY#', '#WZ#', '#SH#', '#PP#', '%PH%', '%PP%', '%PJ%', '#PZ#', '#GJ#', '#GJBJ#']

// ========== 主解析函数 ==========
export function parseLizhengTXT(text) {
  const lines = parseLines(text)
  const project = {}
  const boreholes = []
  let current = null // 当前钻孔的累积对象

  function ensureBorehole(boreholeNo) {
    // 根据编号匹配已有钻孔对象（同一文件内）
    let b = boreholes.find(x => x.boreholeNo === boreholeNo)
    if (!b) {
      b = {
        boreholeNo,
        holeType: '钻孔',
        lng: null, lat: null, offset: null,
        groundElev: null, waterElev: null,
        depth: null, shaftDepth: null, diameter: null,
        startDate: '', endDate: '',
        layers: [], cpt: [], hammer: [], samples: [],
        _tcSeen: false,   // 标记是否已读入 #TC#，决定后续 #JT#/#BG#/#QY# 归属
      }
      boreholes.push(b)
    }
    return b
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith(';')) continue // 注释行跳过

    // 判断行首标记
    let header = null
    for (const h of SECTION_HEADERS) {
      if (line.startsWith(h)) { header = h; break }
    }
    if (!header) continue

    const body = line.slice(header.length).replace(/^\t+/, '') // 去掉头后的前导 TAB
    const fields = tokenize(body)

    switch (header) {
      case '#GC#': {
        // 勘察阶段、建设单位、设计单位、勘察单位、施工单位、工程地点、
        // 工程参考原点坐标X、Y、工程标高、起始里程、结束里程、
        // 桥中心点段号、桥中心点里程、桥式类型、桥名、
        // 坐标系统、指北针夹角、底图比例尺、工程执行标准、开工日期、完工日期
        project.stage       = fields[0] || '详勘'
        project.client      = fields[1] || ''
        project.designUnit  = fields[2] || ''
        project.surveyUnit  = fields[3] || ''
        project.constructUnit = fields[4] || ''
        project.location    = fields[5] || ''
        project.refOriginX  = parseNum(fields[6])
        project.refOriginY  = parseNum(fields[7])
        project.groundElev  = parseNum(fields[8])
        project.startMileage  = parseNum(fields[9])
        project.endMileage    = parseNum(fields[10])
        project.startDate   = fields[20] || ''
        project.endDate     = fields[21] || ''
        current = null
        break
      }

      case '#ZK#': {
        // *钻孔编号(0)、*勘探点类型(1)、X坐标(2)、Y坐标(3)、偏移量(4)、
        // 孔口标高(5)、水面标高(6)、勘探深度(7)、探井深度(8)、钻孔直径(9)、
        // 勘探开始日期(10)、勘探结束日期(11)、自定义1(12)、自定义2(13)、自定义3(14)
        const no = fields[0]?.trim()
        if (!no) break
        const b = ensureBorehole(no)
        b.holeType   = fields[1] || '钻孔'
        b.lng        = parseNum(fields[2])
        b.lat        = parseNum(fields[3])
        b.offset     = parseNum(fields[4])
        b.groundElev = parseNum(fields[5])
        b.waterElev  = parseNum(fields[6])
        b.depth      = parseNum(fields[7])
        b.shaftDepth = parseNum(fields[8])
        b.diameter   = parseNum(fields[9])
        b.startDate  = fields[10] || ''
        b.endDate    = fields[11] || ''
        current = b
        break
      }

      case '#TC#': {
        // 必须在 #ZK# 之后
        if (!current) break
        const bot = parseNum(fields[1])
        const thickness = parseNum(fields[2]) || 0
        const prevBottom = current.layers.length > 0
          ? current.layers[current.layers.length - 1].bottomDepth
          : 0
        current.layers.push({
          topDepth: prevBottom,
          bottomDepth: bot != null ? bot : prevBottom + thickness,
          thickness,
          soilName:    fields[0] || '',
          mainNo:      fields[3] || '',
          subNo:       fields[4] || '',
          minorNo:     fields[5] || '',
          geoAge:      fields[6] || '',
          geoOrigin:   fields[7] || '',
          color:       fields[8] || '',
          state:       fields[9] || '',        // 密实度
          moisture:    fields[10] || '',
          plasticity:  fields[11] || '',
          roundness:   fields[12] || '',
          uniformity:  fields[13] || '',
          weathering:  fields[14] || '',
          dipDir:      fields[15] || '',       // 岩层倾向
          dipAngle:    fields[16] || '',       // 岩层倾角
          minerals:    fields[17] || '',
          structure:   fields[18] || '',
          inclusions:  fields[19] || '',
          odor:        fields[20] || '',
          description: fields[21] || '',
          integrity:   fields[22] || '',
          hardness:    fields[23] || '',
          fragmentation: fields[24] || '',
          jointing:    fields[25] || '',
          jointSpacing: fields[26] || ''
        })
        break
      }

      case '#JT#': {
        // *试验点底深度(0)、*静探类型(1: 1-单桥 2-双桥 3-多桥)、
        // 锥头阻力(2)、侧壁摩阻力(3)、比贯入阻力(4)
        if (!current) break
        const depth = parseNum(fields[0])
        const type  = parseNum(fields[1]) || 2
        const qc    = parseNum(fields[2])
        const fs    = parseNum(fields[3])
        const ps    = parseNum(fields[4]) ?? (qc != null && fs != null ? qc + 0.87 * fs : null)
        if (depth != null) current.cpt.push({ depth, type, qc, fs, ps })
        break
      }

      case '#BG#': {
        // *试验点底深度(0)、标贯类型(1)、特征值(2)、
        // 杆长(3)、一阵击数长度(4)、一阵击数(5)、
        // 标贯击数(6)、修正系数(7)、修正后击数(8)、修正否(9)、参与否(10)
        if (!current) break
        const depth    = parseNum(fields[0])
        const rodLen   = parseNum(fields[3])
        const hitLen   = parseNum(fields[4]) // 一般 0.15
        const n63_5    = parseNum(fields[6]) // 标贯击数
        const nCorr    = parseNum(fields[8])
        if (depth != null && n63_5 != null) {
          current.hammer.push({
            depth, rodLen, hitLen, n63_5, nCorr,
            corrected: fields[9] !== '0',
            participate: fields[10] !== '0'
          })
        }
        break
      }

      case '#QY#': {
        // 取样编号(0)、所在地层(1)、取样顶深度(2)、取样长度(3)、
        // 现场鉴定名称(4)、... 物理指标等
        if (!current) break
        const no      = fields[0] || ''
        const topDep  = parseNum(fields[2])
        const length  = parseNum(fields[3])
        const rockName = fields[4] || ''
        const rqd     = parseNum(fields[9])
        if (no) {
          current.samples.push({
            sampleNo: no, locationLayer: fields[1] || '',
            topDepth: topDep, length, rockName,
            rqd: rqd,
            description: fields.slice(20).filter(Boolean).join(' ') || ''
          })
        }
        break
      }

      default:
        // 其他 #DT#（动探）、#GY#（干密度）、#WZ#（无侧限抗压）
        // #SH#/#PP#/%PH%/%PP%/%PJ%（平板载荷）、#PZ#（膨胀）、#GJ#/#GJBJ#（固结）
        // 暂不处理，预留扩展
        break
    }
  }

  // 工程名默认取首个钻孔名所在的目录段，或用用户指定
  if (!project.name) project.name = '从理正接口导入'

  return { project, boreholes }
}

// ========== 静探原始数据 txt/csv 解析 ==========
// 常见格式：depth, qc, fs 三列（单桥只有 ps，双桥有 qc + fs）
// 允许分隔符：逗号 / TAB / 空格连续
// 自动跳过表头行（非数值开头的行）
export function parseCPTRawText(text) {
  const lines = parseLines(text)
  const points = []
  let type = 2 // 默认双桥

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';') || line.toLowerCase().includes('depth')) continue
    let parts
    if (line.includes('\t')) parts = line.split('\t').map(s => s.trim())
    else if (line.includes(',')) parts = line.split(',').map(s => s.trim())
    else parts = line.split(/\s+/)
    if (parts.length < 2) continue

    const depth = parseNum(parts[0])
    const qc = parseNum(parts[1])
    let fs = parts.length >= 3 ? parseNum(parts[2]) : 0
    if (depth == null || qc == null) continue
    if (fs == null) fs = 0

    points.push({ depth, qc, fs, type })
  }

  // 按深度升序
  points.sort((a, b) => a.depth - b.depth)
  return points
}

// ========== 快速导入校验 ==========
export function validateLizhengText(text) {
  // 判断一个文件是否是理正标准接口
  const lines = parseLines(text)
  let hasGC = false, hasZK = false
  for (const l of lines) {
    if (l.startsWith('#GC#')) hasGC = true
    if (l.startsWith('#ZK#')) hasZK = true
    if (hasGC && hasZK) break
  }
  return hasGC && hasZK
}
