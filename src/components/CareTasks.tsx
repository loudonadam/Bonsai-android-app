import { useState, useEffect } from 'react';
import { useBonsai } from '../context/BonsaiContext';
import { Calendar, CheckSquare, Square, Trash2, Plus, Clock, Droplets, Scissors, Sparkles, Sprout, Bell, BellRing, Smartphone, ShieldAlert, CheckCircle, HelpCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatLocalDate, isDateOverdue, getTodayLocalDateStr } from '../utils';
import { 
  isNotificationSupported, 
  requestNotificationPermission, 
  getNotificationPermissionStatus, 
  sendNotification, 
  isRunningInIframe 
} from '../utils/notifications';

export default function CareTasks() {
  const { trees, tasks, addTask, toggleTask, deleteTask } = useBonsai();
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Custom Inline Confirmation States for Task Deletion
  const [confirmingTask, setConfirmingTask] = useState<{
    treeId: string;
    taskId: string;
    type: 'complete' | 'uncomplete' | 'delete';
  } | null>(null);

  const handleToggleDirect = async (treeId: string, taskId: string, currentCompleted: boolean) => {
    try {
      await toggleTask(treeId, taskId, !currentCompleted);
    } catch (err) {
      console.error("Error toggling task completion:", err);
    }
  };

  const triggerConfirmAction = (treeId: string, taskId: string, type: 'complete' | 'uncomplete' | 'delete') => {
    setConfirmingTask({ treeId, taskId, type });
  };

  const handleConfirmAction = async () => {
    if (!confirmingTask) return;
    const { treeId, taskId, type } = confirmingTask;
    try {
      if (type === 'complete') {
        await toggleTask(treeId, taskId, true);
      } else if (type === 'uncomplete') {
        await toggleTask(treeId, taskId, false);
      } else if (type === 'delete') {
        await deleteTask(treeId, taskId);
      }
    } catch (err) {
      console.error("Error executing task action:", err);
    } finally {
      setConfirmingTask(null);
    }
  };

  // Notification States
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('unsupported');
  const [testFeedback, setTestFeedback] = useState('');
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showPhoneInfo, setShowPhoneInfo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setNotifPermission(getNotificationPermissionStatus());
  }, []);

  const handleEnableNotifications = async () => {
    const res = await requestNotificationPermission();
    setNotifPermission(res);
    if (res === 'granted') {
      await sendNotification("Notifications Activated! 🌿", {
        body: "Your device is now linked with Bonsai Care. We'll send real-time reminders for your trees."
      });
      if (isRunningInIframe()) {
        setTestFeedback('Permissions granted! Note: To see native OS banners, open the app in a New Tab.');
      } else {
        setTestFeedback('Successfully enabled phone/device notifications!');
      }
    } else if (res === 'denied') {
      setTestFeedback('Permission blocked. Check your phone/browser settings to turn on notifications.');
    }
    setTimeout(() => setTestFeedback(''), 6000);
  };

  const handleSendTestNotification = async () => {
    if (notifPermission !== 'granted') {
      setTestFeedback('Please grant permission first by clicking "Enable Alerts".');
      return;
    }
    const success = await sendNotification("Bonsai Care Test Alert 🎋", {
      body: "Reminders active! Your device is successfully synchronized.",
      requireInteraction: true
    });
    if (success) {
      if (isRunningInIframe()) {
        setTestFeedback('Test alert dispatched! (Inside this preview iframe, browser blocks native popups. Open in a New Tab to see OS notification banners)');
      } else {
        setTestFeedback('Test notification dispatched! Check your device banner / notification center.');
      }
    } else {
      setTestFeedback('Native dispatch failure. Make sure notifications are allowed for this site in your browser.');
    }
    setTimeout(() => setTestFeedback(''), 7000);
  };

  // Schedule Form State
  const [selectedTreeId, setSelectedTreeId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState('Wire');
  const [dueDate, setDueDate] = useState(getTodayLocalDateStr());

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
    if (!selectedTreeId || !taskTitle || !dueDate || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addTask(selectedTreeId, taskTitle, taskType, dueDate);
      
      // Full reset of form inputs & collapse form container
      setTaskTitle('');
      setSelectedTreeId('');
      setTaskType('Wire');
      setDueDate(getTodayLocalDateStr());
      setShowAddForm(false);
    } catch (err) {
      console.error("Failed to add scheduled reminder task:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'Wire':
      case 'Check Wire':
        return <Clock className="w-4 h-4 text-amber-600" />;
      case 'Repot':
        return <Sprout className="w-4 h-4 text-natural-sage" />;
      case 'Fertilize':
        return <Sparkles className="w-4 h-4 text-natural-clay" />;
      case 'Styling':
      case 'Pruning':
        return <Scissors className="w-4 h-4 text-natural-forest" />;
      default: 
        return <Calendar className="w-4 h-4 text-natural-muted" />;
    }
  };

  const isOverdue = (dateStr: string) => isDateOverdue(dateStr);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-serif font-bold text-natural-dark flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-natural-sage" />
            Reminders & Tasks
          </h2>
          <button
            onClick={() => setShowPhoneInfo(!showPhoneInfo)}
            className={`p-1.5 rounded-full transition-all cursor-pointer border ${
              showPhoneInfo 
                ? 'bg-natural-sage/15 text-natural-forest border-natural-sage/30' 
                : 'bg-white text-natural-muted hover:text-natural-forest border-natural-cream shadow-xs'
            }`}
            title="Setup Device Reminders"
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>
        
        {trees.length > 0 && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-1.5 bg-natural-clay hover:bg-natural-clay/90 text-white font-serif font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" /> Schedule Task
          </button>
        )}
      </div>

      {/* Smart Mobile & Phone Notification Center */}
      <AnimatePresence>
        {showPhoneInfo && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: -10 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -10 }}
            className="overflow-hidden"
          >
            <div className="bg-[#FAF8F5] border border-natural-cream rounded-[24px] p-4 space-y-3 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="p-1.5 shrink-0 bg-natural-sage/10 text-natural-forest rounded-xl inline-flex items-center justify-center">
                    <Smartphone className="w-4 h-4 text-natural-forest" />
                  </span>
                  <div>
                    <h4 className="text-xs font-serif font-bold text-natural-dark flex flex-wrap items-center gap-1.5">
                      Phone & Device Reminders
                      {notifPermission === 'granted' ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-mono font-bold inline-flex items-center gap-1">
                          <CheckCircle className="w-2.5 h-2.5" /> Activated
                        </span>
                      ) : notifPermission === 'denied' ? (
                        <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full font-mono font-bold inline-flex items-center gap-1">
                          <ShieldAlert className="w-2.5 h-2.5" /> Blocked
                        </span>
                      ) : notifPermission === 'unsupported' ? (
                        <span className="text-[10px] bg-zinc-50 text-zinc-600 border border-zinc-200 px-2 py-0.5 rounded-full font-mono font-bold">
                          Unsupported
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-mono font-bold animate-pulse">
                          Not Approved Yet
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-natural-muted leading-relaxed mt-0.5">
                      Setup real-time system reminder alerts on your phone or computer to notify you exactly when tree wiring, watering, repotting, or pruning duties are due.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0 self-end sm:self-center">
                  {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={handleEnableNotifications}
                      className="px-3.5 py-1.5 bg-natural-forest hover:bg-natural-forest/90 text-white font-mono text-[10px] font-black rounded-lg uppercase cursor-pointer"
                    >
                      Enable Alerts
                    </button>
                  )}
                  
                  {notifPermission === 'granted' && (
                    <button
                      type="button"
                      onClick={handleSendTestNotification}
                      className="px-3.5 py-1.5 bg-natural-sage/20 hover:bg-natural-sage/30 text-natural-forest border border-natural-sage/40 font-mono text-[10px] font-black rounded-lg uppercase cursor-pointer"
                    >
                      Send Test
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowNotifPanel(!showNotifPanel)}
                    className="px-2.5 py-1.5 bg-white hover:bg-natural-bg text-natural-muted hover:text-natural-forest border border-natural-cream text-xs rounded-lg flex items-center justify-center cursor-pointer"
                    title="Show Phone setup instructions"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {testFeedback && (
                <p className="text-[10.5px] font-mono font-bold text-natural-forest bg-emerald-50/80 border border-emerald-200/60 px-3 py-2 rounded-xl animate-fade-in flex items-center gap-1.5 shadow-2xs">
                  <BellRing className="w-3.5 h-3.5 text-natural-forest shrink-0 animate-bounce" />
                  <span>{testFeedback}</span>
                </p>
              )}

              {isRunningInIframe() && (
                <div className="text-[10px] bg-amber-50/90 border border-amber-200 text-amber-900 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold flex items-center gap-1.5 text-[10.5px] text-amber-950">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                      Preview Iframe Browser Constraint
                    </p>
                    <button
                      type="button"
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-mono text-[9.5px] font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      Open in New Tab ↗
                    </button>
                  </div>
                  <p className="leading-relaxed opacity-90 text-[9.5px]">
                    Chrome & Safari strictly suppress native desktop/phone OS popups from inside embedded iframe previews. 
                    In-app alerts work everywhere, but to test real OS system tray banners on desktop or mobile, click <strong>"Open in New Tab ↗"</strong> above!
                  </p>
                </div>
              )}

              {showNotifPanel && (
                <div className="text-[10px] leading-relaxed bg-white border border-natural-cream rounded-xl p-3 space-y-2 text-natural-dark animate-fade-in">
                  <p className="font-bold border-b border-natural-bg pb-1 text-natural-forest font-serif">How to receive notifications on your smartphone:</p>
                  <ul className="list-decimal list-inside space-y-1 font-semibold text-natural-muted">
                    <li>Open this app on your phone's browser (Safari for iOS, Chrome for Android).</li>
                    <li>Tap the browser's <strong>Share</strong> button (Safari) or <strong>Menu</strong> (Chrome).</li>
                    <li>Select <strong>"Add to Home Screen"</strong> which registers the app as a secure device widget.</li>
                    <li>Open the newly added Home Screen app and click the <strong>"Enable Alerts"</strong> toggle right here in the Reminders tab.</li>
                    <li>Your phone will receive elegant notification banners for chore reminders even while standard windows are completely closed!</li>
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Task Form Inline */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleAddTask} className="p-5 bg-[#FDFBF7] rounded-[32px] border border-natural-cream space-y-4 my-2">
              <h3 className="text-xs font-serif font-bold text-natural-forest uppercase tracking-wider">Schedule Bonsai Task</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-natural-muted">Target Tree</label>
                  <select
                    value={selectedTreeId}
                    onChange={(e) => setSelectedTreeId(e.target.value)}
                    required
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                  >
                    <option value="" disabled hidden>-- Choose tree --</option>
                    {trees.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.species})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-natural-muted">Task</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                  >
                    <option value="Wire">Wire</option>
                    <option value="Check Wire">Check Wire</option>
                    <option value="Repot">Repot</option>
                    <option value="Fertilize">Fertilize</option>
                    <option value="Styling">Styling</option>
                    <option value="Pruning">Pruning</option>
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
                    placeholder="e.g. Wire first branch, check for bark cutting"
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
                  disabled={isSubmitting}
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-natural-muted hover:text-natural-forest text-xs font-serif font-bold cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-natural-clay hover:bg-natural-clay/90 text-white font-serif font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Task'
                  )}
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
      <div className="space-y-2">
        {activeTab === 'pending' ? (
          pendingTasks.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-natural-cream p-5">
              <Sprout className="w-7 h-7 text-natural-sage mx-auto mb-1.5" />
              <p className="text-xs text-natural-muted font-bold">All clear! No pending chores left.</p>
              <p className="text-[11px] text-natural-muted leading-relaxed mt-0.5">Your Bonsai collection is fully hydrated and pruned.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {pendingTasks.map((task) => {
                const isConfirming = confirmingTask && confirmingTask.taskId === task.id;
                
                if (isConfirming) {
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between py-2 px-3 bg-amber-50/40 border border-amber-200/60 rounded-xl shadow-xs gap-2 animate-fade-in text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="p-1 bg-amber-100/60 rounded-lg inline-flex items-center justify-center text-amber-850 shrink-0">
                          <ShieldAlert className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-serif font-bold text-amber-900 truncate">
                            {confirmingTask.type === 'delete' ? 'Delete Task?' : 'Mark Done?'}
                          </p>
                          <p className="text-[9.5px] text-amber-700/80 font-semibold truncate">
                            "{task.title}"
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-mono">
                        <button
                          type="button"
                          onClick={() => setConfirmingTask(null)}
                          className="px-2 py-0.5 bg-white hover:bg-stone-50 text-stone-600 border border-stone-200 text-[9.5px] font-bold rounded cursor-pointer uppercase transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmAction}
                          className={`px-2 py-0.5 text-white text-[9.5px] font-bold rounded cursor-pointer uppercase transition-all shadow-xs ${
                            confirmingTask.type === 'delete' 
                              ? 'bg-rose-600 hover:bg-rose-700' 
                              : 'bg-natural-forest hover:bg-natural-forest/90'
                          }`}
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between py-2 px-3 sm:py-2.5 sm:px-3.5 bg-white border border-natural-cream rounded-xl shadow-xs transition-all hover:border-natural-sage gap-2.5 min-w-0"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        onClick={() => handleToggleDirect(task.treeId, task.id, false)}
                        className="text-natural-muted hover:text-natural-sage transition-colors shrink-0 cursor-pointer"
                        title="Mark task completed"
                      >
                        <Square className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-natural-muted/80" />
                      </button>
                      
                      <span className="p-1 rounded bg-natural-bg inline-flex items-center justify-center shrink-0">
                        {getTaskIcon(task.type)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] sm:text-xs font-serif font-bold text-natural-dark truncate">
                            {task.title}
                          </span>
                        </div>
                        <div className="text-[9.5px] sm:text-[10px] text-natural-muted font-semibold truncate leading-tight">
                          <span className="text-natural-forest font-bold">{task.treeName}</span>
                          <span className="mx-1">&bull;</span>
                          <span className="italic">{task.treeSpecies}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[9.5px] sm:text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        isOverdue(task.dueDate) 
                          ? 'bg-rose-50 text-rose-700 border border-rose-200/60 font-black' 
                          : 'bg-natural-sage/10 text-natural-forest border border-natural-sage/20'
                      }`}>
                        {isOverdue(task.dueDate) ? 'Overdue ' : ''}{formatLocalDate(task.dueDate, { month: 'short', day: 'numeric' })}
                      </span>

                      <button
                        onClick={() => triggerConfirmAction(task.treeId, task.id, 'delete')}
                        className="text-natural-muted hover:text-natural-clay p-1 rounded-lg transition-colors cursor-pointer"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          completedTasks.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-natural-cream p-5">
              <Clock className="w-7 h-7 text-natural-sage mx-auto mb-1.5" />
              <p className="text-xs text-natural-muted font-bold">No history recorded yet.</p>
              <p className="text-[11px] text-natural-muted mt-0.5">Check off chores in the schedule tab to log history.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {completedTasks.map((task) => {
                const isConfirming = confirmingTask && confirmingTask.taskId === task.id;
                
                if (isConfirming) {
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between py-2 px-3 bg-amber-50/40 border border-amber-200/60 rounded-xl shadow-xs gap-2 animate-fade-in text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="p-1 bg-amber-100/60 rounded-lg inline-flex items-center justify-center text-amber-850 shrink-0">
                          <ShieldAlert className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-serif font-bold text-amber-900 truncate">
                            {confirmingTask.type === 'delete' ? 'Delete Archive?' : 'Re-open?'}
                          </p>
                          <p className="text-[9.5px] text-amber-700/80 font-semibold truncate">
                            "{task.title}"
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-mono">
                        <button
                          type="button"
                          onClick={() => setConfirmingTask(null)}
                          className="px-2 py-0.5 bg-white hover:bg-stone-50 text-stone-600 border border-stone-200 text-[9.5px] font-bold rounded cursor-pointer uppercase transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmAction}
                          className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white text-[9.5px] font-bold rounded cursor-pointer uppercase transition-all shadow-xs"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between py-2 px-3 sm:py-2.5 sm:px-3.5 bg-natural-bg/30 border border-natural-cream rounded-xl gap-2.5 min-w-0"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 opacity-75">
                      <button
                        onClick={() => handleToggleDirect(task.treeId, task.id, true)}
                        className="text-natural-sage hover:text-natural-muted transition-colors shrink-0 cursor-pointer"
                        title="Re-open task"
                      >
                        <CheckSquare className="w-4 h-4 sm:w-4.5 sm:h-4.5 bg-white rounded" />
                      </button>
                      
                      <span className="p-1 rounded bg-natural-bg inline-flex items-center justify-center shrink-0">
                        {getTaskIcon(task.type)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] sm:text-xs text-natural-muted line-through truncate block">
                          {task.title}
                        </span>
                        <div className="text-[9.5px] sm:text-[10px] text-natural-muted font-medium truncate leading-tight">
                          <span>{task.treeName}</span>
                          <span className="mx-1">&bull;</span>
                          <span>{task.treeSpecies}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9.5px] sm:text-[10px] text-natural-muted font-mono bg-stone-100/80 px-1.5 py-0.5 rounded border border-stone-200/60">
                        Done {task.completedAt 
                          ? formatLocalDate(task.completedAt, { month: 'short', day: 'numeric' })
                          : formatLocalDate(new Date().toISOString(), { month: 'short', day: 'numeric' })
                        }
                      </span>

                      <button
                        onClick={() => triggerConfirmAction(task.treeId, task.id, 'delete')}
                        className="text-natural-muted hover:text-natural-clay p-1 rounded-lg transition-colors cursor-pointer"
                        title="Delete task archive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
