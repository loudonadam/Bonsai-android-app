import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Tree, Measurement, CareLog, Task, BonsaiStatus, CareType } from '../types';
import { 
  GoogleOneDriveQuota, 
  getGoogleDriveQuota, 
  findOrCreateBonsaiFile, 
  updateBonsaiFileInDrive 
} from '../utils/googleDrive';

interface BonsaiContextValue {
  user: User | null;
  authLoading: boolean;
  trees: Tree[];
  measurements: Record<string, Measurement[]>; // key: treeId
  careLogs: Record<string, CareLog[]>; // key: treeId
  tasks: Record<string, Task[]>; // key: treeId
  loading: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
  addTree: (treeData: Omit<Tree, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateTree: (treeId: string, treeData: Partial<Tree>) => Promise<void>;
  deleteTree: (treeId: string) => Promise<void>;
  addMeasurement: (treeId: string, width: number, date: string, notes?: string) => Promise<void>;
  deleteMeasurement: (treeId: string, measurementId: string) => Promise<void>;
  addCareLog: (treeId: string, type: CareType, date: string, notes?: string) => Promise<void>;
  deleteCareLog: (treeId: string, logId: string) => Promise<void>;
  addTask: (treeId: string, title: string, type: string, dueDate: string) => Promise<void>;
  toggleTask: (treeId: string, taskId: string, completed: boolean) => Promise<void>;
  deleteTask: (treeId: string, taskId: string) => Promise<void>;
  // Google One Storage Extensions
  accessToken: string | null;
  driveFileId: string | null;
  driveSyncStatus: 'unlinked' | 'linked' | 'syncing' | 'synced' | 'error';
  quota: GoogleOneDriveQuota | null;
  reconnectDrive: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  // Google One / Drive state
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [driveFileId, setDriveFileId] = useState<string | null>(null);
  const [driveSyncStatus, setDriveSyncStatus] = useState<'unlinked' | 'linked' | 'syncing' | 'synced' | 'error'>('unlinked');
  const [quota, setQuota] = useState<GoogleOneDriveQuota | null>(null);

  // 1. Synchronize Auth status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // 2. Initial Offline-First Local Storage bootloader
  useEffect(() => {
    const cachedTrees = localStorage.getItem('bonsai_trees');
    const cachedMeasurements = localStorage.getItem('bonsai_measurements');
    const cachedLogs = localStorage.getItem('bonsai_logs');
    const cachedTasks = localStorage.getItem('bonsai_tasks');

    if (cachedTrees) setTrees(JSON.parse(cachedTrees));
    if (cachedMeasurements) setMeasurements(JSON.parse(cachedMeasurements));
    if (cachedLogs) setCareLogs(JSON.parse(cachedLogs));
    if (cachedTasks) setTasks(JSON.parse(cachedTasks));

    setLoading(false);
  }, []);

  // 3. Drive Sync engine loop triggered when an accessToken is connected / refreshed
  useEffect(() => {
    if (!accessToken) {
      setDriveSyncStatus('unlinked');
      setQuota(null);
      return;
    }

    const connectAndFetchDrive = async () => {
      setDriveSyncStatus('syncing');
      try {
        // Fetch current 1TB/15GB Google One Storage space quota
        const driveQuota = await getGoogleDriveQuota(accessToken);
        if (driveQuota) setQuota(driveQuota);

        // Prepare our local configuration state to sync/upload
        const initialLocalState = {
          trees: JSON.parse(localStorage.getItem('bonsai_trees') || '[]'),
          measurements: JSON.parse(localStorage.getItem('bonsai_measurements') || '{}'),
          careLogs: JSON.parse(localStorage.getItem('bonsai_logs') || '{}'),
          tasks: JSON.parse(localStorage.getItem('bonsai_tasks') || '{}'),
          updatedAt: new Date().toISOString()
        };

        const result = await findOrCreateBonsaiFile(accessToken, initialLocalState);
        setDriveFileId(result.fileId);

        // Safely merge Drive data as the single source of truth, merging any newer local items
        const driveData = result.data;

        // Perform IDs based merger
        const mergedTrees = [...(driveData.trees || [])];
        initialLocalState.trees.forEach((lt: any) => {
          if (!mergedTrees.find((dt: any) => dt.id === lt.id)) {
            mergedTrees.push(lt);
          }
        });

        const mergedM = { ...(driveData.measurements || {}) };
        Object.entries(initialLocalState.measurements).forEach(([treeId, items]: [string, any]) => {
          if (!mergedM[treeId]) {
            mergedM[treeId] = items;
          } else {
            const list = [...mergedM[treeId]];
            items.forEach((li: any) => {
              if (!list.find((di: any) => di.id === li.id)) {
                list.push(li);
              }
            });
            mergedM[treeId] = list;
          }
        });

        const mergedL = { ...(driveData.careLogs || {}) };
        Object.entries(initialLocalState.careLogs).forEach(([treeId, items]: [string, any]) => {
          if (!mergedL[treeId]) {
            mergedL[treeId] = items;
          } else {
            const list = [...mergedL[treeId]];
            items.forEach((li: any) => {
              if (!list.find((di: any) => di.id === li.id)) {
                list.push(li);
              }
            });
            mergedL[treeId] = list;
          }
        });

        const mergedT = { ...(driveData.tasks || {}) };
        Object.entries(initialLocalState.tasks).forEach(([treeId, items]: [string, any]) => {
          if (!mergedT[treeId]) {
            mergedT[treeId] = items;
          } else {
            const list = [...mergedT[treeId]];
            items.forEach((li: any) => {
              if (!list.find((di: any) => di.id === li.id)) {
                list.push(li);
              }
            });
            mergedT[treeId] = list;
          }
        });

        // Set state
        setTrees(mergedTrees);
        setMeasurements(mergedM);
        setCareLogs(mergedL);
        setTasks(mergedT);

        // Update local buffer cache
        localStorage.setItem('bonsai_trees', JSON.stringify(mergedTrees));
        localStorage.setItem('bonsai_measurements', JSON.stringify(mergedM));
        localStorage.setItem('bonsai_logs', JSON.stringify(mergedL));
        localStorage.setItem('bonsai_tasks', JSON.stringify(mergedT));

        // Sync back the combined/merged dataset to ensure total coverage
        await updateBonsaiFileInDrive(accessToken, result.fileId, {
          trees: mergedTrees,
          measurements: mergedM,
          careLogs: mergedL,
          tasks: mergedT
        });

        setDriveSyncStatus('synced');
      } catch (err) {
        console.error('Failed to coordinate Google Drive syncing:', err);
        setDriveSyncStatus('error');
      }
    };

    connectAndFetchDrive();
  }, [accessToken]);

  // Drive push helper
  const syncToDrive = async (
    currentTrees: Tree[],
    currentM: Record<string, Measurement[]>,
    currentL: Record<string, CareLog[]>,
    currentT: Record<string, Task[]>
  ) => {
    if (!accessToken || !driveFileId) return;

    setDriveSyncStatus('syncing');
    try {
      const success = await updateBonsaiFileInDrive(accessToken, driveFileId, {
        trees: currentTrees,
        measurements: currentM,
        careLogs: currentL,
        tasks: currentT
      });
      if (success) {
        setDriveSyncStatus('synced');
        const driveQuota = await getGoogleDriveQuota(accessToken);
        if (driveQuota) setQuota(driveQuota);
      } else {
        setDriveSyncStatus('error');
      }
    } catch (err) {
      console.error('Error syncing collection to Drive:', err);
      setDriveSyncStatus('error');
    }
  };

  // State updater coordinator
  const updateStateAndSync = async (
    newTrees: Tree[],
    newM: Record<string, Measurement[]>,
    newL: Record<string, CareLog[]>,
    newT: Record<string, Task[]>
  ) => {
    setTrees(newTrees);
    setMeasurements(newM);
    setCareLogs(newL);
    setTasks(newT);

    // Persist local storage cache copy
    localStorage.setItem('bonsai_trees', JSON.stringify(newTrees));
    localStorage.setItem('bonsai_measurements', JSON.stringify(newM));
    localStorage.setItem('bonsai_logs', JSON.stringify(newL));
    localStorage.setItem('bonsai_tasks', JSON.stringify(newT));

    // Async push to Drive if we are currently connected with token
    if (accessToken && driveFileId) {
      await syncToDrive(newTrees, newM, newL, newT);
    }
  };

  // Auth Operations
  const signIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
      }
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const reconnectDrive = async () => {
    // Triggers standard Google authorization popup to reload access token
    await signIn();
  };

  const logOut = async () => {
    try {
      await signOut(auth);
      setAccessToken(null);
      setDriveFileId(null);
      setDriveSyncStatus('unlinked');
      setQuota(null);

      // Reset application states
      setTrees([]);
      setMeasurements({});
      setCareLogs({});
      setTasks({});

      localStorage.removeItem('bonsai_trees');
      localStorage.removeItem('bonsai_measurements');
      localStorage.removeItem('bonsai_logs');
      localStorage.removeItem('bonsai_tasks');
    } catch (error) {
      console.error("Log out failed:", error);
    }
  };

  const createUuid = () => {
    return 'id_' + Math.random().toString(36).substring(2, 12);
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
    const nextTrees = trees.filter(t => t.id !== treeId);
    
    const nextM = { ...measurements };
    delete nextM[treeId];

    const nextL = { ...careLogs };
    delete nextL[treeId];

    const nextT = { ...tasks };
    delete nextT[treeId];

    await updateStateAndSync(nextTrees, nextM, nextL, nextT);
  };

  const addMeasurement = async (treeId: string, width: number, date: string, notes?: string) => {
    const mockId = createUuid();
    const newItem: Measurement = {
      id: mockId,
      userId: user ? user.uid : 'anonymous',
      treeId,
      date,
      width,
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };
    const nextM = {
      ...measurements,
      [treeId]: [...(measurements[treeId] || []), newItem],
    };
    await updateStateAndSync(trees, nextM, careLogs, tasks);
  };

  const deleteMeasurement = async (treeId: string, measurementId: string) => {
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

    // Auto-record a complimentary task
    const taskUuid = createUuid();
    const nextChore: Task = {
      id: taskUuid,
      userId: user ? user.uid : 'anonymous',
      treeId,
      title: `Completed Pruning/Watering care: ${type}`,
      type,
      dueDate: date,
      completed: true,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const nextT = {
      ...tasks,
      [treeId]: [...(tasks[treeId] || []), nextChore],
    };

    await updateStateAndSync(trees, measurements, nextL, nextT);
  };

  const deleteCareLog = async (treeId: string, logId: string) => {
    const nextL = {
      ...careLogs,
      [treeId]: (careLogs[treeId] || []).filter(item => item.id !== logId),
    };
    await updateStateAndSync(trees, measurements, nextL, tasks);
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
    const nextT = {
      ...tasks,
      [treeId]: (tasks[treeId] || []).map(t => t.id === taskId ? {
        ...t,
        completed,
        completedAt: completed ? new Date().toISOString() : undefined
      } : t),
    };
    await updateStateAndSync(trees, measurements, careLogs, nextT);
  };

  const deleteTask = async (treeId: string, taskId: string) => {
    const nextT = {
      ...tasks,
      [treeId]: (tasks[treeId] || []).filter(t => t.id !== taskId),
    };
    await updateStateAndSync(trees, measurements, careLogs, nextT);
  };

  const importCollection = async (
    importedTrees: Tree[],
    importedM: Record<string, Measurement[]>,
    importedL: Record<string, CareLog[]>,
    importedT: Record<string, Task[]>
  ) => {
    await updateStateAndSync(importedTrees, importedM, importedL, importedT);
  };

  return (
    <BonsaiContext.Provider value={{
      user,
      authLoading,
      trees,
      measurements,
      careLogs,
      tasks,
      loading,
      signIn,
      logOut,
      addTree,
      updateTree,
      deleteTree,
      addMeasurement,
      deleteMeasurement,
      addCareLog,
      deleteCareLog,
      addTask,
      toggleTask,
      deleteTask,
      accessToken,
      driveFileId,
      driveSyncStatus,
      quota,
      reconnectDrive,
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
