import { useState, useEffect, useMemo, useRef } from 'react';
import { BonsaiProvider, useBonsai } from './context/BonsaiContext';
import { PocketbaseService, PocketbaseLog } from './utils/pocketbase';
import { 
  Sprout, 
  BookOpen, 
  CheckSquare, 
  Plus, 
  Sparkles, 
  LogIn, 
  LogOut, 
  Database, 
  TrendingUp, 
  Droplets, 
  Scissors, 
  CloudRain, 
  Flame,
  User,
  Activity,
  ArrowRight,
  RefreshCw,
  Clock,
  Download,
  Upload,
  Archive,
  Menu,
  ChevronDown,
  Skull,
  BarChart2,
  Trash2,
  Check,
  Copy,
  Cloud,
  ExternalLink,
  Server,
  Lock,
  Terminal,
  Power,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import TreeDetail from './components/TreeDetail';
import CareLibrary from './components/CareLibrary';
import CareTasks from './components/CareTasks';
import AddTreeModal from './components/AddTreeModal';
import { Tree, BonsaiStatus } from './types';
import { samplePreloadTrees, calculateCurrentAge, getTreePrimaryPhoto } from './utils';
import { checkAndNotifyDueTasks } from './utils/notifications';
import { exportCollectionToZip, importCollectionFromZip, downloadBlob } from './utils/zipHelpers';
import bonsaiLogo from './assets/images/app_icon_512_1781291901980.jpg';

function AppContent() {
  const { 
    user, 
    authLoading, 
    trees, 
    measurements, 
    addTree,
    addCareLog,
    loading, 
    signIn, 
    logOut, 
    pbEnabled,
    pbSyncStatus,
    pbSyncMessage,
    connectPocketbase,
    disconnectPocketbase,
    syncPocketbaseNow
  } = useBonsai();

  const { careLogs, tasks, importCollection, clearAllData, updateTree, deleteTree } = useBonsai();

  // Navigation & UI state
  const [currentView, setCurrentView] = useState<'garden' | 'graveyard' | 'chores' | 'library' | 'sync'>('garden');
  const [urlCopied, setUrlCopied] = useState(false);
  
  // Pocketbase input states
  const [pbUrl, setPbUrl] = useState(() => localStorage.getItem('pb_url') || 'http://100.');
  const [pbIdentity, setPbIdentity] = useState(() => localStorage.getItem('pb_identity') || '');
  const [pbPassword, setPbPassword] = useState('');
  const [pbUseNativeFiles, setPbUseNativeFiles] = useState(() => localStorage.getItem('pb_use_native_files') === 'true');
  const [pbError, setPbError] = useState('');
  const [showPbForm, setShowPbForm] = useState(false);
  const [isConnectingPb, setIsConnectingPb] = useState(false);
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const selectedTree = trees.find(t => t.id === selectedTreeId) || null;
  const [hydratedSelectedTree, setHydratedSelectedTree] = useState<Tree | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    // CRITICAL: Reset hydratedSelectedTree to null immediately ONLY when the selected tree ID changes.
    // This prevents the UI from showing stale details/images of the previously selected tree while loading,
    // but avoids flashing or resetting when the active tree's data (like care tasks) is modified.
    if (selectedTreeId !== lastSelectedIdRef.current) {
      setHydratedSelectedTree(null);
      lastSelectedIdRef.current = selectedTreeId;
    }

    if (!selectedTreeId) {
      return;
    }
    const baseTree = trees.find(t => t.id === selectedTreeId);
    if (!baseTree) {
      return;
    }

    let active = true;
    const hydrateActiveTree = async () => {
      try {
        if (baseTree.images && Array.isArray(baseTree.images)) {
          const { getPhotoLocal } = await import('./utils/idb');
          const hImages = await Promise.all(baseTree.images.map(async (img) => {
            if (typeof img === 'object' && img !== null && !img.base64) {
              const b64 = await getPhotoLocal(img.id);
              if (b64) return { ...img, base64: b64 };
            }
            return img;
          }));
          if (active) {
            setHydratedSelectedTree({ ...baseTree, images: hImages });
          }
        } else {
          if (active) {
            setHydratedSelectedTree(baseTree);
          }
        }
      } catch (err) {
        console.error("Failed to hydrate active tree images:", err);
        if (active) {
          setHydratedSelectedTree(baseTree);
        }
      }
    };

    hydrateActiveTree();
    return () => {
      active = false;
    };
  }, [selectedTreeId, trees]);

  // Dynamically resolve active tree for details, combining context state and locally hydrated IndexedDB state
  const activeTreeForDetails = useMemo(() => {
    if (!selectedTree) return null;
    if (!hydratedSelectedTree || hydratedSelectedTree.id !== selectedTree.id) {
      return selectedTree;
    }
    // Merge images from selectedTree (BonsaiContext) and hydratedSelectedTree (App local hydration)
    const contextImages = selectedTree.images || [];
    const hydratedImages = hydratedSelectedTree.images || [];

    const mergedImages = contextImages.map((img, idx) => {
      if (typeof img === 'object' && img !== null) {
        if (img.base64) return img;
        const matchingHydrated = hydratedImages.find((h: any) => typeof h === 'object' && h !== null && (h.id === img.id || (h.takenAt === img.takenAt && idx === hydratedImages.indexOf(h)))) as any;
        if (matchingHydrated?.base64) {
          return { ...img, base64: matchingHydrated.base64 };
        }
      }
      return img;
    });

    return {
      ...selectedTree,
      images: mergedImages
    };
  }, [selectedTree, hydratedSelectedTree]);

  // Sorting options
  const [sortBy, setSortBy] = useState<'lastUpdated' | 'name' | 'age' | 'dateAcquired' | 'status' | 'trunkWidth'>('lastUpdated');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  // Graveyard notes inline editor
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [inputNote, setInputNote] = useState('');
  const [restoringTreeId, setRestoringTreeId] = useState<string | null>(null);
  const [deletingTreeId, setDeletingTreeId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMobileStats, setShowMobileStats] = useState(false);
  const [showZipDropdown, setShowZipDropdown] = useState(false);

  const [showWipeConfirmModal, setShowWipeConfirmModal] = useState(false);
  const [wipeInputText, setWipeInputText] = useState('');

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Floating In-App Notifications Stack State
  const [inAppNotifs, setInAppNotifs] = useState<{ id: string; title: string; body: string; timestamp: string }[]>([]);

  useEffect(() => {
    const handleInAppNotif = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setInAppNotifs(prev => [detail, ...prev.filter(n => n.id !== detail.id).slice(0, 4)]);
    };

    window.addEventListener('bonsai-in-app-notification', handleInAppNotif);
    return () => window.removeEventListener('bonsai-in-app-notification', handleInAppNotif);
  }, []);

  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Pocketbase diagnostics logs
  const [pbLogs, setPbLogs] = useState<PocketbaseLog[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(true);

  const handleCopyLogs = () => {
    if (pbLogs.length === 0) {
      setToastMessage({ text: 'Diagnostics log console is empty.', type: 'error' });
      return;
    }
    const formattedText = pbLogs.map(log => {
      const time = log.timestamp.split('T')[1]?.slice(0, 8) || '';
      const level = log.level.toUpperCase();
      const details = log.details ? `\n  └─ ${log.details}` : '';
      return `[${time}] [${level}] ${log.message}${details}`;
    }).join('\n');
    
    navigator.clipboard.writeText(formattedText).then(() => {
      setToastMessage({ text: 'Diagnostics logs copied to clipboard!', type: 'success' });
    }).catch((err) => {
      console.error('Failed to copy logs:', err);
    });
  };

  useEffect(() => {
    const unsubscribe = PocketbaseService.subscribeLogs((logs) => {
      setPbLogs(logs);
    });
    return unsubscribe;
  }, []);

  // Memoize all tree sorting, categorization, and statistics to keep the application responsive and lightning-fast!
  const gardenMetrics = useMemo(() => {
    const aliveTrees = trees.filter(t => !t.isDead);
    const deadTrees = trees.filter(t => t.isDead);

    // Calculations for Quick Stats
    const uniqueSpecies = new Set(aliveTrees.map(t => (t.species || '').trim().toLowerCase())).size;
    
    const treesWithAge = aliveTrees.filter(t => calculateCurrentAge(t) !== undefined);
    const avgAge = treesWithAge.length > 0 
      ? Math.round(treesWithAge.reduce((sum, t) => sum + (calculateCurrentAge(t) || 0), 0) / treesWithAge.length)
      : 0;

    const stageCounts: Record<string, number> = {
      'Pre-Bonsai': 0,
      'Early Development': 0,
      'Refinement': 0,
      'Mature': 0
    };
    aliveTrees.forEach(t => {
      const s = t.status || 'Pre-Bonsai';
      if (s in stageCounts) {
        stageCounts[s]++;
      } else {
        stageCounts[s] = (stageCounts[s] || 0) + 1;
      }
    });

    // Sort Order mapping
    const STAGE_ORDER: Record<string, number> = {
      'Pre-Bonsai': 1,
      'Early Development': 2,
      'Refinement': 3,
      'Mature': 4
    };

    // Precalculate latest update times of all trees in O(N) to prevent nested O(N log N) loops in sorts
    const latestUpdateTimes: Record<string, number> = {};
    if (sortBy === 'lastUpdated') {
      aliveTrees.forEach(tree => {
        let latest = 0;
        if (tree.updatedAt) {
          const t = new Date(tree.updatedAt).getTime();
          if (!isNaN(t)) latest = Math.max(latest, t);
        } else if (tree.createdAt) {
          const t = new Date(tree.createdAt).getTime();
          if (!isNaN(t)) latest = Math.max(latest, t);
        }
        
        // check care logs
        const logs = careLogs[tree.id] || [];
        logs.forEach((l: any) => {
          if (l.date) {
            const t = new Date(l.date).getTime();
            if (!isNaN(t)) latest = Math.max(latest, t);
          } else if (l.createdAt) {
            const t = new Date(l.createdAt).getTime();
            if (!isNaN(t)) latest = Math.max(latest, t);
          }
        });
        
        // check measurements
        const mm = measurements[tree.id] || [];
        mm.forEach((m: any) => {
          if (m.date) {
            const t = new Date(m.date).getTime();
            if (!isNaN(t)) latest = Math.max(latest, t);
          } else if (m.createdAt) {
            const t = new Date(m.createdAt).getTime();
            if (!isNaN(t)) latest = Math.max(latest, t);
          }
        });
        
        latestUpdateTimes[tree.id] = latest || 1;
      });
    }

    // Precalculate latest widths of all trees in O(N)
    const latestWidths: Record<string, number> = {};
    if (sortBy === 'trunkWidth') {
      aliveTrees.forEach(tree => {
        const mm = (measurements[tree.id] || []).filter(m => m.width !== 0);
        if (mm.length === 0) {
          latestWidths[tree.id] = 0;
        } else {
          const sortedMM = [...mm].sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());
          latestWidths[tree.id] = sortedMM[0]?.width || 0;
        }
      });
    }

    const sortedAliveTrees = [...aliveTrees];
    if (sortBy === 'lastUpdated') {
      sortedAliveTrees.sort((a, b) => {
        const valA = latestUpdateTimes[a.id] || 0;
        const valB = latestUpdateTimes[b.id] || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
    } else if (sortBy === 'age') {
      sortedAliveTrees.sort((a, b) => {
        const valA = calculateCurrentAge(a) || 0;
        const valB = calculateCurrentAge(b) || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
    } else if (sortBy === 'dateAcquired') {
      sortedAliveTrees.sort((a, b) => {
        const valA = a.dateAcquired ? new Date(a.dateAcquired).getTime() : 0;
        const valB = b.dateAcquired ? new Date(b.dateAcquired).getTime() : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
    } else if (sortBy === 'status') {
      sortedAliveTrees.sort((a, b) => {
        const valA = STAGE_ORDER[a.status] || 0;
        const valB = STAGE_ORDER[b.status] || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
    } else if (sortBy === 'trunkWidth') {
      sortedAliveTrees.sort((a, b) => {
        const valA = latestWidths[a.id] || 0;
        const valB = latestWidths[b.id] || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
    } else {
      // default sortByName
      sortedAliveTrees.sort((a, b) => {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      });
    }

    let finalSortedTrees = sortedAliveTrees;
    if (stageFilter) {
      finalSortedTrees = finalSortedTrees.filter(t => (t.status || 'Pre-Bonsai') === stageFilter);
    }

    return {
      aliveTrees,
      deadTrees,
      uniqueSpecies,
      avgAge,
      stageCounts,
      sortedAliveTrees: finalSortedTrees
    };
  }, [trees, careLogs, measurements, sortBy, sortOrder, stageFilter]);

  // Periodic background check to trigger phone/device notification alerts for due tasks
  useEffect(() => {
    checkAndNotifyDueTasks(trees, tasks);
    
    // Check every 6s for reactive real-time feedback, and every 60s continuously
    const timeout = setTimeout(() => {
      checkAndNotifyDueTasks(trees, tasks);
    }, 6000);

    const interval = setInterval(() => {
      checkAndNotifyDueTasks(trees, tasks);
    }, 60000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [trees, tasks]);

  const handleClearAll = () => {
    setWipeInputText('');
    setShowWipeConfirmModal(true);
  };

  const copyAppUrl = () => {
    navigator.clipboard.writeText(window.location.origin);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  // Seed sample trees if the user is empty and signed out
  const handleLoadSamples = async () => {
    const samples = samplePreloadTrees();
    for (const s of samples) {
      await addTree(s);
    }
  };

  // Helper status badge styles
  const getStatusBadgeStyles = (status: BonsaiStatus) => {
    switch (status) {
      case 'Pre-Bonsai': return 'bg-yellow-500/10 text-yellow-800 border border-yellow-500/30';
      case 'Early Development': return 'bg-blue-500/10 text-blue-700 border border-blue-500/30';
      case 'Refinement': return 'bg-teal-500/10 text-teal-700 border border-teal-500/30';
      case 'Mature': return 'bg-violet-500/10 text-[#6B21A8] border border-violet-500/30';
      default: return 'bg-neutral-500/10 text-neutral-700 border border-neutral-500/30';
    }
  };

  // Safe action: Water tree from garden card overview without clicking inside
  const handleQuickWater = async (e: React.MouseEvent, treeId: string) => {
    e.stopPropagation();
    const todayStr = new Date().toISOString().split('T')[0];
    await addCareLog(treeId, 'Watering', todayStr, 'Quick mist & water from garden dashboard');
  };

  // Safe action: Prune tree from garden card overview without clicking inside
  const handleQuickPrune = async (e: React.MouseEvent, treeId: string) => {
    e.stopPropagation();
    const todayStr = new Date().toISOString().split('T')[0];
    await addCareLog(treeId, 'Pruning', todayStr, 'Light maintenance pinch pruning from card');
  };

  const handleExportZip = async () => {
    if (trees.length === 0) return;
    setExporting(true);
    setToastMessage(null);
    try {
      const zipBlob = await exportCollectionToZip(trees, measurements, careLogs, tasks);
      downloadBlob(zipBlob, `bonsai_backup_${new Date().toISOString().split('T')[0]}.zip`);
      setToastMessage({ text: 'Bonsai collection ZIP exported successfully with Excel inventory sheets and decoupling photos!', type: 'success' });
    } catch (err: any) {
      console.error(err);
      setToastMessage({ text: 'Failed to export ZIP: ' + (err.message || err), type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const handleLogOutWithConfirm = async () => {
    try {
      await logOut();
      setToastMessage({ text: 'Successfully logged out and cleared local browser session.', type: 'success' });
      setShowLogoutConfirm(false);
      setShowProfileDropdown(false);
    } catch (err: any) {
      setToastMessage({ text: 'Log out failed: ' + (err.message || err), type: 'error' });
    }
  };

  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  const handleImportZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImportFile(file);
    e.target.value = '';
  };

  const handleCancelImport = () => {
    setPendingImportFile(null);
  };

  const handleProceedImport = async () => {
    if (!pendingImportFile) return;
    setImporting(true);
    setToastMessage(null);
    try {
      const importedData = await importCollectionFromZip(pendingImportFile);
      await importCollection(
        importedData.trees,
        importedData.measurements,
        importedData.careLogs,
        importedData.tasks
      );
      setToastMessage({ text: `Successfully imported ${importedData.trees.length} trees and historical logs from ZIP folder!`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      setToastMessage({ text: 'Failed to import ZIP archive: ' + (err.message || 'Make sure it is a valid Bonsai backup format.'), type: 'error' });
    } finally {
      setImporting(false);
      setPendingImportFile(null);
    }
  };

  return (
    <div className="min-h-screen blueprint-grid text-natural-text font-mono pb-16">
      {/* Premium minimal header navigations */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-natural-cream z-30 shadow-xs">
        <div className="py-3 px-4 sm:px-6">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setSelectedTreeId(null); setCurrentView('garden'); }}>
              <div className="w-8 h-8 rounded-xl overflow-hidden bg-black flex items-center justify-center border border-stone-800 shadow-xs shrink-0 p-0.5">
                <img 
                  src={bonsaiLogo} 
                  alt="Garden Bonsai Logo" 
                  className="w-full h-full object-cover rounded-lg"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/icon.svg';
                  }}
                />
              </div>
              <div>
                <h1 className="text-xs uppercase font-mono tracking-wider font-extrabold text-natural-forest">Garden</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Top Menu Expand Button */}
              <button
                onClick={() => setShowMenu(!showMenu)}
                className={`px-3 py-1.5 transition-all text-[11px] font-mono font-black tracking-wider uppercase inline-flex items-center gap-1.5 border cursor-pointer ${
                  showMenu 
                    ? 'bg-natural-forest text-white border-natural-forest rounded-xl shadow-xs' 
                    : 'bg-white text-natural-forest hover:bg-natural-bg border-natural-cream rounded-xl'
                }`}
                title="Expand garden operations menu"
              >
                <Menu className="w-3.5 h-3.5" />
                <span>Menu</span>
                <motion.span
                  animate={{ rotate: showMenu ? 180 : 0 }}
                  className="inline-block text-[8px]"
                >
                  <ChevronDown className="w-2.5 h-2.5" />
                </motion.span>
              </button>
              {/* Account authentication states */}
              <div className="relative">
                {/* Dynamic interactive profile button pill */}
                <button
                  onClick={() => {
                    setShowProfileDropdown(!showProfileDropdown);
                    setPbError('');
                  }}
                  className={`flex items-center gap-1.5 bg-white hover:bg-natural-bg active:scale-95 transition-all border rounded-full px-2.5 py-1.5 shadow-xs cursor-pointer ${
                    showProfileDropdown ? 'border-natural-forest border-2' : 'border-natural-cream'
                  }`}
                  title="Secure PC Server Sync Status"
                >
                  <Server className="w-4 h-4 text-natural-forest shrink-0" />
                  
                  {/* Status dot representing overall active synchronizations */}
                  <span 
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      (pbSyncStatus === 'synced' || pbSyncStatus === 'connected') ? 'bg-emerald-500' : 
                      pbSyncStatus === 'syncing' ? 'bg-amber-500 animate-pulse' : 
                      pbSyncStatus === 'error' ? 'bg-rose-500' : 'bg-stone-400'
                    }`}
                  />
                  <span className="text-[10px] font-black uppercase tracking-wider text-natural-forest hidden sm:inline">Sync</span>
                  <ChevronDown className={`w-3 h-3 text-natural-muted transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu Overlay */}
                <AnimatePresence>
                  {showProfileDropdown && (
                    <>
                      {/* Outside click handler overlay */}
                      <div 
                        className="fixed inset-0 z-40 cursor-default" 
                        onClick={() => setShowProfileDropdown(false)} 
                      />

                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-72 bg-white border border-natural-cream rounded-2xl shadow-xl z-50 overflow-hidden font-mono text-xs origin-top-right text-left"
                      >
                        {/* Server Sync Section */}
                        <div className="p-3.5 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold uppercase text-[9px] tracking-wider text-natural-forest flex items-center gap-1">
                              <Server className="w-3.5 h-3.5 text-natural-forest" />
                              <span>Home PC Server Sync</span>
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-sm ${
                              pbSyncStatus === 'synced' || pbSyncStatus === 'connected' ? 'text-emerald-700 bg-emerald-50' :
                              pbSyncStatus === 'syncing' ? 'text-amber-700 bg-amber-50' :
                              pbSyncStatus === 'error' ? 'text-rose-700 bg-rose-50' :
                              'text-stone-600 bg-stone-100'
                            }`}>
                              <span className={`w-1 h-1 rounded-full ${
                                pbSyncStatus === 'synced' || pbSyncStatus === 'connected' ? 'bg-emerald-600' :
                                pbSyncStatus === 'syncing' ? 'bg-amber-500 animate-pulse' :
                                pbSyncStatus === 'error' ? 'bg-rose-500 animate-pulse' :
                                'bg-stone-400'
                              }`} />
                              {pbSyncStatus === 'synced' ? 'Synced' :
                               pbSyncStatus === 'connected' ? 'Connected' :
                               pbSyncStatus === 'syncing' ? 'Syncing...' :
                               pbSyncStatus === 'error' ? 'Error' : 'Offline'}
                            </span>
                          </div>

                          {pbEnabled ? (
                            <div className="space-y-2.5">
                              <div className="p-2 bg-stone-50 border border-stone-200/50 rounded-xl text-[9px] text-neutral-600 leading-normal font-mono break-all space-y-1">
                                <div className="font-bold text-[7px] text-stone-400 uppercase tracking-wider">SERVER ADDRESS</div>
                                <div className="text-stone-800 font-semibold select-all">{localStorage.getItem('pb_url')}</div>
                                {pbSyncMessage && (
                                  <div className="mt-1 text-natural-muted font-normal text-[8px] border-t border-stone-200/40 pt-1">
                                    {pbSyncMessage}
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      await syncPocketbaseNow();
                                    } catch (e) {}
                                  }}
                                  disabled={pbSyncStatus === 'syncing'}
                                  className="py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/50 rounded-lg text-[9px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-50 text-emerald-800"
                                  title="Sync files with your home PC Pocketbase database"
                                >
                                  <RefreshCw className={`w-3 h-3 ${pbSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                                  <span>Sync Now</span>
                                </button>
                                <button
                                  onClick={() => disconnectPocketbase()}
                                  className="py-1.5 bg-stone-50 hover:bg-stone-100 border border-stone-200/50 rounded-lg text-[9px] font-bold text-stone-700 cursor-pointer transition-all flex items-center justify-center gap-1"
                                >
                                  <Power className="w-3 h-3 text-stone-500" />
                                  <span>Disconnect</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2.5 bg-stone-50/50 p-2.5 border border-stone-200/40 rounded-xl">
                              <p className="text-[10px] text-stone-500 leading-normal mb-1 font-sans">
                                Enter your home PC PocketBase details to connect and back up your garden securely over Tailscale.
                              </p>
                              <div className="space-y-1.5 text-left">
                                <div>
                                  <label className="text-[7px] font-extrabold text-stone-500 block uppercase tracking-wider">PocketBase URL</label>
                                  <input
                                    type="text"
                                    placeholder="http://100.x.y.z:8090"
                                    value={pbUrl}
                                    onChange={(e) => setPbUrl(e.target.value)}
                                    className="w-full text-[9px] px-2 py-1 border border-stone-200 rounded-md bg-white font-mono text-stone-800 focus:outline-none focus:border-emerald-500"
                                  />
                                  {pbUrl.trim().toLowerCase().startsWith('http:') && typeof window !== 'undefined' && window.location.protocol === 'https:' && (
                                    <div className="mt-1 p-1.5 bg-amber-50 border border-amber-200 rounded-md text-[7px] text-amber-800 leading-normal">
                                      ⚠️ <strong>Browser Security Notice:</strong> This app runs over secure HTTPS, so browsers block insecure <code>http://</code> connections. Use Tailscale HTTPS/Funnel, or download and run this app locally.
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <label className="text-[7px] font-extrabold text-stone-500 block uppercase tracking-wider">Identity (Email/Username)</label>
                                  <input
                                    type="text"
                                    placeholder="user@example.com"
                                    value={pbIdentity}
                                    onChange={(e) => setPbIdentity(e.target.value)}
                                    className="w-full text-[9px] px-2 py-1 border border-stone-200 rounded-md bg-white font-mono text-stone-800 focus:outline-none focus:border-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[7px] font-extrabold text-stone-500 block uppercase tracking-wider">Password</label>
                                  <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={pbPassword}
                                    onChange={(e) => setPbPassword(e.target.value)}
                                    className="w-full text-[9px] px-2 py-1 border border-stone-200 rounded-md bg-white font-mono text-stone-800 focus:outline-none focus:border-emerald-500"
                                  />
                                </div>

                                {pbError && (
                                  <p className="text-[8px] text-rose-600 font-bold leading-normal pt-1 font-sans">
                                    {pbError}
                                  </p>
                                )}

                                <button
                                  onClick={async () => {
                                    setPbError('');
                                    setIsConnectingPb(true);
                                    try {
                                      const res = await connectPocketbase(pbUrl, pbIdentity, pbPassword, pbUseNativeFiles);
                                      if (res.success) {
                                        setPbPassword('');
                                      } else {
                                        setPbError(res.error || 'Connection failed');
                                      }
                                    } catch (err: any) {
                                      setPbError(err.message || 'Connection error');
                                    } finally {
                                      setIsConnectingPb(false);
                                    }
                                  }}
                                  disabled={isConnectingPb || !pbUrl || !pbIdentity}
                                  className="w-full mt-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-bold cursor-pointer transition-all disabled:opacity-50 text-center flex items-center justify-center gap-1"
                                >
                                  {isConnectingPb ? (
                                    <>
                                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                      <span>Connecting...</span>
                                    </>
                                  ) : (
                                    <span>Connect & Synchronize</span>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Pocketbase Live Diagnostics Log Console */}
                        {pbEnabled && (
                          <div className="p-3 bg-stone-50 border-t border-natural-cream/60 text-left">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-extrabold text-[8px] tracking-wider text-stone-500 uppercase flex items-center gap-1 font-mono">
                                <Terminal className="w-2.5 h-2.5 text-stone-500" />
                                <span>Diagnostics Console</span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={handleCopyLogs}
                                  className="text-[7px] text-stone-500 hover:text-stone-700 font-bold hover:underline cursor-pointer bg-stone-100 hover:bg-stone-200 px-1 rounded-sm border border-stone-200 flex items-center gap-0.5 font-mono"
                                  title="Copy logs to clipboard"
                                >
                                  <Copy className="w-2 h-2 text-stone-400" />
                                  <span>Copy</span>
                                </button>
                                <button
                                  onClick={() => PocketbaseService.clearLogs()}
                                  className="text-[7px] text-stone-400 hover:text-stone-600 font-bold hover:underline cursor-pointer bg-stone-100 hover:bg-stone-200 px-1 rounded-sm border border-stone-200"
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={() => setLogsExpanded(!logsExpanded)}
                                  className="p-0.5 text-stone-400 hover:text-stone-600 cursor-pointer rounded-sm hover:bg-stone-150 flex items-center justify-center"
                                  title={logsExpanded ? "Collapse Console" : "Expand Console"}
                                >
                                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${logsExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              </div>
                            </div>
                            {logsExpanded && (
                              <div className="h-44 overflow-y-auto bg-stone-950 text-stone-300 font-mono text-[9px] p-2 rounded-xl border border-stone-850 space-y-1.5 select-text scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
                                {pbLogs.length === 0 ? (
                                  <div className="text-stone-500 italic text-[8px] py-4 text-center">
                                    No logs yet. Data is synced to PC server.
                                  </div>
                                ) : (
                                  pbLogs.map((log, index) => {
                                    let levelColor = 'text-stone-400';
                                    let levelText = '[INFO]';
                                    if (log.level === 'success') {
                                      levelColor = 'text-emerald-400 font-bold';
                                      levelText = '[OK]';
                                    } else if (log.level === 'warn') {
                                      levelColor = 'text-amber-400 font-bold';
                                      levelText = '[WARN]';
                                    } else if (log.level === 'error') {
                                      levelColor = 'text-rose-400 font-bold animate-pulse';
                                      levelText = '[ERR]';
                                    }

                                    return (
                                      <div key={index} className="leading-normal break-words border-b border-stone-900/40 pb-1 last:border-0 last:pb-0">
                                        <div className="flex items-start gap-1">
                                          <span className="text-[7px] text-stone-600 shrink-0 font-mono select-none">
                                            {log.timestamp.split('T')[1]?.slice(0, 8) || ''}
                                          </span>
                                          <span className={`${levelColor} shrink-0 select-none text-[8px]`}>
                                            {levelText}
                                          </span>
                                          <span className="text-stone-200 whitespace-pre-wrap select-text">
                                            {log.message}
                                          </span>
                                        </div>
                                        {log.details && (
                                          <div className="text-stone-500 text-[8px] pl-8 select-text break-all font-mono">
                                            └─ {log.details}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Navigation & Operations Bar */}
        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={`bg-natural-bg/95 backdrop-blur-md border-b border-natural-cream shadow-sm ${showZipDropdown ? 'overflow-visible' : 'overflow-hidden'}`}
            >
              <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
                  <button
                    onClick={() => {
                      setCurrentView('graveyard');
                      setSelectedTreeId(null);
                      setShowMenu(false);
                    }}
                    className={`px-4 py-2 border rounded-xl text-xs font-mono font-black tracking-wider uppercase transition-all cursor-pointer inline-flex items-center justify-center gap-2 h-10 ${
                      currentView === 'graveyard' && !selectedTree
                        ? 'bg-natural-forest text-white border-natural-forest shadow-xs'
                        : 'bg-white hover:bg-natural-bg text-natural-forest border-natural-cream'
                    }`}
                  >
                    <Skull className="w-3.5 h-3.5 shrink-0 text-natural-sage" />
                    <span>Graveyard</span>
                  </button>

                  <button
                    onClick={() => {
                      setCurrentView('chores');
                      setSelectedTreeId(null);
                      setShowMenu(false);
                    }}
                    className={`px-4 py-2 border rounded-xl text-xs font-mono font-black tracking-wider uppercase transition-all cursor-pointer inline-flex items-center justify-center gap-2 h-10 ${
                      currentView === 'chores'
                        ? 'bg-natural-forest text-white border-natural-forest shadow-xs'
                        : 'bg-white hover:bg-natural-bg text-natural-forest border-natural-cream'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5 shrink-0 text-natural-sage" />
                    <span>Reminders</span>
                  </button>

                  <button
                    onClick={() => {
                      setCurrentView('library');
                      setSelectedTreeId(null);
                      setShowMenu(false);
                    }}
                    className={`px-4 py-2 border rounded-xl text-xs font-mono font-black tracking-wider uppercase transition-all cursor-pointer inline-flex items-center justify-center gap-2 h-10 ${
                      currentView === 'library'
                        ? 'bg-natural-forest text-white border-natural-forest shadow-xs'
                        : 'bg-white hover:bg-natural-bg text-natural-forest border-natural-cream'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 shrink-0 text-natural-sage" />
                    <span>Care Manual</span>
                  </button>

                  <button
                    onClick={() => {
                      setCurrentView('sync');
                      setSelectedTreeId(null);
                      setShowMenu(false);
                    }}
                    className={`px-4 py-2 border rounded-xl text-xs font-mono font-black tracking-wider uppercase transition-all cursor-pointer inline-flex items-center justify-center gap-2 h-10 ${
                      currentView === 'sync'
                        ? 'bg-natural-forest text-white border-natural-forest shadow-xs'
                        : 'bg-white hover:bg-natural-bg text-natural-forest border-natural-cream'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5 shrink-0 text-natural-sage" />
                    <span>PC Sync Setup</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto border-t md:border-t-0 border-natural-cream pt-3 md:pt-0 justify-end items-center">
                  {/* Single Expandable ZIP Backup & Restore Button */}
                  <div className="relative flex-1 sm:flex-initial">
                    <button
                      type="button"
                      onClick={() => setShowZipDropdown(!showZipDropdown)}
                      className="px-3.5 py-2 bg-white hover:bg-natural-bg border border-natural-cream rounded-xl text-[10px] sm:text-xs font-mono font-black tracking-wider uppercase inline-flex items-center justify-center gap-1.5 text-natural-forest cursor-pointer h-10 w-full sm:w-auto shadow-xs"
                      title="ZIP Collection Backup & Restore options"
                    >
                      {exporting || importing ? (
                        <span className="w-3.5 h-3.5 border-t border-natural-forest rounded-full animate-spin shrink-0" />
                      ) : (
                        <Archive className="w-3.5 h-3.5 text-natural-sage shrink-0" />
                      )}
                      <span>ZIP Archive</span>
                      <ChevronDown className={`w-3 h-3 text-natural-muted transition-transform ${showZipDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showZipDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-30 cursor-default" 
                            onClick={() => setShowZipDropdown(false)} 
                          />
                          <motion.div
                            initial={{ opacity: 0, y: 5, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 5, scale: 0.95 }}
                            className="absolute right-0 mt-1.5 w-44 bg-white border border-natural-cream rounded-xl shadow-lg z-40 p-1.5 space-y-1 font-mono text-xs"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setShowZipDropdown(false);
                                handleExportZip();
                              }}
                              disabled={exporting || trees.length === 0}
                              className="w-full px-3 py-2 text-left hover:bg-natural-bg rounded-lg text-[11px] font-bold text-natural-forest inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5 text-natural-sage shrink-0" />
                              <span>Export ZIP</span>
                            </button>

                            <label
                              className="w-full px-3 py-2 text-left hover:bg-natural-bg rounded-lg text-[11px] font-bold text-natural-forest inline-flex items-center gap-2 cursor-pointer transition-colors block"
                            >
                              <Upload className="w-3.5 h-3.5 text-natural-sage shrink-0" />
                              <span>Import ZIP</span>
                              <input
                                type="file"
                                accept=".zip"
                                onChange={(e) => {
                                  setShowZipDropdown(false);
                                  handleImportZip(e);
                                }}
                                disabled={importing}
                                className="hidden"
                              />
                            </label>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  <button
                    onClick={handleClearAll}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 rounded-xl text-[10px] sm:text-xs font-mono font-black tracking-wider uppercase inline-flex items-center justify-center gap-1.5 cursor-pointer h-10 flex-1 sm:flex-initial"
                    title="Erase entire local and cloud database records"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Wipe All Data</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main container */}
      <main className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-5">
        <AnimatePresence mode="wait">
          {currentView === 'chores' ? (
            <motion.div
              key="chores"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-5"
            >
              <CareTasks />
            </motion.div>
          ) : currentView === 'library' ? (
            <motion.div
              key="library"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-5"
            >
              <CareLibrary />
            </motion.div>
          ) : currentView === 'sync' ? (
            <motion.div
              key="sync"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.15 }}
              className="space-y-6 text-left max-w-4xl mx-auto"
            >
              <div className="bg-white border border-natural-cream p-6 sm:p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-serif font-black text-natural-forest">Home PC Server Sync</h3>
                  <p className="text-xs text-natural-muted leading-relaxed mt-1 font-sans">
                    Sync your garden records and photos directly with a private PocketBase server on your home PC or Tailscale VPN.
                  </p>
                </div>

                {/* App URL Access Action Card */}
                <div className="p-4 bg-stone-50 border border-stone-200/60 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs">
                  <div>
                    <span className="block text-[9px] text-stone-400 uppercase font-black tracking-wider">Application URL</span>
                    <span className="text-stone-800 font-semibold text-xs select-all break-all">{window.location.origin}</span>
                  </div>
                  <button
                    onClick={copyAppUrl}
                    className="px-4 py-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-800 rounded-xl font-bold text-xs inline-flex items-center gap-2 cursor-pointer transition-all shadow-xs shrink-0 active:scale-95"
                  >
                    {urlCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">Copied URL</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-natural-sage" />
                        <span>Copy App URL</span>
                      </>
                    )}
                  </button>
                </div>

                {pbEnabled ? (
                  <div className="space-y-6">
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4 text-emerald-700" />
                        </div>
                        <div className="font-mono text-xs">
                          <div className="font-bold text-emerald-900 uppercase tracking-wide text-[10px]">PC Server Status</div>
                          <div className="text-emerald-800 font-semibold mt-0.5">Securely Connected & Ready</div>
                          {pbSyncMessage && (
                            <div className="text-[10px] text-emerald-700/80 mt-1">{pbSyncMessage}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          onClick={async () => {
                            try {
                              await syncPocketbaseNow();
                              setToastMessage({ text: 'Data synchronized successfully with your home server!', type: 'success' });
                            } catch (e: any) {
                              setToastMessage({ text: e.message || 'Sync failed', type: 'error' });
                            }
                          }}
                          disabled={pbSyncStatus === 'syncing'}
                          className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-mono font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs active:scale-95"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${pbSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                          <span>Sync Now</span>
                        </button>
                        <button
                          onClick={() => {
                            disconnectPocketbase();
                            setToastMessage({ text: 'PC server link disconnected.', type: 'success' });
                          }}
                          className="flex-1 sm:flex-initial px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-mono font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>Disconnect</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="p-4 bg-stone-50 border border-stone-200/50 rounded-2xl space-y-3 font-mono text-xs">
                        <div className="font-bold text-[10px] text-stone-400 uppercase tracking-wider">Connection Parameters</div>
                        
                        <div className="space-y-2">
                          <div>
                            <span className="block text-[8px] text-stone-400 uppercase font-black tracking-wider">Host Node Address</span>
                            <span className="text-stone-800 font-semibold text-xs select-all">{localStorage.getItem('pb_url')}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] text-stone-400 uppercase font-black tracking-wider">Authorized User Identity</span>
                            <span className="text-stone-800 font-semibold text-xs select-all">{localStorage.getItem('pb_identity')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-stone-50 border border-stone-200/50 rounded-2xl space-y-3 font-mono text-xs">
                        <div className="font-bold text-[10px] text-stone-400 uppercase tracking-wider">Privacy & Storage</div>
                        <div className="text-stone-600 leading-normal text-[11px] font-sans">
                          Works offline. Changes sync automatically when online. Photos compressed for storage.
                        </div>
                      </div>
                    </div>

                    {/* Diagnostics Panel in full Sync view */}
                    <div className="space-y-2 pt-3 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-[10px] tracking-wider text-stone-500 uppercase flex items-center gap-1.5 font-mono">
                          <Terminal className="w-3.5 h-3.5 text-stone-500" />
                          <span>Live Synchronization Diagnostics Console</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={handleCopyLogs}
                            className="text-[10px] text-stone-600 hover:text-stone-850 font-bold hover:underline cursor-pointer bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded-md border border-stone-200 flex items-center gap-1 font-mono"
                            title="Copy logs to clipboard"
                          >
                            <Copy className="w-2.5 h-2.5 text-stone-400" />
                            <span>Copy Logs</span>
                          </button>
                          <button
                            onClick={() => PocketbaseService.clearLogs()}
                            className="text-[10px] text-stone-500 hover:text-stone-700 font-bold hover:underline cursor-pointer bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded-md border border-stone-200 font-mono"
                          >
                            Clear History
                          </button>
                          <button
                            onClick={() => setLogsExpanded(!logsExpanded)}
                            className="p-1 text-stone-500 hover:text-stone-700 cursor-pointer rounded-md hover:bg-stone-150 flex items-center justify-center"
                            title={logsExpanded ? "Collapse Console" : "Expand Console"}
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${logsExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>
                      {logsExpanded && (
                        <div className="h-64 overflow-y-auto bg-stone-950 text-stone-300 font-mono text-xs p-3.5 rounded-2xl border border-stone-850 space-y-2 select-text scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
                          {pbLogs.length === 0 ? (
                            <div className="text-stone-500 italic text-xs py-10 text-center">
                              No logs yet. Perform actions or trigger sync to capture network diagnostics.
                            </div>
                          ) : (
                            pbLogs.map((log, index) => {
                              let levelColor = 'text-stone-400';
                              let levelText = '[INFO]';
                              if (log.level === 'success') {
                                levelColor = 'text-emerald-400 font-bold';
                                levelText = '[OK]';
                              } else if (log.level === 'warn') {
                                levelColor = 'text-amber-400 font-bold';
                                levelText = '[WARN]';
                              } else if (log.level === 'error') {
                                levelColor = 'text-rose-400 font-bold animate-pulse';
                                levelText = '[ERR]';
                              }

                              return (
                                <div key={index} className="leading-relaxed break-words border-b border-stone-900/60 pb-1.5 last:border-0 last:pb-0">
                                  <div className="flex items-start gap-2">
                                    <span className="text-[10px] text-stone-600 shrink-0 font-mono select-none">
                                      {log.timestamp.split('T')[1]?.slice(0, 8) || ''}
                                    </span>
                                    <span className={`${levelColor} shrink-0 select-none text-[10px]`}>
                                      {levelText}
                                    </span>
                                    <span className="text-stone-200 whitespace-pre-wrap select-text">
                                      {log.message}
                                    </span>
                                  </div>
                                  {log.details && (
                                    <div className="text-stone-500 text-[10px] pl-10 select-text break-all font-mono">
                                      └─ {log.details}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5 bg-stone-50/60 p-5 sm:p-6 border border-stone-200/50 rounded-2xl text-left font-mono">
                    <p className="text-xs text-stone-600 leading-normal font-sans">
                      Connect to PocketBase running on your PC (<code>./pocketbase serve</code>) via local network or Tailscale.
                    </p>
                    
                    <div className="space-y-3 max-w-lg">
                      <div>
                        <label className="text-[10px] font-extrabold text-stone-500 block uppercase tracking-wider mb-1">PocketBase URL</label>
                        <input
                          type="text"
                          placeholder="http://100.x.y.z:8090"
                          value={pbUrl}
                          onChange={(e) => setPbUrl(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-stone-200 rounded-lg bg-white font-mono text-stone-800 focus:outline-none focus:border-emerald-500"
                        />
                        {pbUrl.trim().toLowerCase().startsWith('http:') && typeof window !== 'undefined' && window.location.protocol === 'https:' && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800 leading-normal font-sans">
                            ⚠️ <strong>Browser Security:</strong> HTTPS browsers block <code>http://</code> links. Use Tailscale HTTPS/Funnel or run locally.
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] font-extrabold text-stone-500 block uppercase tracking-wider mb-1">Identity (Email/Username)</label>
                        <input
                          type="text"
                          placeholder="user@example.com"
                          value={pbIdentity}
                          onChange={(e) => setPbIdentity(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-stone-200 rounded-lg bg-white font-mono text-stone-800 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-extrabold text-stone-500 block uppercase tracking-wider mb-1">Password</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={pbPassword}
                          onChange={(e) => setPbPassword(e.target.value)}
                          className="w-full text-xs px-3 py-2 border border-stone-200 rounded-lg bg-white font-mono text-stone-800 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="flex items-start gap-2.5 pt-1.5 pb-1">
                        <input
                          type="checkbox"
                          id="pbUseNativeFiles"
                          checked={pbUseNativeFiles}
                          onChange={(e) => setPbUseNativeFiles(e.target.checked)}
                          className="mt-0.5 w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-stone-300 rounded cursor-pointer"
                        />
                        <div className="text-left">
                          <label htmlFor="pbUseNativeFiles" className="text-xs font-bold text-stone-700 cursor-pointer block select-none">
                            Use PocketBase File Fields
                          </label>
                          <p className="text-[10px] text-stone-500 leading-normal font-sans mt-0.5">
                            Stores photos as binary files for faster performance. Requires <code>photoBase64</code> as File type in PocketBase.
                          </p>
                        </div>
                      </div>

                      {pbError && (
                        <p className="text-xs text-rose-600 font-bold leading-normal pt-1 font-sans">
                          {pbError}
                        </p>
                      )}

                      <button
                        onClick={async () => {
                          setPbError('');
                          setIsConnectingPb(true);
                          try {
                            const res = await connectPocketbase(pbUrl, pbIdentity, pbPassword, pbUseNativeFiles);
                            if (res.success) {
                              setPbPassword('');
                              setToastMessage({ text: 'Connected and synchronized with your PC PocketBase server successfully!', type: 'success' });
                            } else {
                              setPbError(res.error || 'Connection failed');
                            }
                          } catch (err: any) {
                            setPbError(err.message || 'Connection error');
                          } finally {
                            setIsConnectingPb(false);
                          }
                        }}
                        disabled={isConnectingPb || !pbUrl || !pbIdentity}
                        className="w-full mt-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-50 text-center flex items-center justify-center gap-1.5"
                      >
                        {isConnectingPb ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Connecting...</span>
                          </>
                        ) : (
                          <span>Connect & Synchronize</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : selectedTree ? (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
            >
              <TreeDetail 
                tree={activeTreeForDetails} 
                onBack={() => {
                  setSelectedTreeId(null);
                }} 
              />
            </motion.div>
          ) : (
            <motion.div
              key="tabs"
              className="space-y-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Backups Sync Alert Info Block for Anonymous Sessions */}
              {!pbEnabled && trees.length > 0 && (
                <div className="p-5 bg-natural-forest text-natural-bg border border-natural-cloud/20 rounded-[32px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-md font-mono text-xs">
                  <div className="flex gap-3 items-start">
                    <Server className="w-5 h-5 text-natural-sage shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-serif font-bold text-white">Sync with Home PC Server</h4>
                      <p className="text-[11px] text-natural-cream opacity-90 leading-relaxed mt-1 font-sans">
                        Connect your garden database and growth photos to a local PocketBase server running on your home PC or over Tailscale.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowProfileDropdown(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-3.5 py-1.5 bg-natural-clay hover:bg-natural-clay/90 text-white font-serif font-bold text-[11px] rounded-xl inline-flex items-center gap-1 transition-all shrink-0 self-start sm:self-center shadow-md cursor-pointer"
                  >
                    Configure PC Sync &rarr;
                  </button>
                </div>
              )}

              {/* Toast Notification message */}
              {toastMessage && (
                <div className={`p-4 rounded-2xl border text-xs font-serif font-bold transition-all relative flex justify-between items-center ${
                  toastMessage.type === 'success' 
                    ? 'bg-natural-sage/10 border-natural-sage text-natural-forest' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <span>{toastMessage.text}</span>
                  <button 
                    onClick={() => setToastMessage(null)}
                    className="text-xs ml-3 font-serif cursor-pointer hover:underline text-natural-forest"
                  >
                    Close
                  </button>
                </div>
              )}

              {/* Loader feedback */}
              {loading ? (
                <div className="flex flex-col justify-center items-center py-20 space-y-2">
                  <div className="w-8 h-8 rounded-full border-2 border-natural-forest border-t-transparent animate-spin" />
                  <p className="text-xs text-natural-muted font-medium">Synthesizing Bonsai collection...</p>
                </div>
              ) : (
                <div className="space-y-6 animate-fadeIn">
                  {(() => {
                    const {
                      aliveTrees,
                      deadTrees,
                      uniqueSpecies,
                      avgAge,
                      stageCounts,
                      sortedAliveTrees
                    } = gardenMetrics;

                    if (currentView === 'garden') {
                      return (
                        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start w-full text-left">
                          {/* Desktop Quick Stats Left Sidebar (sticky on scroll) */}
                          <div className="hidden lg:block w-72 shrink-0 space-y-4 sticky top-22">
                            <div className="bg-[#FCFAF5] border border-natural-cream p-5 rounded-[24px] space-y-4 shadow-xs">
                              <h3 className="text-xs font-mono font-black text-natural-forest uppercase tracking-wider flex items-center gap-2 border-b border-natural-cream pb-2.5">
                                <BarChart2 className="w-4 h-4 text-natural-sage" />
                                Garden Quick Stats
                              </h3>
                              
                              <div className="space-y-4">
                                <div className="p-3.5 bg-white border border-natural-cream/65 rounded-xl shadow-xs">
                                  <span className="block text-[9px] font-mono font-bold text-natural-muted uppercase tracking-wider"># Unique Species</span>
                                  <span className="text-base font-serif font-black text-natural-forest mt-0.5 block">{uniqueSpecies} Types</span>
                                </div>
                                
                                <div className="p-3.5 bg-white border border-natural-cream/65 rounded-xl shadow-xs">
                                  <span className="block text-[9px] font-mono font-bold text-natural-muted uppercase tracking-wider">Average Tree Age</span>
                                  <span className="text-base font-serif font-black text-natural-forest mt-0.5 block">{avgAge > 0 ? `${avgAge} years` : 'N/A'}</span>
                                </div>

                                <div className="p-4 bg-white border border-natural-cream/65 rounded-xl shadow-xs space-y-3">
                                  <div className="flex justify-between items-center border-b border-natural-cream/30 pb-1">
                                    <span className="block text-[9px] font-mono font-bold text-natural-muted uppercase tracking-wider">Breakdown of Trees by Growth Stage</span>
                                    {stageFilter && (
                                      <button 
                                        onClick={() => setStageFilter(null)}
                                        className="text-[9px] font-mono font-bold text-rose-600 hover:text-rose-850 hover:underline cursor-pointer focus:outline-none bg-transparent border-none p-0"
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    {Object.entries(stageCounts).map(([stage, count]) => {
                                      const pct = aliveTrees.length > 0 ? Math.round((count / aliveTrees.length) * 100) : 0;
                                      const isActive = stageFilter === stage;
                                      return (
                                        <div 
                                          key={stage} 
                                          onClick={() => setStageFilter(prev => prev === stage ? null : stage)}
                                          className={`space-y-1 p-1.5 rounded-xl transition-all cursor-pointer select-none border ${
                                            isActive 
                                              ? 'bg-natural-sage/10 border-natural-sage/30 ring-1 ring-natural-sage/10' 
                                              : 'bg-transparent border-transparent hover:bg-natural-bg/40'
                                          }`}
                                        >
                                          <div className="flex justify-between items-center text-[10px] font-mono font-bold text-natural-dark">
                                            <span className={isActive ? 'text-natural-forest font-black' : 'text-natural-muted'}>
                                              {stage} {isActive && '✓'}
                                            </span>
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                                              isActive 
                                                ? 'bg-natural-forest text-white font-extrabold' 
                                                : 'bg-natural-sage/10 text-natural-forest'
                                            }`}>{count}</span>
                                          </div>
                                          <div className="w-full bg-[#FCFAF5]/70 border border-natural-cream/65 h-1.5 rounded-full overflow-hidden">
                                            <div 
                                              className={`${isActive ? 'bg-natural-forest' : 'bg-natural-sage'} h-full rounded-full transition-all duration-500`} 
                                              style={{ width: `${pct}%` }} 
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Garden Feed main area */}
                          <div className="flex-1 w-full space-y-6">
                            {/* Header sorting controls bar */}
                            <div className="flex flex-row items-center justify-between gap-3 border-b border-natural-cream pb-3 text-left">
                              <div 
                                onClick={() => setShowMobileStats(true)}
                                className="cursor-pointer group flex flex-col hover:opacity-85 transition-all select-none"
                                title="Click to view Garden Quick Stats"
                              >
                                <div className="flex items-center gap-1.5">
                                  <h2 className="text-xs font-serif font-extrabold text-natural-forest uppercase tracking-wide group-hover:text-natural-clay transition-colors">
                                    Bonsai Garden
                                  </h2>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <p className="text-[10px] text-natural-muted leading-tight font-mono">
                                    {sortedAliveTrees.length} Trees
                                  </p>
                                  {stageFilter && (
                                    <span className="inline-flex items-center gap-1 bg-natural-sage/15 border border-natural-sage/35 text-natural-forest px-1.5 py-0.5 rounded-full text-[8px] font-mono font-bold leading-none">
                                      Stage: {stageFilter}
                                      <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setStageFilter(null); }} 
                                        className="hover:text-rose-700 font-extrabold ml-0.5 cursor-pointer focus:outline-none border-none bg-transparent p-0 flex items-center"
                                        title="Clear filter"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono font-bold text-natural-muted uppercase shrink-0">Sort:</span>
                                <select
                                  value={sortBy}
                                  onChange={(e) => {
                                    setSortBy(e.target.value as any);
                                  }}
                                  className="bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark font-sans font-semibold focus:outline-none focus:ring-1 focus:ring-natural-sage cursor-pointer"
                                >
                                  <option value="lastUpdated">Last Updated</option>
                                  <option value="name">Name</option>
                                  <option value="age">Age</option>
                                  <option value="dateAcquired">Date Acquired</option>
                                  <option value="status">Growth Stage</option>
                                  <option value="trunkWidth">Trunk Width</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                  className="h-8 px-2.5 bg-white border border-natural-cream hover:bg-natural-bg/50 hover:border-natural-sage/50 text-natural-forest font-bold font-mono text-[10px] uppercase tracking-wider transition-all rounded-xl cursor-pointer flex items-center justify-center gap-1"
                                  title={sortOrder === 'asc' ? "Sort Ascending" : "Sort Descending"}
                                >
                                  <span>{sortOrder === 'asc' ? 'Asc' : 'Desc'}</span>
                                  <span className="text-natural-sage">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                </button>
                              </div>
                            </div>

                            {sortedAliveTrees.length === 0 ? (
                              <div className="text-center py-20 bg-white border border-natural-cream rounded-[32px] p-8 space-y-4 shadow-sm">
                                <div className="w-12 h-12 rounded-full bg-natural-bg flex items-center justify-center text-zinc-300 mx-auto border border-natural-cream-dark">
                                  <Sprout className="w-6 h-6 text-natural-sage" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-mono font-bold text-natural-dark">No Active Specimens</h3>
                                  <p className="text-xs text-natural-muted leading-relaxed mt-1 font-mono max-w-md mx-auto">
                                    Your active garden is empty. Register a specimen or load the preloaded sandbox database to begin.
                                  </p>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                                  <button
                                    onClick={() => setShowAddModal(true)}
                                    className="px-4 py-2 bg-natural-forest hover:bg-[#2F4F4F] text-white font-mono font-semibold text-xs rounded-xl flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer"
                                  >
                                    <Plus className="w-4 h-4" /> Add Specimen
                                  </button>
                                  <button
                                    onClick={handleLoadSamples}
                                    className="px-4 py-2 bg-white hover:bg-natural-bg border border-natural-cream text-natural-forest font-mono font-semibold text-xs rounded-xl cursor-pointer"
                                  >
                                    Load Sample Sandbox Data
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Widened responsive grid allowing larger scale card imagery on desktop views */
                              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                                {sortedAliveTrees.map((tree) => {
                                  return (
                                    <div
                                      key={tree.id}
                                      onClick={() => setSelectedTreeId(tree.id)}
                                      className="group cursor-pointer rounded-2xl border border-natural-cream bg-white overflow-hidden shadow-none hover:border-natural-sage transition-all flex flex-col relative"
                                    >
                                      {/* Square photo box */}
                                      <div className="aspect-square w-full bg-[#FCFAF5] border-b border-natural-cream relative overflow-hidden flex items-center justify-center shrink-0">
                                        {getTreePrimaryPhoto(tree) ? (
                                          <img 
                                            src={getTreePrimaryPhoto(tree)} 
                                            alt={tree.name} 
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                                            referrerPolicy="no-referrer"
                                            loading="lazy"
                                          />
                                        ) : (
                                          <div className="flex flex-col items-center justify-center text-natural-sage/40 gap-1 p-2">
                                            <Sprout className="w-8 h-8 text-natural-sage" />
                                            <span className="text-[7px] uppercase font-mono tracking-widest text-natural-muted font-bold">PREVIEW</span>
                                          </div>
                                        )}
                                      </div>

                                      {/* Content block */}
                                      <div className="p-3.5 flex-1 flex flex-col justify-between gap-1 border-t border-natural-cream">
                                        <div>
                                          <h3 className="text-xs font-mono font-bold text-natural-dark group-hover:text-natural-sage line-clamp-1 transition-colors leading-[1.2]">
                                            {tree.name}
                                          </h3>
                                          <p className="text-[9px] text-[#555] font-semibold truncate mt-1 leading-none">{tree.species}</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Floating Addition Bar Trigger */}
                            {aliveTrees.length > 0 && (
                              <div className="flex justify-end pt-2">
                                <button
                                  onClick={() => {
                                    setShowAddModal(true);
                                  }}
                                  className="px-5 py-2.5 bg-natural-forest hover:bg-natural-forest/90 text-white font-mono font-bold text-xs rounded-full flex items-center gap-1.5 shadow-md sticky bottom-4 shrink-0 cursor-pointer transition-all hover:-translate-y-0.5"
                                >
                                  <Plus className="w-4 h-4" /> Add Tree
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    } else if (currentView === 'graveyard') {
                      return (
                        <div className="space-y-6 text-left">
                          {/* Graveyard header block */}
                          <div className="p-6 bg-stone-100 border border-stone-200 rounded-[24px] text-left">
                            <div className="flex items-center gap-2">
                              <Skull className="w-5 h-5 text-stone-600" />
                              <h2 className="text-sm font-serif font-black text-stone-800 uppercase tracking-wide">Bonsai Graveyard</h2>
                            </div>
                          </div>

                          {deadTrees.length === 0 ? (
                            <div className="text-center py-20 bg-stone-50 border border-stone-200 rounded-[28.5px] p-8 shadow-inner">
                              <Sprout className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                              <p className="text-xs text-stone-500 font-serif italic text-center">
                                Bonsai Graveyard is empty.
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {deadTrees.map((tree) => {
                                const isEditing = editingNoteId === tree.id;
                                return (
                                  <div
                                    key={tree.id}
                                    className="border border-stone-200 bg-[#FAF9F5] rounded-3xl p-4 flex flex-col sm:flex-row gap-4 relative text-left shadow-xs"
                                  >
                                    {/* Grayscale square photo box */}
                                    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-stone-100 rounded-2xl relative overflow-hidden flex items-center justify-center shrink-0 border border-stone-200">
                                      {getTreePrimaryPhoto(tree) ? (
                                        <img 
                                          src={getTreePrimaryPhoto(tree)} 
                                          alt={tree.name} 
                                          className="w-full h-full object-cover grayscale opacity-70"
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <Sprout className="w-8 h-8 text-stone-400" />
                                      )}
                                      <div className="absolute inset-0 bg-stone-900/5 h-full w-full" />
                                    </div>

                                    {/* Content and Memorial Notes Container */}
                                    <div className="flex-1 flex flex-col justify-between gap-2">
                                      <div>
                                        <div className="flex items-start justify-between gap-1.5">
                                          <div>
                                            <h3 className="text-xs font-serif font-black text-stone-800 leading-tight">{tree.name}</h3>
                                            <p className="text-[9px] text-stone-500 font-mono font-bold mt-0.5">{tree.species} &bull; {tree.style || 'Undetermined profile'}</p>
                                          </div>
                                          
                                          <div className="flex items-center gap-1 shrink-0">
                                            {/* Restore Tree Option */}
                                            <button
                                              onClick={() => {
                                                setRestoringTreeId(tree.id);
                                              }}
                                              className="p-1 px-2 border border-emerald-200/85 hover:bg-emerald-50 text-emerald-700 font-bold font-mono text-[9px] uppercase tracking-wider transition-all rounded-xl cursor-pointer flex items-center gap-1"
                                              title="Restore Specimen to Active Garden"
                                            >
                                              <Sprout className="w-3 h-3 text-emerald-600" />
                                              <span>Restore</span>
                                            </button>

                                            {/* Deletion Option only available in Graveyard */}
                                            <button
                                              onClick={() => {
                                                setDeletingTreeId(tree.id);
                                              }}
                                              className="p-1.5 hover:bg-rose-50 text-stone-400 hover:text-rose-700 transition-colors rounded-xl cursor-pointer"
                                              title="Delete Specimen Record Permanently"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>

                                        {/* Lesson Learned wrapper block */}
                                        <div className="mt-3 bg-stone-50 border border-stone-200/80 p-3 rounded-xl">
                                          <span className="block text-[8px] font-mono font-bold text-stone-500 uppercase tracking-wider">Lesson learned memorial note</span>
                                          
                                          {isEditing ? (
                                            <div className="mt-1.5 space-y-2">
                                              <textarea
                                                value={inputNote}
                                                onChange={(e) => setInputNote(e.target.value)}
                                                className="w-full bg-white border border-stone-300 rounded-lg p-1.5 text-xs font-serif text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-500"
                                                rows={2.5}
                                                placeholder="What did you learn from this specimen's demise?"
                                              />
                                              <div className="flex justify-end gap-1">
                                                <button
                                                  onClick={() => setEditingNoteId(null)}
                                                  className="px-2 py-0.5 border border-stone-300 text-stone-500 rounded text-[9px] font-bold cursor-pointer hover:bg-stone-100 transition-all"
                                                >
                                                  Cancel
                                                </button>
                                                <button
                                                  onClick={async () => {
                                                    await updateTree(tree.id, { lessonLearned: inputNote });
                                                    setEditingNoteId(null);
                                                  }}
                                                  className="px-2 py-0.5 bg-stone-700 hover:bg-stone-800 text-white rounded text-[9px] font-bold cursor-pointer transition-all"
                                                >
                                                  Save Note
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="mt-1 flex items-start justify-between gap-1.5">
                                              <p className="text-xs font-serif text-stone-700 leading-normal italic">
                                                "{tree.lessonLearned || 'No notes currently written.'}"
                                              </p>
                                              <button
                                                onClick={() => {
                                                  setEditingNoteId(tree.id);
                                                  setInputNote(tree.lessonLearned || '');
                                                }}
                                                className="text-[9px] font-mono font-bold text-stone-500 hover:text-stone-800 hover:underline cursor-pointer flex-shrink-0"
                                              >
                                                Edit
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add Tree Modal Popup Box */}
      <AnimatePresence>
        {showAddModal && (
          <AddTreeModal onClose={() => setShowAddModal(false)} />
        )}
      </AnimatePresence>

      {/* Mobile Stats Modal Overlay */}
      <AnimatePresence>
        {showMobileStats && (() => {
          const aliveTrees = trees.filter(t => !t.isDead);
          const uniqueSpecies = new Set(aliveTrees.map(t => (t.species || '').trim().toLowerCase())).size;
          const treesWithAge = aliveTrees.filter(t => calculateCurrentAge(t) !== undefined);
          const avgAge = treesWithAge.length > 0 
            ? Math.round(treesWithAge.reduce((sum, t) => sum + (calculateCurrentAge(t) || 0), 0) / treesWithAge.length)
            : 0;

          const stageCounts: Record<string, number> = {
            'Pre-Bonsai': 0,
            'Early Development': 0,
            'Refinement': 0,
            'Mature': 0
          };
          aliveTrees.forEach(t => {
            const s = t.status || 'Pre-Bonsai';
            if (s in stageCounts) {
              stageCounts[s]++;
            } else {
              stageCounts[s] = (stageCounts[s] || 0) + 1;
            }
          });

          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-left">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-[32px] border border-natural-cream overflow-hidden max-w-sm w-full shadow-2xl relative"
              >
                <div className="bg-[#FCFAF5] px-5 py-4 border-b border-natural-cream flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-natural-sage" />
                    <h3 className="text-xs font-mono font-bold text-natural-forest uppercase tracking-wide">
                      Garden Quick Stats
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowMobileStats(false)}
                    className="text-xs font-mono font-bold text-natural-muted hover:text-natural-dark hover:underline cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div className="p-4 bg-[#FCFAF5]/50 border border-natural-cream/60 rounded-2xl shadow-xs">
                    <span className="block text-[9px] font-mono font-bold text-natural-muted uppercase tracking-wider"># Unique Species</span>
                    <span className="text-base font-serif font-black text-natural-forest mt-0.5 block">{uniqueSpecies} Types</span>
                  </div>
                  
                  <div className="p-4 bg-[#FCFAF5]/50 border border-natural-cream/60 rounded-2xl shadow-xs">
                    <span className="block text-[9px] font-mono font-bold text-natural-muted uppercase tracking-wider">Average Tree Age</span>
                    <span className="text-base font-serif font-black text-natural-forest mt-0.5 block">{avgAge > 0 ? `${avgAge} years` : 'N/A'}</span>
                  </div>

                  <div className="p-4 bg-[#FCFAF5]/50 border border-natural-cream/60 rounded-2xl shadow-xs space-y-3">
                    <div className="flex justify-between items-center border-b border-natural-cream/30 pb-1">
                      <span className="block text-[9px] font-mono font-bold text-natural-muted uppercase tracking-wider">Breakdown of Trees by Growth Stage</span>
                      {stageFilter && (
                        <button 
                          onClick={() => setStageFilter(null)}
                          className="text-[9px] font-mono font-bold text-rose-600 hover:text-rose-850 hover:underline cursor-pointer focus:outline-none bg-transparent border-none p-0"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {Object.entries(stageCounts).map(([stage, count]) => {
                        const pct = aliveTrees.length > 0 ? Math.round((count / aliveTrees.length) * 100) : 0;
                        const isActive = stageFilter === stage;
                        return (
                          <div 
                            key={stage} 
                            onClick={() => setStageFilter(prev => prev === stage ? null : stage)}
                            className={`space-y-1 p-1.5 rounded-xl transition-all cursor-pointer select-none border ${
                              isActive 
                                ? 'bg-natural-sage/10 border-natural-sage/30 ring-1 ring-natural-sage/10' 
                                : 'bg-transparent border-transparent hover:bg-natural-bg/40'
                            }`}
                          >
                            <div className="flex justify-between items-center text-[10px] font-mono font-bold text-natural-dark font-sans">
                              <span className={isActive ? 'text-natural-forest font-black' : 'text-natural-muted'}>
                                {stage} {isActive && '✓'}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                                isActive 
                                  ? 'bg-natural-forest text-white font-extrabold' 
                                  : 'bg-natural-sage/10 text-natural-forest'
                              }`}>{count}</span>
                            </div>
                            <div className="w-full bg-white border border-natural-cream/65 h-1.5 rounded-full overflow-hidden font-sans">
                              <div 
                                className={`${isActive ? 'bg-natural-forest' : 'bg-natural-sage'} h-full rounded-full transition-all duration-500`} 
                                style={{ width: `${pct}%` }} 
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 bg-[#FCFAF5]/30 border-t border-natural-cream flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setShowMobileStats(false)}
                    className="px-5 py-2 bg-natural-forest hover:bg-natural-forest/95 text-white rounded-xl text-xs font-mono font-bold uppercase cursor-pointer shadow-xs transition-all"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Wipe All Data Confirmation Modal */}
      <AnimatePresence>
        {showWipeConfirmModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-natural-cream overflow-hidden max-w-sm w-full shadow-xl"
            >
              <div className="bg-rose-50 px-5 py-4 border-b border-rose-100 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                <h3 className="text-xs font-mono font-bold text-rose-955 uppercase tracking-wide">
                  Confirm Database Wipe
                </h3>
              </div>

              <div className="p-5 space-y-3.5">
                <p className="text-[11px] text-rose-900 bg-rose-50/50 p-3 border border-rose-100 rounded-xl leading-normal">
                  <strong>WARNING:</strong> This action cannot be undone. All data will be permanently deleted.
                </p>

                <div className="space-y-1.5">
                  <label className="block text-[9px] font-mono font-bold uppercase tracking-wider text-natural-muted">
                    To confirm deletion, type exactly: <strong className="text-rose-750 bg-rose-50 px-1 py-0.5 rounded">WIPE ALL DATA</strong>
                  </label>
                  <input
                    type="text"
                    value={wipeInputText}
                    onChange={(e) => setWipeInputText(e.target.value)}
                    placeholder="WIPE ALL DATA"
                    className="w-full bg-slate-50 border border-natural-cream focus:border-rose-350 focus:ring-1 focus:ring-rose-200 rounded-xl px-2.5 py-2 text-xs text-natural-dark font-mono placeholder:opacity-50"
                  />
                </div>
              </div>

              <div className="px-5 py-3.5 bg-slate-50 border-t border-natural-cream flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setShowWipeConfirmModal(false);
                    setWipeInputText('');
                  }}
                  className="px-3.5 py-1.5 border border-natural-cream rounded-xl text-[10px] font-mono font-bold uppercase text-natural-muted hover:bg-white cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={wipeInputText !== "WIPE ALL DATA"}
                  onClick={async () => {
                    // Close dialog and reset input immediately so the UI is responsive
                    setShowWipeConfirmModal(false);
                    const currentInput = wipeInputText;
                    setWipeInputText('');
                    try {
                      // Automatically execute an export zip of all the data so that a backup exists before the wipe goes through
                      try {
                        const zipBlob = await exportCollectionToZip(trees, measurements, careLogs, tasks);
                        downloadBlob(zipBlob, `bonsai_prewipe_backup_${new Date().toISOString().split('T')[0]}.zip`);
                      } catch (backupErr) {
                        console.error("Automated pre-wipe backup ZIP export failed:", backupErr);
                      }
                      await clearAllData();
                      setSelectedTreeId(null);
                      setCurrentView('garden');
                      setToastMessage({ text: "Entire collection wiped successfully. A pre-wipe backup ZIP has been auto-downloaded. Ready for import retesting.", type: 'success' });
                    } catch (err: any) {
                      setToastMessage({ text: "Failed to wipe data: " + err.message, type: 'error' });
                    }
                  }}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-mono font-black border border-rose-700 disabled:bg-stone-100 disabled:text-stone-400 disabled:border-stone-200 disabled:opacity-50 disabled:cursor-not-allowed uppercase transition-colors cursor-pointer"
                >
                  Wipe Database
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Backup Confirmation Modal */}
      <AnimatePresence>
        {pendingImportFile && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-left">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-natural-cream overflow-hidden max-w-sm w-full shadow-xl"
            >
              <div className="bg-emerald-50 px-5 py-4 border-b border-emerald-100 flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
                <h3 className="text-xs font-mono font-bold text-emerald-950 uppercase tracking-wide">
                  Confirm ZIP Backup Import
                </h3>
              </div>

              <div className="p-5 space-y-3.5">
                <div className="text-[11px] text-emerald-900 bg-emerald-50/50 p-3 border border-emerald-100 rounded-xl leading-normal space-y-1.5 font-sans">
                  <p>
                    <strong>File to import:</strong> <span className="font-mono text-emerald-800 font-bold break-all">{pendingImportFile.name}</span>
                  </p>
                  <p>
                    Importing will load and restore trees, photos, care logs, measurements, and tasks from your backup.
                  </p>
                  <p className="text-stone-500 italic">
                    Note: If you have existing records, this will merge them. For a clean overwrite, run "Wipe All Data" first.
                  </p>
                </div>
              </div>

              <div className="px-5 py-3.5 bg-slate-50 border-t border-natural-cream flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleCancelImport}
                  className="px-3.5 py-1.5 border border-natural-cream rounded-xl text-[10px] font-mono font-bold uppercase text-natural-muted hover:bg-white cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProceedImport}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-mono font-black border border-emerald-700 uppercase transition-colors cursor-pointer"
                >
                  Proceed with Import
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Permanent Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingTreeId && (() => {
          const targetTree = trees.find(t => t.id === deletingTreeId);
          if (!targetTree) return null;
          return (
            <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-left">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-[32px] border border-rose-100 overflow-hidden max-w-sm w-full shadow-2xl"
              >
                <div className="bg-rose-50 px-5 py-4 border-b border-rose-100 flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-700 shrink-0" />
                  <h3 className="text-xs font-mono font-bold text-rose-800 uppercase tracking-wide">
                    Delete Tree
                  </h3>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-xs text-natural-dark leading-relaxed">
                    Are you sure you want to permanently erase <strong>{targetTree.name}</strong> from history?
                  </p>
                  <p className="text-[11px] text-zinc-500 leading-normal">
                    This will delete all logs, progression milestones, measurements, and cloud backups for this tree. This action is irreversible.
                  </p>
                </div>
                <div className="px-5 py-3.5 bg-stone-50 border-t border-rose-50 flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setDeletingTreeId(null)}
                    className="px-3.5 py-1.5 border border-stone-200 rounded-xl text-[10px] font-mono font-bold uppercase text-stone-500 hover:bg-white cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteTree(targetTree.id);
                      setDeletingTreeId(null);
                      setToastMessage({ text: `Permanently removed resting record of "${targetTree.name}".`, type: 'success' });
                    }}
                    className="px-3.5 py-1.5 bg-rose-750 hover:bg-rose-800 text-white rounded-xl text-[10px] font-mono font-black border border-rose-800 transition-colors cursor-pointer uppercase"
                  >
                    Delete Permanently
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Restore Confirmation Modal */}
      <AnimatePresence>
        {restoringTreeId && (() => {
          const targetTree = trees.find(t => t.id === restoringTreeId);
          if (!targetTree) return null;
          return (
            <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-left">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-[32px] border border-emerald-100 overflow-hidden max-w-sm w-full shadow-2xl"
              >
                <div className="bg-emerald-50/70 border-b border-emerald-100 px-5 py-4 flex items-center gap-2">
                  <Sprout className="w-4 h-4 text-emerald-700 shrink-0" />
                  <h3 className="text-xs font-mono font-bold text-emerald-800 uppercase tracking-wide">
                    Restore Specimen
                  </h3>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-xs text-natural-dark leading-relaxed">
                    Would you like to restore <strong>{targetTree.name}</strong> back to your active garden feed?
                  </p>
                  <p className="text-[11px] text-zinc-500 leading-normal">
                    This will place the tree back in your active Bonsai collection list and count it in active stats.
                  </p>
                </div>
                <div className="px-5 py-3.5 bg-stone-50 border-t border-emerald-100/30 flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setRestoringTreeId(null)}
                    className="px-3.5 py-1.5 border border-stone-200 rounded-xl text-[10px] font-mono font-bold uppercase text-stone-500 hover:bg-white cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await updateTree(targetTree.id, { isDead: false });
                      setRestoringTreeId(null);
                      setToastMessage({ text: `"${targetTree.name}" has been successfully restored to your active garden tree directory.`, type: 'success' });
                    }}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[10px] font-mono font-black border border-emerald-800 transition-colors cursor-pointer uppercase"
                  >
                    Restore Garden Feed
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
      {/* Real-time Floating Push Notification Stack */}
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[99999] max-w-sm w-[calc(100vw-2rem)] space-y-2.5 pointer-events-none">
        <AnimatePresence>
          {inAppNotifs.map(notif => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, y: -24, scale: 0.9, rotateX: -15 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.9, transition: { duration: 0.2 } }}
              className="pointer-events-auto bg-stone-900/95 text-stone-100 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-emerald-500/40 flex items-start gap-3 relative overflow-hidden ring-1 ring-white/10"
            >
              <div className="p-2 bg-emerald-950/90 text-emerald-400 rounded-xl border border-emerald-800/80 shrink-0 shadow-xs">
                <Sprout className="w-5 h-5 text-emerald-400 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-serif font-bold text-emerald-300 truncate">
                    {notif.title}
                  </h4>
                  <span className="text-[9px] font-mono font-medium text-stone-400 shrink-0">
                    {notif.timestamp}
                  </span>
                </div>
                {notif.body && (
                  <p className="text-[11px] text-stone-300 leading-snug mt-1 font-sans">
                    {notif.body}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInAppNotifs(prev => prev.filter(n => n.id !== notif.id))}
                className="text-stone-400 hover:text-stone-100 p-1 rounded-lg hover:bg-stone-800/80 cursor-pointer transition-colors shrink-0"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              
              {/* Progress timer indicator line */}
              <motion.div
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 7, ease: 'linear' }}
                onAnimationComplete={() => {
                  setInAppNotifs(prev => prev.filter(n => n.id !== notif.id));
                }}
                className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-400"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BonsaiProvider>
      <AppContent />
    </BonsaiProvider>
  );
}
