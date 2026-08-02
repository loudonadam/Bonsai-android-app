/**
 * Utility to manage Web Notification permissions and dispatch.
 */

// Helper to determine if we are running inside an iframe (e.g. AI Studio console)
export function isRunningInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

// Check standard browser/mobile notification support
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// Web Audio API Pleasant Dual-Tone Bell Chime
export function playNotificationChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc1.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.12); // G5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1046.50, ctx.currentTime); // C6

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // Audio context may be restricted before user gesture
  }
}

// Trigger in-app notification event for floating banner
export function triggerInAppToast(title: string, body?: string): void {
  if (typeof window !== 'undefined') {
    playNotificationChime();
    const event = new CustomEvent('bonsai-in-app-notification', {
      detail: {
        id: Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        title,
        body: body || '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    });
    window.dispatchEvent(event);
  }
}

// Register service worker if available
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      return reg;
    } catch (e) {
      console.warn("Service worker registration failed:", e);
      return null;
    }
  }
  return null;
}

// Request permission from user
export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (!isNotificationSupported()) {
    return 'default';
  }
  
  try {
    // Attempt SW registration simultaneously
    await registerNotificationServiceWorker();
    
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return 'default';
  }
}

// Retrieve current permission status
export function getNotificationPermissionStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

// Send local device notification
export async function sendNotification(title: string, options?: NotificationOptions): Promise<boolean> {
  // Always trigger audio chime + floating in-app notification toast banner
  triggerInAppToast(title, options?.body as string);

  if (!isNotificationSupported()) {
    return true;
  }
  
  if (Notification.permission === 'granted') {
    try {
      // For mobile compatibility (especially Android Chrome/PWA), attempt SW registration dispatch first
      if ('serviceWorker' in navigator) {
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          registration = await registerNotificationServiceWorker() || undefined;
        }

        if (registration && registration.showNotification) {
          await registration.showNotification(title, {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'bonsai-chore',
            ...options
          });
          return true;
        }
      }

      // Create native web notification direct desktop fallback
      new Notification(title, {
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'bonsai-chore',
        ...options
      });
      return true;
    } catch (e) {
      console.warn("Native OS notification silenced or blocked by iframe sandbox:", e);
      return true;
    }
  }
  return true;
}

// Check scheduled tasks and trigger alerts for unsent on-due reminders
export function checkAndNotifyDueTasks(
  trees: any[],
  tasks: Record<string, any[]>
): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const notifiedKeysStr = localStorage.getItem('bonsai_notified_tasks') || '[]';
  let notifiedKeys: string[] = [];
  try {
    notifiedKeys = JSON.parse(notifiedKeysStr);
  } catch (e) {
    notifiedKeys = [];
  }

  let updated = false;

  Object.entries(tasks).forEach(([treeId, treeTasks]) => {
    const tree = trees.find(t => t.id === treeId);
    if (!tree) return;

    treeTasks.forEach(task => {
      if (task.completed) return;

      // Identify if the task matches today's date or is overdue
      const taskDue = task.dueDate;
      const isDueOrOverdue = taskDue <= todayStr;

      if (isDueOrOverdue) {
        const uniqueKey = `${task.id}_${taskDue}`;
        if (!notifiedKeys.includes(uniqueKey)) {
          // Send Device notification
          sendNotification(`🌿 Bonsai Alert: ${tree.name || 'Bonsai'}`, {
            body: `Chore due: ${task.title} (${task.type}) for your ${tree.species || 'Bonsai'}`,
            requireInteraction: true
          });

          notifiedKeys.push(uniqueKey);
          updated = true;
        }
      }
    });
  });

  if (updated) {
    // Retain only last 50 key logs to keep storage clean
    if (notifiedKeys.length > 50) {
      notifiedKeys = notifiedKeys.slice(notifiedKeys.length - 50);
    }
    localStorage.setItem('bonsai_notified_tasks', JSON.stringify(notifiedKeys));
  }
}

