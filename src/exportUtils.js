import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { fmtDepth } from './dataDict.js'

// ============ 华宁 xlsx 导出 ============
// 严格对齐桌面「华宁基础数据 空模板.xlsx」的表头结构
export async function exportHuaningXLSX(project, boreholes, allRecords, allPhotos) {
  const wb = XLSX.utils.book_new()

  // ============ Sheet 1: 单孔数据 ============
  // 表头：孔号, 孔口标高, 孔深, 初见水位, 稳定水位, X, Y, 勘探点类型, 勘探点代号
  const sheet1Data = [['孔号', '孔口标高', '孔深', '初见水位', '稳定水位', 'X', 'Y', '勘探点类型', '勘探点代号']]
  boreholes.forEach(b => {
    const bottomDepth = allRecords[b.id]?.length > 0
      ? Math.max(...allRecords[b.id].map(r => r.endDepth || 0))
      : 0
    sheet1Data.push([
      b.boreholeNo,
      b.groundElev ?? '',
      bottomDepth.toFixed(2) || b.designDepth?.toFixed(2) || '',
      '',  // 初见水位
      '',  // 稳定水位
      b.lat ?? '',
      b.lng ?? '',
      '控制取土孔',
      '19'
    ])
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1Data), '单孔数据')

  // ============ Sheet 2: 钻孔（地层） ============
  // 表头：孔号, 层号, 孔底深度
  const sheet2Data = [['孔号', '层号', '孔底深度']]
  boreholes.forEach(b => {
    const records = allRecords[b.id] || []
    records.forEach((r, idx) => {
      sheet2Data.push([b.boreholeNo, idx + 1, r.endDepth?.toFixed(2) ?? ''])
    })
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2Data), '钻孔')

  // ============ Sheet 3: 标贯 ============
  // 表头：孔号, 起始深度, 杆长, 实测击数
  const sheet3Data = [['孔号', '起始深度', '杆长', '实测击数']]
  boreholes.forEach(b => {
    const records = allRecords[b.id] || []
    records.forEach(r => {
      if (r.hammerN != null && r.hammerN !== '') {
        sheet3Data.push([
          b.boreholeNo,
          r.startDepth?.toFixed(2) ?? '',
          r.hammerRod ?? '',
          r.hammerN
        ])
      }
    })
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet3Data), '标贯')

  // ============ Sheet 4: N63.5（重型动力触探，结构同标贯，此处留空供用户后续填） ============
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['孔号', '起始深度', '杆长', '实测击数']]), 'N63.5')

  // ============ Sheet 5: 剖面（留空） ============
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['建筑物', '剖面号', '孔号']]), '剖面')

  // ============ Sheet 6: 岩石 ============
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['孔号', '岩样编号', '取样深度(m)', '', '取样长度', '试样名称', '密度-天然', '密度-饱和', '抗压强度-天然', '抗压强度-饱和']
  ]), '岩石')

  // ============ Sheet 7: 土工数据（复杂多列表头，留模板骨架） ============
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['土工试验（由勘察软件后续补齐）'],
    ['里程', '室内编号', '野外编号', '钻孔', '土样顺序', '取样深度(m)']
  ]), '土工数据')

  // ============ Sheet 8: 土质分析（留模板骨架） ============
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['土质分析（由勘察软件后续补齐）'],
    ['项目', '含量'],
    ['Ca2+', ''],
    ['Mg2+', ''],
    ['Cl-', ''],
    ['SO42-', ''],
    ['HCO3-', ''],
    ['易溶盐总量', ''],
    ['pH值', '']
  ]), '土质分析')

  // ============ Sheet 9: 水质分析（留模板骨架） ============
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['水质分析（由勘察软件后续补齐）'],
    ['项目', '含量(mg/l)'],
    ['Ca2+', ''],
    ['Mg2+', ''],
    ['Cl-', ''],
    ['SO42-', ''],
    ['HCO3-', ''],
    ['pH值', ''],
    ['矿化度', '']
  ]), '水质分析')

  // 下载
  const fileName = `${project.name || '项目'}_华宁基础数据_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, fileName)
  return fileName
}

// ============ 照片 ZIP 打包 ============
export async function exportPhotosZip(project, allPhotos) {
  const zip = new JSZip()
  const photos = Object.values(allPhotos).flat()
  
  if (photos.length === 0) {
    alert('该项目没有照片')
    return
  }

  // 按钻孔号分目录
  for (const p of photos) {
    const folder = p.boreholeId || '未分类'
    zip.folder(folder).file(p.fileName || `photo_${p.id}.jpg`, p.blob)
  }

  const fileName = `${project.name || '项目'}_岩心照片_${new Date().toISOString().slice(0, 10)}.zip`
  const content = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return fileName
}

// ============ 打印钻孔现场记录表（PDF/HTML 备选） ============
export function printFieldTable(project, borehole, records) {
  const win = window.open('', '_blank')
  if (!win) return alert('⚠️ 请允许浏览器弹窗以打印')
  
  let rowsHtml = records.map(r => `
    <tr>
      <td>${r.roundNo || ''}</td>
      <td>${fmtDepth(r.startDepth)}</td>
      <td>${fmtDepth(r.endDepth)}</td>
      <td>${r.soilName || ''}</td>
      <td>${r.color || ''} ${r.state || ''}</td>
      <td>${(r.description || '').replace(/\n/g, '<br>')}</td>
      <td>${r.takeRate ?? ''}</td>
      <td>${r.isRock ? (r.rqd ?? '') : ''}</td>
      <td>${r.hammerN ?? ''}</td>
      <td>${r.hammerRod ?? ''}</td>
      <td>${(r.remarks || '').replace(/\n/g, '<br>')}</td>
    </tr>
  `).join('')

  win.document.write(`
    <!doctype html><html><head><meta charset="utf-8">
    <title>钻孔现场记录表 - ${borehole.boreholeNo}</title>
    <style>
      body{font-family:"SimSun","宋体",serif;padding:20px}
      h2{text-align:center;margin-bottom:4px}
      .meta{text-align:center;color:#666;font-size:13px;margin-bottom:12px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #000;padding:4px 6px;text-align:center;vertical-align:middle}
      th{background:#f0f0f0}
      .meta-row{display:flex;justify-content:space-between;font-size:13px;margin:8px 0}
      @media print{button{display:none}}
    </style></head><body>
    <h2>钻 孔 现 场 记 录 表</h2>
    <div class="meta">${project?.name || ''} · ${borehole.boreholeNo} · 终孔深度 ${(records.length>0?records[records.length-1].endDepth:0)?.toFixed(2)} m</div>
    <div class="meta-row">
      <span>开孔口径: _____ mm</span>
      <span>终孔口径: _____ mm</span>
      <span>钻机型号: ________</span>
    </div>
    <table>
      <tr><th rowspan="2">回次</th><th colspan="2">进尺(m)</th><th rowspan="2">岩土名称</th><th rowspan="2">岩性描述</th><th rowspan="2">取芯率%</th><th rowspan="2">RQD%</th><th colspan="2">原位测试</th><th rowspan="2">钻进过程/异常</th></tr>
      <tr><th>自</th><th>止</th><th>击数N</th><th>杆长m</th></tr>
      ${rowsHtml || '<tr><td colspan="11" style="padding:40px;color:#aaa">（暂无回次数据）</td></tr>'}
    </table>
    <div style="margin-top:20px;font-size:13px">
      <span>勘察单位：________</span>
      <span style="float:right">钻机负责人：________ 编录员：________ 日期：________</span>
    </div>
    <div style="text-align:center;margin-top:20px"><button onclick="window.print()" style="padding:10px 30px;font-size:14px">🖨️ 打印</button></div>
    </body></html>
  `)
  win.document.close()
}
