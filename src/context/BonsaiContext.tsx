import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, db } from '../firebase';
import { Tree, Measurement, CareLog, Task, CareType, CareGuide } from '../types';
import { careGuides as defaultCareGuides } from '../careGuides';
import { PocketbaseService } from '../utils/pocketbase';
import { 
  savePhotoLocal, 
  getPhotoLocal,
  deletePhotoLocal, 
  clearAllPhotosLocal, 
  getAllCachedPhotoIds 
} from '../utils/idb';

// Helper to strip heavy base64 strings from photos array before writing to JSON or memory cache
export const stripFullImagesForCache = (treesList: Tree[]): Tree[] => {
  return treesList.map(t => {
    const strippedImages = t.images?.map(img => {
      if (typeof img === 'object' && img !== null) {
        return { ...img, base64: '' };
      }
      return img;
    });
    return {
      ...t,
      images: strippedImages
    };
  });
};

export const toPocketBaseId = (id: string): string => {
  if (/^[a-z0-9]{15}$/.test(id)) {
    return id;
  }
  let clean = id.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (clean.length < 15) {
    const padding = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let padIdx = 0;
    while (clean.length < 15) {
      clean += padding[padIdx % padding.length];
      padIdx++;
    }
  } else {
    clean = clean.substring(0, 15);
  }
  return clean;
};

// Automatic structural healing function to guard against data corruption, duplicate entries or orphaned metrics
export const autoHealMissingTrees = (
  rawTrees: Tree[],
  rawM: Record<string, Measurement[]>,
  rawL: Record<string, CareLog[]>,
  rawT: Record<string, Task[]>
): Tree[] => {
  const mergedTrees = [...rawTrees];
  const treeIds = new Set(mergedTrees.map(t => t.id));

  const allReferencedTreeIds = new Set<string>();
  Object.keys(rawM).forEach(id => allReferencedTreeIds.add(id));
  Object.keys(rawL).forEach(id => allReferencedTreeIds.add(id));
  Object.keys(rawT).forEach(id => allReferencedTreeIds.add(id));

  allReferencedTreeIds.forEach(treeId => {
    if (!treeIds.has(treeId)) {
      console.warn(`Healing routine: Discovered orphaned references for Tree ${treeId}. Re-creating lost Tree record.`);
      const firstM = rawM[treeId]?.[0];
      const firstL = rawL[treeId]?.[0];
      const firstT = rawT[treeId]?.[0];
      const fallbackSpecies = firstM?.notes || firstL?.type || firstT?.title || 'Unknown Specimen';

      const newTree: Tree = {
        id: treeId,
        userId: 'anonymous',
        name: `Healed Specimen`,
        species: fallbackSpecies.slice(0, 30),
        status: 'Early Development',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mergedTrees.push(newTree);
    }
  });

  return mergedTrees;
};

interface BonsaiContextValue {
  user: User | null;
  authLoading: boolean;
  trees: Tree[];
  measurements: Record<string, Measurement[]>; // key: treeId
  careLogs: Record<string, CareLog[]>; // key: treeId
  tasks: Record<string, Task[]>; // key: treeId
  careGuides: CareGuide[];
  loading: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
  addTree: (treeData: Omit<Tree, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateTree: (treeId: string, treeData: Partial<Tree>) => Promise<void>;
  deleteTree: (treeId: string) => Promise<void>;
  addMeasurement: (treeId: string, width: number, date: string, notes?: string) => Promise<void>;
  updateMeasurement: (treeId: string, measurementId: string, width: number, date: string, notes?: string) => Promise<void>;
  deleteMeasurement: (treeId: string, measurementId: string) => Promise<void>;
  addCareLog: (treeId: string, type: CareType, date: string, notes?: string) => Promise<void>;
  updateCareLog: (treeId: string, logId: string, type: CareType, date: string, notes?: string) => Promise<void>;
  deleteCareLog: (treeId: string, logId: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  addTask: (treeId: string, title: string, type: string, dueDate: string) => Promise<void>;
  toggleTask: (treeId: string, taskId: string, completed: boolean) => Promise<void>;
  deleteTask: (treeId: string, taskId: string) => Promise<void>;
  updateCareGuide: (id: string, updated: CareGuide) => Promise<void>;
  addCareGuide: (guide: Omit<CareGuide, 'id'>) => Promise<void>;
  deleteCareGuide: (id: string) => Promise<void>;
  resetCareGuides: () => Promise<void>;
  // Pocketbase Tailscale Server Sync
  pbEnabled: boolean;
  pbSyncStatus: 'unconfigured' | 'connected' | 'syncing' | 'synced' | 'error';
  pbSyncMessage: string;
  connectPocketbase: (url: string, identity: string, password?: string, useNativeFiles?: boolean) => Promise<{ success: boolean; error?: string }>;
  disconnectPocketbase: () => void;
  syncPocketbaseNow: () => Promise<void>;
  importCollection: (
    importedTrees: Tree[],
    importedM: Record<string, Measurement[]>,
    importedL: Record<string, CareLog[]>,
    importedT: Record<string, Task[]>
  ) => Promise<void>;
}

const BonsaiContext = createContext<BonsaiContextValue | undefined>(undefined);

export function BonsaiProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, Measurement[]>>({});
  const [careLogs, setCareLogs] = useState<Record<string, CareLog[]>>({});
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [careGuides, setCareGuides] = useState<CareGuide[]>([]);
  const [loading, setLoading] = useState(true);

  // Pocketbase States
  const [pbEnabled, setPbEnabled] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('pb_enabled') === 'true' : false;
  });
  const [pbSyncStatus, setPbSyncStatus] = useState<'unconfigured' | 'connected' | 'syncing' | 'synced' | 'error'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pb_enabled') === 'true' ? 'connected' : 'unconfigured';
    }
    return 'unconfigured';
  });
  const [pbSyncMessage, setPbSyncMessage] = useState<string>('');

  // Helper to sync local data bidirectionally with Firestore when logged in (Disabled by user request)
  const syncWithFirestore = async (
    userId: string, 
    currentTrees: Tree[], 
    currentM: Record<string, Measurement[]>, 
    currentL: Record<string, CareLog[]>, 
    currentT: Record<string, Task[]>, 
    currentGuides: CareGuide[]
  ) => {
    // Cloud Firestore Sync completely disabled by user request
  };

  // 1. Authenticated state disabled for purely offline and Tailscale PocketBase PC synchronization
  useEffect(() => {
    setUser(null);
    setAuthLoading(false);
  }, []);

  // 2. Initial Offline-First Local Storage bootloader with IndexedDB photo hydration
  useEffect(() => {
    const loadCachedAndHydrate = async () => {
      const cachedTrees = localStorage.getItem('bonsai_trees');
      const cachedMeasurements = localStorage.getItem('bonsai_measurements');
      const cachedLogs = localStorage.getItem('bonsai_logs');
      const cachedTasks = localStorage.getItem('bonsai_tasks');
      const cachedGuides = localStorage.getItem('bonsai_care_guides');

      let initialTrees: Tree[] = [];
      if (cachedTrees) {
        try {
          const parsed = JSON.parse(cachedTrees) as Tree[];
          initialTrees = parsed;
        } catch (err) {
          console.error('Failed to parse cached trees:', err);
        }
      }

      let initialMeasurements: Record<string, Measurement[]> = {};
      if (cachedMeasurements) {
        try {
          initialMeasurements = JSON.parse(cachedMeasurements);
        } catch (err) {
          console.error('Failed to parse cached measurements:', err);
        }
      }

      let initialLogs: Record<string, CareLog[]> = {};
      if (cachedLogs) {
        try {
          initialLogs = JSON.parse(cachedLogs);
        } catch (err) {
          console.error('Failed to parse cached care logs:', err);
        }
      }

      let initialTasks: Record<string, Task[]> = {};
      if (cachedTasks) {
        try {
          initialTasks = JSON.parse(cachedTasks);
        } catch (err) {
          console.error('Failed to parse cached tasks:', err);
        }
      }

      // Check if we need to migrate/normalize any IDs to Pocketbase standard
      let needsWriteback = false;

      // 1. Migrate Trees
      const migratedTrees = initialTrees.map(tree => {
        const compliantId = toPocketBaseId(tree.id);
        if (compliantId !== tree.id) {
          needsWriteback = true;
          return { ...tree, id: compliantId };
        }
        return tree;
      });

      // 2. Migrate Measurements
      const migratedM: Record<string, Measurement[]> = {};
      Object.keys(initialMeasurements).forEach(oldTreeId => {
        const compliantTreeId = toPocketBaseId(oldTreeId);
        const list = initialMeasurements[oldTreeId] || [];
        const migratedList = list.map(m => {
          const compliantMId = toPocketBaseId(m.id);
          if (compliantMId !== m.id || compliantTreeId !== m.treeId) {
            needsWriteback = true;
          }
          return { ...m, id: compliantMId, treeId: compliantTreeId };
        });
        migratedM[compliantTreeId] = migratedList;
      });

      // 3. Migrate Care Logs
      const migratedL: Record<string, CareLog[]> = {};
      Object.keys(initialLogs).forEach(oldTreeId => {
        const compliantTreeId = toPocketBaseId(oldTreeId);
        const list = initialLogs[oldTreeId] || [];
        const migratedList = list.map(l => {
          const compliantLId = toPocketBaseId(l.id);
          if (compliantLId !== l.id || compliantTreeId !== l.treeId) {
            needsWriteback = true;
          }
          return { ...l, id: compliantLId, treeId: compliantTreeId };
        });
        migratedL[compliantTreeId] = migratedList;
      });

      // 4. Migrate Tasks
      const migratedT: Record<string, Task[]> = {};
      Object.keys(initialTasks).forEach(oldTreeId => {
        const compliantTreeId = toPocketBaseId(oldTreeId);
        const list = initialTasks[oldTreeId] || [];
        const migratedList = list.map(t => {
          const compliantTId = toPocketBaseId(t.id);
          if (compliantTId !== t.id || compliantTreeId !== t.treeId) {
            needsWriteback = true;
          }
          return { ...t, id: compliantTId, treeId: compliantTreeId };
        });
        migratedT[compliantTreeId] = migratedList;
      });

      let initialGuides: CareGuide[] = [];
      if (cachedGuides) {
        try {
          initialGuides = JSON.parse(cachedGuides);
        } catch (err) {
          console.error('Failed to parse cached guides:', err);
          initialGuides = defaultCareGuides;
        }
      } else {
        initialGuides = defaultCareGuides;
      }

      // 5. Migrate Care Guides
      const migratedGuides = initialGuides.map(guide => {
        const compliantId = toPocketBaseId(guide.id);
        if (compliantId !== guide.id) {
          needsWriteback = true;
          return { ...guide, id: compliantId };
        }
        return guide;
      });

      if (needsWriteback) {
        console.log('PocketBase ID normalization migration triggered.');
        localStorage.setItem('bonsai_trees', JSON.stringify(migratedTrees));
        localStorage.setItem('bonsai_measurements', JSON.stringify(migratedM));
        localStorage.setItem('bonsai_logs', JSON.stringify(migratedL));
        localStorage.setItem('bonsai_tasks', JSON.stringify(migratedT));
        localStorage.setItem('bonsai_care_guides', JSON.stringify(migratedGuides));
      }

      // Hydrate all image base64 data from IndexedDB
      const allImageIds: string[] = [];
      migratedTrees.forEach(t => {
        if (t.images && Array.isArray(t.images)) {
          t.images.forEach(img => {
            if (typeof img === 'object' && img !== null && img.id) {
              allImageIds.push(img.id);
            }
          });
        }
      });

      const { getPhotosLocalMap, savePhotoLocal } = await import('../utils/idb');
      const idbPhotosMap = await getPhotosLocalMap(allImageIds);

      const hydratedTrees = await Promise.all(migratedTrees.map(async (t) => {
        if (t.images && Array.isArray(t.images) && t.images.length > 0) {
          const hImages = await Promise.all(t.images.map(async (img, idx) => {
            if (typeof img === 'object' && img !== null) {
              let b64 = img.base64 || idbPhotosMap[img.id] || '';
              if (!b64 && (img.isStarred || idx === 0) && t.photoBase64) {
                b64 = t.photoBase64;
                savePhotoLocal(img.id, b64);
              }
              return { ...img, base64: b64 };
            }
            return img;
          }));
          return { ...t, images: hImages };
        } else if (t.photoBase64) {
          const defaultImgId = `init-${t.id}`;
          savePhotoLocal(defaultImgId, t.photoBase64);
          return {
            ...t,
            images: [{
              id: defaultImgId,
              base64: t.photoBase64,
              takenAt: t.dateAcquired || new Date().toISOString().split('T')[0],
              isStarred: true
            }]
          };
        }
        return t;
      }));

      setTrees(hydratedTrees);
      setMeasurements(migratedM);
      setCareLogs(migratedL);
      setTasks(migratedT);
      setCareGuides(migratedGuides);

      setLoading(false);
    };

    loadCachedAndHydrate();
  }, []);

  // Shared processor for PocketBase sync results to cache remote base64 images locally
  const processAndSaveSyncResult = async (syncRes: {
    trees: Tree[];
    measurements: Record<string, Measurement[]>;
    careLogs: Record<string, CareLog[]>;
    tasks: Record<string, Task[]>;
    careGuides?: CareGuide[];
    updatedAt: string;
  }) => {
    // 1. Cache any full base64 images downloaded from PocketBase locally to IndexedDB before stripping
    if (syncRes.trees && Array.isArray(syncRes.trees)) {
      for (const t of syncRes.trees) {
        if (t.images && Array.isArray(t.images)) {
          for (const img of t.images) {
            if (typeof img === 'object' && img !== null && img.base64) {
              await savePhotoLocal(img.id, img.base64);
            }
          }
        }
      }
    }

    // 2. Hydrate/Preserve base64 data for state trees so active UI views don't lose cached images
    const fullyHydratedTrees = await Promise.all((syncRes.trees || []).map(async (t) => {
      if (t.images && Array.isArray(t.images)) {
        const hImages = await Promise.all(t.images.map(async (img) => {
          if (typeof img === 'object' && img !== null) {
            if (!img.base64) {
              // Check current state first
              const existingTree = trees.find(et => et.id === t.id);
              const existingImg = existingTree?.images?.find((ei: any) => typeof ei === 'object' && ei !== null && ei.id === img.id) as any;
              if (existingImg?.base64) {
                return { ...img, base64: existingImg.base64 };
              }
              // Check local IndexedDB cache
              try {
                const cachedB64 = await getPhotoLocal(img.id);
                if (cachedB64) return { ...img, base64: cachedB64 };
              } catch (err) {
                console.warn('Failed restoring image base64 from IndexedDB in processAndSaveSyncResult:', err);
              }
            }
          }
          return img;
        }));
        return { ...t, images: hImages };
      }
      return t;
    }));

    // 3. Strip full images for high-speed cache / localStorage performance
    const finalStrippedTrees = stripFullImagesForCache(syncRes.trees);

    // 4. Update application state safely respecting local tombstones and optimistic status
    setTrees(fullyHydratedTrees);
    setMeasurements(syncRes.measurements);
    setCareLogs(syncRes.careLogs);
    
    const deletedTaskIds = new Set(PocketbaseService.getDeletedIds('tasks'));
    setTasks(prevTasks => {
      const mergedTasks: Record<string, Task[]> = {};
      const allTreeKeys = new Set([...Object.keys(prevTasks), ...Object.keys(syncRes.tasks || {})]);
      
      allTreeKeys.forEach(tKey => {
        const localList = prevTasks[tKey] || [];
        const remoteList = (syncRes.tasks || {})[tKey] || [];
        
        const localMap = new Map(localList.map(t => [t.id, t]));
        const resultMap = new Map<string, Task>();

        remoteList.forEach(rt => {
          if (deletedTaskIds.has(rt.id)) return;
          const lt = localMap.get(rt.id);
          if (lt) {
            // Keep local completed status if user toggled completion locally
            const isCompleted = lt.completed !== undefined ? lt.completed : rt.completed;
            const completedAt = lt.completedAt !== undefined ? lt.completedAt : rt.completedAt;
            resultMap.set(rt.id, {
              ...rt,
              completed: isCompleted,
              completedAt: isCompleted ? completedAt : undefined
            });
          } else {
            resultMap.set(rt.id, rt);
          }
        });

        // Preserve local tasks not yet in remote and not deleted
        localList.forEach(lt => {
          if (!deletedTaskIds.has(lt.id) && !resultMap.has(lt.id)) {
            resultMap.set(lt.id, lt);
          }
        });

        mergedTasks[tKey] = Array.from(resultMap.values());
      });

      return mergedTasks;
    });

    if (syncRes.careGuides && Array.isArray(syncRes.careGuides)) {
      const deletedGuideIds = new Set(PocketbaseService.getDeletedIds('care_guides'));
      const filteredGuides = syncRes.careGuides.filter(g => !deletedGuideIds.has(g.id) && !deletedGuideIds.has(toPocketBaseId(g.id)));
      setCareGuides(filteredGuides);
    }

    // 4. Mirror to localStorage
    try {
      localStorage.setItem('bonsai_trees', JSON.stringify(finalStrippedTrees));
      localStorage.setItem('bonsai_measurements', JSON.stringify(syncRes.measurements));
      localStorage.setItem('bonsai_logs', JSON.stringify(syncRes.careLogs));
      localStorage.setItem('bonsai_tasks', JSON.stringify(syncRes.tasks));
      if (syncRes.careGuides && Array.isArray(syncRes.careGuides)) {
        const deletedGuideIds = new Set(PocketbaseService.getDeletedIds('care_guides'));
        const filteredGuides = syncRes.careGuides.filter(g => !deletedGuideIds.has(g.id) && !deletedGuideIds.has(toPocketBaseId(g.id)));
        localStorage.setItem('bonsai_care_guides', JSON.stringify(filteredGuides));
      }
      localStorage.setItem('bonsai_updated_at', syncRes.updatedAt);
    } catch (e) {
      console.warn("localStorage save failed post-sync:", e);
    }
  };

  // 3. Pocketbase Initial Auto-Sync bootloader
  useEffect(() => {
    if (pbEnabled) {
      const runInitialPbSync = async () => {
        setPbSyncStatus('syncing');
        setPbSyncMessage('Initializing Tailscale sync...');
        try {
          const localTrees = JSON.parse(localStorage.getItem('bonsai_trees') || '[]');
          const localM = JSON.parse(localStorage.getItem('bonsai_measurements') || '{}');
          const localL = JSON.parse(localStorage.getItem('bonsai_logs') || '{}');
          const localT = JSON.parse(localStorage.getItem('bonsai_tasks') || '{}');
          const localGuides = JSON.parse(localStorage.getItem('bonsai_care_guides') || '[]');
          
          const syncRes = await PocketbaseService.syncData(
            localTrees,
            localM,
            localL,
            localT,
            localGuides,
            (status) => setPbSyncMessage(status)
          );

          await processAndSaveSyncResult(syncRes);

          setPbSyncStatus('synced');
          setPbSyncMessage('Last synced: ' + new Date(syncRes.updatedAt).toLocaleTimeString());
        } catch (err: any) {
          console.warn('Pocketbase initial boot sync failed:', err);
          PocketbaseService.addLog('error', 'Initial Sync Failed', err.message || 'Unknown sync error');
          setPbSyncStatus('error');
          setPbSyncMessage(err.message || 'Connection failed');
        }
      };

      runInitialPbSync();
    }
  }, [pbEnabled]);

  // State updater coordinator
  const updateStateAndSync = async (
    newTrees: Tree[],
    newM: Record<string, Measurement[]>,
    newL: Record<string, CareLog[]>,
    newT: Record<string, Task[]>,
    customGuides?: CareGuide[],
    isImport = false
  ) => {
    const currentGuides = customGuides || careGuides;
    const localUpdatedAt = new Date().toISOString();

    // Ensure every image object has a unique id so they are successfully saved/queried in IndexedDB
    for (const t of newTrees) {
      if (t.images && Array.isArray(t.images)) {
        t.images = t.images.map((img, idx) => {
          if (typeof img === 'object' && img !== null) {
            if (!img.id) {
              return {
                ...img,
                id: 'img_healed_' + Math.random().toString(36).substring(2, 9) + '_' + idx
              };
            }
          }
          return img;
        });
      }
    }

    // 1. Save all existing full base64 images to IndexedDB and ensure React state retains 100% of image base64 strings
    const fullyHydratedStateTrees = await Promise.all(newTrees.map(async (t) => {
      const prevTree = trees.find(pt => pt.id === t.id);
      if (t.images && Array.isArray(t.images) && t.images.length > 0) {
        const hImages = await Promise.all(t.images.map(async (img, idx) => {
          if (typeof img === 'object' && img !== null) {
            let b64 = img.base64;
            // 1. If missing, check previous tree state in memory
            if (!b64 && prevTree && prevTree.images && Array.isArray(prevTree.images)) {
              const prevImg = prevTree.images.find((pi: any) => typeof pi === 'object' && pi !== null && (pi.id === img.id || (pi.takenAt === img.takenAt && idx === prevTree.images.indexOf(pi)))) as any;
              if (prevImg?.base64) {
                b64 = prevImg.base64;
              }
            }
            // 2. If missing, check local IndexedDB store
            if (!b64 && img.id) {
              try {
                const idbB64 = await getPhotoLocal(img.id);
                if (idbB64) b64 = idbB64;
              } catch (e) {}
            }
            // 3. If missing, check tree.photoBase64 fallback
            if (!b64 && (img.isStarred || idx === 0) && t.photoBase64) {
              b64 = t.photoBase64;
            }

            if (b64 && img.id) {
              savePhotoLocal(img.id, b64);
            }

            return { ...img, base64: b64 || '' };
          }
          return img;
        }));
        return { ...t, images: hImages };
      } else if (t.photoBase64) {
        const defaultImgId = `init-${t.id}`;
        savePhotoLocal(defaultImgId, t.photoBase64);
        return {
          ...t,
          images: [{
            id: defaultImgId,
            base64: t.photoBase64,
            takenAt: t.dateAcquired || new Date().toISOString().split('T')[0],
            isStarred: true
          }]
        };
      }
      return t;
    }));

    // 2. Strip full images to prevent localStorage QuotaExceededErrors
    const strippedTrees = stripFullImagesForCache(fullyHydratedStateTrees);

    // Update state synchronously for zero-latency local user interactions
    setTrees(fullyHydratedStateTrees);
    setMeasurements(newM);
    setCareLogs(newL);
    setTasks(newT);
    setCareGuides(currentGuides);

    // Persist local storage cache copy
    try {
      localStorage.setItem('bonsai_trees', JSON.stringify(strippedTrees));
    } catch (e) {
      console.warn("localStorage save failed for trees:", e);
    }

    try {
      localStorage.setItem('bonsai_care_guides', JSON.stringify(currentGuides));
      localStorage.setItem('bonsai_measurements', JSON.stringify(newM));
      localStorage.setItem('bonsai_logs', JSON.stringify(newL));
      localStorage.setItem('bonsai_tasks', JSON.stringify(newT));
      localStorage.setItem('bonsai_updated_at', localUpdatedAt);
    } catch (e) {
      console.warn("localStorage save failed for metadata:", e);
    }

    // Async push to Pocketbase if configured (non-blocking)
    if (PocketbaseService.isEnabled()) {
      PocketbaseService.syncData(newTrees, newM, newL, newT, currentGuides, undefined, isImport)
        .then(async (syncRes) => {
          await processAndSaveSyncResult(syncRes);
          setPbSyncStatus('synced');
          setPbSyncMessage('Last auto-synced: ' + new Date(syncRes.updatedAt).toLocaleTimeString());
        })
        .catch((err) => {
          console.warn('Pocketbase auto-sync failed:', err);
          PocketbaseService.addLog('error', 'Auto-Sync Failed', err.message || 'Unknown auto-sync error');
          setPbSyncStatus('error');
          setPbSyncMessage(err.message || 'Auto-sync failed');
        });
    }

    // Google Cloud Firestore Synchronization disabled by user request
  };

  // Auth Operations (Disabled by user request for full local / PC PocketBase sync)
  const signIn = async () => {};

  const logOut = async () => {};

  const createUuid = () => {
    // Generate exactly 15 characters of lowercase alphanumeric string
    // This is 100% compliant with PocketBase ID requirements (alphanumeric, exactly 15 chars)
    let s = '';
    while (s.length < 15) {
      s += Math.random().toString(36).substring(2);
    }
    return s.substring(0, 15).toLowerCase();
  };

  // CRUD Implementations
  const addTree = async (treeData: Omit<Tree, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    const mockId = createUuid();
    const newTree: Tree = {
      ...treeData,
      id: mockId,
      userId: user ? user.uid : 'anonymous',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const nextTrees = [newTree, ...trees];
    await updateStateAndSync(nextTrees, measurements, careLogs, tasks);
    return mockId;
  };

  const updateTree = async (treeId: string, treeData: Partial<Tree>) => {
    const nextTrees = trees.map(t => t.id === treeId ? { 
      ...t, 
      ...treeData, 
      updatedAt: new Date().toISOString() 
    } : t);
    await updateStateAndSync(nextTrees, measurements, careLogs, tasks);
  };

  const deleteTree = async (treeId: string) => {
    PocketbaseService.addDeletedId('trees', treeId);

    const mList = measurements[treeId] || [];
    mList.forEach(m => PocketbaseService.addDeletedId('measurements', m.id));

    const lList = careLogs[treeId] || [];
    lList.forEach(l => PocketbaseService.addDeletedId('care_logs', l.id));

    const tList = tasks[treeId] || [];
    tList.forEach(t => PocketbaseService.addDeletedId('tasks', t.id));

    if (PocketbaseService.isEnabled()) {
      PocketbaseService.deleteRecord('trees', treeId).catch(e => console.warn('Immediate delete tree failed:', e));
      mList.forEach(m => PocketbaseService.deleteRecord('measurements', m.id).catch(() => {}));
      lList.forEach(l => PocketbaseService.deleteRecord('care_logs', l.id).catch(() => {}));
      tList.forEach(t => PocketbaseService.deleteRecord('tasks', t.id).catch(() => {}));
    }

    const nextTrees = trees.filter(t => t.id !== treeId);
    
    // Clean up local IndexedDB files for images of this deleted tree
    const targetTree = trees.find(t => t.id === treeId);
    if (targetTree && targetTree.images && Array.isArray(targetTree.images)) {
      targetTree.images.forEach(img => {
        if (typeof img === 'object' && img !== null) {
          deletePhotoLocal(img.id);
        }
      });
    }

    const nextM = { ...measurements };
    delete nextM[treeId];

    const nextL = { ...careLogs };
    delete nextL[treeId];

    const nextT = { ...tasks };
    delete nextT[treeId];

    await updateStateAndSync(nextTrees, nextM, nextL, nextT);
  };

  const updateCareGuide = async (id: string, updated: CareGuide) => {
    const nextGuides = careGuides.map(g => g.id === id ? updated : g);
    await updateStateAndSync(trees, measurements, careLogs, tasks, nextGuides);
  };

  const addCareGuide = async (guideData: Omit<CareGuide, 'id'>) => {
    const newId = createUuid();
    const newGuide: CareGuide = { ...guideData, id: newId };
    const nextGuides = [...careGuides, newGuide];
    await updateStateAndSync(trees, measurements, careLogs, tasks, nextGuides);
  };

  const deleteCareGuide = async (id: string) => {
    const pbId = toPocketBaseId(id);
    PocketbaseService.addDeletedId('care_guides', id);
    if (pbId !== id) {
      PocketbaseService.addDeletedId('care_guides', pbId);
    }
    if (PocketbaseService.isEnabled()) {
      PocketbaseService.deleteRecord('care_guides', id).catch(e => console.warn('Immediate delete care guide failed:', e));
      if (pbId !== id) {
        PocketbaseService.deleteRecord('care_guides', pbId).catch(() => {});
      }
    }
    const nextGuides = careGuides.filter(g => g.id !== id && g.id !== pbId);
    await updateStateAndSync(trees, measurements, careLogs, tasks, nextGuides);
  };

  const resetCareGuides = async () => {
    PocketbaseService.clearDeletedIds('care_guides');
    await updateStateAndSync(trees, measurements, careLogs, tasks, defaultCareGuides);
  };

  const addMeasurement = async (treeId: string, width: number, date: string, notes?: string) => {
    const mockId = createUuid();
    const newItem: Measurement = {
      id: mockId,
      userId: user ? user.uid : 'anonymous',
      treeId,
      date,
      width: Math.round(width * 10) / 10,
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };
    const nextM = {
      ...measurements,
      [treeId]: [...(measurements[treeId] || []), newItem],
    };
    await updateStateAndSync(trees, nextM, careLogs, tasks);
  };

  const updateMeasurement = async (treeId: string, measurementId: string, width: number, date: string, notes?: string) => {
    const nextM = {
      ...measurements,
      [treeId]: (measurements[treeId] || []).map(item => item.id === measurementId ? {
        ...item,
        width: Math.round(width * 10) / 10,
        date,
        notes: notes || '',
      } : item),
    };
    await updateStateAndSync(trees, nextM, careLogs, tasks);
  };

  const deleteMeasurement = async (treeId: string, measurementId: string) => {
    PocketbaseService.addDeletedId('measurements', measurementId);
    if (PocketbaseService.isEnabled()) {
      PocketbaseService.deleteRecord('measurements', measurementId).catch(e => console.warn('Immediate delete measurement failed:', e));
    }
    const nextM = {
      ...measurements,
      [treeId]: (measurements[treeId] || []).filter(item => item.id !== measurementId),
    };
    await updateStateAndSync(trees, nextM, careLogs, tasks);
  };

  const addCareLog = async (treeId: string, type: CareType, date: string, notes?: string) => {
    const mockId = createUuid();
    const newItem: CareLog = {
      id: mockId,
      userId: user ? user.uid : 'anonymous',
      treeId,
      type,
      date,
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };
    const nextL = {
      ...careLogs,
      [treeId]: [...(careLogs[treeId] || []), newItem],
    };
    await updateStateAndSync(trees, measurements, nextL, tasks);
  };

  const updateCareLog = async (treeId: string, logId: string, type: CareType, date: string, notes?: string) => {
    const nextL = {
      ...careLogs,
      [treeId]: (careLogs[treeId] || []).map(item => item.id === logId ? {
        ...item,
        type,
        date,
        notes: notes || '',
      } : item),
    };
    await updateStateAndSync(trees, measurements, nextL, tasks);
  };

  const deleteCareLog = async (treeId: string, logId: string) => {
    PocketbaseService.addDeletedId('care_logs', logId);
    if (PocketbaseService.isEnabled()) {
      PocketbaseService.deleteRecord('care_logs', logId).catch(e => console.warn('Immediate delete care log failed:', e));
    }
    const nextL = {
      ...careLogs,
      [treeId]: (careLogs[treeId] || []).filter(item => item.id !== logId),
    };
    await updateStateAndSync(trees, measurements, nextL, tasks);
  };

  const clearAllData = async () => {
    // 1. Clear local IndexedDB photos
    await clearAllPhotosLocal();

    // 2. Clear local tombstone tracking
    PocketbaseService.clearDeletedIds();

    // 3. Clear remote PocketBase data if connected
    if (PocketbaseService.isEnabled()) {
      try {
        await PocketbaseService.purgeAllRemoteData();
      } catch (err: any) {
        console.warn('Failed to purge remote pocketbase collections:', err);
      }
    }

    // 4. Update memory, localStorage, Firestore and clear state
    await updateStateAndSync([], {}, {}, {});
  };

  const addTask = async (treeId: string, title: string, type: string, dueDate: string) => {
    const mockId = createUuid();
    const newItem: Task = {
      id: mockId,
      userId: user ? user.uid : 'anonymous',
      treeId,
      title,
      type,
      dueDate,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    const nextT = {
      ...tasks,
      [treeId]: [...(tasks[treeId] || []), newItem],
    };
    await updateStateAndSync(trees, measurements, careLogs, nextT);
  };

  const toggleTask = async (treeId: string, taskId: string, completed: boolean) => {
    const nextT: Record<string, Task[]> = {};
    let found = false;
    Object.keys(tasks).forEach(tKey => {
      const list = tasks[tKey] || [];
      const updatedList = list.map(t => {
        if (t.id === taskId) {
          found = true;
          return {
            ...t,
            completed,
            completedAt: completed ? new Date().toISOString() : undefined
          };
        }
        return t;
      });
      nextT[tKey] = updatedList;
    });

    if (!found && treeId) {
      nextT[treeId] = (tasks[treeId] || []).map(t => t.id === taskId ? {
        ...t,
        completed,
        completedAt: completed ? new Date().toISOString() : undefined
      } : t);
    }

    await updateStateAndSync(trees, measurements, careLogs, nextT);
  };

  const deleteTask = async (treeId: string, taskId: string) => {
    PocketbaseService.addDeletedId('tasks', taskId);
    if (PocketbaseService.isEnabled()) {
      PocketbaseService.deleteRecord('tasks', taskId).catch(e => console.warn('Immediate delete task failed:', e));
    }
    const nextT: Record<string, Task[]> = {};
    Object.keys(tasks).forEach(tKey => {
      nextT[tKey] = (tasks[tKey] || []).filter(t => t.id !== taskId);
    });
    await updateStateAndSync(trees, measurements, careLogs, nextT);
  };

  const importCollection = async (
    importedTrees: Tree[],
    importedM: Record<string, Measurement[]>,
    importedL: Record<string, CareLog[]>,
    importedT: Record<string, Task[]>
  ) => {
    // 1. Migrate Trees to Pocketbase compliant IDs
    const migratedTrees = importedTrees.map(tree => {
      const compliantId = toPocketBaseId(tree.id);
      return { ...tree, id: compliantId };
    });

    // 2. Migrate Measurements to compliant IDs and correct relation mapping
    const migratedM: Record<string, Measurement[]> = {};
    Object.keys(importedM).forEach(oldTreeId => {
      const compliantTreeId = toPocketBaseId(oldTreeId);
      const list = importedM[oldTreeId] || [];
      const migratedList = list.map(m => {
        const compliantMId = toPocketBaseId(m.id);
        return { ...m, id: compliantMId, treeId: compliantTreeId };
      });
      migratedM[compliantTreeId] = migratedList;
    });

    // 3. Migrate Care Logs to compliant IDs and correct relation mapping
    const migratedL: Record<string, CareLog[]> = {};
    Object.keys(importedL).forEach(oldTreeId => {
      const compliantTreeId = toPocketBaseId(oldTreeId);
      const list = importedL[oldTreeId] || [];
      const migratedList = list.map(l => {
        const compliantLId = toPocketBaseId(l.id);
        return { ...l, id: compliantLId, treeId: compliantTreeId };
      });
      migratedL[compliantTreeId] = migratedList;
    });

    // 4. Migrate Tasks to compliant IDs and correct relation mapping
    const migratedT: Record<string, Task[]> = {};
    Object.keys(importedT).forEach(oldTreeId => {
      const compliantTreeId = toPocketBaseId(oldTreeId);
      const list = importedT[oldTreeId] || [];
      const migratedList = list.map(t => {
        const compliantTId = toPocketBaseId(t.id);
        return { ...t, id: compliantTId, treeId: compliantTreeId };
      });
      migratedT[compliantTreeId] = migratedList;
    });

    const healedTrees = autoHealMissingTrees(migratedTrees, migratedM, migratedL, migratedT);
    // Pass isImport = true to wait for all photos to be written to local IndexedDB correctly
    await updateStateAndSync(healedTrees, migratedM, migratedL, migratedT, undefined, true);
  };

  // Pocketbase Handlers
  const connectPocketbase = async (url: string, identity: string, password?: string, useNativeFiles = false) => {
    setPbSyncStatus('syncing');
    setPbSyncMessage('Connecting to Tailscale PC server...');
    const result = await PocketbaseService.connect(url, identity, password, useNativeFiles);
    if (result.success) {
      setPbEnabled(true);
      setPbSyncStatus('connected');
      setPbSyncMessage('Connected securely to Pocketbase!');
    } else {
      setPbSyncStatus('error');
      setPbSyncMessage(result.error || 'Failed to connect');
    }
    return result;
  };

  const disconnectPocketbase = () => {
    PocketbaseService.disconnect();
    setPbEnabled(false);
    setPbSyncStatus('unconfigured');
    setPbSyncMessage('Pocketbase server disconnected');
  };

  const syncPocketbaseNow = async () => {
    if (!PocketbaseService.isEnabled()) {
      throw new Error('Pocketbase not configured or authenticated');
    }
    setPbSyncStatus('syncing');
    setPbSyncMessage('Syncing data...');
    try {
      const localTrees = JSON.parse(localStorage.getItem('bonsai_trees') || '[]');
      const localM = JSON.parse(localStorage.getItem('bonsai_measurements') || '{}');
      const localL = JSON.parse(localStorage.getItem('bonsai_logs') || '{}');
      const localT = JSON.parse(localStorage.getItem('bonsai_tasks') || '{}');
      const localGuides = JSON.parse(localStorage.getItem('bonsai_care_guides') || '[]');

      const syncRes = await PocketbaseService.syncData(
        localTrees,
        localM,
        localL,
        localT,
        localGuides,
        (status) => setPbSyncMessage(status)
      );

      await processAndSaveSyncResult(syncRes);

      setPbSyncStatus('synced');
      setPbSyncMessage('Last synced: ' + new Date(syncRes.updatedAt).toLocaleTimeString());
    } catch (err: any) {
      console.warn('Pocketbase manual sync failed:', err);
      PocketbaseService.addLog('error', 'Manual Sync Failed', err.message || 'Unknown sync error');
      setPbSyncStatus('error');
      setPbSyncMessage(err.message || 'Sync failed');
      throw err;
    }
  };

  return (
    <BonsaiContext.Provider value={{
      user,
      authLoading,
      trees,
      measurements,
      careLogs,
      tasks,
      careGuides,
      loading,
      signIn,
      logOut,
      addTree,
      updateTree,
      deleteTree,
      addMeasurement,
      updateMeasurement,
      deleteMeasurement,
      addCareLog,
      updateCareLog,
      deleteCareLog,
      clearAllData,
      addTask,
      toggleTask,
      deleteTask,
      updateCareGuide,
      addCareGuide,
      deleteCareGuide,
      resetCareGuides,
      pbEnabled,
      pbSyncStatus,
      pbSyncMessage,
      connectPocketbase,
      disconnectPocketbase,
      syncPocketbaseNow,
      importCollection,
    }}>
      {children}
    </BonsaiContext.Provider>
  );
}

export function useBonsai() {
  const context = useContext(BonsaiContext);
  if (context === undefined) {
    throw new Error('useBonsai must be used within a BonsaiProvider');
  }
  return context;
}
