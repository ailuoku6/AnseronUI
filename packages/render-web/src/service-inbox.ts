/** Shared by the page and the app's service worker; bounded, explicit-ack delivery. */
async function database(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = factory.open('anseronui-native-inbox', 1); request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function inbox(factory: IDBFactory, module: string, ids?: string[], event?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const db = await database(factory);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('events', ids || event ? 'readwrite' : 'readonly'); const store = tx.objectStore('events');
      const request = store.getAll(); let result: Record<string, unknown>[] = [];
      request.onsuccess = () => {
        result = (request.result as Record<string, unknown>[]).filter(value => value.module === module).sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
        if (ids) { for (const value of result) if (ids.includes(String(value.id))) store.delete(String(value.id)); result = result.filter(value => !ids.includes(String(value.id))); }
        if (event) { const value = { ...event, module, id: crypto.randomUUID(), timestamp: Date.now() }; store.put(value); result.push(value); while (result.length > 100 || new TextEncoder().encode(JSON.stringify(result)).length > 48000) { const removed = result.shift(); if (!removed) break; store.delete(String(removed.id)); } }
      };
      tx.oncomplete = () => resolve(result.map(({ module: _module, ...value }) => value)); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
