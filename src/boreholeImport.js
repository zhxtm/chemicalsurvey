// 钻孔一览表 Excel 导入
// 支持中英文表头自动识别
import * as XLSX from 'xlsx'

// 中文 → 英文 字段映射
const HEADER_MAP = {
  // 孔号
  '孔号': 'boreholeNo', '钻孔编号': 'boreholeNo', '编号': 'boreholeNo',
  'Borehole No.': 'boreholeNo', 'Borehole No': 'boreholeNo', 'BH No.': 'boreholeNo',
  // 孔深
  '孔深': 'designDepth', '设计孔深': 'designDepth', '钻孔深度': 'designDepth',
  'Borehole Depth': 'designDepth', 'Depth': 'designDepth',
  // 孔口标高
  '孔口标高': 'groundElev', '孔口高程': 'groundElev', '地面标高': 'groundElev',
  'Ground Elevation': 'groundElev', 'Ground El.': 'groundElev',
  // 坐标
  'E': 'coordE', '东': 'coordE', 'X坐标': 'coordE', 'X': 'coordE',
  'N': 'coordN', '北': 'coordN', 'Y坐标': 'coordN', 'Y': 'coordN',
  // 孔类型
  '孔类别': 'boreholeType', '孔型': 'boreholeType', '勘探点类型': 'boreholeType',
  'Borehole Type': 'boreholeType', 'Type': 'boreholeType',
  // 备注
  '备注': 'remarks', '备注1': 'remarks',
  'Remarks': 'remarks', 'Notes': 'remarks',
  // 装置名称
  '装置名称': 'unitName', 'Unit Name': 'unitName'
}

export async function parseBoreholeExcel(file) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  
  const results = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
    if (rows.length < 2) continue

    // 找表头行：找包含孔号/boreholeNo 关键词的行
    let headerIdx = -1
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i].map(c => String(c).trim())
      const hit = row.find(c =>
        c.includes('孔号') || c.includes('Borehole') || c.includes('BH')
      )
      if (hit) { headerIdx = i; break }
    }
    if (headerIdx < 0) continue

    // 映射列
    const headerRow = rows[headerIdx].map(c => String(c).trim())
    const colMap = {}
    headerRow.forEach((h, idx) => {
      const mapped = HEADER_MAP[h]
      if (mapped && !colMap[mapped]) colMap[mapped] = idx
    })

    // 解析数据行
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const raw = rows[i]
      if (!raw || raw.length === 0) continue
      const no = String(raw[colMap.boreholeNo] ?? '').trim()
      if (!no) continue  // 空孔号跳过

      const item = {
        boreholeNo: no,
        designDepth: toNum(raw[colMap.designDepth]),
        groundElev: toNum(raw[colMap.groundElev]),
        coordE: toNum(raw[colMap.coordE]),
        coordN: toNum(raw[colMap.coordN]),
        boreholeType: String(raw[colMap.boreholeType] ?? '').trim(),
        remarks: String(raw[colMap.remarks] ?? '').trim(),
        unitName: String(raw[colMap.unitName] ?? '').trim(),
      }
      if (item.designDepth === null) item.designDepth = 30  // 默认 30m
      results.push(item)
    }
  }
  return results
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
