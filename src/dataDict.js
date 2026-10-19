// 岩土勘察常用数据字典 —— 依据 GB/T 50145 + 自制野外鉴定手册
// 字段：岩土名称 / 状态 / 湿度 / 颜色 / 切面光泽 / 摇振反应 / 颗粒级配 / 骨架含量 / 结构构造

// ============== 完整岩土名称表（约 60 种） ==============
export const SOIL_NAMES = {
  // ---- 粘性土 ----
  clay: '粘土',
  silty_clay: '粉质粘土',
  clay_layer: '粉质粘土与粉土互层',
  organic_clay: '有机质粘土',
  // ---- 粉土 ----
  silt: '粉土',
  // ---- 砂土 ----
  gravel_sand: '砾砂',
  coarse_sand: '粗砂',
  medium_sand: '中砂',
  fine_sand: '细砂',
  silty_sand: '粉砂',
  // ---- 碎石土 ----
  block_stone: '块石',
  broken_stone: '碎石',
  round_gravel: '圆砾',
  angular_gravel: '角砾',
  // ---- 特殊土 ----
  mucky_soil: '淤泥质土',
  peat: '泥炭',
  collapsible_loess: '湿陷性黄土',
  swelling_soil: '膨胀土',
  red_clay: '红黏土',
  laterite: '红土',
  salty_soil: '盐渍土',
  frozen_soil: '冻土',
  // ---- 人工填土 ----
  fill_plain: '素填土',
  fill_misc: '杂填土',
  fill_stone: '开山土石',
  // ---- 风化壳 ----
  residual_soil: '残积土',
  slope_soil: '坡积土',
  talus: '崩积土',
  alluvial_soil: '冲积土',
  colluvial_soil: '洪积土',
  marine_soil: '海积土',
  // ---- 岩石 ----
  // 岩浆岩
  granite: '花岗岩',
  diorite: '闪长岩',
  gabbro: '辉长岩',
  basalt: '玄武岩',
  rhyolite: '流纹岩',
  andesite: '安山岩',
  porphyry: '斑岩',
  // 沉积岩
  mudstone: '泥岩',
  shale: '页岩',
  sandstone: '砂岩',
  conglomerate: '砾岩',
  limestone: '石灰岩',
  dolomite: '白云岩',
  marl: '泥灰岩',
  coal: '煤',
  // 变质岩
  gneiss: '片麻岩',
  schist: '片岩',
  slate: '板岩',
  marble: '大理岩',
  quartzite: '石英岩',
  // 风化带（复合）
  completely_weathered: '全风化岩',
  strongly_weathered: '强风化岩',
  moderately_weathered: '中风化岩',
  slightly_weathered: '微风化岩',
  fresh_rock: '未风化岩',
}

// 用于下拉框的精简列表（按大类分组，常用 ~25 个）
// 分组用 optgroup，但原生 select 不支持，用 [分组标题, null] 做分隔
export const SOIL_NAME_LIST = [
  // 粘性土
  '粘土', '粉质粘土', '粉质粘土与粉土互层',
  // 粉土
  '粉土',
  // 砂土
  '砾砂', '粗砂', '中砂', '细砂', '粉砂',
  // 碎石土
  '块石', '碎石', '圆砾', '角砾',
  // 特殊土
  '淤泥质土', '泥炭', '湿陷性黄土', '膨胀土', '红黏土', '盐渍土',
  // 人工填土
  '素填土', '杂填土', '开山土石',
  // 风化壳
  '残积土', '坡积土',
  // 岩石风化带
  '全风化岩', '强风化岩', '中风化岩', '微风化岩',
  // 其它（手动）
  '其它（手动录入）',
]

// ============== 状态/稠度 ==============
// 粘性土 → 稠度；砂土/粉土/碎石 → 密实度
export const STATES = {
  // --- 粘性土：稠度（流塑→软塑→可塑→硬塑→坚硬） ---
  '粘土': ['流塑', '软塑', '可塑', '硬塑', '坚硬'],
  '粉质粘土': ['流塑', '软塑', '可塑', '硬塑', '坚硬'],
  '粉质粘土与粉土互层': ['软塑', '可塑', '硬塑'],
  '淤泥质土': ['流塑', '软塑'],
  '泥炭': ['流塑', '软塑'],
  '湿陷性黄土': ['可塑', '硬塑', '坚硬'],
  '膨胀土': ['软塑', '可塑', '硬塑'],
  '红黏土': ['软塑', '可塑', '硬塑', '坚硬'],
  // --- 粉土（密实度） ---
  '粉土': ['松散', '稍密', '中密', '密实'],
  // --- 砂土（密实度） ---
  '砾砂': ['松散', '稍密', '中密', '密实'],
  '粗砂': ['松散', '稍密', '中密', '密实'],
  '中砂': ['松散', '稍密', '中密', '密实'],
  '细砂': ['松散', '稍密', '中密', '密实'],
  '粉砂': ['松散', '稍密', '中密', '密实'],
  // --- 碎石土（密实度） ---
  '块石': ['稍密', '中密', '密实'],
  '碎石': ['稍密', '中密', '密实'],
  '圆砾': ['稍密', '中密', '密实'],
  '角砾': ['稍密', '中密', '密实'],
  // --- 人工填土 ---
  '素填土': ['松散', '稍密', '中密', '密实'],
  '杂填土': ['松散', '稍密', '中密'],
  '开山土石': ['松散', '稍密', '中密', '密实'],
  // --- 风化壳 ---
  '残积土': ['可塑', '硬塑'],
  '坡积土': ['稍密', '中密', '密实'],
  // --- 岩石风化带 ---
  '全风化岩': ['可塑', '硬塑'],
  '强风化岩': ['—'],
  '中风化岩': ['—'],
  '微风化岩': ['—'],
  // 默认
  '_default': ['可塑', '硬塑', '稍密', '中密', '密实']
}

// ============== 湿度 ==============
export const MOISTURES = ['稍湿', '湿', '饱和', '干燥', '很湿']

// ============== 颜色 ==============
export const COLORS = [
  '黄', '灰', '褐', '红褐', '棕', '深灰', '黑褐', '绿灰', '紫褐',
  '白', '黄褐', '灰褐', '灰褐色', '灰白色', '红褐色', '黄褐色',
  '灰绿色', '灰黑色', '褐黄色'
]

// ============== 切面光泽（粉土/粘性土） ==============
export const SECTION_GLOSS = ['光滑', '稍有光滑', '无光滑']

// ============== 摇振反应（粉土专用） ==============
export const SHAKE_REACTION = ['迅速', '中等', '缓慢', '无']

// ============== 颗粒级配描述（砂土专用） ==============
export const GRADING = ['良好', '一般', '不良', '均匀', '级配良好', '级配不良']

// ============== 骨架颗粒含量（碎石土专用） ==============
export const FRAMEWORK = ['骨架颗粒>70%', '骨架颗粒50-70%', '骨架颗粒<60%', '充填物为主']

// ============== 结构构造 ==============
export const STRUCTURES = ['均质', '层理明显', '交错层理', '块状', '孔隙发育', '垂直节理', '节理发育']

// ============== 岩石硬度（野外鉴别） ==============
export const ROCK_HARDNESS = {
  '花岗岩': '坚硬岩（锤击声脆）',
  '玄武岩': '坚硬岩',
  '流纹岩': '坚硬岩',
  '安山岩': '坚硬岩',
  '砂岩': '较软岩（小刀可刻划）',
  '泥岩': '软岩（手指甲可刻）',
  '页岩': '软岩',
  '石灰岩': '较软岩（盐酸起泡）',
  '白云岩': '较软岩',
  '片麻岩': '坚硬岩',
  '片岩': '较软岩',
  '板岩': '较软岩',
  '大理岩': '坚硬岩',
  '石英岩': '极坚硬岩（锤击难碎）',
}

// ============== 风化程度 → 野外描述模板 ==============
export const WEATHERING_DESC = {
  '全风化岩': '组织结构完全破坏，矿物成分大部风化成土状，可徒手捏碎，外观似土但保留原岩结构痕迹',
  '强风化岩': '组织结构大部分破坏，矿物成分显著变化，节理面附近矿物风化成土状，风化裂隙发育，岩体被切割成岩块，锤击易碎',
  '中风化岩': '组织结构部分破坏，矿物成分部分变化，节理面有铁锰质渲染，风化裂隙发育，岩体较完整，锤击声较脆',
  '微风化岩': '组织结构基本未变，仅节理面有铁锰质渲染或矿物略有变色，有少量风化裂隙，岩体完整性好，锤击声脆',
  '未风化岩': '组织结构未变，矿物成分新鲜，仅节理面有轻微铁锰质渲染，无风化裂隙'
}

// ============== 智能性状描述生成器 ==============
export function generateDescription(soilName, state, color, options = {}) {
  const {
    moisture = '稍湿',
    sectionGloss = '',
    shakeReaction = '',
    grading = '',
    framework = '',
    structure = '',
    inclusions = ''  // 夹含物
  } = options

  if (!soilName) return ''
  const p = []

  // 基础：颜色 + 湿度 + 状态
  if (color) p.push(color + '色')
  p.push(moisture)
  if (state && state !== '—') p.push(state)

  // ======== 粘性土鉴别 ========
  if (['粘土', '粉质粘土', '粉质粘土与粉土互层'].includes(soilName)) {
    if (soilName === '粘土') {
      p.push('切面非常光滑，干强度高，韧性高')
    } else if (soilName === '粉质粘土') {
      if (sectionGloss === '光滑') p.push('切面光滑')
      else if (sectionGloss === '稍有光滑') p.push('切面稍有光滑')
      p.push('干强度中等-高，韧性中等')
    } else {
      p.push('粉质粘土与粉土互层')
    }
    // 搓条
    if (state === '可塑' || state === '硬塑') {
      p.push('能搓成1-3mm土条')
    }
    if (inclusions) p.push('夹' + inclusions)
    if (structure) p.push(structure)
  }

  // ======== 粉土鉴别 ========
  else if (soilName === '粉土') {
    p.push('切面粗糙，干强度低，韧性低')
    if (shakeReaction) p.push('摇振反应' + shakeReaction)
    if (inclusions) p.push('夹' + inclusions)
  }

  // ======== 砂土 ========
  else if (['砾砂', '粗砂', '中砂', '细砂', '粉砂'].includes(soilName)) {
    p.push('颗粒组成为' + soilName.replace('砂', ''))
    // 颗粒描述
    if (soilName === '砾砂') p.push('约1/4以上颗粒较粗，状似荞麦粒')
    else if (soilName === '粗砂') p.push('约一半以上颗粒较粗，状似小米粒')
    else if (soilName === '中砂') p.push('约一半以上颗粒与砂糖近似')
    else if (soilName === '细砂') p.push('大部分颗粒与玉米粉近似')
    else if (soilName === '粉砂') p.push('大部分颗粒与小米粉近似')
    if (grading) p.push('颗粒级配' + grading)
    if (state === '松散' || state === '稍密') p.push('颗粒基本分散')
    else p.push('颗粒间有胶结，' + state)
  }

  // ======== 碎石土 ========
  else if (['块石', '碎石', '圆砾', '角砾'].includes(soilName)) {
    p.push(soilName + '为主')
    if (framework) p.push(framework)
    if (state === '密实') {
      p.push('骨架颗粒呈交错排列，连续紧密接触，掏取大颗粒后填充物能成窝形')
    } else if (state === '稍密') {
      p.push('骨架颗粒排列混乱，大部分不接触，被充填物包裹')
    }
    p.push('充填物为' + (inclusions || '砂土'))
  }

  // ======== 特殊土 ========
  else if (soilName.includes('黄土')) {
    p.push('具大孔隙结构，垂直节理发育，遇水易产生湿陷')
  }
  else if (soilName.includes('膨胀土')) {
    p.push('含蒙脱石等膨胀性矿物，遇水膨胀、失水开裂，胀缩性显著')
  }
  else if (soilName.includes('红黏土') || soilName.includes('红土')) {
    p.push('发育于石灰岩风化壳之上，粘颗粒含量高，颜色鲜艳')
  }
  else if (soilName.includes('淤泥')) {
    p.push('高有机质含量，有腥臭味，湿时手指轻压即陷')
  }
  else if (soilName.includes('泥炭')) {
    p.push('主要为未完全分解的植物残体，有机质含量>50%，灼烧时可燃')
  }
  else if (soilName.includes('盐渍土')) {
    p.push('含盐量较高，地表有盐霜/盐壳，对混凝土和金属有腐蚀性')
  }

  // ======== 风化壳 ========
  else if (WEATHERING_DESC[soilName]) {
    p.push(WEATHERING_DESC[soilName])
  }

  // ======== 岩石 ========
  else if (ROCK_HARDNESS[soilName]) {
    p.push(ROCK_HARDNESS[soilName])
    if (structure) p.push(structure)
    p.push('矿物成分以长石、石英、云母等为主')
    p.push('节理发育，岩块新鲜')
  }

  // ======== 填土 ========
  else if (soilName.includes('填土')) {
    if (soilName === '素填土') p.push('以黏性土/粉土/砂土为主，成分较单一，含少量碎块')
    else if (soilName === '杂填土') p.push('含砖石、混凝土块、木料、生活垃圾等建筑垃圾，成分杂乱不均')
    else if (soilName === '开山土石') p.push('以碎石、块石为主，含少量粘性土充填')
  }

  // ======== 默认 ========
  else {
    if (soilName) p.push(soilName)
    if (structure) p.push(structure)
    if (inclusions) p.push('夹' + inclusions)
  }

  return p.filter(Boolean).join(', ')
}

// ============== 格式化工具 ==============
export function fmtDepth(d) {
  if (d === null || d === undefined || d === '') return ''
  return Number(d).toFixed(2)
}

export function fmtNo(v) {
  if (v === null || v === undefined || v === '') return ''
  return Number(v)
}

// ============== 钻孔类型下拉 ==============
export const BOREHOLE_TYPES = [
  '控制取土孔',
  '一般取土孔',
  '控制标贯孔',
  '一般标贯孔',
  '鉴别孔',
  '控制取土兼标贯孔',
  '一般取土兼标贯孔',
  '探井',
  '静探孔'
]

// ============== 自动建议下一个孔号 ==============
export function suggestBoreholeNo(prefix, existingNos) {
  const nums = (existingNos || []).map(no => {
    const m = String(no).match(/(\d+)/)
    return m ? parseInt(m[1]) : 0
  }).filter(n => n > 0)
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `${prefix || 'ZK'}${String(next).padStart(2, '0')}`
}
