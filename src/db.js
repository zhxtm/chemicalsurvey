// IndexedDB 封装 —— 离线优先，支持照片 Blob 存储
const DB_NAME = 'survey_app_db'
const DB_VERSION = 1

// 四个 Object Store
const STORES = {
  projects: { keyPath: 'id', indexes: [] },
  boreholes: { keyPath: 'id', indexes: [['projectId', 'projectId']] },
  records: { keyPath: 'id', indexes: [['boreholeId', 'boreholeId']] },
  photos: { keyPath: 'id', indexes: [['boreholeId', 'boreholeId'], ['recordId', 'recordId']] }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      for (const [name, config] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: config.keyPath, autoIncrement: false })
          for (const [idxName, idxKey] of config.indexes) {
            store.createIndex(idxName, idxKey, { unique: false })
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
  const p = { ...data, id: genId(), createdAt: Date.now() }
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
  const b = { ...data, id: genId(), createdAt: Date.now() }
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
  const r = { ...data, id: genId(), createdAt: Date.now() }
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
  const p = { ...data, id: genId(), createdAt: Date.now() }
  s.add(p)
  return p
}
export async function deletePhoto(id) {
  const s = await tx('photos', 'readwrite')
  s.delete(id)
}

export { genId }
