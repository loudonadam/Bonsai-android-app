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

// Generate some helpful prefilled mock data if a user is completely new (first time opening)
import { Tree } from './types';

export const samplePreloadTrees = (userId: string = 'anonymous'): Omit<Tree, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] => [
  {
    name: 'Ginkgo Whisper',
    species: 'Chinese Elm',
    style: 'Informal Upright (Moyogi)',
    approximateAge: 7,
    dateAcquired: '2025-04-12',
    status: 'Healthy',
    notes: 'Acquired at the spring collectors show. Responds fast to styling and pruning.',
    photoBase64: ''
  },
  {
    name: 'Sentinel Jade',
    species: 'Dwarf Jade',
    style: 'Slanting (Shakan)',
    approximateAge: 4,
    dateAcquired: '2026-01-05',
    status: 'In Training',
    notes: 'Propagated from a thick cutting. Minimal watering needed, thives inside near bright east window.',
    photoBase64: ''
  }
];
