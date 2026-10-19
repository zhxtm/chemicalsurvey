// 理正工程地质勘察CAD 9.0 标准接口（纯文本 .txt）导出
// 规范依据：帮助文档 11.2.2 文件格式及说明
// 分隔符：TAB（\t），分号开头为注释

function f(v, digits) {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number' && digits !== undefined) return v.toFixed(digits)
  return String(v)
}

export function exportLizhengTXT(project, boreholes, allRecords) {
  const lines = []
  const TAB = '\t'

  // ============== 工程表 #GC# ==============
  // 字段（按帮助文档顺序）：
  // 勘察阶段、建设单位、设计单位、勘察单位、施工单位、工程地点、
  // 工程参考原点坐标X、工程参考原点坐标Y、工程标高(m)、
  // 起始里程(m)、结束里程(m)、桥中心点段号、桥中心点里程、桥式类型、桥名、
  // 坐标系统Y轴为水平方向(0-XY/1-YX)、指北针与Y轴夹角(度)、
  // 底图比例尺、工程执行标准(0-工勘/1-铁路/2-公路/3-水利)、
  // 开工日期、完工日期
  lines.push(';工程数据')
  lines.push('#GC#' + [
    '详勘',                // 勘察阶段
    '',                     // 建设单位
    '',                     // 设计单位
    '',                     // 勘察单位
    '',                     // 施工单位
    f(project.location),   // 工程地点
    '0', '0',               // 参考原点 X、Y
    f(project.groundElev, 3), // 工程标高（取第一个孔的孔口高程，若无则0）
    '', '', '', '', '', '', '', '', '',  // 里程/桥梁相关（空）
    '1',                    // 坐标系统（默认 X轴水平）
    '0',                    // 指北针夹角
    '500',                  // 底图比例尺
    '0',                    // 工程执行标准：0-工勘
    '', ''                  // 开工、完工日期
  ].join(TAB))

  // 取第一个有孔口高程的钻孔作为工程标高
  const elevBorehole = boreholes.find(b => b.groundElev)
  if (elevBorehole) {
    lines[1] = '#GC#' + [
      '详勘', '', '', '', '',
      f(project.location),
      '0', '0',
      f(elevBorehole.groundElev, 3),
      '', '', '', '', '', '', '', '', '',
      '1', '0', '500', '0', '', ''
    ].join(TAB)
  }

  // ============== 按钻孔分组 ==============
  boreholes.forEach(b => {
    const records = allRecords[b.id] || []

    // 钻孔表 #ZK#
    // *钻孔编号、*勘探点类型、X坐标、Y坐标、偏移量、孔口标高、水面标高、
    // 勘探深度、探井深度、钻孔直径、勘探开始日期、勘探结束日期、
    // 自定义字段一、自定义字段二、自定义字段三
    const bottomDepth = records.length > 0
      ? Math.max(...records.map(r => r.endDepth || 0))
      : b.designDepth || 0

    lines.push(';钻孔数据')
    lines.push('#ZK#' + [
      f(b.boreholeNo),        // 钻孔编号 *必填
      '钻孔',                  // 勘探点类型
      f(b.lng, 5),            // X 坐标（经度）
      f(b.lat, 5),            // Y 坐标（纬度）
      '0',                     // 偏移量
      f(b.groundElev, 3),     // 孔口标高
      '',                      // 水面标高（初见水位，留空）
      f(bottomDepth, 2),      // 勘探深度
      '0',                     // 探井深度
      '',                      // 钻孔直径
      '', '', '', '', ''       // 日期 + 三个自定义字段
    ].join(TAB))

    // 土层表 #TC# —— 每个回次一条（按理正习惯一个层一条）
    // *岩土名称、*层底深度、地层厚度、主层编号、亚层编号、次亚层编号、
    // 地质时代、地质成因、颜色、密实度、湿度、可塑性、浑圆度、均匀性、
    // 风化程度、岩层倾向、岩层倾角、矿物成分、结构构造、包含物、气味、
    // 描述、完整程度、坚硬程度、破碎程度、节理发育、节理间距
    records.forEach((r, idx) => {
      lines.push('#TC#' + [
        f(r.soilName),                                // *岩土名称
        f(r.endDepth, 2),                             // *层底深度
        f((r.endDepth || 0) - (r.startDepth || 0), 2), // 地层厚度
        String(idx + 1),                              // 主层编号
        '', '',                                        // 亚层、次亚层编号
        '',                                            // 地质时代
        '',                                            // 地质成因
        f(r.color),                                    // 颜色
        f(r.state),                                    // 密实度
        r.moisture || '稍湿',                         // 湿度
        '', '', '', '',                                // 可塑性、浑圆度、均匀性、风化程度
        '', '', '', '', '', '', '',                    // 岩层倾向/倾角/矿物成分/结构构造/包含物/气味/描述位置
        f(r.description),                              // 性状描述
        '', '', '', '',                                // 完整程度/坚硬程度/破碎程度/节理发育
        ''                                             // 节理间距
      ].join(TAB))
    })

    // 标贯表 #BG# —— 有标贯击数的回次
    // *试验点的底深度(m)、标贯类型、特征值、杆长(m)、一阵击数的长度(m)、
    // 一阵击数、标贯击数、标贯修正系数（中间结果）、修正后的标贯击数、
    // 修正否、参与否
    records.filter(r => r.hammerN != null && r.hammerN !== '').forEach(r => {
      lines.push('#BG#' + [
        f(r.endDepth, 2),          // *试验点底深度
        '标准贯入',                  // 标贯类型
        '',                          // 特征值
        f(r.hammerRod, 1),          // 杆长
        '0.15',                      // 一阵击数的长度（理正默认0.15m）
        '',                          // 一阵击数
        f(r.hammerN),                // 标贯击数
        '',                          // 修正系数
        '',                          // 修正后的标贯击数
        '1',                         // 修正否（0-否 1-是）
        '1'                          // 参与否
      ].join(TAB))
    })

    // 岩石取样 #QY# —— RQD 有值的
    // 取样编号、取样深度(m)、取样长度、位置、岩性、RQD%、描述...（简化版）
    records.filter(r => r.isRock && r.rqd != null).forEach((r, idx) => {
      lines.push('#QY#' + [
        `${b.boreholeNo}-${idx + 1}`,  // 取样编号
        f(r.endDepth, 2),               // 取样深度
        f((r.endDepth || 0) - (r.startDepth || 0), 2),  // 取样长度
        '',                               // 位置
        f(r.soilName),                    // 岩性
        '', '', '', '', '', '',            // 物理指标留空
        f(r.rqd),                         // RQD%
        '', '', '', '', '', '', '',        // 强度等留空
        f(r.description)                  // 描述
      ].join(TAB))
    })

    // 动探表 #DT# —— 如果有（这里从简，用户有数据再加）
    // 注：完整格式还包括 #JT# 静探、#QY# 取样、#GY# 干密度、#WZ# 无侧限抗压等
    // 本次先输出外业核心数据，内业实验室数据由用户在理正里补齐
  })

  // ============== 组装下载 ==============
  const content = lines.join('\r\n') + '\r\n'
  const fileName = `${project.name || '项目'}_理正标准接口_${new Date().toISOString().slice(0, 10)}.txt`

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  console.log('=== 理正标准接口文件预览（前20行）===')
  console.log(lines.slice(0, 20).join('\n'))
  console.log(`...共 ${lines.length} 行`)

  return { fileName, lineCount: lines.length, preview: lines.slice(0, 20) }
}
