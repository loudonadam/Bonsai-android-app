import JSZip from 'jszip';
import { Tree, Measurement, CareLog, Task, BonsaiStatus, TreePhoto, TreeAccolade } from '../types';
import { compressBase64Image, extractPhotoMetadata, sanitizeDateString } from '../utils';

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
 * Robust CSV parser that handles double-quoted fields, comma separators, 
 * escaped characters, and multi-line CSV column values.
 */
function parseCSV(content: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let currentVal = '';
  let insideQuote = false;

  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentVal += '"';
        i++; // skip next char
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if (char === '\n' && !insideQuote) {
      row.push(currentVal.trim());
      result.push(row);
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    result.push(row);
  }
  return result;
}

/**
 * Convert raw CSV text into mapped objects based on header row keys
 */
function csvToObjects(content: string): Record<string, string>[] {
  const rows = parseCSV(content);
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const objects: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 0 || (r.length === 1 && r[0] === '')) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    objects.push(obj);
  }
  return objects;
}

/**
 * Intelligent mapper to match various development stage labels to our local BonsaiStatus state
 */
function mapStageToBonsaiStatus(stage: string, fallbackStatus?: string): BonsaiStatus {
  const s = (stage || '').toLowerCase().trim();
  if (s.includes('refinement')) return 'Refinement';
  if (s.includes('mature') || s.includes('exhibition')) return 'Mature';
  if (s.includes('pre-bonsai') || s.includes('pre_bonsai') || s.includes('prebonsai') || s.includes('seedling') || s.includes('cutting')) return 'Pre-Bonsai';
  
  return 'Early Development';
}

/**
 * Reads JSZipObject file contents securely as a Base64 encoded image and returns correct Data URL
 */
async function zipFileToBase64(file: JSZip.JSZipObject, maxWidth = 2400, maxHeight = 2400, quality = 0.95): Promise<string> {
  const arrayBuffer = await file.async('arraybuffer');
  const bytes = new Uint8Array(arrayBuffer);
  let binaryString = '';
  const len = bytes.length;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const base64Str = btoa(binaryString);
  const ext = file.name.split('.').pop() || 'jpg';
  const mime = ext.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
  const rawDataUrl = `data:${mime};base64,${base64Str}`;
  
  // High fidelity default to keep details razor-sharp on import
  return await compressBase64Image(rawDataUrl, maxWidth, maxHeight, quality);
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
    'Registered Timestamp',
    'Is in Graveyard',
    'Memorial Lesson Learned',
    'Accolades & Achievements'
  ];

  const rows = trees.map(t => {
    const accoladesStr = (t.accoladesList || [])
      .map(acc => `${acc.title} (${acc.date})`)
      .join(' | ') || (t.accolades || '');

    return [
      t.id,
      t.name,
      t.species,
      t.status,
      t.style || 'Unspecified',
      t.approximateAge || '',
      t.dateAcquired || '',
      (t.notes || '').replace(/"/g, '""').replace(/\n/g, ' '),
      t.createdAt || '',
      t.isDead ? 'Yes' : 'No',
      (t.lessonLearned || '').replace(/"/g, '""').replace(/\n/g, ' '),
      accoladesStr.replace(/"/g, '""').replace(/\n/g, ' ')
    ];
  });

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

  let getPhotoLocal: any = null;
  try {
    const idbModule = await import('./idb');
    getPhotoLocal = idbModule.getPhotoLocal;
  } catch (err) {
    console.warn("Could not load IndexedDB photo module for ZIP export:", err);
  }

  // Strip photos base64 from the metadata payload to keep the json lightweight and separate photos
  const sanitizedTrees = await Promise.all(trees.map(async t => {
    // 1. Handle main thumbnail configuration
    let photoPath: string | undefined = undefined;
    if (t.photoBase64) {
      try {
        const ext = getExtensionFromBase64(t.photoBase64);
        const filename = `${t.id}_thumb.${ext}`;
        const rawBytes = base64ToUint8Array(t.photoBase64);
        photosFolder?.file(filename, rawBytes);
        photoPath = `photos/${filename}`;
      } catch (err) {
        console.error(`Failed to pack primary thumbnail for tree: ${t.name}`, err);
      }
    }

    // 2. Handle timeline historical pictures
    const sanitizedImages = await Promise.all((t.images || []).map(async (img, idx) => {
      if (!img) return null;
      if (typeof img === 'string') {
        try {
          const ext = getExtensionFromBase64(img);
          const filename = `${t.id}_legacy_${idx}.${ext}`;
          const rawBytes = base64ToUint8Array(img);
          photosFolder?.file(filename, rawBytes);
          return {
            id: `legacy-${idx}-${t.id}`,
            photoPath: `photos/${filename}`,
            takenAt: t.dateAcquired || new Date().toISOString().split('T')[0],
            isStarred: idx === 0
          } as any;
        } catch (err) {
          console.error(`Failed to pack legacy string image for tree: ${t.name}`, err);
          return null;
        }
      } else {
        let b64 = img.base64;
        if (!b64 && img.id && getPhotoLocal) {
          try {
            const cachedB64 = await getPhotoLocal(img.id);
            if (cachedB64) {
              b64 = cachedB64;
            }
          } catch (err) {
            console.warn(`Failed to hydrate historical image ${img.id} from local IndexedDB:`, err);
          }
        }

        if (b64) {
          try {
            const ext = getExtensionFromBase64(b64);
            const filename = `${img.id}.${ext}`;
            const rawBytes = base64ToUint8Array(b64);
            photosFolder?.file(filename, rawBytes);
            return {
              ...img,
              base64: undefined, // Strip inline base64
              photoPath: `photos/${filename}` // Store reference pointer
            };
          } catch (err) {
            console.error(`Failed to pack historical image ${img.id} for tree: ${t.name}`, err);
            return img;
          }
        }
        return img;
      }
    }));

    const filteredImages = sanitizedImages.filter(Boolean);

    return {
      ...t,
      photoBase64: undefined, // Strip inline base64
      photoPath: photoPath, // Store reference pointer
      images: filteredImages
    };
  }));

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

  // 4. Generate and compile zip file
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
  
  // Detect if this is the multi-csv directory structure
  let indexCsvFile: JSZip.JSZipObject | null = null;
  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (relativePath.replace(/\\/g, '/').endsWith('data/trees/index.csv')) {
      indexCsvFile = file;
      break;
    }
  }

  // Handle MULTI-CSV and PHOTO FOLDER Layout structure
  if (indexCsvFile) {
    const csvContent = await indexCsvFile.async('string');
    const treeRows = csvToObjects(csvContent);
    
    const finalTrees: Tree[] = [];
    const measurementsMap: Record<string, Measurement[]> = {};
    const careLogsMap: Record<string, CareLog[]> = {};
    const tasksMap: Record<string, Task[]> = {};

    for (const row of treeRows) {
      const folderRaw = row['folder'] || '';
      const folderName = folderRaw.replace(/\\/g, '/');
      const treeId = row['id'] || row['tree id'] || Math.random().toString(36).substring(2, 9);
      
      const commonName = row['species_common_name'] || '';
      const scientificName = row['species_scientific_name'] || '';
      const speciesName = row['species / botanical name'] || commonName || scientificName || row['species_id'] || 'Unspecified Specimen';
      
      // Calculate approximateAge based on origin_date vs current time
      let age: number | undefined;
      const originDateStr = row['origin_date'];
      if (originDateStr) {
        const originYear = new Date(originDateStr).getFullYear();
        if (!isNaN(originYear)) {
          age = Math.max(0, new Date().getFullYear() - originYear);
        }
      } else if (row['approximateage'] || row['estimated age (years)']) {
        const parsedAge = parseInt(row['approximateage'] || row['estimated age (years)']);
        if (!isNaN(parsedAge)) {
          age = parsedAge;
        }
      }

      const activeStatus = mapStageToBonsaiStatus(row['development_stage'] || row['status level'], row['status'] || 'Healthy');

      const isDeadStr = row['isdead'] || row['is_dead'] || row['is in graveyard'] || '';
      const isDead = isDeadStr.toLowerCase() === 'true' || isDeadStr.toLowerCase() === 'yes' || isDeadStr === '1';

      const lessonLearned = row['lessonlearned'] || row['lesson_learned'] || row['memorial lesson learned'] || undefined;

      let accoladesList: TreeAccolade[] = [];
      const accoladesVal = row['accolades'] || row['accolades & achievements'] || '';
      if (accoladesVal) {
        if (accoladesVal.includes('|')) {
          accoladesList = accoladesVal.split('|').map((part: string) => {
            const trimmed = part.trim();
            const dateMatch = trimmed.match(/\(([^)]+)\)$/);
            const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
            const title = dateMatch ? trimmed.replace(/\(([^)]+)\)$/, '').trim() : trimmed;
            return {
              id: 'acc_' + Math.random().toString(36).substring(2, 9),
              title,
              date
            };
          });
        } else {
          const trimmed = accoladesVal.trim();
          const dateMatch = trimmed.match(/\(([^)]+)\)$/);
          const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
          const title = dateMatch ? trimmed.replace(/\(([^)]+)\)$/, '').trim() : trimmed;
          accoladesList = [{
            id: 'acc_' + Math.random().toString(36).substring(2, 9),
            title,
            date
          }];
        }
      }

      // Setup clean mapped tree
      const mappedTree: Tree = {
        id: treeId,
        userId: '',
        name: row['name'] || row['nickname'] || 'Unnamed Specimen',
        species: speciesName,
        style: row['style'] || row['styling form'] || undefined,
        dateAcquired: row['acquisition_date'] || row['acquisition date'] || row['dateacquired'] || undefined,
        approximateAge: age,
        status: activeStatus,
        notes: row['notes'] || row['general field notes'] || undefined,
        images: [],
        createdAt: row['created_at'] || row['registered timestamp'] || new Date().toISOString(),
        updatedAt: row['updated_at'] || row['registered timestamp'] || new Date().toISOString(),
        isDead: isDead,
        lessonLearned: lessonLearned,
        accoladesList: accoladesList.length > 0 ? accoladesList : undefined
      };

      measurementsMap[treeId] = [];
      careLogsMap[treeId] = [];
      tasksMap[treeId] = [];

      // If a folder name is specified, look inside its subdirectory for logs, measurements, and photos
      if (folderName) {
        // Normalize paths to find subfolder files
        const baseFolder = `data/trees/${folderName}/`;

        // 1. Parse measurements.csv
        const measFile = zip.file(baseFolder + 'measurements.csv') || zip.file(baseFolder.replace(/\//g, '\\') + 'measurements.csv');
        if (measFile) {
          const content = await measFile.async('string');
          const rowData = csvToObjects(content);
          rowData.forEach(mr => {
            const widthVal = parseFloat(mr['trunk_diameter_cm'] || '0');
            measurementsMap[treeId].push({
              id: 'm_' + (mr['id'] || Math.random().toString(36).substring(2, 9)),
              userId: '',
              treeId,
              date: (mr['measured_at'] || mr['created_at'] || '').split('T')[0] || new Date().toISOString().split('T')[0],
              width: isNaN(widthVal) ? 0 : widthVal,
              notes: mr['notes'] || undefined,
              createdAt: mr['created_at'] || new Date().toISOString()
            });
          });
        }

        // 2. Parse updates.csv -> converted to CareLogs
        const updatesFile = zip.file(baseFolder + 'updates.csv') || zip.file(baseFolder.replace(/\//g, '\\') + 'updates.csv');
        if (updatesFile) {
          const content = await updatesFile.async('string');
          const rowData = csvToObjects(content);
          rowData.forEach(ur => {
            careLogsMap[treeId].push({
              id: 'l_' + (ur['id'] || Math.random().toString(36).substring(2, 9)),
              userId: '',
              treeId,
              type: ur['title'] || 'Legacy Update',
              date: (ur['performed_at'] || ur['created_at'] || '').split('T')[0] || new Date().toISOString().split('T')[0],
              notes: ur['description'] || undefined,
              createdAt: ur['created_at'] || new Date().toISOString()
            });
          });
        }

        // 3. Parse notifications.csv -> converted to Tasks / Reminders
        const tasksFile = zip.file(baseFolder + 'notifications.csv') || zip.file(baseFolder.replace(/\//g, '\\') + 'notifications.csv');
        if (tasksFile) {
          const content = await tasksFile.async('string');
          const rowData = csvToObjects(content);
          rowData.forEach(tr => {
            tasksMap[treeId].push({
              id: 't_' + (tr['id'] || Math.random().toString(36).substring(2, 9)),
              userId: '',
              treeId,
              title: tr['title'] || tr['message'] || 'Chore Reminder',
              type: tr['category'] || 'General',
              dueDate: (tr['due_at'] || '').split('T')[0] || new Date().toISOString().split('T')[0],
              completed: tr['read'] === 'true' || tr['read'] === '1',
              createdAt: tr['created_at'] || new Date().toISOString()
            });
          });
        }

        // 4. Parse graveyard.csv -> record as a special status log update
        const graveFile = zip.file(baseFolder + 'graveyard.csv') || zip.file(baseFolder.replace(/\//g, '\\') + 'graveyard.csv');
        if (graveFile) {
          const content = await graveFile.async('string');
          const rowData = csvToObjects(content);
          if (rowData.length > 0) {
            rowData.forEach(g => {
              careLogsMap[treeId].push({
                id: 'g_' + (g['id'] || Math.random().toString(36).substring(2, 9)),
                userId: '',
                treeId,
                type: 'Graveyard Status',
                date: (g['moved_at'] || '').split('T')[0] || new Date().toISOString().split('T')[0],
                notes: `Moved to graveyard section. Category: ${g['category']}. Note: ${g['note']}`,
                createdAt: g['moved_at'] || new Date().toISOString()
              });
            });
            // Also set tree's graveyard status
            mappedTree.isDead = true;
            if (rowData[0] && rowData[0]['note']) {
              mappedTree.lessonLearned = rowData[0]['note'];
            }
          }
        }

        // 5. Parse photos.csv -> Load all image file binaries chronologically
        const photosCsvFile = zip.file(baseFolder + 'photos.csv') || zip.file(baseFolder.replace(/\//g, '\\') + 'photos.csv');
        if (photosCsvFile) {
          const content = await photosCsvFile.async('string');
          const photoRows = csvToObjects(content);
          
          // Sort rows chronologically if taken_at exists
          photoRows.sort((a,b) => {
            const timeA = new Date(a['taken_at'] || a['created_at'] || 0).getTime();
            const timeB = new Date(b['taken_at'] || b['created_at'] || 0).getTime();
            return timeA - timeB;
          });

          const loadedImages: (string | TreePhoto)[] = [];
          let primaryImg: string | undefined;

          for (const pr of photoRows) {
            const relFull = pr['full_path'] || '';
            if (!relFull) continue;

            // Form physical path where the photo binary is packed in the zip
            const possiblePaths = [
              baseFolder + 'photos/' + relFull,
              baseFolder + relFull,
              baseFolder + 'photos/' + relFull.replace(/\\/g, '/'),
              `data/trees/${folderName}/photos/${relFull}`,
              `data/trees/${folderName}/photos/full/${relFull.split('/').pop()}`,
            ];

            let rawImageFile: JSZip.JSZipObject | null = null;
            for (const pathOption of possiblePaths) {
              const fileCheck = zip.file(pathOption) || zip.file(pathOption.replace(/\//g, '\\'));
              if (fileCheck) {
                rawImageFile = fileCheck;
                break;
              }
            }

            if (rawImageFile) {
              try {
                // Read high-quality full photo for the timeline
                const b64DataFull = await zipFileToBase64(rawImageFile, 2400, 2400, 0.95);
                
                // Read crisp thumbnail for list views and card displays
                const b64DataThumb = await zipFileToBase64(rawImageFile, 800, 800, 0.95);
                
                const b64Meta = await extractPhotoMetadata(b64DataFull);
                
                const rawTakenAt = pr['taken_at'] || pr['created_at'] || b64Meta.takenAt || new Date().toISOString().split('T')[0];
                const photoObj: TreePhoto = {
                  id: 'photo_' + Math.random().toString(36).substring(2, 9),
                  base64: b64DataFull,
                  takenAt: sanitizeDateString(rawTakenAt),
                  cameraModel: b64Meta.cameraModel,
                  location: b64Meta.location,
                  isStarred: pr['is_primary'] === 'true' || pr['is_primary'] === '1'
                };
                
                loadedImages.push(photoObj);
                
                const isPrimary = pr['is_primary'] === 'true' || pr['is_primary'] === '1';
                if (isPrimary && !primaryImg) {
                  primaryImg = b64DataThumb;
                }
              } catch (err) {
                console.error('Failed to unpack custom history photograph:', rawImageFile.name, err);
              }
            }
          }

          mappedTree.images = loadedImages;
          
          if (!primaryImg && loadedImages.length > 0) {
            // Fallback: compress full first image to a high quality thumbnail
            const firstImg = loadedImages[0];
            const firstB64 = typeof firstImg === 'string' ? firstImg : firstImg.base64;
            try {
              primaryImg = await compressBase64Image(firstB64, 800, 800, 0.95);
            } catch {
              primaryImg = firstB64;
            }
          }
          mappedTree.photoBase64 = primaryImg;
        }
      }

      finalTrees.push(mappedTree);
    }

    // Load any global/non-tree general notifications if they exist in \data\general\notifications.csv
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (relativePath.replace(/\\/g, '/').endsWith('data/general/notifications.csv')) {
        try {
          const generalContent = await file.async('string');
          const genRows = csvToObjects(generalContent);
          genRows.forEach(gr => {
            const taskId = 'gt_' + (gr['id'] || Math.random().toString(36).substring(2, 9));
            if (!tasksMap['global']) {
              tasksMap['global'] = [];
            }
            tasksMap['global'].push({
              id: taskId,
              userId: '',
              treeId: '',
              title: gr['title'] || gr['message'] || 'General Task Note',
              type: gr['category'] || 'General',
              dueDate: (gr['due_at'] || '').split('T')[0] || new Date().toISOString().split('T')[0],
              completed: gr['read'] === 'true' || gr['read'] === '1',
              createdAt: gr['created_at'] || new Date().toISOString()
            });
          });
        } catch (e) {
          console.error("Failed to parse general notifications list:", e);
        }
      }
    }

    return {
      trees: finalTrees,
      measurements: measurementsMap,
      careLogs: careLogsMap,
      tasks: tasksMap
    };
  }

  // Handle standard JSON snapshot database file fallback structure
  let databaseJsonFile: any = null;
  const photoFilesMap: Record<string, { ext: string; data: Uint8Array }> = {};

  // Traverse the directory structure of the ZIP recursively
  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    // Normalize path to forward slashes for cross-platform matches
    const normPath = relativePath.replace(/\\/g, '/');

    // Skip OS metadata files and MacOS resource forks
    if (normPath.includes('__MACOSX') || normPath.split('/').pop()?.startsWith('._')) {
      continue;
    }

    // Acknowledge the primary JSON database inside the root or any subfolder
    if (normPath.endsWith('bonsai_database.json') || normPath.endsWith('database.json')) {
      databaseJsonFile = file;
    }

    // Capture any image file binary anywhere under photos/ or data/
    if (normPath.includes('photos/') && (normPath.endsWith('.png') || normPath.endsWith('.jpg') || normPath.endsWith('.jpeg') || normPath.endsWith('.webp'))) {
      const parts = normPath.split('/');
      const fileName = parts[parts.length - 1];
      const dotIdx = fileName.lastIndexOf('.');
      if (dotIdx > 0) {
        const ext = fileName.substring(dotIdx + 1);
        const arrayBuffer = await file.async('arraybuffer');
        
        // Store mapped both by exact path and by filename for maximum compatibility
        photoFilesMap[normPath] = { ext, data: new Uint8Array(arrayBuffer) };
        photoFilesMap[fileName] = { ext, data: new Uint8Array(arrayBuffer) };
        
        // Also map legacy tree-id mapping
        const prefixId = fileName.substring(0, dotIdx);
        if (!photoFilesMap[prefixId]) {
          photoFilesMap[prefixId] = { ext, data: new Uint8Array(arrayBuffer) };
        }
      }
    }
  }

  // Fallback 1: Search for any non-system JSON file that contains bonsai, database, backup or portfolio
  if (!databaseJsonFile) {
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const normPath = relativePath.replace(/\\/g, '/');
      if (normPath.includes('__MACOSX') || normPath.split('/').pop()?.startsWith('._')) {
        continue;
      }
      if (normPath.endsWith('.json')) {
        const filename = normPath.split('/').pop()?.toLowerCase() || '';
        if (filename.includes('bonsai') || filename.includes('database') || filename.includes('backup') || filename.includes('portfolio')) {
          databaseJsonFile = file;
          break;
        }
      }
    }
  }

  // Fallback 2: Take the first non-system .json file found anywhere in the ZIP
  if (!databaseJsonFile) {
    for (const [relativePath, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      const normPath = relativePath.replace(/\\/g, '/');
      if (normPath.includes('__MACOSX') || normPath.split('/').pop()?.startsWith('._')) {
        continue;
      }
      if (normPath.endsWith('.json')) {
        databaseJsonFile = file;
        break;
      }
    }
  }

  if (!databaseJsonFile) {
    throw new Error('Invalid archive: Missing structural database JSON file or indices matching the portfolio backup configuration');
  }

  const jsonContent = await databaseJsonFile.async('string');
  const database = JSON.parse(jsonContent);

  const importedTrees: Tree[] = Array.isArray(database.trees) ? database.trees : (Array.isArray(database.portfolio) ? database.portfolio : []);
  const importedMeasurements: Record<string, Measurement[]> = database.measurements || database.measurementsMap || {};
  const importedCareLogs: Record<string, CareLog[]> = database.careLogs || database.care_logs || database.logs || {};
  const importedTasks: Record<string, Task[]> = database.tasks || database.reminders || {};

  // Stitch back physical photos into the respective tree records using base64 reconstructions
  const finalTrees = await Promise.all(importedTrees.map(async t => {
    // 1. Rebuild primary thumbnail
    let photoBase64 = t.photoBase64;
    
    // Attempt match via photoPath or prefixed ID
    const pathMatchKey = t.photoPath ? t.photoPath.replace(/\\/g, '/') : '';
    const nameMatchKey = t.photoPath ? t.photoPath.split('/').pop() || '' : '';
    const matchedThumb = photoFilesMap[pathMatchKey] || photoFilesMap[nameMatchKey] || photoFilesMap[t.id + '_thumb'] || photoFilesMap[t.id];
    
    if (matchedThumb) {
      let mime = 'image/jpeg';
      if (matchedThumb.ext.toLowerCase() === 'png') mime = 'image/png';
      if (matchedThumb.ext.toLowerCase() === 'webp') mime = 'image/webp';
      
      let binaryString = '';
      const len = matchedThumb.data.length;
      const chunkSize = 8192;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = matchedThumb.data.subarray(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64Str = btoa(binaryString);
      const b64Url = `data:${mime};base64,${base64Str}`;
      
      // Generate crisp thumbnail
      try {
        photoBase64 = await compressBase64Image(b64Url, 800, 800, 0.95);
      } catch {
        photoBase64 = b64Url;
      }
    }

    // 2. Rebuild historical images timeline
    const restoredImages = await Promise.all((t.images || []).map(async (img: any) => {
      if (!img) return null;
      if (typeof img === 'string') {
        return img; // already base64 string
      }
      
      let base64 = img.base64;
      const imgPathMatchKey = img.photoPath ? img.photoPath.replace(/\\/g, '/') : '';
      const imgNameMatchKey = img.photoPath ? img.photoPath.split('/').pop() || '' : '';
      const matchedImgFile = photoFilesMap[imgPathMatchKey] || photoFilesMap[imgNameMatchKey] || photoFilesMap[img.id];
      
      if (matchedImgFile) {
        let mime = 'image/jpeg';
        if (matchedImgFile.ext.toLowerCase() === 'png') mime = 'image/png';
        if (matchedImgFile.ext.toLowerCase() === 'webp') mime = 'image/webp';
        
        let binaryString = '';
        const len = matchedImgFile.data.length;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          const chunk = matchedImgFile.data.subarray(i, i + chunkSize);
          binaryString += String.fromCharCode.apply(null, Array.from(chunk));
        }
        const base64Str = btoa(binaryString);
        const b64Url = `data:${mime};base64,${base64Str}`;
        
        try {
          // timeline image is high resolution
          base64 = await compressBase64Image(b64Url, 2400, 2400, 0.95);
        } catch {
          base64 = b64Url;
        }
      }
      
      const photoId = img.id || 'img_rec_' + Math.random().toString(36).substring(2, 9);
      
      return {
        ...img,
        id: photoId,
        base64,
        photoPath: undefined // clean pointer for standard database usage
      };
    }));

    const filteredImages = restoredImages.filter(Boolean) as (string | TreePhoto)[];

    // Fallback if images array is empty but we have a main thumbnail
    let finalImages = filteredImages;
    if (finalImages.length === 0 && photoBase64) {
      const b64Meta = await extractPhotoMetadata(photoBase64);
      const rawTakenAt = b64Meta.takenAt || t.dateAcquired || new Date().toISOString().split('T')[0];
      finalImages = [{
        id: 'img_rec_' + Math.random().toString(36).substring(2, 9),
        base64: photoBase64,
        takenAt: sanitizeDateString(rawTakenAt),
        cameraModel: b64Meta.cameraModel,
        location: b64Meta.location,
        isStarred: true
      }];
    }

    return {
      ...t,
      photoBase64: photoBase64,
      photoPath: undefined, // clean pointer
      images: finalImages
    };
  }));

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
