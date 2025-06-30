const DB_NAME = 'ToothPasteDB';
const DB_VERSION = 1;

// Open or upgrade the database to include any needed object store
function openDB(clientID) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(clientID)) {
        db.createObjectStore(clientID);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save base64 shared secret under a given key in the store for a specific client
export async function saveSharedSecretBase64(clientID, key, value) {
  const db = await openDB(clientID);
  const tx = db.transaction(clientID, 'readwrite');
  tx.objectStore(clientID).put(value, key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// Load the base64 shared secret for a given client and key
export async function loadSharedSecretBase64(clientID, key) {
  const db = await openDB(clientID);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(clientID, 'readonly');
    const req = tx.objectStore(clientID).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
