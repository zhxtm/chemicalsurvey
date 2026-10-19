// ============= 许可证 / 激活码系统 =============
// 保护机制：首次打开激活 + 试用期 30 天 + 功能锁
// 注意：纯前端保护非 100%，但足够防住 90% 未授权使用

// 🔒 你可以改这些配置
const CONFIG = {
  // 激活码前缀（识别来源）
  CODE_PREFIX: 'HXZK',
  // 试用期天数（激活后从当天开始算）
  TRIAL_DAYS: 30,
  // 加密盐（随便改一串长字符，别人不知道这个盐就生成不了有效激活码）
  SALT: 'HuaxueZhiKan-WaiYeCaiJi-2026-SecretSalt-8f3a2b7c',
  // 受保护的功能（试用期结束后禁用）
  LOCKED_FEATURES: ['export_huanning', 'export_lizheng', 'export_images_zip', 'export_profile_png'],
}

// ============= 简易 MD5（不用外部依赖） =============
function md5(str) {
  function rol(n, c) { return (n << c) | (n >>> (32 - c)) }
  function cmn(q, a, b, x, s, t) { return rol((a + q + x + t) | 0, s) + b }
  function ff(a,b,c,d,x,s,t) { return cmn((b & c) | (~b & d), a, b, x, s, t) }
  function gg(a,b,c,d,x,s,t) { return cmn((b & d) | (c & ~d), a, b, x, s, t) }
  function hh(a,b,c,d,x,s,t) { return cmn(b ^ c ^ d, a, b, x, s, t) }
  function ii(a,b,c,d,x,s,t) { return cmn(c ^ (b | ~d), a, b, x, s, t) }

  function coreMd5(x, len) {
    x[len >> 5] |= 0x80 << (len % 32)
    x[(((len + 64) >>> 9) << 4) + 14] = len
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878
    for (let i = 0; i < x.length; i += 16) {
      const olda = a, oldb = b, oldc = c, oldd = d
      a = ff(a,b,c,d, x[i+ 0], 7, -680876936); d = ff(d,a,b,c, x[i+ 1],12, -389564586);
      c = ff(c,d,a,b, x[i+ 2],17,  606105819); b = ff(b,c,d,a, x[i+ 3],22,-1044525330);
      a = ff(a,b,c,d, x[i+ 4], 7, -176418897); d = ff(d,a,b,c, x[i+ 5],12, 1200080426);
      c = ff(c,d,a,b, x[i+ 6],17,-1473231341); b = ff(b,c,d,a, x[i+ 7],22,  -45705983);
      a = ff(a,b,c,d, x[i+ 8], 7, 1770035416); d = ff(d,a,b,c, x[i+ 9],12,-1958414417);
      c = ff(c,d,a,b, x[i+10],17,     -42063); b = ff(b,c,d,a, x[i+11],22,-1990404162);
      a = ff(a,b,c,d, x[i+12], 7, 1804603682); d = ff(d,a,b,c, x[i+13],12,  -40341101);
      c = ff(c,d,a,b, x[i+14],17,-1502002290); b = ff(b,c,d,a, x[i+15],22, 1236535329);
      a = gg(a,b,c,d, x[i+ 1], 5,-165796510); d = gg(d,a,b,c, x[i+ 6], 9,-1069501632);
      c = gg(c,d,a,b, x[i+11],14,  643717713); b = gg(b,c,d,a, x[i+ 0],20,-373897302);
      a = gg(a,b,c,d, x[i+ 5], 5, -701558691); d = gg(d,a,b,c, x[i+10], 9,   38016083);
      c = gg(c,d,a,b, x[i+15],14,-660478335); b = gg(b,c,d,a, x[i+ 4],20,-405537848);
      a = gg(a,b,c,d, x[i+ 9], 5,  568446438); d = gg(d,a,b,c, x[i+14], 9,-1019803690);
      c = gg(c,d,a,b, x[i+ 3],14,-187363961); b = gg(b,c,d,a, x[i+ 8],20, 1163531501);
      a = gg(a,b,c,d, x[i+13], 5,-1444681467); d = gg(d,a,b,c, x[i+ 2], 9,  -51403784);
      c = gg(c,d,a,b, x[i+ 7],14, 1735328473); b = gg(b,c,d,a, x[i+12],20,-1926607734);
      a = hh(a,b,c,d, x[i+ 5], 4,    -378558); d = hh(d,a,b,c, x[i+ 8],11,-2022574463);
      c = hh(c,d,a,b, x[i+11],16, 1839030562); b = hh(b,c,d,a, x[i+14],23,  -35309556);
      a = hh(a,b,c,d, x[i+ 1], 4,-1530992060); d = hh(d,a,b,c, x[i+ 4],11, 1272893353);
      c = hh(c,d,a,b, x[i+ 7],16, -155497632); b = hh(b,c,d,a, x[i+10],23,-1094730640);
      a = hh(a,b,c,d, x[i+13], 4,  681279174); d = hh(d,a,b,c, x[i+ 0],11, -358537222);
      c = hh(c,d,a,b, x[i+ 3],16, -722521979); b = hh(b,c,d,a, x[i+ 6],23,   76029189);
      a = hh(a,b,c,d, x[i+ 9], 4, -640364487); d = hh(d,a,b,c, x[i+12],11, -421815835);
      c = hh(c,d,a,b, x[i+15],16,  530742520); b = hh(b,c,d,a, x[i+ 2],23, -995338651);
      a = ii(a,b,c,d, x[i+ 0], 6, -198630844); d = ii(d,a,b,c, x[i+ 7],10, 1126891415);
      c = ii(c,d,a,b, x[i+14],15,-1416354905); b = ii(b,c,d,a, x[i+ 5],21,  -57434055);
      a = ii(a,b,c,d, x[i+12], 6, 1700485571); d = ii(d,a,b,c, x[i+ 3],10,-1894986606);
      c = ii(c,d,a,b, x[i+10],15,   -1051523); b = ii(b,c,d,a, x[i+ 1],21,-2054922799);
      a = ii(a,b,c,d, x[i+ 8], 6, 1873313359); d = ii(d,a,b,c, x[i+15],10,  -30611744);
      c = ii(c,d,a,b, x[i+ 6],15,-1560198380); b = ii(b,c,d,a, x[i+13],21, 1309151649);
      a = ii(a,b,c,d, x[i+ 4], 6, -145523070); d = ii(d,a,b,c, x[i+11],10,-1120210379);
      c = ii(c,d,a,b, x[i+ 2],15,  718787259); b = ii(b,c,d,a, x[i+ 9],21, -343485551);
      a = ii(a,b,c,d, x[i+14], 6, -426355552); d = ii(d,a,b,c, x[i+ 1],10, -176188977);
      c = ii(c,d,a,b, x[i+ 8],15, 1200080426); b = ii(b,c,d,a, x[i+15],21, -1473231341);
      a = ii(a,b,c,d, x[i+ 6], 6,     -457059); d = ii(d,a,b,c, x[i+13],10, 1770035416);
      c = ii(c,d,a,b, x[i+ 4],15,-1958414417); b = ii(b,c,d,a, x[i+11],22,     -42063);
      a = ii(a,b,c,d, x[i+ 2], 6,-1990404162); d = ii(d,a,b,c, x[i+ 9],10, 1804603682);
      c = ii(c,d,a,b, x[i+12],15,  -40341101); b = ii(b,c,d,a, x[i+ 5],21,-1502002290);
      a = ii(a,b,c,d, x[i+14], 6, 1236535329);
      a = (a + olda) | 0; b = (b + oldb) | 0;
      c = (c + oldc) | 0; d = (d + oldd) | 0
    }
    return [a, b, c, d]
  }
  function toUtf8(s) {
    const out = []
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i)
      if (c < 0x80) out.push(c)
      else if (c < 0x800) { out.push(0xC0 | (c>>6)); out.push(0x80 | (c&0x3F)) }
      else { out.push(0xE0 | (c>>12)); out.push(0x80 | ((c>>6)&0x3F)); out.push(0x80 | (c&0x3F)) }
    }
    return out
  }
  const bytes = toUtf8(str)
  const words = []
  for (let i = 0; i < bytes.length * 8; i += 32) {
    words[i >> 5] = 0
    for (let j = 0; j < 4; j++) {
      words[i >> 5] |= (bytes[(i >> 3) + j] || 0) << (24 - 8 * j)
    }
  }
  const [a, b, c, d] = coreMd5(words, bytes.length * 8)
  return [a, b, c, d].map(n => {
    const s = (n >>> 0).toString(16)
    return s.length < 8 ? '0'.repeat(8 - s.length) + s : s
  }).join('')
}

// ============= 激活码验证 =============
// 激活码格式: HXZK-YYYYMMDD-XXXXXXXX
// YYYYMMDD = 到期日期（从激活当天+30天）
// XXXXXXXX = md5(到期日期 + SALT) 的前8位（大写）

export function verifyCode(inputCode) {
  if (!inputCode) return { ok: false, reason: '激活码为空' }
  const trimmed = inputCode.trim().toUpperCase()
  const parts = trimmed.split('-')
  if (parts.length !== 3 || parts[0] !== CONFIG.CODE_PREFIX) {
    return { ok: false, reason: '格式错误，应为 HXZK-YYYYMMDD-XXXXXXXX' }
  }
  const [prefix, expireDate, checksum] = parts
  // 验证到期日期格式
  if (!/^\d{8}$/.test(expireDate)) return { ok: false, reason: '日期格式错误' }
  // 验证校验码
  const expectedCheck = md5(expireDate + CONFIG.SALT).slice(0, 8).toUpperCase()
  if (checksum !== expectedCheck) return { ok: false, reason: '激活码无效' }
  // 验证日期是否过期
  const exp = new Date(expireDate.slice(0,4) + '-' + expireDate.slice(4,6) + '-' + expireDate.slice(6,8))
  const now = new Date()
  now.setHours(0,0,0,0); exp.setHours(0,0,0,0)
  if (now > exp) return { ok: false, reason: '激活码已过期' }
  return { ok: true, expireDate }
}

// ============= 生成激活码（你发给记录员之前用这个生成） =============
export function generateCode(months = 1, startDate = new Date()) {
  const exp = new Date(startDate)
  exp.setDate(exp.getDate() + CONFIG.TRIAL_DAYS * months)
  const y = exp.getFullYear()
  const m = String(exp.getMonth() + 1).padStart(2, '0')
  const d = String(exp.getDate()).padStart(2, '0')
  const dateStr = `${y}${m}${d}`
  const checksum = md5(dateStr + CONFIG.SALT).slice(0, 8).toUpperCase()
  return `${CONFIG.CODE_PREFIX}-${dateStr}-${checksum}`
}

// ============= 本地存储激活状态 =============
const STORAGE_KEY = 'chemical_survey_license_v1'

export function getLicense() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    // 过期检测
    const exp = new Date(data.expireDate)
    const now = new Date(); now.setHours(0,0,0,0); exp.setHours(0,0,0,0)
    if (now > exp) return { ...data, expired: true }
    return { ...data, expired: false }
  } catch { return null }
}

export function setLicense(inputCode) {
  const result = verifyCode(inputCode)
  if (!result.ok) return result
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    code: inputCode.trim().toUpperCase(),
    expireDate: result.expireDate,
    activatedAt: new Date().toISOString()
  }))
  return { ok: true, expireDate: result.expireDate }
}

export function clearLicense() { localStorage.removeItem(STORAGE_KEY) }

// ============= 功能锁检测 =============
export function isFeatureLocked(featureKey) {
  const lic = getLicense()
  if (!lic || lic.expired) return true  // 没激活或过期 → 所有锁定功能都锁
  return false
}

export function daysRemaining() {
  const lic = getLicense()
  if (!lic) return 0
  const exp = new Date(lic.expireDate)
  const now = new Date(); now.setHours(0,0,0,0); exp.setHours(0,0,0,0)
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
}

export { CONFIG }
