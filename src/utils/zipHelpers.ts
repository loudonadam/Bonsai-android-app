import JSZip from 'jszip';
import { Tree, Measurement, CareLog, Task } from '../types';

/**
 * Utility to convert base64 image strings into a raw binary Uint8Array
 */
function base64ToUint8Array(base64String: string): Uint8Array {
  const parts = base64String.split(';base64,');
  const rawBase64 = parts.length > 1 ? parts[1] : parts[0];
  const binary = atob(rawBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Utility to guess mimetype based on base64 headers
 */
function getExtensionFromBase64(base64String: string): string {
  if (base64String.startsWith('data:image/png')) return 'png';
  if (base64String.startsWith('data:image/svg')) return 'svg';
  if (base64String.startsWith('data:image/gif')) return 'gif';
  return 'jpg';
}

/**
 * Create a beautifully formatted Excel/CSV inventory of all Bonsai Trees
 */
function generateBonsaiCSV(trees: Tree[]): string {
  const headers = [
    'Tree ID',
    'Nickname',
    'Species / Botanical Name',
    'Status Level',
    'Styling Form',
    'Estimated Age (Years)',
    'Acquisition Date',
    'General Field Notes',
    'Registered Timestamp'
  ];

  const rows = trees.map(t => [
    t.id,
    t.name,
    t.species,
    t.status,
    t.style || 'Unspecified',
    t.approximateAge || '',
    t.dateAcquired || '',
    (t.notes || '').replace(/"/g, '""').replace(/\n/g, ' '),
    t.createdAt || ''
  ]);

  return [
    headers.join(','),
    ...rows.map(r => r.map(val => `"${val}"`).join(','))
  ].join('\n');
}

/**
 * Bundle all workspace data and pictures into a fully structured ZIP directory tree
 */
export async function exportCollectionToZip(
  trees: Tree[],
  measurements: Record<string, Measurement[]>,
  careLogs: Record<string, CareLog[]>,
  tasks: Record<string, Task[]>
): Promise<Blob> {
  const zip = new JSZip();

  // 1. Create subfolders
  const photosFolder = zip.folder('photos');
  const sheetsFolder = zip.folder('spreadsheets');

  // Strip photos base64 from the metadata payload to keep the json lightweight and separate photos
  const sanitizedTrees = trees.map(t => {
    if (t.photoBase64) {
      const ext = getExtensionFromBase64(t.photoBase64);
      return {
        ...t,
        photoBase64: undefined, // Strip inline base64
        photoPath: `photos/${t.id}.${ext}` // Add standard files reference pointer
      };
    }
    return t;
  });

  const dbPayload = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    trees: sanitizedTrees,
    measurements,
    careLogs,
    tasks
  };

  // 2. Add structural database metadata json file
  zip.file('bonsai_database.json', JSON.stringify(dbPayload, null, 2));

  // 3. Add clean readable Excel/CSV summary sheet
  const csvInventory = generateBonsaiCSV(trees);
  sheetsFolder?.file('Bonsai_Inventory_Summary.csv', csvInventory);

  // 4. Extract and compress original base64 raw binary photos separately inside their subfolder
  trees.forEach(t => {
    if (t.photoBase64) {
      try {
        const rawBytes = base64ToUint8Array(t.photoBase64);
        const ext = getExtensionFromBase64(t.photoBase64);
        photosFolder?.file(`${t.id}.${ext}`, rawBytes);
      } catch (err) {
        console.error(`Failed to pack photo binary for tree: ${t.name}`, err);
      }
    }
  });

  // 5. Generate and compile zip file
  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Restore database, reminders and attachments loaded dynamically from uploaded ZIP archives
 */
export async function importCollectionFromZip(
  zipFile: File
): Promise<{
  trees: Tree[];
  measurements: Record<string, Measurement[]>;
  careLogs: Record<string, CareLog[]>;
  tasks: Record<string, Task[]>;
}> {
  const zip = await JSZip.loadAsync(zipFile);
  
  let databaseJsonFile: any = null;
  const photoFilesMap: Record<string, { ext: string; data: Uint8Array }> = {};

  // Traverse the directory structure of the ZIP recursively
  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    // Acknowledge the primary JSON database inside the root or any subfolder
    if (relativePath.endsWith('bonsai_database.json') || relativePath.endsWith('database.json')) {
      databaseJsonFile = file;
    }

    // Acknowledge attachments in the photos folder
    if (relativePath.includes('photos/') && (relativePath.endsWith('.png') || relativePath.endsWith('.jpg') || relativePath.endsWith('.jpeg'))) {
      const fileName = relativePath.split('/').pop() || '';
      const dotIdx = fileName.lastIndexOf('.');
      if (dotIdx > 0) {
        const treeId = fileName.substring(0, dotIdx);
        const ext = fileName.substring(dotIdx + 1);
        const arrayBuffer = await file.async('arraybuffer');
        photoFilesMap[treeId] = {
          ext,
          data: new Uint8Array(arrayBuffer)
        };
      }
    }
  }

  if (!databaseJsonFile) {
    throw new Error('Invalid archive: Missing structural database JSON file (bonsai_database.json)');
  }

  const jsonContent = await databaseJsonFile.async('string');
  const database = JSON.parse(jsonContent);

  const importedTrees: Tree[] = Array.isArray(database.trees) ? database.trees : [];
  const importedMeasurements: Record<string, Measurement[]> = database.measurements || {};
  const importedCareLogs: Record<string, CareLog[]> = database.careLogs || {};
  const importedTasks: Record<string, Task[]> = database.tasks || {};

  // Stitch back physical photos into the respective tree records using base64 reconstructions
  const finalTrees = importedTrees.map(t => {
    const matchedPhoto = photoFilesMap[t.id];
    if (matchedPhoto) {
      let mime = 'image/jpeg';
      if (matchedPhoto.ext.toLowerCase() === 'png') mime = 'image/png';
      
      // Re-encode reconstructed binary safe chunk limits
      let binaryString = '';
      const len = matchedPhoto.data.length;
      const chunkSize = 8192;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = matchedPhoto.data.subarray(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64Str = btoa(binaryString);
      return {
        ...t,
        photoBase64: `data:${mime};base64,${base64Str}`
      };
    }
    return t;
  });

  return {
    trees: finalTrees,
    measurements: importedMeasurements,
    careLogs: importedCareLogs,
    tasks: importedTasks
  };
}

/**
 * Standard client download handler
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.id = 'downloader-link';
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
