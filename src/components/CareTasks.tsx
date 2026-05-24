import { useState } from 'react';
import { useBonsai } from '../context/BonsaiContext';
import { Calendar, CheckSquare, Square, Trash2, Plus, Clock, Droplets, Scissors, Sparkles, Sprout } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function CareTasks() {
  const { trees, tasks, addTask, toggleTask, deleteTask } = useBonsai();
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Schedule Form State
  const [selectedTreeId, setSelectedTreeId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState('Watering');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);

  // Aggregate all tasks across trees
  const allTasksList = Object.keys(tasks).flatMap(treeId => {
    const tree = trees.find(t => t.id === treeId);
    return (tasks[treeId] || []).map(task => ({
      ...task,
      treeName: tree?.name || 'Unknown Tree',
      treeSpecies: tree?.species || 'Unknown Species'
    }));
  });

  const pendingTasks = allTasksList.filter(t => !t.completed).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const completedTasks = allTasksList.filter(t => t.completed).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTreeId || !taskTitle || !dueDate) return;

    await addTask(selectedTreeId, taskTitle, taskType, dueDate);
    
    // Reset Form
    setTaskTitle('');
    setSelectedTreeId('');
    setShowAddForm(false);
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'Watering': 
        return <Droplets className="w-4 h-4 text-[#D4A373]" />;
      case 'Pruning': 
      case 'Styling':
        return <Scissors className="w-4 h-4 text-natural-forest" />;
      case 'Fertilizing': 
        return <Sparkles className="w-4 h-4 text-natural-clay" />;
      case 'Repotting': 
        return <Sprout className="w-4 h-4 text-natural-sage" />;
      default: 
        return <Calendar className="w-4 h-4 text-natural-muted" />;
    }
  };

  const isOverdue = (dateStr: string) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dateStr);
    return due < today;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-serif font-bold text-natural-dark flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-natural-sage" />
            Reminders & Care Chores
          </h2>
          <p className="text-xs text-natural-muted">
            Keep schedules synchronized. A well-watered tree is safe; a wired tree forms beautifully.
          </p>
        </div>
        
        {trees.length > 0 && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-natural-clay hover:bg-natural-clay/90 text-white font-serif font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Schedule Care
          </button>
        )}
      </div>

      {/* Add Task Chore Form Inline */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleAddTask} className="p-5 bg-[#FDFBF7] rounded-[32px] border border-natural-cream space-y-4 my-2">
              <h3 className="text-xs font-serif font-bold text-natural-forest uppercase tracking-wider">Schedule Bonsai Chore</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-natural-muted">Target Tree</label>
                  <select
                    value={selectedTreeId}
                    onChange={(e) => setSelectedTreeId(e.target.value)}
                    required
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                  >
                    <option value="">-- Choose tree --</option>
                    {trees.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.species})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-natural-muted">Chore Type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                  >
                    <option value="Watering">Watering & Spray Mist</option>
                    <option value="Pruning">Structural Pruning</option>
                    <option value="Fertilizing">Apply Fertilizer Feed</option>
                    <option value="Wiring">Trunk/Branch Wiring</option>
                    <option value="Repotting">Repotting & Root Trim</option>
                    <option value="Styling">General Styling Work</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-natural-muted">Duty Instructions</label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    required
                    placeholder="e.g. Water juniper, trim strong candles"
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-natural-muted">Target Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-natural-muted hover:text-natural-forest text-xs font-serif font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-natural-clay hover:bg-natural-clay/90 text-white font-serif font-bold text-xs rounded-xl cursor-pointer"
                >
                  Create Chore
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation tabs */}
      <div className="flex border-b border-natural-cream">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 text-xs font-serif font-bold relative transition-colors cursor-pointer ${
            activeTab === 'pending'
              ? 'text-natural-forest font-bold'
              : 'text-natural-muted hover:text-natural-forest'
          }`}
        >
          Active Schedules ({pendingTasks.length})
          {activeTab === 'pending' && (
            <motion.div 
              layoutId="taskTabUnderline" 
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-natural-sage" 
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2 text-xs font-serif font-bold relative transition-colors cursor-pointer ${
            activeTab === 'completed'
              ? 'text-natural-forest font-bold'
              : 'text-natural-muted hover:text-natural-forest'
          }`}
        >
          Completed Logs ({completedTasks.length})
          {activeTab === 'completed' && (
            <motion.div 
              layoutId="taskTabUnderline" 
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-natural-sage" 
            />
          )}
        </button>
      </div>

      {/* Chores listings */}
      <div className="space-y-3">
        {activeTab === 'pending' ? (
          pendingTasks.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-[32px] border border-dashed border-natural-cream p-6">
              <Sprout className="w-8 h-8 text-natural-sage mx-auto mb-2" />
              <p className="text-xs text-natural-muted font-bold">All clear! No pending chores left.</p>
              <p className="text-[11px] text-natural-muted leading-relaxed mt-1">Your Bonsai collection is fully hydrated and pruned.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-4 bg-white border border-natural-cream rounded-xl shadow-xs transition-all hover:border-natural-sage"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleTask(task.treeId, task.id, true)}
                      className="text-natural-muted hover:text-natural-sage transition-colors shrink-0 cursor-pointer"
                    >
                      <Square className="w-5 h-5" />
                    </button>
                    
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-serif font-bold text-natural-dark">
                          {task.title}
                        </span>
                        <span className="p-1 rounded-lg bg-natural-bg inline-flex items-center justify-center">
                          {getTaskIcon(task.type)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-natural-muted font-semibold">
                        <span className="text-natural-forest font-bold">{task.treeName}</span>
                        <span>&bull;</span>
                        <span className="italic">{task.treeSpecies}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right shrink-0">
                      <span className={`text-[10px] uppercase font-mono tracking-wider font-bold block ${
                        isOverdue(task.dueDate) 
                          ? 'text-natural-clay animate-pulse' 
                          : 'text-natural-muted'
                      }`}>
                        {isOverdue(task.dueDate) ? 'Overdue' : 'Due'}
                      </span>
                      <span className={`text-xs font-mono font-bold ${
                        isOverdue(task.dueDate) ? 'text-natural-clay font-black' : 'text-natural-forest'
                      }`}>
                        {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <button
                      onClick={() => deleteTask(task.treeId, task.id)}
                      className="text-natural-muted hover:text-natural-clay p-1 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          completedTasks.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-[32px] border border-dashed border-natural-cream p-6">
              <Clock className="w-8 h-8 text-natural-sage mx-auto mb-2" />
              <p className="text-xs text-natural-muted font-bold">No history recorded yet.</p>
              <p className="text-[11px] text-natural-muted mt-1">Check off chores in the schedule tab to log history.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-4 bg-natural-bg/40 border border-natural-cream rounded-2xl"
                >
                  <div className="flex items-center gap-3 opacity-75">
                    <button
                      onClick={() => toggleTask(task.treeId, task.id, false)}
                      className="text-natural-sage hover:text-natural-muted transition-colors shrink-0 cursor-pointer"
                    >
                      <CheckSquare className="w-5 h-5 bg-white rounded" />
                    </button>
                    
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-natural-muted line-through">
                          {task.title}
                        </span>
                        <span className="p-1 rounded bg-natural-bg">
                          {getTaskIcon(task.type)}
                        </span>
                      </div>
                      <div className="text-[10px] text-natural-muted font-medium">
                        {task.treeName} &bull; {task.treeSpecies}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right shrink-0">
                      <span className="text-[9px] uppercase font-mono tracking-wider text-natural-muted block">Done At</span>
                      <span className="text-xs text-natural-muted font-mono font-bold">
                        {task.completedAt 
                          ? new Date(task.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                          : new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                        }
                      </span>
                    </div>

                    <button
                      onClick={() => deleteTask(task.treeId, task.id)}
                      className="text-natural-muted hover:text-natural-clay p-1 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
