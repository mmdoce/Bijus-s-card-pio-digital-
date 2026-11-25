let database

function openLedger() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('bijus-notifications', 1)
    request.onupgradeneeded = () => {
      const events = request.result.createObjectStore('events')
      events.createIndex('expires', 'expires')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return database
}

// Read and write in the same transaction so tabs and the worker agree.
export async function claimNotification(key, interval = Infinity, now = Date.now()) {
  const db = await openLedger()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('events', 'readwrite')
    const events = transaction.objectStore('events')
    const request = events.get(key)
    let claimed = false
    request.onsuccess = () => {
      const last = request.result
      if (!last || now >= last.expires || now - last.at >= interval) {
        events.put({ at: now, expires: now + 3 * 86400_000 }, key)
        claimed = true
      }
    }
    const expired = events.index('expires').openCursor(IDBKeyRange.upperBound(now))
    expired.onsuccess = () => {
      const cursor = expired.result
      if (cursor) { cursor.delete(); cursor.continue() }
    }
    transaction.oncomplete = () => resolve(claimed)
    transaction.onabort = () => reject(transaction.error)
  })
}
