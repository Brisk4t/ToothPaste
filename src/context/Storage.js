const DB_NAME = "ToothPasteDB";
const STORE_NAME = "deviceKeys";
const DB_VERSION = 1;

// Open or create a new DB store and set the primary key to clientID
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "clientID" }); // Create a new store if it doesn't exist (assume new user) and set 'clientID' as the primary key
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Save base64 shared secret under a given key in the store for a specific client
export async function saveBase64(clientID, key, value) {
    // Open the database
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = await tx.objectStore(STORE_NAME);

    // Wrap the IDbRequest in a promise and get the clientID key's value
    const existing = await new Promise((resolve, reject) => {
        const request = store.get(clientID);
        request.onsuccess = () =>
            resolve(request.result ?? { clientID, data: {} });
        request.onerror = () => reject(request.error);
    });

    // Wrap the IDbRequest in a promise and put the new value into the clientID key
    existing.data[key] = value;
    await new Promise((resolve, reject) => {
        const request = store.put(existing);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

// Load the base64 shared secret for a given client and key
export async function loadBase64(clientID, key) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(clientID);

    return new Promise((resolve, reject) => {
        req.onsuccess = () => {
            const data = req.result?.data?.[key] ?? null;
            resolve(data);
        };
        req.onerror = () => reject(req.error);
    });
}

// Load the stored base64 keys into the ECDH context if they exist
export async function keyExists(clientID) {
    try {
        const selfPublicKey = await loadBase64(clientID, "SelfPublicKey");
        const selfPrivateKey = await loadBase64(clientID, "SelfPrivateKey");
        const peerPublicKey = await loadBase64(clientID, "PeerPublicKey");

        return !!(selfPublicKey && selfPrivateKey && peerPublicKey);
    } catch (error) {
        console.error("Error retreiving keys in ECDH context", error);
        return false;
    }
}
