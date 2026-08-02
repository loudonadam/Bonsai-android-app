import ExifReader from 'exifreader';
import { Tree } from './types';

export interface ExtractedPhotoMetadata {
  takenAt: string; // Date string: YYYY-MM-DD
  cameraModel?: string;
  location?: string;
}

/**
 * Safely converts any base64 string (including data URL) to a Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  let cleanB64 = base64;
  if (cleanB64.startsWith('data:')) {
    const parts = cleanB64.split(',');
    if (parts.length > 1) {
      cleanB64 = parts[1];
    }
  }
  const binaryString = atob(cleanB64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Extracts Exif metadata such as Date Taken (DateTimeOriginal), camera make/model, and GPS location.
 */
export async function extractPhotoMetadata(fileOrBase64: File | string): Promise<ExtractedPhotoMetadata> {
  const result: ExtractedPhotoMetadata = {
    takenAt: new Date().toISOString().split('T')[0] // Default to current local date
  };

  try {
    let tags: any;
    if (typeof fileOrBase64 === 'string') {
      const bytes = base64ToUint8Array(fileOrBase64);
      tags = ExifReader.load(bytes.buffer);
    } else {
      tags = await ExifReader.load(fileOrBase64);
    }

    if (tags) {
      // 1. Photo Taken Date extraction
      const dateTimeOriginal = tags['DateTimeOriginal']?.description;
      const dateTimeDigitized = tags['DateTimeDigitized']?.description;
      const dateTime = tags['DateTime']?.description;
      
      const rawDate = dateTimeOriginal || dateTimeDigitized || dateTime;
      if (rawDate) {
        // Usually formatted as "YYYY:MM:DD HH:MM:SS" or "YYYY/MM/DD HH:MM:SS"
        const datePart = rawDate.split(' ')[0];
        const separator = datePart.includes('/') ? '/' : ':';
        const parts = datePart.split(separator);
        if (parts.length === 3) {
          result.takenAt = `${parts[0]}-${parts[1]}-${parts[2]}`;
        }
      } else if (fileOrBase64 instanceof File && fileOrBase64.lastModified) {
        // Use File system timestamp if EXIF does not provide one
        result.takenAt = new Date(fileOrBase64.lastModified).toISOString().split('T')[0];
      }

      // 2. Camera Model extraction
      const make = tags['Make']?.description || '';
      const model = tags['Model']?.description || '';
      let camera = '';
      if (make && model) {
        if (model.toLowerCase().startsWith(make.toLowerCase())) {
          camera = model;
        } else {
          camera = `${make} ${model}`;
        }
      } else {
        camera = model || make;
      }
      if (camera) {
        result.cameraModel = camera.trim();
      }

      // 3. Location (GPS Coordinates) extraction
      const lat = tags['GPSLatitude']?.description;
      const lon = tags['GPSLongitude']?.description;
      if (lat !== undefined && lon !== undefined) {
        const latVal = typeof lat === 'number' ? lat : parseFloat(lat);
        const lonVal = typeof lon === 'number' ? lon : parseFloat(lon);
        
        if (!isNaN(latVal) && !isNaN(lonVal)) {
          const latRef = tags['GPSLatitudeRef']?.value?.[0] || tags['GPSLatitudeRef']?.description;
          const lonRef = tags['GPSLongitudeRef']?.value?.[0] || tags['GPSLongitudeRef']?.description;
          
          let signLat = 1;
          let signLon = 1;
          if (latRef === 'S' || latRef === 's' || String(latRef).toLowerCase().includes('south')) signLat = -1;
          if (lonRef === 'W' || lonRef === 'w' || String(lonRef).toLowerCase().includes('west')) signLon = -1;
          
          const finalLat = latVal * signLat;
          const finalLon = lonVal * signLon;
          result.location = `${finalLat.toFixed(5)}, ${finalLon.toFixed(5)}`;
        }
      }
    }
  } catch (err) {
    console.warn('ExifReader error trying to read metadata:', err);
    if (fileOrBase64 instanceof File && fileOrBase64.lastModified) {
      result.takenAt = new Date(fileOrBase64.lastModified).toISOString().split('T')[0];
    }
  }

  return result;
}

/**
 * Resizes and compresses an image to fit safely inside the Firestore 1MB document size limits
 * by converting it to a compressed base64 JPEG format.
 */
export function compressImage(file: File, maxWidth = 200, maxHeight = 200, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratios
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context could not be created'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * Resizes and compresses a raw Base64 Data URL string to match dimensions and constraints safely.
 * Normalizes images to crisp JPEG base64 strings suitable for PocketBase file conversion and cloud sync.
 */
export function compressBase64Image(base64Str: string, maxWidth = 1200, maxHeight = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      resolve(base64Str || '');
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate aspect ratios
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      } catch (err) {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
}

/**
 * Returns today's date in YYYY-MM-DD format based on local time (not UTC).
 */
export function getTodayLocalDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Safely parses a "YYYY-MM-DD" (or ISO string) into a Date object in local time,
 * avoiding the JavaScript UTC-midnight offset bug where date-only strings like "2026-07-30"
 * are parsed as UTC 00:00:00 and rendered as 1 day earlier in local timezones.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const cleanStr = String(dateStr).trim().split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day);
    }
  }
  return new Date(dateStr);
}

/**
 * Formats a "YYYY-MM-DD" or date string to local date format without timezone shift.
 */
export function formatLocalDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, options || { month: 'short', day: 'numeric' });
}

/**
 * Checks if a date string ("YYYY-MM-DD") is strictly in the past (before today's local midnight).
 */
export function isDateOverdue(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseLocalDate(dateStr);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

/**
 * Robust date sanitization helper to correct null/undefined/invalid date strings
 */
export function sanitizeDateString(d: any, fallbackDate?: string): string {
  const currentLocal = fallbackDate || getTodayLocalDateStr();
  if (!d) return currentLocal;
  
  const str = String(d).trim();
  if (str === '' || str === 'null' || str === 'undefined' || str === 'invalid date') {
    return currentLocal;
  }

  // 1. If string starts with YYYY-MM-DD, preserve YYYY-MM-DD directly without UTC conversion
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && day >= 1 && day <= 31) {
      return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    }
  }

  // 2. Format using local date components
  try {
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return currentLocal;
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return currentLocal;
  }
}

/**
 * Calculates the current age of a tree.
 * Increments the initial approximate age by the number of years that have 
 * elapsed since the tree was acquired or added.
 */
export function calculateCurrentAge(tree: { approximateAge?: number; originDate?: string; dateAcquired?: string; createdAt?: any }): number | undefined {
  if (tree.approximateAge === undefined || tree.approximateAge === null) {
    return undefined;
  }

  const today = new Date();

  // 1. If we have the originDate, calculate age based directly on the elapsed years since the originDate
  if (tree.originDate) {
    try {
      const origin = new Date(tree.originDate);
      if (!isNaN(origin.getTime())) {
        let yearsDiff = today.getFullYear() - origin.getFullYear();
        const monthDiff = today.getMonth() - origin.getMonth();
        const dayDiff = today.getDate() - origin.getDate();
        if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
          yearsDiff--;
        }
        return Math.max(0, yearsDiff);
      }
    } catch {
      // fallback
    }
  }
  
  // 2. Legacy data: Fallback to the previous logic of (createdAt/dateAcquired + approximateAge)
  let targetDateStr = tree.dateAcquired;
  if (!targetDateStr && tree.createdAt) {
    const dateObj = tree.createdAt.toDate ? tree.createdAt.toDate() : new Date(tree.createdAt);
    if (!isNaN(dateObj.getTime())) {
      targetDateStr = dateObj.toISOString().split('T')[0];
    }
  }

  if (!targetDateStr) {
    return tree.approximateAge;
  }

  try {
    const refDate = new Date(targetDateStr);
    
    // Calculate difference in whole years
    let yearsDiff = today.getFullYear() - refDate.getFullYear();
    const monthDiff = today.getMonth() - refDate.getMonth();
    const dayDiff = today.getDate() - refDate.getDate();
    
    // Decrease the year difference by 1 if today is before the month/day anniversary
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      yearsDiff--;
    }

    return Math.max(0, yearsDiff) + tree.approximateAge;
  } catch (err) {
    console.warn("Could not compute dynamic tree age. Falling back to static age:", err);
    return tree.approximateAge;
  }
}


/**
 * Safely resolves the primary thumbnail/photo for a tree.
 * Checks the hydrated tree images array first, then falls back to photoBase64.
 */
export function getTreePrimaryPhoto(tree: Tree): string {
  if (tree.images && Array.isArray(tree.images) && tree.images.length > 0) {
    const starred = tree.images.find(img => typeof img === 'object' && img !== null && img.isStarred) as any;
    if (starred && starred.base64) {
      return starred.base64;
    }
    const first = tree.images[0];
    if (typeof first === 'object' && first !== null) {
      if (first.base64) return first.base64;
    } else if (typeof first === 'string' && first) {
      return first;
    }
  }
  return tree.photoBase64 || '';
}

// Generate some helpful prefilled mock data if a user is completely new (first time opening)

export const samplePreloadTrees = (userId: string = 'anonymous'): Omit<Tree, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] => [
  {
    name: 'Ginkgo Whisper',
    species: 'Chinese Elm',
    style: 'Informal Upright',
    approximateAge: 7,
    dateAcquired: '2025-04-12',
    status: 'Refinement',
    notes: 'Acquired at the spring collectors show. Responds fast to styling and pruning.',
    photoBase64: ''
  },
  {
    name: 'Sentinel Jade',
    species: 'Dwarf Jade',
    style: 'Slanting',
    approximateAge: 4,
    dateAcquired: '2026-01-05',
    status: 'Early Development',
    notes: 'Propagated from a thick cutting. Minimal watering needed, thrives inside near bright east window.',
    photoBase64: ''
  },
  {
    name: 'Komorebi Cedar',
    species: 'Japanese Red Cedar',
    style: 'Formal Upright',
    approximateAge: 12,
    dateAcquired: '2024-09-18',
    status: 'Mature',
    notes: 'Features a perfectly straight vertical trunk line and layered cloud-like branch pads. Requires consistent moisture.',
    photoBase64: ''
  }
];
