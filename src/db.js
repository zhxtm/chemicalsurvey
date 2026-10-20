// IndexedDB 封装 —— 离线优先，支持照片 Blob 存储 + 内业扩展（CPT / 地层 / 剖线）
const DB_NAME = 'survey_app_db'
const DB_VERSION = 2

// v2 新增 stores：
//   cptData:    静力触探原始数据 { boreholeId, depth, qc, fs, ft, type } （type: 1-单桥 2-双桥）
//   layers:     内业分层后的地层表 { boreholeId, layerNo, topDepth, bottomDepth, soilName, state, moisture, color, thickness, subLayerNo, genDesc, description }
//   sectionLines: 剖面线 { id, projectId, lineNo, boreholeNos: [], spacings: [], azimuth }
const STORES = {
  projects: { keyPath: 'id', indexes: [] },
  boreholes: { keyPath: 'id', indexes: [['projectId', 'projectId']] },
  records: { keyPath: 'id', indexes: [['boreholeId', 'boreholeId']] },
  photos: { keyPath: 'id', indexes: [['boreholeId', 'boreholeId'], ['recordId', 'recordId']] },
  cptData: { keyPath: 'id', indexes: [['boreholeId', 'boreholeId']] },
  layers: { keyPath: 'id', indexes: [['boreholeId', 'boreholeId']] },
  sectionLines: { keyPath: 'id', indexes: [['projectId', 'projectId']] }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      const version = e.oldVersion || 0
      console.log(`IndexedDB upgrade: ${version} → ${DB_VERSION}`)

      // 各版本按序迁移
      if (version < 1) {
        for (const [name, config] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: config.keyPath, autoIncrement: false })
            for (const [idxName, idxKey] of config.indexes) {
              store.createIndex(idxName, idxKey, { unique: false })
            }
          }
        }
      }

      if (version < 2) {
        // v1→v2：新增 cptData / layers / sectionLines
        const v2NewStores = ['cptData', 'layers', 'sectionLines']
        for (const name of v2NewStores) {
          const config = STORES[name]
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: config.keyPath, autoIncrement: false })
            for (const [idxName, idxKey] of config.indexes) {
              store.createIndex(idxName, idxKey, { unique: false })
            }
          }
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx(storeName, mode = 'readonly') {
  const db = await openDB()
  return db.transaction(storeName, mode).objectStore(storeName)
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ============ Projects ============
export async function listProjects() {
  const s = await tx('projects')
  return new Promise(resolve => {
    const r = s.getAll()
    r.onsuccess = () => resolve(r.result.sort((a, b) => b.createdAt - a.createdAt))
  })
}
export async function createProject(data) {
  const s = await tx('projects', 'readwrite')
  const p = { ...data, id: data.id || genId(), createdAt: data.createdAt || Date.now() }
  s.add(p)
  return p
}
export async function updateProject(id, patch) {
  const s = await tx('projects', 'readwrite')
  s.put({ ...patch, id })
}
export async function deleteProject(id) {
  const s = await tx('projects', 'readwrite')
  s.delete(id)
}

// 级联删除项目：删 project 同时删其下所有 boreholes + 关联数据（records/photos/layers/cptData/sectionLines）
export async function deleteProjectCascade(projectId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ['projects', 'boreholes', 'records', 'photos', 'layers', 'cptData', 'sectionLines'],
      'readwrite'
    )
    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => resolve()

    // 1. 先找到所有 borehole id（用 projectId 索引）
    const bhStore = tx.objectStore('boreholes')
    const bhIdx = bhStore.index('projectId')
    const bhIds = []
    const bhCursorReq = bhIdx.openCursor(projectId)
    bhCursorReq.onsuccess = (e) => {
      const cur = e.target.result
      if (cur) {
        bhIds.push(cur.value.id)
        cur.delete()
        cur.continue()
      } else {
        // 2. boreholes 删完后，删其他按 boreholeId 关联的表
        for (const bid of bhIds) {
          for (const storeName of ['records', 'photos', 'layers', 'cptData']) {
            const st = tx.objectStore(storeName)
            try {
              const idx = st.index('boreholeId')
              const r = idx.openCursor(bid)
              r.onsuccess = (ev) => {
                const c = ev.target.result
                if (c) { c.delete(); c.continue() }
              }
            } catch (_) { /* 某些 store 可能没 boreholeId 索引 */ }
          }
        }
        // 3. sectionLines 按 projectId
        const slStore = tx.objectStore('sectionLines')
        const slIdx = slStore.index('projectId')
        const slReq = slIdx.openCursor(projectId)
        slReq.onsuccess = (ev) => {
          const c = ev.target.result
          if (c) { c.delete(); c.continue() }
        }
        // 4. project 本身
        tx.objectStore('projects').delete(projectId)
      }
    }
  })
}

// 清空整个数据库（开发调试用）
export async function clearAll() {
  const db = await openDB()
  const tx = db.transaction(db.objectStoreNames, 'readwrite')
  for (const name of db.objectStoreNames) {
    tx.objectStore(name).clear()
  }
}

// ============ Boreholes ============
export async function listBoreholes(projectId) {
  const s = await tx('boreholes')
  return new Promise(resolve => {
    const idx = s.index('projectId')
    const r = idx.getAll(projectId)
    r.onsuccess = () => resolve(r.result.sort((a, b) => (a.boreholeNo || '').localeCompare(b.boreholeNo || '')))
  })
}
export async function getBorehole(id) {
  const s = await tx('boreholes')
  return new Promise(resolve => {
    const r = s.get(id)
    r.onsuccess = () => resolve(r.result)
  })
}
export async function createBorehole(data) {
  const s = await tx('boreholes', 'readwrite')
  const b = { ...data, id: data.id || genId(), createdAt: data.createdAt || Date.now() }
  s.add(b)
  return b
}
export async function updateBorehole(id, patch) {
  const s = await tx('boreholes', 'readwrite')
  const rec = await new Promise(resolve => {
    const r = s.get(id); r.onsuccess = () => resolve(r.result)
  })
  s.put({ ...rec, ...patch, id })
}
export async function deleteBorehole(id) {
  const s = await tx('boreholes', 'readwrite')
  s.delete(id)
  // 级联删除回次和照片
  const allRecords = await listRecords(id)
  for (const r of allRecords) await deleteRecord(r.id)
  const allPhotos = await listPhotosByBorehole(id)
  const ps = await tx('photos', 'readwrite')
  for (const p of allPhotos) ps.delete(p.id)
}

// ============ Records (回次/地层) ============
export async function listRecords(boreholeId) {
  const s = await tx('records')
  return new Promise(resolve => {
    const idx = s.index('boreholeId')
    const r = idx.getAll(boreholeId)
    r.onsuccess = () => resolve(r.result.sort((a, b) => a.roundNo - b.roundNo))
  })
}
export async function getRecord(id) {
  const s = await tx('records')
  return new Promise(resolve => { const r = s.get(id); r.onsuccess = () => resolve(r.result) })
}
export async function createRecord(data) {
  const s = await tx('records', 'readwrite')
  const r = { ...data, id: data.id || genId(), createdAt: data.createdAt || Date.now() }
  s.add(r)
  return r
}
export async function updateRecord(id, patch) {
  const s = await tx('records', 'readwrite')
  const rec = await new Promise(resolve => { const r = s.get(id); r.onsuccess = () => resolve(r.result) })
  s.put({ ...rec, ...patch, id })
}
export async function deleteRecord(id) {
  const s = await tx('records', 'readwrite')
  s.delete(id)
  // 级联删该回次的照片
  const all = await listPhotosByRecord(id)
  const ps = await tx('photos', 'readwrite')
  for (const p of all) ps.delete(p.id)
}

// ============ Photos ============
export async function listPhotosByBorehole(boreholeId) {
  const s = await tx('photos')
  return new Promise(resolve => {
    const idx = s.index('boreholeId')
    const r = idx.getAll(boreholeId)
    r.onsuccess = () => resolve(r.result.sort((a, b) => a.createdAt - b.createdAt))
  })
}
export async function listPhotosByRecord(recordId) {
  const s = await tx('photos')
  return new Promise(resolve => {
    const idx = s.index('recordId')
    const r = idx.getAll(recordId)
    r.onsuccess = () => resolve(r.result.sort((a, b) => a.createdAt - b.createdAt))
  })
}
export async function addPhoto(data) {
  const s = await tx('photos', 'readwrite')
  const p = { ...data, id: data.id || genId(), createdAt: data.createdAt || Date.now() }
  s.add(p)
  return p
}
export async function deletePhoto(id) {
  const s = await tx('photos', 'readwrite')
  s.delete(id)
}

// ============ CPT 静力触探原始数据 ============
// 按 boreholeId 批量存储（一条钻孔的静探曲线是一堆 depth/qc/fs 点）
export async function listCPTByBorehole(boreholeId) {
  const s = await tx('cptData')
  return new Promise(resolve => {
    const idx = s.index('boreholeId')
    const r = idx.getAll(boreholeId)
    r.onsuccess = () => resolve(r.result.sort((a, b) => a.depth - b.depth))
  })
}
export async function upsertCPTPoints(boreholeId, points) {
  // 先删后插：points 是 [{depth, qc, fs, type}]
  const s = await tx('cptData', 'readwrite')
  await new Promise(resolve => {
    const idx = s.index('boreholeId')
    const r = idx.openCursor(boreholeId)
    r.onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor) { cursor.delete(); cursor.continue() } else resolve()
    }
  })
  for (const p of points) {
    s.add({
      id: genId(),
      boreholeId,
      depth: Number(p.depth || 0),
      qc: Number(p.qc || 0),
      fs: Number(p.fs || 0),
      type: p.type || 2,
      createdAt: Date.now()
    })
  }
}
export async function deleteCPTByBorehole(boreholeId) {
  const s = await tx('cptData', 'readwrite')
  await new Promise(resolve => {
    const idx = s.index('boreholeId')
    const r = idx.openCursor(boreholeId)
    r.onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor) { cursor.delete(); cursor.continue() } else resolve()
    }
  })
}

// ============ Layers 内业分层地层 ============
export async function listLayers(boreholeId) {
  const s = await tx('layers')
  return new Promise(resolve => {
    const idx = s.index('boreholeId')
    const r = idx.getAll(boreholeId)
    r.onsuccess = () => resolve(r.result.sort((a, b) => a.topDepth - b.topDepth))
  })
}
export async function upsertLayers(boreholeId, layers) {
  // 先删后插：layers 是 [{topDepth, bottomDepth, soilName, state, moisture, color, subLayerNo, genDesc, description}]
  const s = await tx('layers', 'readwrite')
  await new Promise(resolve => {
    const idx = s.index('boreholeId')
    const r = idx.openCursor(boreholeId)
    r.onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor) { cursor.delete(); cursor.continue() } else resolve()
    }
  })
  let layerNo = 1
  for (const l of layers) {
    const top = Number(l.topDepth || 0)
    const bot = Number(l.bottomDepth || 0)
    s.add({
      id: genId(),
      boreholeId,
      layerNo: layerNo++,
      topDepth: top,
      bottomDepth: bot,
      thickness: Math.max(0, bot - top),
      soilName: l.soilName || '',
      state: l.state || '',
      moisture: l.moisture || '',
      color: l.color || '',
      subLayerNo: l.subLayerNo || '',
      genDesc: l.genDesc || '',
      description: l.description || '',
      createdAt: Date.now()
    })
  }
}
export async function deleteLayersByBorehole(boreholeId) {
  const s = await tx('layers', 'readwrite')
  await new Promise(resolve => {
    const idx = s.index('boreholeId')
    const r = idx.openCursor(boreholeId)
    r.onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor) { cursor.delete(); cursor.continue() } else resolve()
    }
  })
}

// ============ SectionLines 剖面线 ============
export async function listSectionLines(projectId) {
  const s = await tx('sectionLines')
  return new Promise(resolve => {
    const idx = s.index('projectId')
    const r = idx.getAll(projectId)
    r.onsuccess = () => resolve(r.result.sort((a, b) => (a.lineNo || '').localeCompare(b.lineNo || '')))
  })
}
export async function createSectionLine(data) {
  const s = await tx('sectionLines', 'readwrite')
  const l = {
    id: genId(),
    projectId: data.projectId,
    lineNo: data.lineNo || '',
    boreholeNos: data.boreholeNos || [],
    spacings: data.spacings || [],
    azimuth: data.azimuth || '',
    createdAt: Date.now()
  }
  s.add(l)
  return l
}
export async function updateSectionLine(id, patch) {
  const s = await tx('sectionLines', 'readwrite')
  const rec = await new Promise(resolve => {
    const r = s.get(id); r.onsuccess = () => resolve(r.result)
  })
  s.put({ ...rec, ...patch, id })
}
export async function deleteSectionLine(id) {
  const s = await tx('sectionLines', 'readwrite')
  s.delete(id)
}

export { genId }
