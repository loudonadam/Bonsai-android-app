// Simple IndexedDB wrapper for storing large base64 image streams locally.
// Bypasses the 5MB localStorage limit to support gigabytes of offline storage.

const DB_NAME = 'BonsaiPhotosDB';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

const alreadySavedIds = new Set<string>();

/**
 * Saves a high-resolution base64 photo string to local IndexedDB.
 */
export async function savePhotoLocal(photoId: string, base64: string): Promise<boolean> {
  if (!photoId || !base64) return false;
  if (alreadySavedIds.has(photoId)) return true;
  try {
    const db = await getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(base64, photoId);

      request.onsuccess = () => {
        alreadySavedIds.add(photoId);
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to write photo to IndexedDB:', error);
    return false;
  }
}

/**
 * Retrieves a high-resolution base64 photo string from local IndexedDB.
 */
export async function getPhotoLocal(photoId: string): Promise<string | null> {
  if (!photoId) return null;
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(photoId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to read photo from IndexedDB:', error);
    return null;
  }
}

/**
 * Retrieves a dictionary map of photoId -> base64 string in a single fast IndexedDB transaction.
 */
export async function getPhotosLocalMap(photoIds: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const validIds = photoIds.filter(Boolean);
  if (validIds.length === 0) return result;

  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      let count = 0;

      validIds.forEach(id => {
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result) {
            result[id] = req.result;
            alreadySavedIds.add(id);
          }
          count++;
          if (count === validIds.length) resolve(result);
        };
        req.onerror = () => {
          count++;
          if (count === validIds.length) resolve(result);
        };
      });
    });
  } catch (error) {
    console.error('Failed batch read from IndexedDB:', error);
    return result;
  }
}

/**
 * Deletes a photo from local IndexedDB.
 */
export async function deletePhotoLocal(photoId: string): Promise<boolean> {
  if (!photoId) return false;
  alreadySavedIds.delete(photoId);
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(photoId);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to delete photo from IndexedDB:', error);
    return false;
  }
}

/**
 * Completely clears out the local IndexedDB photos store.
 */
export async function clearAllPhotosLocal(): Promise<boolean> {
  alreadySavedIds.clear();
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear local IndexedDB storage:', error);
    return false;
  }
}

/**
 * Retrieves all photo keys from IndexedDB.
 */
export async function getAllCachedPhotoIds(): Promise<string[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        const keys = request.result.map(k => String(k));
        resolve(keys);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to list cached photo IDs from IndexedDB:', error);
    return [];
  }
}
