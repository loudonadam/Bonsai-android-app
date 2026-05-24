import React, { useState } from 'react';
import { useBonsai } from '../context/BonsaiContext';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Droplets, 
  Scissors, 
  Sparkles, 
  Sprout, 
  Activity, 
  Bot, 
  LineChart, 
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle,
  HelpCircle,
  Loader2,
  Scale,
  Square,
  CheckSquare
} from 'lucide-react';
import { Tree, BonsaiStatus, CareType, Measurement, CareLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import MetricChart from './MetricChart';
import Markdown from 'react-markdown';

interface TreeDetailProps {
  tree: Tree;
  onBack: () => void;
}

export default function TreeDetail({ tree, onBack }: TreeDetailProps) {
  const { 
    updateTree, 
    deleteTree,
    measurements,
    addMeasurement, 
    deleteMeasurement,
    careLogs,
    addCareLog, 
    deleteCareLog,
    tasks,
    addTask,
    toggleTask,
    deleteTask
  } = useBonsai();

  // Dialog & Modal Triggers
  const [showEditForm, setShowEditForm] = useState(false);
  const [showMForm, setShowMForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showChoreForm, setShowChoreForm] = useState(false);

  // Edit Tree Fields State
  const [editName, setEditName] = useState(tree.name);
  const [editSpecies, setEditSpecies] = useState(tree.species);
  const [editStyle, setEditStyle] = useState(tree.style || '');
  const [editAge, setEditAge] = useState(tree.approximateAge?.toString() || '');
  const [editAcquired, setEditAcquired] = useState(tree.dateAcquired || '');
  const [editNotes, setEditNotes] = useState(tree.notes || '');

  // Log Width Fields State
  const [logWidth, setLogWidth] = useState('');
  const [logMDate, setLogMDate] = useState(new Date().toISOString().split('T')[0]);
  const [logMNotes, setLogMNotes] = useState('');

  // Log Care Fields State
  const [careType, setCareType] = useState<CareType>('Watering');
  const [careDate, setCareDate] = useState(new Date().toISOString().split('T')[0]);
  const [careNotes, setCareNotes] = useState('');

  // Log Chore Fields State
  const [choreTitle, setChoreTitle] = useState('');
  const [choreType, setChoreType] = useState('Watering');
  const [choreDueDate, setChoreDueDate] = useState(new Date().toISOString().split('T')[0]);

  // Gemini Consultation AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Retrieve tree records safely or fall back to empty array
  const treeMeasurements = measurements[tree.id] || [];
  const treeLogs = careLogs[tree.id] || [];
  const treeTasks = tasks[tree.id] || [];

  const handleUpdateTree = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateTree(tree.id, {
      name: editName,
      species: editSpecies,
      style: editStyle,
      approximateAge: editAge ? parseInt(editAge) : undefined,
      dateAcquired: editAcquired || undefined,
      notes: editNotes,
    });
    setShowEditForm(false);
  };

  const handleStatusChange = async (newStatus: BonsaiStatus) => {
    await updateTree(tree.id, { status: newStatus });
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete ${tree.name}? This will remove all associated logs and tree tracking history.`)) {
      await deleteTree(tree.id);
      onBack();
    }
  };

  const handleAddMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(logWidth);
    if (!w || !logMDate) return;

    await addMeasurement(tree.id, w, logMDate, logMNotes);
    
    // Reset Log State
    setLogWidth('');
    setLogMNotes('');
    setShowMForm(false);
  };

  const handleAddCareLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!careDate) return;

    await addCareLog(tree.id, careType, careDate, careNotes);

    // Reset Form
    setCareNotes('');
    setShowLogForm(false);
  };

  const handleAddChore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choreTitle || !choreDueDate) return;
    await addTask(tree.id, choreTitle, choreType, choreDueDate);
    setChoreTitle('');
    setShowChoreForm(false);
  };

  // Consult the Master (Gemini Route Proxy)
  const consultBonsaiMaster = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiDiagnosis(null);

    try {
      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          species: tree.species,
          style: tree.style,
          status: tree.status,
          notes: tree.notes,
          age: tree.approximateAge,
          dateAcquired: tree.dateAcquired,
          imageBase64: tree.photoBase64,
        }),
      });

      if (!response.ok) {
        throw new Error('Trouble talking to the Bonsai Master.');
      }

      const data = await response.json();
      setAiDiagnosis(data.analysis);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Consultation failed. Check dev logs.');
    } finally {
      setAiLoading(false);
    }
  };

  // Icon mapping helpers
  const getCareIcon = (type: CareType) => {
    switch (type) {
      case 'Watering': 
        return <Droplets className="w-4 h-4 text-sky-505 shrink-0" />;
      case 'Pruning': 
      case 'Styling':
        return <Scissors className="w-4 h-4 text-natural-forest shrink-0" />;
      case 'Fertilizing': 
        return <Sparkles className="w-4 h-4 text-natural-clay shrink-0" />;
      case 'Repotting': 
        return <Sprout className="w-4 h-4 text-natural-sage shrink-0" />;
      default: 
        return <Calendar className="w-4 h-4 text-natural-muted shrink-0" />;
    }
  };

  const getStatusBadgeStyles = (status: BonsaiStatus) => {
    switch (status) {
      case 'Healthy': return 'bg-natural-sage/20 text-natural-forest border border-natural-sage/35';
      case 'Stressed': return 'bg-natural-clay/20 text-natural-clay border border-natural-clay/35';
      case 'Dormant': return 'bg-natural-bg text-natural-muted border border-natural-cream';
      case 'In Training': return 'bg-blue-50 text-blue-700 border border-blue-150';
      case 'Diseased': return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'Recovering': return 'bg-emerald-50 text-natural-forest border border-natural-sage/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Back to feed header */}
      <div className="flex justify-between items-center pb-2 border-b border-natural-cream">
        <button 
          onClick={onBack}
          className="text-xs font-serif font-bold text-natural-forest hover:text-natural-clay hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          &larr; Back to Bonsai Garden
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => setShowEditForm(true)}
            className="p-1.5 hover:bg-natural-bg hover:text-natural-forest text-natural-muted transition-colors rounded-lg flex items-center justify-center border border-transparent hover:border-natural-cream cursor-pointer"
            title="Edit Tree Info"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 hover:bg-rose-50 hover:text-rose-700 text-natural-muted transition-colors rounded-lg flex items-center justify-center border border-transparent hover:border-rose-200 cursor-pointer"
            title="Delete Tree"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Primary Tree Header Block */}
      <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center p-6 bg-white border border-natural-cream rounded-[32px] shadow-sm">
        {tree.photoBase64 ? (
          <img 
            src={tree.photoBase64} 
            alt={tree.name}
            className="w-20 h-20 rounded-2xl object-cover border border-natural-cream shrink-0" 
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-natural-bg flex items-center justify-center text-natural-sage border border-natural-cream shrink-0 select-none">
            <Sprout className="w-10 h-10 text-natural-sage" />
          </div>
        )}

        <div className="space-y-1 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-serif font-bold text-natural-dark">{tree.name}</h1>
            <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold tracking-wide uppercase ${getStatusBadgeStyles(tree.status)}`}>
              {tree.status}
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-natural-muted font-semibold">
            <span className="text-natural-forest font-bold font-serif">{tree.species}</span>
            <span>&bull;</span>
            <span className="italic">{tree.style || 'No styling declared'}</span>
            {tree.approximateAge && (
              <>
                <span>&bull;</span>
                <span>~{tree.approximateAge} yrs</span>
              </>
            )}
            {tree.dateAcquired && (
              <>
                <span>&bull;</span>
                <span>Acquired: {new Date(tree.dateAcquired).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit Tree Information Modal Dialogue */}
      {showEditForm && (
        <div className="fixed inset-0 bg-transparent/45 backdrop-blur-xs flex items-center justify-center p-4 z-40">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-850 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Update Tree Registration</span>
            <form onSubmit={handleUpdateTree} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-550 block">Tree Name / Nickname</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-850 dark:text-zinc-150"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-550 block">Species (e.g. Chinese Elm, Japanese Maple)</label>
                <input
                  type="text"
                  value={editSpecies}
                  onChange={(e) => setEditSpecies(e.target.value)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-850 dark:text-zinc-150"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-550 block">Bonsai Styling Style</label>
                <select
                  value={editStyle}
                  onChange={(e) => setEditStyle(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-850 dark:text-zinc-150"
                >
                  <option value="">-- Choose Style --</option>
                  <option value="Chokkan (Formal Upright)">Chokkan (Formal Upright)</option>
                  <option value="Moyogi (Informal Upright)">Moyogi (Informal Upright)</option>
                  <option value="Shakan (Slanting)">Shakan (Slanting)</option>
                  <option value="Kengai (Cascade)">Kengai (Cascade)</option>
                  <option value="Han-Kengai (Semi-Cascade)">Han-Kengai (Semi-Cascade)</option>
                  <option value="Fukinagashi (Windswept)">Fukinagashi (Windswept)</option>
                  <option value="Sokan (Double Trunk)">Sokan (Double Trunk)</option>
                  <option value="Bunjingi (Literati)">Bunjingi (Literati)</option>
                  <option value="Seki-joju (Root-over-Rock)">Seki-joju (Root-over-Rock)</option>
                  <option value="Ishisuki (Clinging-to-Rock)">Ishisuki (Clinging-to-Rock)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-550 block">Age (approx years)</label>
                  <input
                    type="number"
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-850 dark:text-zinc-150"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-550 block">Date Acquired</label>
                  <input
                    type="date"
                    value={editAcquired}
                    onChange={(e) => setEditAcquired(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-850 dark:text-zinc-150 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-550 block">Care History / Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-850 dark:text-zinc-150 leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowEditForm(false)}
                  className="px-3 py-1.5 text-zinc-500 hover:text-zinc-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl"
                >
                  Save Updates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Status Changer Quick Deck */}
      <div className="p-5 bg-[#FDFBF7] border border-natural-cream rounded-[32px] shadow-xs">
        <h3 className="text-xs font-serif font-bold text-natural-forest uppercase tracking-wider mb-2.5">Quick Tree Status Update</h3>
        <div className="flex flex-wrap gap-2">
          {(['Healthy', 'Stressed', 'Dormant', 'In Training', 'Diseased', 'Recovering'] as BonsaiStatus[]).map((st) => (
            <button
              key={st}
              onClick={() => handleStatusChange(st)}
              className={`px-3.5 py-2 rounded-xl text-xs font-serif font-bold cursor-pointer transition-all ${
                tree.status === st 
                  ? 'bg-natural-clay text-white shadow-sm ring-2 ring-natural-sage/20' 
                  : 'bg-white hover:bg-natural-cream/40 border border-[#E9E5DD] text-natural-muted'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Tree specific Active Chores Checklist section */}
      <div className="p-5 bg-white border border-natural-cream rounded-[32px] space-y-4 shadow-xs">
        <div className="flex justify-between items-center pb-2 border-b border-natural-cream/40">
          <div>
            <h3 className="text-xs font-serif font-bold text-natural-forest uppercase tracking-wider flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-natural-sage" />
              Active Reminders & Tasks
            </h3>
          </div>
          <button
            onClick={() => setShowChoreForm(!showChoreForm)}
            className="text-[10px] font-serif font-bold text-natural-forest hover:text-natural-clay transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" /> Add Task
          </button>
        </div>

        {/* Add Chore Inline Form Slider */}
        <AnimatePresence>
          {showChoreForm && (
            <motion.form 
              onSubmit={handleAddChore}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-4 bg-natural-bg/60 rounded-2xl border border-natural-cream/60 space-y-3 overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-natural-muted uppercase">Chore Action</label>
                  <select
                    value={choreType}
                    onChange={(e) => setChoreType(e.target.value)}
                    className="w-full bg-white border border-natural-cream rounded-xl px-2 py-1.5 text-xs text-natural-dark"
                  >
                    <option value="Watering">Watering & Spray Mist</option>
                    <option value="Pruning">Structural Pruning</option>
                    <option value="Fertilizing">Apply Fertilizer Feed</option>
                    <option value="Wiring">Trunk/Branch Wiring</option>
                    <option value="Repotting">Repotting & Root Trim</option>
                    <option value="Styling">General Styling Work</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-natural-muted uppercase">Duty Due Date</label>
                  <input
                    type="date"
                    value={choreDueDate}
                    onChange={(e) => setChoreDueDate(e.target.value)}
                    required
                    className="w-full bg-white border border-natural-cream rounded-xl px-2 py-1.5 text-xs font-mono text-natural-dark"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-natural-muted uppercase">Task Notes / Description</label>
                <input
                  type="text"
                  value={choreTitle}
                  onChange={(e) => setChoreTitle(e.target.value)}
                  required
                  placeholder="e.g. prune upper branches, water with compost mist"
                  className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowChoreForm(false)}
                  className="px-3 py-1 text-natural-muted hover:text-natural-forest text-[11px] font-serif font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 bg-natural-clay hover:bg-natural-clay/90 text-white rounded-xl text-[11px] font-serif font-bold cursor-pointer"
                >
                  Create Task
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Chores Listing */}
        {treeTasks.length === 0 ? (
          <div className="text-center py-4 border border-dashed border-natural-cream/60 rounded-2xl bg-[#FCFAF5]/50">
            <span className="text-[11px] text-natural-muted italic">No reminders scheduled for this tree</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {treeTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-2.5 bg-natural-bg/20 hover:bg-natural-bg/40 border border-natural-cream/40 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2 max-w-[70%]">
                  <button
                    onClick={() => toggleTask(tree.id, task.id, !task.completed)}
                    className="text-natural-muted hover:text-natural-sage transition-colors shrink-0 cursor-pointer"
                  >
                    {task.completed ? (
                      <CheckCircle className="w-4 h-4 text-natural-sage" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-natural-cream shrink-0 hover:border-natural-sage" />
                    )}
                  </button>
                  <span className={`text-xs leading-tight truncate ${task.completed ? 'line-through text-natural-muted' : 'text-natural-dark font-serif font-bold'}`}>
                    {task.title}
                  </span>
                  <span className="p-0.5 rounded bg-white shrink-0">
                    {getCareIcon(task.type as CareType)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right whitespace-nowrap">
                    <span className={`text-[9px] font-mono font-bold ${task.completed ? 'text-natural-muted line-through' : 'text-natural-forest'}`}>
                      {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteTask(tree.id, task.id)}
                    className="text-natural-muted hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trunk thickness growth chart log & analysis */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-serif font-bold text-natural-dark flex items-center gap-2">
            <LineChart className="w-4 h-4 text-natural-sage" />
            Trunk Growth Log (Thickness)
          </h3>
          <button
            onClick={() => setShowMForm(!showMForm)}
            className="text-xs font-serif font-bold text-natural-forest border border-natural-cream hover:bg-natural-bg px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Log Measurement
          </button>
        </div>

        {/* Add Measurement Inline Slider */}
        <AnimatePresence>
          {showMForm && (
            <motion.form 
              onSubmit={handleAddMeasurement}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-5 bg-[#FDFBF7] rounded-[32px] border border-natural-cream space-y-3.5 overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-muted uppercase">Trunk Width (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={logWidth}
                    onChange={(e) => setLogWidth(e.target.value)}
                    required
                    placeholder="e.g. 15.4"
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-muted uppercase">Date of Thickness</label>
                  <input
                    type="date"
                    value={logMDate}
                    onChange={(e) => setLogMDate(e.target.value)}
                    required
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs font-mono text-natural-dark"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-natural-muted uppercase">Measurement Landmark/Notes (Optional)</label>
                <input
                  type="text"
                  value={logMNotes}
                  onChange={(e) => setLogMNotes(e.target.value)}
                  placeholder="e.g. measured 2cm above soil line"
                  className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowMForm(false)}
                  className="px-3 py-1.5 text-natural-muted hover:text-natural-forest text-xs font-serif font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-natural-clay hover:bg-natural-clay/90 text-white rounded-xl text-xs font-serif font-bold cursor-pointer"
                >
                  Log Curve Point
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <MetricChart measurements={treeMeasurements} />
      </div>

      {/* Care Activities Logs */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-serif font-bold text-natural-dark flex items-center gap-2">
            <Activity className="w-4 h-4 text-natural-sage" />
            History of Work Performed
          </h3>
          <button
            onClick={() => setShowLogForm(!showLogForm)}
            className="text-xs font-serif font-bold text-natural-forest border border-natural-cream hover:bg-natural-bg px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Record Care Done
          </button>
        </div>

        {/* Record Care log form slider */}
        <AnimatePresence>
          {showLogForm && (
            <motion.form 
              onSubmit={handleAddCareLog}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-5 bg-[#FDFBF7] rounded-[32px] border border-natural-cream space-y-3.5 overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-muted uppercase">Care Action</label>
                  <select
                    value={careType}
                    onChange={(e) => setCareType(e.target.value as CareType)}
                    className="w-full bg-white border border-natural-cream rounded-xl px-2 py-1.5 text-xs text-natural-dark"
                  >
                    <option value="Watering">Watering / Spritz Misting</option>
                    <option value="Pruning">Structural / Leaf Pruning</option>
                    <option value="Fertilizing">Organic Fertilizer Feed</option>
                    <option value="Wiring">Trunk & Branch Wiring</option>
                    <option value="Repotting">Repotting & Root Trim</option>
                    <option value="Pest Control">Pest Control Treatment</option>
                    <option value="Styling">Styling or Canopy Defoliating</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-muted uppercase">Date Performed</label>
                  <input
                    type="date"
                    value={careDate}
                    onChange={(e) => setCareDate(e.target.value)}
                    required
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs font-mono text-natural-dark"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-natural-muted uppercase">Observations & Notes</label>
                <input
                  type="text"
                  value={careNotes}
                  onChange={(e) => setCareNotes(e.target.value)}
                  placeholder="e.g. wired main left structural branch, added akadama mix"
                  className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowLogForm(false)}
                  className="px-3 py-1.5 text-natural-muted hover:text-natural-forest text-xs font-serif font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-natural-clay hover:bg-natural-clay/90 text-white rounded-xl text-xs font-serif font-bold cursor-pointer"
                >
                  Save Log Entry
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Actions Logs Timeline Table lists */}
        {treeLogs.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-natural-cream rounded-[32px] bg-white">
            <span className="text-xs text-natural-muted font-bold block">No historic actions logged yet</span>
            <span className="text-[11px] text-natural-muted leading-relaxed mt-1 block">Helpful events like structural pruning and wire dates appear here.</span>
          </div>
        ) : (
          <div className="overflow-hidden border border-natural-cream bg-white rounded-2xl shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-natural-bg text-natural-muted font-serif font-bold uppercase tracking-wider text-[10px]">
                <tr>
                   <th className="px-4 py-3">Activity</th>
                   <th className="px-4 py-3">Date</th>
                   <th className="px-4 py-3">Observations</th>
                   <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-natural-cream">
                {[...treeLogs]
                  .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((log) => (
                    <tr key={log.id} className="hover:bg-natural-bg/10">
                      <td className="px-4 py-3.5 flex items-center gap-2">
                        <span className="p-1.5 rounded bg-natural-bg shrink-0">
                          {getCareIcon(log.type)}
                        </span>
                        <span className="font-serif font-bold text-natural-dark">{log.type}</span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-natural-dark whitespace-nowrap">
                        {new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3.5 text-natural-muted max-w-[200px] truncate" title={log.notes}>
                        {log.notes || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => deleteCareLog(tree.id, log.id)}
                          className="text-natural-muted hover:text-natural-clay transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PREMIUM GEMINI BONSAI AI DOCTOR OR STYLING ADVICE CONSULT */}
      <div className="p-6 border border-natural-sage/20 bg-natural-sage/10 rounded-[32px] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-natural-sage/20 inline-flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5 text-natural-forest" />
            </span>
            <div>
              <h3 className="text-sm font-serif font-bold text-natural-dark">AI Bonsai Consultation Doc</h3>
              <p className="text-[11px] text-natural-muted">Ask the Bonsai Master to review health, soil routines, and wiring stylings.</p>
            </div>
          </div>
          
          <button
            onClick={consultBonsaiMaster}
            disabled={aiLoading}
            className="px-4 py-2 bg-natural-clay hover:bg-natural-clay/90 disabled:bg-natural-clay/50 text-white font-serif font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          >
            {aiLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Consulting...
              </>
            ) : (
              'Consult Master'
            )}
          </button>
        </div>

        {/* Master AI Advice Section Display */}
        <AnimatePresence>
          {aiLoading && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-5 bg-white rounded-2xl border border-dashed border-natural-sage/30 flex flex-col items-center justify-center text-center space-y-2"
            >
              <Loader2 className="w-6 h-6 animate-spin text-natural-forest" />
              <p className="text-xs font-bold text-natural-dark">The Bonsai Master is reviewing your logs & tree specs...</p>
              <p className="text-[10px] text-natural-muted leading-relaxed">Comparing species guidelines and health profiles to deliver guidance.</p>
            </motion.div>
          )}

          {aiError && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 border border-rose-250 bg-rose-50/10 rounded-2xl flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-xs font-serif font-bold text-rose-800 block">Consultation Halted</span>
                <p className="text-[11px] text-rose-700 leading-relaxed">{aiError}</p>
              </div>
            </motion.div>
          )}

          {aiDiagnosis && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-white border border-natural-cream rounded-[24px] shadow-inner space-y-2 leading-relaxed"
            >
              <span className="text-[10px] uppercase font-mono bg-natural-bg text-natural-forest px-2.5 py-1 rounded font-bold">
                Master Zen assessment
              </span>
              
              <div className="prose prose-sm max-w-none text-xs text-natural-dark pt-2 font-serif leading-relaxed">
                <Markdown>{aiDiagnosis}</Markdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
