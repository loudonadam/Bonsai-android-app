import { useState, useEffect } from 'react';
import { BonsaiProvider, useBonsai } from './context/BonsaiContext';
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
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import TreeDetail from './components/TreeDetail';
import CareLibrary from './components/CareLibrary';
import CareTasks from './components/CareTasks';
import AddTreeModal from './components/AddTreeModal';
import { Tree, BonsaiStatus } from './types';
import { samplePreloadTrees } from './utils';
import { exportCollectionToZip, importCollectionFromZip, downloadBlob } from './utils/zipHelpers';

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
    accessToken,
    driveSyncStatus,
    quota,
    reconnectDrive
  } = useBonsai();

  const { careLogs, tasks, importCollection } = useBonsai();

  // Navigation & UI state
  const [selectedTree, setSelectedTree] = useState<Tree | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showChoresModal, setShowChoresModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
      case 'Healthy': return 'bg-natural-sage/20 text-natural-forest border border-natural-sage/40';
      case 'Stressed': return 'bg-natural-clay/20 text-natural-clay border border-natural-clay/40';
      case 'Dormant': return 'bg-natural-cream-dark/40 text-natural-muted border border-natural-cream-dark';
      case 'In Training': return 'bg-natural-forest/10 text-natural-forest border border-natural-forest/20';
      case 'Diseased': return 'bg-rose-500/10 text-rose-700 border border-rose-500/20';
      case 'Recovering': return 'bg-natural-clay/10 text-natural-clay border border-natural-clay/30';
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

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    setToastMessage(null);
    try {
      const importedData = await importCollectionFromZip(file);
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
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-natural-bg text-natural-text font-sans pb-16">
      {/* Premium minimal header navigations */}
      <header className="sticky top-0 bg-natural-bg/95 backdrop-blur-md border-b border-natural-cream py-3 px-4 sm:px-6 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setSelectedTree(null); }}>
            <span className="p-1.5 bg-natural-sage/25 text-natural-forest rounded-xl inline-flex items-center justify-center">
              <Sprout className="w-4 h-4 text-natural-forest" />
            </span>
            <div>
              <h1 className="text-xs uppercase font-mono tracking-wider font-extrabold text-natural-forest">Bonsai Collection</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Account authentication states */}
            {authLoading ? (
              <span className="w-4 h-4 rounded-full border border-t-natural-forest animate-spin" />
            ) : user ? (
              <div className="flex items-center gap-2.5 bg-natural-cream/40 py-1 pl-2 pr-3 border border-natural-cream rounded-full">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || 'user'} 
                    className="w-5 h-5 rounded-full border border-natural-cream-dark shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-natural-sage text-natural-forest flex items-center justify-center text-[10px] shrink-0">
                    <User className="w-3 h-3" />
                  </div>
                )}
                
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-bold truncate leading-none max-w-[80px] text-natural-dark">
                    {user.displayName?.split(' ')[0]}
                  </span>
                  {accessToken ? (
                    <span className="text-[8px] font-semibold text-natural-forest inline-flex items-center gap-0.5 mt-0.5">
                      <span className={`w-1 h-1 rounded-full ${driveSyncStatus === 'synced' ? 'bg-natural-forest animate-pulse' : 'bg-amber-500 animate-spin'}`}></span>
                      {driveSyncStatus === 'synced' ? 'Google One Synced' : driveSyncStatus === 'syncing' ? 'Syncing...' : 'Drive Linked'}
                    </span>
                  ) : (
                    <button 
                      onClick={reconnectDrive}
                      className="text-[8px] font-bold text-amber-700 hover:underline flex items-center gap-0.5 mt-px text-left w-full"
                      title="Link the active session to Google One Drive storage file"
                    >
                      <RefreshCw className="w-2 h-2 animate-spin duration-3000 shrink-0" /> Link Cloud Drive
                    </button>
                  )}
                </div>

                <button
                  onClick={logOut}
                  className="text-natural-muted hover:text-red-650 transition-colors p-0.5 ml-1 shrink-0"
                  title="Disconnect account"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={signIn}
                className="px-3 py-1 bg-natural-forest hover:bg-natural-forest/90 text-natural-bg text-[11px] font-serif font-bold rounded-xl inline-flex items-center gap-1 shadow-xs transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" /> Link Google One
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-5">
        <AnimatePresence mode="wait">
          {selectedTree ? (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
            >
              <TreeDetail 
                tree={selectedTree} 
                onBack={() => {
                  setSelectedTree(null);
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
              {!user && !authLoading && trees.length > 0 && (
                <div className="p-5 bg-natural-forest text-natural-bg border border-natural-cloud/20 rounded-[32px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-md">
                  <div className="flex gap-3 items-start">
                    <Database className="w-5 h-5 text-natural-sage shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-serif font-bold text-white">Backup to Google One Account</h4>
                      <p className="text-[11px] text-natural-cream opacity-90 leading-relaxed mt-1">
                        We back up your entire Bonsai garden configuration, growth patterns, and chores securely to your 1TB cloud storage.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={signIn}
                    className="px-3.5 py-1.5 bg-natural-clay hover:bg-natural-clay/90 text-white font-serif font-bold text-[11px] rounded-xl inline-flex items-center gap-1 transition-all shrink-0 self-start sm:self-center shadow-md cursor-pointer"
                  >
                    Sync Google One &rarr;
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
                <>
                  <div className="flex flex-col gap-2.5 pb-2.5 border-b border-natural-cream">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-mono tracking-wider font-extrabold text-natural-forest">
                        My Garden ({trees.length})
                      </span>
                      
                      <button 
                        onClick={() => setShowToolsMenu(!showToolsMenu)}
                        className="px-2.5 py-1.5 bg-white hover:bg-natural-cream border border-natural-cream rounded-xl text-[10px] font-sans font-bold inline-flex items-center gap-1 text-natural-forest cursor-pointer shadow-2xs transition-all"
                        title="Toggle garden collection options"
                      >
                        <span>Garden Options</span>
                        <motion.span
                          animate={{ rotate: showToolsMenu ? 180 : 0 }}
                          className="inline-block text-[8px]"
                        >
                          ▼
                        </motion.span>
                      </button>
                    </div>

                    <AnimatePresence>
                      {showToolsMenu && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 pb-1 pt-1.5">
                            <button 
                              onClick={() => setShowChoresModal(true)}
                              className="px-3 py-1.5 bg-white hover:bg-natural-cream border border-natural-cream rounded-xl text-[11px] font-serif font-bold inline-flex items-center justify-center gap-1 text-natural-forest cursor-pointer shadow-2xs"
                              title="View All Reminders & Care Chores"
                            >
                              <CheckSquare className="w-3.5 h-3.5 text-natural-sage" /> Care Chores
                            </button>
                            <button 
                              onClick={() => setShowLibraryModal(true)}
                              className="px-3 py-1.5 bg-white hover:bg-natural-cream border border-natural-cream rounded-xl text-[11px] font-serif font-bold inline-flex items-center justify-center gap-1 text-natural-forest cursor-pointer shadow-2xs"
                              title="Browse Reference Library"
                            >
                              <BookOpen className="w-3.5 h-3.5 text-natural-sage" /> Care Library
                            </button>

                            <button
                              onClick={handleExportZip}
                              disabled={exporting || trees.length === 0}
                              className="px-3 py-1.5 bg-white hover:bg-natural-cream border border-natural-cream rounded-xl text-[11px] font-serif font-bold inline-flex items-center justify-center gap-1 text-natural-forest cursor-pointer shadow-2xs disabled:opacity-50"
                              title="Export ZIP archive"
                            >
                              {exporting ? (
                                <span className="w-3 h-3 border-t border-natural-forest rounded-full animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5 text-natural-sage" />
                              )}
                              Export ZIP
                            </button>

                            <label 
                              className="px-3 py-1.5 bg-white hover:bg-natural-cream border border-natural-cream rounded-xl text-[11px] font-serif font-bold inline-flex items-center justify-center gap-1 text-natural-forest cursor-pointer shadow-2xs text-center"
                              title="Import collection backup"
                            >
                              {importing ? (
                                <span className="w-3.5 h-3.5 border-t border-natural-forest rounded-full animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5 text-natural-sage" />
                              )}
                              <span>Import ZIP</span>
                              <input
                                type="file"
                                accept=".zip"
                                onChange={handleImportZip}
                                disabled={importing}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="space-y-5">
                    {/* Zero State or Grid lists */}
                    {trees.length === 0 ? (
                      <div className="text-center py-20 bg-white border border-natural-cream rounded-[32px] p-8 space-y-4">
                        <div className="w-12 h-12 rounded-full bg-natural-bg flex items-center justify-center text-zinc-300 mx-auto border border-natural-cream-dark">
                          <Sprout className="w-6 h-6 text-natural-sage" />
                        </div>
                        <div>
                          <h3 className="text-sm font-serif font-bold text-natural-dark">No Bonsai trees in your collection</h3>
                          <p className="text-xs text-natural-muted leading-relaxed mt-1">
                            Let&apos;s register your first Bonsai and start recording water history and trunk developments!
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                          <button
                            onClick={() => setShowAddModal(true)}
                            className="px-4 py-2 bg-natural-clay hover:bg-natural-clay/90 text-white font-serif font-semibold text-xs rounded-xl flex items-center justify-center gap-1 shadow-md transition-all cursor-pointer"
                          >
                            <Plus className="w-4 h-4" /> Add Your Bonsai
                          </button>
                          <button
                            onClick={handleLoadSamples}
                            className="px-4 py-2 bg-white hover:bg-natural-cream border border-natural-cream text-natural-forest font-serif font-semibold text-xs rounded-xl cursor-pointer"
                          >
                            Load Sample Bonsais
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
                        {trees.map((tree) => {
                          const mm = measurements[tree.id] || [];
                          const latestMM = mm.length > 0 
                            ? [...mm].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                            : null;

                          return (
                            <div
                              key={tree.id}
                              onClick={() => setSelectedTree(tree)}
                              className="group cursor-pointer rounded-2xl border border-natural-cream bg-white overflow-hidden shadow-2xs hover:shadow-md transition-all hover:border-natural-sage flex flex-col relative"
                            >
                              {/* Absolute corner status pill overlay */}
                              <div className="absolute top-2 right-2 z-10">
                                <span className={`px-1.5 py-0.5 rounded-lg text-[7px] font-bold tracking-wider shrink-0 uppercase shadow-xs ${getStatusBadgeStyles(tree.status)}`}>
                                  {tree.status}
                                </span>
                              </div>

                              {/* Square photo box */}
                              <div className="aspect-square w-full bg-[#FCFAF5] border-b border-natural-cream relative overflow-hidden flex items-center justify-center shrink-0">
                                {tree.photoBase64 ? (
                                  <img 
                                    src={tree.photoBase64} 
                                    alt={tree.name} 
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center justify-center text-natural-sage/60 gap-1 p-2">
                                    <Sprout className="w-6 h-6 text-natural-sage" />
                                    <span className="text-[8px] uppercase font-mono tracking-widest text-[#B5AE9E] font-bold">Unrecorded</span>
                                  </div>
                                )}
                              </div>

                              {/* Content block */}
                              <div className="p-3 flex-1 flex flex-col justify-between gap-1.5">
                                <div>
                                  <h3 className="text-xs sm:text-sm font-serif font-black text-natural-dark group-hover:text-natural-clay line-clamp-1 transition-colors leading-[1.15]">
                                    {tree.name}
                                  </h3>
                                  <p className="text-[10px] text-natural-forest font-bold truncate mt-0.5 leading-none">{tree.species}</p>
                                  <p className="text-[9px] text-[#A29A88] italic font-medium truncate mt-0.5 leading-none">{tree.style || 'unspecified shape'}</p>
                                </div>

                                {/* Minimal info & fast logging */}
                                <div className="pt-2 border-t border-[#F2EDE2] flex items-center justify-between text-[9px] text-natural-muted font-mono mt-0.5 shrink-0">
                                  <span className="truncate max-w-[50%] font-bold">
                                    {latestMM ? `${latestMM.width}mm width` : 'no measurement'}
                                  </span>

                                  <div className="flex gap-1 shrink-0">
                                    <button
                                      onClick={(e) => handleQuickWater(e, tree.id)}
                                      className="p-1 hover:bg-sky-50 text-[#D4A373] hover:text-[#C08C5D] rounded transition-colors cursor-pointer"
                                      title="Record quick Watering"
                                    >
                                      <Droplets className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => handleQuickPrune(e, tree.id)}
                                      className="p-1 hover:bg-natural-cream text-natural-forest rounded transition-colors cursor-pointer"
                                      title="Record quick Pruning"
                                    >
                                      <Scissors className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Floating Addition Bar Trigger */}
                    {trees.length > 0 && (
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => {
                            setShowAddModal(true);
                          }}
                          className="px-5 py-3 bg-natural-clay hover:bg-natural-clay/90 text-white font-serif font-bold text-xs rounded-full flex items-center gap-1.5 shadow-lg transition-all sticky bottom-4 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" /> Register Bonsai Tree
                        </button>
                      </div>
                    )}
                  </div>
                </>
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

      {/* Care Chores Modal Drawer */}
      <AnimatePresence>
        {showChoresModal && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-40">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-natural-bg border border-zinc-200 rounded-[32px] max-w-xl w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowChoresModal(false)}
                className="absolute top-5 right-5 text-natural-muted hover:text-natural-dark text-lg font-serif font-bold pr-1 cursor-pointer z-50"
                title="Close"
              >
                ✕
              </button>
              <CareTasks />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Care Library Modal Drawer */}
      <AnimatePresence>
        {showLibraryModal && (
          <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 z-40">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-natural-bg border border-zinc-200 rounded-[32px] max-w-3xl w-full p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowLibraryModal(false)}
                className="absolute top-5 right-5 text-natural-muted hover:text-natural-dark text-lg font-serif font-bold pr-1 cursor-pointer z-50"
                title="Close"
              >
                ✕
              </button>
              <CareLibrary />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
