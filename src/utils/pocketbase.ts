import { Tree, Measurement, CareLog, Task, CareGuide } from '../types';
import { compressBase64Image } from '../utils';

// Helper to parse base64 data URLs robustly without regex catastrophic backtracking on large strings
function parseBase64DataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const clean = dataUrl.trim();
  if (!clean.startsWith('data:')) return null;
  const commaIndex = clean.indexOf(',');
  if (commaIndex === -1) return null;
  
  const meta = clean.substring(0, commaIndex); // e.g. "data:image/jpeg;base64"
  const base64Data = clean.substring(commaIndex + 1).replace(/\s/g, ''); // strip newlines/spaces
  
  const semicolonIndex = meta.indexOf(';');
  let mimeType = 'image/jpeg';
  if (semicolonIndex !== -1) {
    mimeType = meta.substring(5, semicolonIndex);
  } else {
    const colonIndex = meta.indexOf(':');
    if (colonIndex !== -1) {
      mimeType = meta.substring(colonIndex + 1);
    }
  }
  return {
    mimeType: mimeType || 'image/jpeg',
    base64Data,
  };
}

export interface PocketbaseConfig {
  url: string;
  identity: string;
  password?: string;
  token?: string;
  userId?: string;
  enabled: boolean;
  useNativeFiles?: boolean;
}

export interface PocketbaseLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: string;
}

export class PocketbaseService {
  private static logs: PocketbaseLog[] = PocketbaseService.loadLogs();
  private static logListeners: ((logs: PocketbaseLog[]) => void)[] = [];

  private static loadLogs(): PocketbaseLog[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('pb_logs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private static saveLogs() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('pb_logs', JSON.stringify(this.logs));
    } catch {}
  }

  public static addLog(level: 'info' | 'warn' | 'error' | 'success', message: string, details?: string) {
    const log: PocketbaseLog = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      details
    };
    this.logs.unshift(log); // Newest first
    if (this.logs.length > 100) {
      this.logs.pop();
    }
    this.saveLogs();
    this.logListeners.forEach(listener => {
      try {
        listener([...this.logs]);
      } catch (e) {
        console.error('Error triggering log listener:', e);
      }
    });
  }

  public static getLogs(): PocketbaseLog[] {
    return this.logs;
  }

  private static isPrivateUrl(urlStr: string): boolean {
    try {
      const url = new URL(urlStr);
      const host = url.hostname.toLowerCase();
      
      // localhost / loopback
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        return true;
      }
      // mDNS
      if (host.endsWith('.local')) {
        return true;
      }
      
      // IPv4 private ranges
      const ipPattern = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
      const match = host.match(ipPattern);
      if (match) {
        const octet1 = parseInt(match[1], 10);
        const octet2 = parseInt(match[2], 10);
        
        // 10.0.0.0/8
        if (octet1 === 10) return true;
        // 172.16.0.0/12
        if (octet1 === 172 && (octet2 >= 16 && octet2 <= 31)) return true;
        // 192.168.0.0/16
        if (octet1 === 192 && octet2 === 168) return true;
        // 100.64.0.0/10 (Tailscale / CGNAT)
        if (octet1 === 100) return true; // Treat any 100.x.y.z as private
      }
      
      return false;
    } catch {
      return false;
    }
  }

  private static async proxiedFetch(targetUrl: string, options: { method?: string; headers?: Record<string, string>; body?: any; uploadBase64FieldsAsFiles?: string[] } = {}): Promise<any> {
    const isPrivate = this.isPrivateUrl(targetUrl);

    let uploadFieldsToUse = Array.isArray(options.uploadBase64FieldsAsFiles) ? [...options.uploadBase64FieldsAsFiles] : [];

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      const imagesKey = options.body.images ? 'images' : (options.body.Images ? 'Images' : null);
      let hasBase64Images = false;
      if (imagesKey) {
        let imgs: any[] = [];
        try {
          imgs = typeof options.body[imagesKey] === 'string' ? JSON.parse(options.body[imagesKey]) : (Array.isArray(options.body[imagesKey]) ? options.body[imagesKey] : []);
        } catch {}
        hasBase64Images = imgs.some((img: any) => img && typeof img === 'object' && img.base64 && img.base64.startsWith('data:image/'));
      }

      if (typeof options.body.photoBase64 === 'string' && options.body.photoBase64.startsWith('data:') && !uploadFieldsToUse.includes('photoBase64')) {
        uploadFieldsToUse.push('photoBase64');
      }
      if (hasBase64Images && imagesKey && !uploadFieldsToUse.includes(imagesKey)) {
        uploadFieldsToUse.push(imagesKey);
      }

      Object.keys(options.body).forEach(key => {
        const val = options.body[key];
        if (typeof val === 'string' && val.startsWith('data:') && !uploadFieldsToUse.includes(key)) {
          uploadFieldsToUse.push(key);
        }
      });
    }

    if (isPrivate) {
      this.addLog('info', `Direct Browser Connection (Private Address Detected)`, `Connecting directly: ${targetUrl}. Server-side cloud proxy is bypassed because the cloud environment cannot access your private tailnet/network.`);
      try {
        const fetchOptions: RequestInit = {
          method: options.method || 'GET',
          headers: {
            ...options.headers,
          },
        };
        if (options.body) {
          if (uploadFieldsToUse.length > 0) {
            const formData = new FormData();
            Object.keys(options.body).forEach(key => {
              const value = options.body[key];
              const isFileField = uploadFieldsToUse.includes(key) || key === 'photoBase64' || key === 'images' || key === 'Images';

              if (isFileField) {
                if ((key === 'images' || key === 'Images')) {
                  let imagesArray: any[] = [];
                  try {
                    imagesArray = typeof value === 'string' ? JSON.parse(value) : (Array.isArray(value) ? value : []);
                  } catch {}
                  
                  if (imagesArray.length > 250) {
                    this.addLog('warn', `Tree has ${imagesArray.length} images. Slicing to the first 250 for PocketBase.`, `PocketBase limit is 250. Local IndexedDB will preserve all ${imagesArray.length} images.`);
                  }
                  
                  imagesArray.slice(0, 250).forEach((img: any) => {
                    if (typeof img === 'object' && img !== null && img.base64 && img.base64.startsWith('data:image/')) {
                      const parsed = parseBase64DataUrl(img.base64);
                      if (parsed) {
                        const mimeType = parsed.mimeType || 'image/jpeg';
                        const base64Data = parsed.base64Data;
                        const binaryStr = atob(base64Data);
                        const len = binaryStr.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                          bytes[i] = binaryStr.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: mimeType });
                        let ext = mimeType.split('/')[1] || 'jpg';
                        if (ext === 'jpeg') ext = 'jpg';
                        
                        const meta = {
                          id: img.id,
                          takenAt: img.takenAt || '',
                          isStarred: !!img.isStarred,
                          cameraModel: img.cameraModel || '',
                          location: img.location || ''
                        };
                        const metaStr = btoa(unescape(encodeURIComponent(JSON.stringify(meta))));
                        const safeMetaStr = metaStr.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                        const filename = `photo_${safeMetaStr}.${ext}`;
                        
                        formData.append(key, blob, filename);
                      }
                    }
                  });
                  return;
                }
                if (typeof value === 'string' && value.startsWith('data:')) {
                  const parsed = parseBase64DataUrl(value);
                  if (parsed) {
                    const mimeType = parsed.mimeType || 'image/jpeg';
                    const base64Data = parsed.base64Data;
                    const binaryStr = atob(base64Data);
                    const len = binaryStr.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                      bytes[i] = binaryStr.charCodeAt(i);
                    }
                    const blob = new Blob([bytes], { type: mimeType });
                    let ext = mimeType.split('/')[1] || 'jpg';
                    if (ext === 'jpeg') ext = 'jpg';
                    formData.append(key, blob, `photo_${Date.now()}.${ext}`);
                  }
                  return;
                }
                if (typeof value === 'string' && value.trim().length > 0 && !value.startsWith('data:')) {
                  formData.append(key, value);
                  return;
                }
                return;
              }

              if (value !== undefined && value !== null) {
                if (typeof value === 'object') {
                  formData.append(key, JSON.stringify(value));
                } else {
                  formData.append(key, String(value));
                }
              }
            });
            fetchOptions.body = formData;
            if (fetchOptions.headers) {
              delete (fetchOptions.headers as any)['Content-Type'];
              delete (fetchOptions.headers as any)['content-type'];
            }
          } else if (typeof options.body === 'object' && !(options.body instanceof FormData)) {
            fetchOptions.headers = {
              ...fetchOptions.headers,
              'Content-Type': 'application/json',
            };
            fetchOptions.body = JSON.stringify(options.body);
          } else {
            fetchOptions.body = options.body;
          }
        }

        const res = await fetch(targetUrl, fetchOptions);
        return res;
      } catch (err: any) {
        let explanation = 'Browser direct connection failed.';
        const urlObj = new URL(targetUrl);
        
        if (window.location.protocol === 'https:' && urlObj.protocol === 'http:') {
          explanation = `Mixed Content Block: Your browser blocked this connection because this app is running over secure HTTPS (${window.location.origin}), but your PocketBase is running over insecure HTTP (${targetUrl}). Modern web browsers strictly block insecure HTTP connections from secure HTTPS sites.`;
        } else {
          explanation = `Network Unreachable / CORS Block: Direct browser fetch to ${targetUrl} failed. Please verify that: \n1. PocketBase is actually running on your PC with host binding 0.0.0.0 (e.g. "./pocketbase serve --http=0.0.0.0:8090").\n2. Tailscale is connected on both your PC and this device.\n3. PocketBase allows connections from this app's origin (CORS).`;
        }

        this.addLog('error', 'Direct Connection Failed', explanation);
        throw new Error(`${explanation}\n\nTo resolve this:\n1. Enable Tailscale HTTPS on your PC (e.g., run "tailscale cert") and connect via your secure "https://..." domain.\n2. Or download this app (via settings/export) and run it locally over HTTP to completely bypass browser Mixed Content restrictions.`);
      }
    }

    // For public URLs, try direct fetch first, fallback to proxy if it fails (e.g. CORS)
    this.addLog('info', `Direct Browser Connection (Public Address)`, `Connecting to public host: ${targetUrl}`);
    try {
      const fetchOptions: RequestInit = {
        method: options.method || 'GET',
        headers: {
          ...options.headers,
        },
      };
      if (options.body) {
        if (uploadFieldsToUse.length > 0) {
          const formData = new FormData();
          Object.keys(options.body).forEach(key => {
            const value = options.body[key];
            const isFileField = uploadFieldsToUse.includes(key) || key === 'photoBase64' || key === 'images' || key === 'Images';

            if (isFileField) {
              if ((key === 'images' || key === 'Images')) {
                let imagesArray: any[] = [];
                try {
                  imagesArray = typeof value === 'string' ? JSON.parse(value) : (Array.isArray(value) ? value : []);
                } catch {}
                
                if (imagesArray.length > 250) {
                  this.addLog('warn', `Tree has ${imagesArray.length} images. Slicing to the first 250 for PocketBase.`, `PocketBase limit is 250. Local IndexedDB will preserve all ${imagesArray.length} images.`);
                }
                
                imagesArray.slice(0, 250).forEach((img: any) => {
                  if (typeof img === 'object' && img !== null && img.base64 && img.base64.startsWith('data:image/')) {
                    const parsed = parseBase64DataUrl(img.base64);
                    if (parsed) {
                      const mimeType = parsed.mimeType || 'image/jpeg';
                      const base64Data = parsed.base64Data;
                      const binaryStr = atob(base64Data);
                      const len = binaryStr.length;
                      const bytes = new Uint8Array(len);
                      for (let i = 0; i < len; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                      }
                      const blob = new Blob([bytes], { type: mimeType });
                      let ext = mimeType.split('/')[1] || 'jpg';
                      if (ext === 'jpeg') ext = 'jpg';
                      
                      const meta = {
                        id: img.id,
                        takenAt: img.takenAt || '',
                        isStarred: !!img.isStarred,
                        cameraModel: img.cameraModel || '',
                        location: img.location || ''
                      };
                      const metaStr = btoa(unescape(encodeURIComponent(JSON.stringify(meta))));
                      const safeMetaStr = metaStr.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                      const filename = `photo_${safeMetaStr}.${ext}`;
                      
                      formData.append(key, blob, filename);
                    }
                  }
                });
                return;
              }
              if (typeof value === 'string' && value.startsWith('data:')) {
                const parsed = parseBase64DataUrl(value);
                if (parsed) {
                  const mimeType = parsed.mimeType || 'image/jpeg';
                  const base64Data = parsed.base64Data;
                  const binaryStr = atob(base64Data);
                  const len = binaryStr.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                  }
                  const blob = new Blob([bytes], { type: mimeType });
                  let ext = mimeType.split('/')[1] || 'jpg';
                  if (ext === 'jpeg') ext = 'jpg';
                  formData.append(key, blob, `photo_${Date.now()}.${ext}`);
                }
                return;
              }
              if (typeof value === 'string' && value.trim().length > 0 && !value.startsWith('data:')) {
                formData.append(key, value);
                return;
              }
              return;
            }

            if (value !== undefined && value !== null) {
              if (typeof value === 'object') {
                formData.append(key, JSON.stringify(value));
              } else {
                formData.append(key, String(value));
              }
            }
          });
          fetchOptions.body = formData;
          if (fetchOptions.headers) {
            delete (fetchOptions.headers as any)['Content-Type'];
            delete (fetchOptions.headers as any)['content-type'];
          }
        } else if (typeof options.body === 'object' && !(options.body instanceof FormData)) {
          fetchOptions.headers = {
            ...fetchOptions.headers,
            'Content-Type': 'application/json',
          };
          fetchOptions.body = JSON.stringify(options.body);
        } else {
          fetchOptions.body = options.body;
        }
      }

      const res = await fetch(targetUrl, fetchOptions);
      if (res.ok || res.status < 500) {
        return res;
      }
    } catch (err) {
      this.addLog('warn', `Direct Connection Blocked / CORS Failure`, 'Direct browser fetch failed (likely due to CORS). Falling back to Cloud Server proxy...');
    }

    const response = await fetch('/api/pb-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetUrl,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        uploadBase64FieldsAsFiles: uploadFieldsToUse,
      }),
    });

    const result = await response.json().catch(() => null);

    // If result has our proxy wrapper format { ok, status, data }
    if (result && typeof result === 'object' && 'status' in result) {
      return {
        ok: result.ok,
        status: result.status,
        headers: {
          get: (name: string) => result.headers?.[name.toLowerCase()] || '',
        },
        json: async () => result.data,
        text: async () => typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
        blob: async () => {
          if (typeof result.data === 'string' && result.data.startsWith('data:')) {
            const parts = result.data.split(',');
            const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
            const bstr = atob(parts[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
              u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], { type: mime });
          }
          return new Blob([typeof result.data === 'string' ? result.data : JSON.stringify(result.data)]);
        },
        clone: function() {
          return {
            json: async () => result.data,
            text: async () => typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
          };
        }
      } as any;
    }

    // Otherwise, if the proxy route itself failed (e.g. server-side 500)
    if (!response.ok) {
      const errData = result || {};
      throw new Error(errData.details || errData.error || `Proxy error ${response.status}`);
    }
  }

  public static clearLogs() {
    this.logs = [];
    this.saveLogs();
    this.logListeners.forEach(listener => listener([]));
    this.addLog('info', 'Diagnostics log history cleared.');
  }

  public static subscribeLogs(listener: (logs: PocketbaseLog[]) => void) {
    this.logListeners.push(listener);
    // Initial call
    listener([...this.logs]);
    return () => {
      this.logListeners = this.logListeners.filter(l => l !== listener);
    };
  }

  private static getStoredConfig(): PocketbaseConfig {
    if (typeof window === 'undefined') {
      return { url: '', identity: '', enabled: false, useNativeFiles: false };
    }
    return {
      url: localStorage.getItem('pb_url') || '',
      identity: localStorage.getItem('pb_identity') || '',
      token: localStorage.getItem('pb_token') || '',
      userId: localStorage.getItem('pb_user_id') || '',
      enabled: localStorage.getItem('pb_enabled') === 'true',
      useNativeFiles: localStorage.getItem('pb_use_native_files') === 'true',
    };
  }

  public static isEnabled(): boolean {
    const config = this.getStoredConfig();
    return config.enabled && !!config.url && !!config.token;
  }

  public static getUrl(): string {
    return localStorage.getItem('pb_url') || '';
  }

  public static getDeletedIds(collection: string): string[] {
    try {
      const raw = localStorage.getItem(`pb_deleted_${collection}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public static addDeletedId(collection: string, id: string): void {
    if (!id) return;
    try {
      const current = new Set(this.getDeletedIds(collection));
      current.add(id);
      localStorage.setItem(`pb_deleted_${collection}`, JSON.stringify(Array.from(current)));
    } catch (e) {
      console.warn(`Failed to add deleted ID for ${collection}:`, e);
    }
  }

  public static removeDeletedId(collection: string, id: string): void {
    if (!id) return;
    try {
      const current = new Set(this.getDeletedIds(collection));
      current.delete(id);
      localStorage.setItem(`pb_deleted_${collection}`, JSON.stringify(Array.from(current)));
    } catch (e) {
      console.warn(`Failed to remove deleted ID for ${collection}:`, e);
    }
  }

  public static clearDeletedIds(collection?: string): void {
    try {
      if (collection) {
        localStorage.removeItem(`pb_deleted_${collection}`);
      } else {
        ['trees', 'measurements', 'care_logs', 'tasks', 'care_guides'].forEach(c => {
          localStorage.removeItem(`pb_deleted_${c}`);
        });
      }
    } catch {}
  }

  public static async deleteRecord(collection: 'trees' | 'measurements' | 'care_logs' | 'tasks' | 'care_guides', id: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      this.addLog('info', `Deleting record '${id}' from collection '${collection}' on PocketBase...`);
      await this.apiRequest(`${collection}/records/${id}`, 'DELETE');
      this.addLog('success', `✓ Successfully deleted record '${id}' from '${collection}' on PocketBase.`);
      return true;
    } catch (err: any) {
      this.addLog('warn', `Failed to delete record '${id}' from '${collection}' on PocketBase: ${err.message}`);
      return false;
    }
  }

  /**
   * Save configuration and authenticate to get a fresh token
   */
  public static async connect(url: string, identity: string, password?: string, useNativeFiles = false): Promise<{ success: boolean; error?: string }> {
    let cleanUrl = url.trim().replace(/\/$/, ''); // strip trailing slash
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    this.addLog('info', 'Initializing connection...', `Connecting to PocketBase server at ${cleanUrl}`);

    // Mixed Content warning block
    if (cleanUrl.toLowerCase().startsWith('http:') && typeof window !== 'undefined' && window.location.protocol === 'https:') {
      this.addLog('warn', '⚠️ Insecure Connection (HTTP) Alert', 'You are running this app over secure HTTPS, but your PocketBase URL is insecure HTTP. Browsers block insecure requests on secure sites. Set up HTTPS using Tailscale Funnel / Tailscale HTTPS on your PC, or run this app locally.');
    }

    try {
      // Store configurations locally
      localStorage.setItem('pb_url', cleanUrl);
      localStorage.setItem('pb_identity', identity);
      localStorage.setItem('pb_use_native_files', useNativeFiles ? 'true' : 'false');

      if (!password) {
        const existingToken = localStorage.getItem('pb_token');
        if (existingToken) {
          localStorage.setItem('pb_enabled', 'true');
          this.addLog('success', 'Reconnected with cached credentials.', `User/Identity: ${identity}`);
          return { success: true };
        }
        this.addLog('error', 'Connection failed: Password required');
        return { success: false, error: 'Password required' };
      }

      // Step 1: Pre-test network reachability to distinguish network/CORS blocks from auth issues
      this.addLog('info', 'Testing connection reachability...', 'Checking if server endpoints respond...');
      try {
        const pingResponse = await this.proxiedFetch(`${cleanUrl}/api/collections/users/auth-methods`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }).catch(err => {
          throw new Error('Fetch failed. Server may be offline, port closed, or request was blocked.');
        });
        
        if (pingResponse.ok) {
          this.addLog('info', '✓ Network reachability test passed.', 'Server responded correctly.');
        } else {
          this.addLog('warn', `Reachability response code: ${pingResponse.status}`, 'Proceeding to authentication regardless...');
        }
      } catch (pingErr: any) {
        this.addLog('error', '✗ Network reachability test failed!', 'Check if Tailscale is running on this device, the server PC is turned on, and PocketBase is started with the correct host binding (e.g. 0.0.0.0:8090).');
        
        if (cleanUrl.toLowerCase().includes('.ts.net')) {
          throw new Error(`Connection failed for Tailscale URL.\n\nSince this app is running in the cloud, our cloud proxy cannot access private tailnets. To make your server reachable by the app, you need to turn on Tailscale Funnel.\n\nTo resolve this instantly, run this command on your PC:\n\n  tailscale funnel --bg 8090\n\n(Or replace 8090 with your PocketBase port if different). This will securely expose your local server to our cloud proxy!`);
        }
        
        throw new Error(`Connection timed out or blocked by browser security (CORS/Mixed Content). Details: ${pingErr.message}`);
      }

      // Step 2: Try User authentication
      this.addLog('info', 'Attempting regular User authentication...', `Logging in user: ${identity}`);
      let authUrl = `${cleanUrl}/api/collections/users/auth-with-password`;
      let payload = { identity, password };

      let response = await this.proxiedFetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      let data: any;
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      // If User authentication fails, try Superuser or Legacy admin
      if (!response.ok) {
        this.addLog('warn', `User login failed: ${data.message || 'Unauthorized'}`, 'Trying Superuser/Admin authentication pathways...');

        const superuserUrl = `${cleanUrl}/api/collections/_superusers/auth-with-password`;
        const legacyAdminUrl = `${cleanUrl}/api/admins/auth-with-password`;
        
        this.addLog('info', 'Attempting Superuser authentication (Pocketbase v0.23+)...', `Superuser: ${identity}`);
        let altResponse = await this.proxiedFetch(superuserUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { identity, password },
        });

        if (!altResponse.ok) {
          let superuserErr = 'Failed';
          try {
            const temp = await altResponse.clone().json();
            superuserErr = temp.message || 'Failed';
          } catch {}
          this.addLog('warn', `Superuser login failed: ${superuserErr}`, 'Trying Legacy Admin authentication (Pocketbase <v0.23)...');

          altResponse = await this.proxiedFetch(legacyAdminUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { identity, password },
          });
        }

        if (altResponse.ok) {
          response = altResponse;
          data = await altResponse.json();
          this.addLog('success', '✓ Admin/Superuser authenticated successfully!');
        } else {
          let altData: any;
          try {
            altData = await altResponse.json();
          } catch {
            altData = {};
          }
          const finalError = altData.message || data.message || 'Invalid credentials or login unauthorized';
          this.addLog('error', `✗ Authentication completely failed: ${finalError}`, 'Make sure email/username and password are correct inside your PocketBase setup.');
          return { success: false, error: finalError };
        }
      } else {
        this.addLog('success', '✓ User authenticated successfully!');
      }

      // Step 3: Save credentials and enable
      const token = data.token;
      const record = data.record || data.admin;
      const userId = record?.id || 'admin';

      localStorage.setItem('pb_token', token);
      localStorage.setItem('pb_user_id', userId);
      localStorage.setItem('pb_enabled', 'true');

      this.addLog('success', 'PocketBase connected and active.', `Active User ID: ${userId}`);

      // Verify the collections are set up correctly
      await this.verifyCollections();

      return { success: true };
    } catch (err: any) {
      console.warn('Pocketbase connection error:', err);
      this.addLog('error', '✗ Connection Error!', err.message || 'An unexpected connection error occurred.');
      return { success: false, error: err.message || 'Network error connecting to Pocketbase' };
    }
  }

  /**
   * Verify all required collections are active
   */
  public static async verifyCollections(): Promise<{ success: boolean; errors: string[] }> {
    const collections = ['trees', 'measurements', 'care_logs', 'tasks', 'care_guides'];
    const errors: string[] = [];
    this.addLog('info', 'Auditing PocketBase collections structure...', 'Checking required schemas on PC...');

    for (const collection of collections) {
      try {
        await this.apiRequest(`${collection}/records?perPage=1`, 'GET');
        this.addLog('success', `✓ Collection '${collection}' is active and readable.`);
      } catch (err: any) {
        const errMsg = err.message || 'Fetch error';
        if (errMsg.includes('404') || errMsg.toLowerCase().includes('not found')) {
          this.addLog('error', `✗ Collection '${collection}' NOT FOUND (404)!`, `You must log into your PC's PocketBase Admin panel (http://127.0.0.1:8090/_/) and create the collection named '${collection}'.`);
        } else {
          this.addLog('warn', `⚠️ Collection '${collection}' read issue: ${errMsg}`);
        }
        errors.push(`${collection}: ${errMsg}`);
      }
    }
    return { success: errors.length === 0, errors };
  }

  public static disconnect() {
    const config = this.getStoredConfig();
    this.addLog('info', 'Disconnecting PocketBase.', `Cleared server configuration: ${config.url}`);
    localStorage.removeItem('pb_token');
    localStorage.removeItem('pb_user_id');
    localStorage.removeItem('pb_use_native_files');
    localStorage.setItem('pb_enabled', 'false');
  }

  /**
   * Helper to perform authenticated requests to Pocketbase
   */
  private static async apiRequest(endpoint: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: any, uploadBase64FieldsAsFiles?: string[]): Promise<any> {
    const config = this.getStoredConfig();
    if (!config.url || !config.token) {
      throw new Error('Pocketbase not configured or logged out');
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${config.token}`,
    };

    if (body && (!uploadBase64FieldsAsFiles || uploadBase64FieldsAsFiles.length === 0)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.proxiedFetch(`${config.url}/api/collections/${endpoint}`, {
      method,
      headers,
      body,
      uploadBase64FieldsAsFiles,
    });

    if (response.status === 401) {
      this.addLog('error', '🔒 PocketBase Session Expired', 'Received 401 Unauthorized from server. Disconnecting.');
      this.disconnect();
      throw new Error('Pocketbase session expired. Please reconnect.');
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      let errMsg = errData.message || `API error ${response.status}`;
      if (errData.data && typeof errData.data === 'object') {
        const details = Object.entries(errData.data)
          .map(([field, err]: [string, any]) => `${field}: ${err.message || JSON.stringify(err)}`)
          .join(', ');
        if (details) {
          errMsg += ` (${details})`;
        }
      }
      throw new Error(errMsg);
    }

    if (method === 'DELETE') {
      return { success: true };
    }

    return response.json();
  }

  /**
   * Bidirectional sync routine
   */
  public static async syncData(
    localTrees: Tree[],
    localM: Record<string, Measurement[]>,
    localL: Record<string, CareLog[]>,
    localT: Record<string, Task[]>,
    localGuides: CareGuide[],
    onProgress?: (status: string) => void,
    forceOverwriteRemote = false
  ): Promise<{
    trees: Tree[];
    measurements: Record<string, Measurement[]>;
    careLogs: Record<string, CareLog[]>;
    tasks: Record<string, Task[]>;
    careGuides: CareGuide[];
    updatedAt: string;
  }> {
    if (!this.isEnabled()) {
      throw new Error('Pocketbase sync is disabled or not configured');
    }

    const config = this.getStoredConfig();
    const userId = localStorage.getItem('pb_user_id') || 'local_user';
    const getIsoNow = () => new Date().toISOString();

    if (forceOverwriteRemote) {
      this.addLog('info', 'Import override detected. Purging old remote database contents first...', 'Overwriting remote with imported data.');
      onProgress?.('Wiping remote PocketBase for full high-fidelity restore...');
      await this.purgeAllRemoteData();
    }

    this.addLog('info', 'Synchronizing with PocketBase...', 'Starting bidirectional data convergence.');

    // Hydrate local trees' images with their base64 strings from IndexedDB
    let getPhotoLocalFn: any = null;
    let hydratedLocalTrees = localTrees;
    try {
      const { getPhotoLocal } = await import('./idb');
      getPhotoLocalFn = getPhotoLocal;
      if (getPhotoLocal) {
        hydratedLocalTrees = await Promise.all(localTrees.map(async (t) => {
          if (t.images && Array.isArray(t.images)) {
            const hydratedImages = await Promise.all(t.images.map(async (img) => {
              if (typeof img === 'object' && img !== null && !img.base64) {
                const b64 = await getPhotoLocal(img.id);
                if (b64) {
                  return { ...img, base64: b64 };
                }
              }
              return img;
            }));
            return { ...t, images: hydratedImages };
          }
          return t;
        }));
      }
    } catch (e) {
      console.warn('Failed to hydrate local tree images from IndexedDB before sync:', e);
    }

    // Client-side image compression step before sync to ensure optimized file size and valid formats
    try {
      hydratedLocalTrees = await Promise.all(hydratedLocalTrees.map(async (t) => {
        let compressedPhoto = t.photoBase64;
        if (compressedPhoto && typeof compressedPhoto === 'string' && compressedPhoto.startsWith('data:image/')) {
          compressedPhoto = await compressBase64Image(compressedPhoto, 1200, 1200, 0.75);
        }
        let compressedImages = t.images;
        if (compressedImages && Array.isArray(compressedImages)) {
          compressedImages = await Promise.all(compressedImages.map(async (img) => {
            if (typeof img === 'object' && img !== null && img.base64 && typeof img.base64 === 'string' && img.base64.startsWith('data:image/')) {
              const compB64 = await compressBase64Image(img.base64, 1200, 1200, 0.75);
              return { ...img, base64: compB64 };
            }
            return img;
          }));
        }
        return { ...t, photoBase64: compressedPhoto, images: compressedImages };
      }));
    } catch (e) {
      console.warn('Failed client-side compression on local tree photos before sync:', e);
    }

    let remoteTrees: any[] = [];
    let remoteMItems: any[] = [];
    let remoteLItems: any[] = [];
    let remoteTItems: any[] = [];
    let remoteGItems: any[] = [];

    // Step 1: Fetch remote collections
    try {
      onProgress?.('Fetching remote Trees from Pocketbase...');
      this.addLog('info', 'Fetching remote Trees from server...');
      const remoteTreesRes = await this.apiRequest('trees/records?perPage=500');
      remoteTrees = remoteTreesRes.items || [];
      this.addLog('success', `✓ Fetched ${remoteTrees.length} Trees from PocketBase.`);
    } catch (err: any) {
      this.addLog('error', '✗ Failed to fetch Trees from PocketBase', err.message);
      throw new Error(`Failed to sync 'trees' collection: ${err.message}`);
    }

    try {
      onProgress?.('Fetching remote Measurements...');
      this.addLog('info', 'Fetching remote Measurements from server...');
      const remoteMRes = await this.apiRequest('measurements/records?perPage=1000');
      remoteMItems = remoteMRes.items || [];
      this.addLog('success', `✓ Fetched ${remoteMItems.length} Measurements.`);
    } catch (err: any) {
      this.addLog('error', '✗ Failed to fetch Measurements from PocketBase', err.message);
      throw new Error(`Failed to sync 'measurements' collection: ${err.message}`);
    }

    try {
      onProgress?.('Fetching remote Care Logs...');
      this.addLog('info', 'Fetching remote Care Logs from server...');
      const remoteLRes = await this.apiRequest('care_logs/records?perPage=1000');
      remoteLItems = remoteLRes.items || [];
      this.addLog('success', `✓ Fetched ${remoteLItems.length} Care Logs.`);
    } catch (err: any) {
      this.addLog('error', '✗ Failed to fetch Care Logs from PocketBase', err.message);
      throw new Error(`Failed to sync 'care_logs' collection: ${err.message}`);
    }

    try {
      onProgress?.('Fetching remote Tasks...');
      this.addLog('info', 'Fetching remote Tasks from server...');
      const remoteTRes = await this.apiRequest('tasks/records?perPage=1000');
      remoteTItems = remoteTRes.items || [];
      this.addLog('success', `✓ Fetched ${remoteTItems.length} Chores/Tasks.`);
    } catch (err: any) {
      this.addLog('error', '✗ Failed to fetch Tasks from PocketBase', err.message);
      throw new Error(`Failed to sync 'tasks' collection: ${err.message}`);
    }

    try {
      onProgress?.('Fetching remote Care Guides...');
      this.addLog('info', 'Fetching remote Care Guides from server...');
      const remoteGRes = await this.apiRequest('care_guides/records?perPage=500');
      remoteGItems = remoteGRes.items || [];
      this.addLog('success', `✓ Fetched ${remoteGItems.length} Care Guides.`);
    } catch (err: any) {
      this.addLog('error', '✗ Failed to fetch Care Guides from PocketBase', err.message);
      throw new Error(`Failed to sync 'care_guides' collection: ${err.message}`);
    }

    // Map remote arrays into dictionaries
    const remoteM: Record<string, Measurement[]> = {};
    remoteMItems.forEach(item => {
      const treeId = item.treeId;
      if (!remoteM[treeId]) remoteM[treeId] = [];
      remoteM[treeId].push({
        id: item.id,
        userId: item.userId,
        treeId: item.treeId,
        date: item.date,
        width: item.width,
        notes: item.notes,
        createdAt: item.created || item.createdAt,
      });
    });

    const remoteL: Record<string, CareLog[]> = {};
    remoteLItems.forEach(item => {
      const treeId = item.treeId;
      if (!remoteL[treeId]) remoteL[treeId] = [];
      remoteL[treeId].push({
        id: item.id,
        userId: item.userId,
        treeId: item.treeId,
        type: item.type,
        date: item.date,
        notes: item.notes,
        createdAt: item.created || item.createdAt,
      });
    });

    const remoteT: Record<string, Task[]> = {};
    remoteTItems.forEach(item => {
      const treeId = item.treeId;
      if (!remoteT[treeId]) remoteT[treeId] = [];
      remoteT[treeId].push({
        id: item.id,
        userId: item.userId,
        treeId: item.treeId,
        title: item.title,
        type: item.type,
        dueDate: item.dueDate,
        completed: item.completed,
        completedAt: item.completedAt,
        createdAt: item.created || item.createdAt,
      });
    });

    // Step 2: Merge Trees
    const finalTrees: Tree[] = [];
    const localTreesMap = new Map(hydratedLocalTrees.map(t => [t.id, t]));
    const remoteTreesMap = new Map(remoteTrees.map(t => [t.id, t]));

    onProgress?.('Syncing Trees...');
    const deletedTreeIds = new Set(this.getDeletedIds('trees'));
    const allTreeIds = new Set([...localTreesMap.keys(), ...remoteTreesMap.keys(), ...deletedTreeIds]);
    this.addLog('info', `Reconciling ${allTreeIds.size} Trees...`);

    // Helper to download native PocketBase file and convert to local cache Base64 data URL
    const resolveRemotePhoto = async (remoteTree: any): Promise<string> => {
      const rawPhoto = remoteTree.photoBase64;
      if (!rawPhoto) return '';
      if (rawPhoto.startsWith('data:image') || rawPhoto.startsWith('http://') || rawPhoto.startsWith('https://')) {
        return rawPhoto;
      }
      
      const collectionId = remoteTree.collectionId || remoteTree.collectionName || 'trees';
      const fileUrl = `${config.url}/api/files/${collectionId}/${remoteTree.id}/${rawPhoto}`;
      try {
        const res = await this.proxiedFetch(fileUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.token}`,
          }
        });
        
        if (!res.ok) {
          return fileUrl;
        }

        if (typeof res.blob === 'function') {
          try {
            const blob = await res.blob();
            return new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string || fileUrl);
              reader.onerror = () => resolve(fileUrl);
              reader.readAsDataURL(blob);
            });
          } catch {
            // fallback
          }
        }

        const textData = await res.text();
        if (textData && textData.startsWith('data:image/')) {
          return textData;
        }
        return fileUrl;
      } catch (err) {
        console.warn('Failed resolving remote photo:', err);
        return fileUrl;
      }
    };

    // Detect if remote collection schema has 'images' or 'Images' field dynamically by probing with fields parameter
    let hasImagesField = false;
    let imagesFieldName = 'images';
    try {
      await this.apiRequest('trees/records?perPage=1&fields=images', 'GET');
      hasImagesField = true;
      imagesFieldName = 'images';
      this.addLog('info', '✓ Detected "images" (lowercase) field in remote collection schema.');
    } catch {
      try {
        await this.apiRequest('trees/records?perPage=1&fields=Images', 'GET');
        hasImagesField = true;
        imagesFieldName = 'Images';
        this.addLog('info', '✓ Detected "Images" (capitalized) field in remote collection schema.');
      } catch {
        if (remoteTrees.length > 0) {
          if ('images' in remoteTrees[0]) {
            hasImagesField = true;
            imagesFieldName = 'images';
            this.addLog('info', '✓ Detected "images" field via existing records.');
          } else if ('Images' in remoteTrees[0]) {
            hasImagesField = true;
            imagesFieldName = 'Images';
            this.addLog('info', '✓ Detected "Images" field via existing records.');
          } else {
            this.addLog('info', 'ℹ️ PocketBase trees collection does not appear to have an "images" or "Images" field.');
          }
        } else {
          this.addLog('info', 'ℹ️ PocketBase trees collection does not appear to have an "images" or "Images" field.');
        }
      }
    }

    let imagesIsFileField = false;
    if (hasImagesField) {
      imagesIsFileField = true;
    }

    if (imagesIsFileField) {
      this.addLog('info', '📂 "images" field detected as a native File field. Managing multiple file attachments with serialized metadata.');
    }

    // Helper to download native multiple PocketBase images and convert to base64
    const resolveRemoteImages = async (remoteTree: any, rawImages: any[]): Promise<any[]> => {
      if (!rawImages || !Array.isArray(rawImages)) return [];
      
      const CONCURRENCY_LIMIT = 5;
      const resolved: any[] = new Array(rawImages.length);
      
      const processImage = async (imgName: any, index: number) => {
        if (typeof imgName !== 'string') {
          resolved[index] = imgName;
          return;
        }
        if (imgName.trim().startsWith('{') || imgName.trim().startsWith('[')) {
          try {
            resolved[index] = JSON.parse(imgName);
          } catch {
            resolved[index] = imgName;
          }
          return;
        }
        
        // Helper function to decode JSON metadata from PocketBase filenames (handling optional PB random hash suffixes)
        let meta: any = {};
        if (imgName.startsWith('photo_')) {
          const dotIdx = imgName.lastIndexOf('.');
          const stem = dotIdx !== -1 ? imgName.substring(6, dotIdx) : imgName.substring(6);
          
          const tryDecode = (str: string) => {
            try {
              let b64Meta = str.replace(/-/g, '+').replace(/_/g, '/');
              while (b64Meta.length % 4) b64Meta += '=';
              const decodedJson = decodeURIComponent(escape(atob(b64Meta)));
              return JSON.parse(decodedJson);
            } catch {
              return null;
            }
          };

          meta = tryDecode(stem);
          if (!meta) {
            let parts = stem.split('_');
            while (!meta && parts.length > 1) {
              parts.pop();
              meta = tryDecode(parts.join('_'));
            }
          }
        }
        meta = meta || {};

        const imgId = meta.id || ('img_failed_' + Math.random().toString(36).substring(2, 12));
        
        // Speed optimization: Bypasses redundant remote downloads by checking local IndexedDB cache first
        if (getPhotoLocalFn) {
          try {
            const cachedB64 = await getPhotoLocalFn(imgId);
            if (cachedB64) {
              resolved[index] = {
                id: imgId,
                base64: cachedB64,
                takenAt: meta.takenAt || new Date().toISOString().split('T')[0],
                isStarred: !!meta.isStarred,
                cameraModel: meta.cameraModel || '',
                location: meta.location || ''
              };
              return;
            }
          } catch (err) {
            console.warn('Failed reading photo from IndexedDB:', err);
          }
        }
        
        const collectionId = remoteTree.collectionId || remoteTree.collectionName || 'trees';
        const fileUrl = `${config.url}/api/files/${collectionId}/${remoteTree.id}/${imgName}`;
        try {
          this.addLog('info', `Downloading remote image file: ${imgName}...`);
          const res = await this.proxiedFetch(fileUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${config.token}`,
            }
          });
          
          if (res.ok) {
            let b64 = '';
            const textData = await res.text().catch(() => '');
            if (textData && textData.startsWith('data:')) {
              b64 = textData;
            } else if (typeof res.blob === 'function') {
              try {
                const blob = await res.blob();
                b64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string || '');
                  reader.onerror = () => resolve('');
                  reader.readAsDataURL(blob);
                });
              } catch (err) {
                console.warn('Failed reading blob from response:', err);
              }
            }
            
            if (b64) {
              // Cache downloaded photo into local IndexedDB
              try {
                const { savePhotoLocal } = await import('./idb');
                await savePhotoLocal(imgId, b64);
              } catch {}

              resolved[index] = {
                id: imgId,
                base64: b64,
                takenAt: meta.takenAt || new Date().toISOString().split('T')[0],
                isStarred: !!meta.isStarred,
                cameraModel: meta.cameraModel || '',
                location: meta.location || ''
              };
            } else {
              resolved[index] = {
                id: imgId,
                base64: '',
                takenAt: meta.takenAt || '',
                isStarred: !!meta.isStarred,
                cameraModel: meta.cameraModel || '',
                location: meta.location || '',
                error: true
              };
            }
          } else {
            resolved[index] = {
              id: imgId,
              base64: '',
              takenAt: meta.takenAt || '',
              isStarred: !!meta.isStarred,
              cameraModel: meta.cameraModel || '',
              location: meta.location || '',
              error: true
            };
          }
        } catch (err) {
          console.warn('Failed resolving remote image file:', imgName, err);
          resolved[index] = {
            id: imgId,
            base64: '',
            takenAt: meta.takenAt || '',
            isStarred: !!meta.isStarred,
            cameraModel: meta.cameraModel || '',
            location: meta.location || '',
            error: true
          };
        }
      };

      // Download images concurrently in batches of CONCURRENCY_LIMIT
      for (let i = 0; i < rawImages.length; i += CONCURRENCY_LIMIT) {
        const chunk = rawImages.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(chunk.map((imgName, chunkIdx) => processImage(imgName, i + chunkIdx)));
      }
      
      return resolved.filter(Boolean);
    };

    // Tree merging execution with bounded parallel concurrency (processes up to 4 trees at once)
    const treeIdsArray = Array.from(allTreeIds);
    const TREE_CONCURRENCY = 4;

    for (let i = 0; i < treeIdsArray.length; i += TREE_CONCURRENCY) {
      const chunk = treeIdsArray.slice(i, i + TREE_CONCURRENCY);
      const chunkPromises = chunk.map(async (treeId) => {
        const local = localTreesMap.get(treeId);
        const remote = remoteTreesMap.get(treeId);
        const isDeletedLocally = deletedTreeIds.has(treeId);

        if (isDeletedLocally) {
          if (remote) {
            try {
              this.addLog('info', `Deleting remote tree '${remote.name || remote.species || treeId}'...`);
              await this.apiRequest(`trees/records/${treeId}`, 'DELETE');
              this.addLog('success', `✓ Deleted remote tree '${remote.name || remote.species || treeId}'.`);
            } catch (err: any) {
              this.addLog('warn', `Failed deleting remote tree '${treeId}': ${err.message}`);
            }
          }
          this.removeDeletedId('trees', treeId);
          return null;
        }

        if (local && !remote) {
          this.addLog('info', `Uploading tree '${local.name || local.species}' to PocketBase...`);

          // Hydrate base64 data for local.images if missing using IndexedDB cache
          if (Array.isArray(local.images) && getPhotoLocalFn) {
            for (const img of local.images) {
              if (img && typeof img === 'object' && (!img.base64 || img.base64 === '')) {
                try {
                  const cachedB64 = await getPhotoLocalFn(img.id);
                  if (cachedB64) {
                    img.base64 = cachedB64;
                  }
                } catch (err) {
                  console.warn('Failed restoring image base64 from IndexedDB for POST:', err);
                }
              }
            }
          }

          const hasBase64Images = Array.isArray(local.images) && local.images.some((img: any) => img && typeof img === 'object' && img.base64 && typeof img.base64 === 'string' && img.base64.startsWith('data:image/'));

          const payload: any = {
            id: local.id,
            userId,
            name: local.name,
            species: local.species,
            dateAcquired: local.dateAcquired || '',
            approximateAge: local.approximateAge || 0,
            originDate: local.originDate || '',
            style: local.style || '',
            status: local.status,
            notes: local.notes || '',
            isDead: !!local.isDead,
            lessonLearned: local.lessonLearned || '',
            accolades: local.accolades || '',
            accoladesList: JSON.stringify(local.accoladesList || []),
          };

          const uploadFields: string[] = [];
          if (typeof local.photoBase64 === 'string' && local.photoBase64.startsWith('data:image/')) {
            payload.photoBase64 = local.photoBase64;
            uploadFields.push('photoBase64');
          }

          if (hasImagesField) {
            if (imagesIsFileField) {
              if (hasBase64Images) {
                payload[imagesFieldName] = local.images || [];
                uploadFields.push(imagesFieldName);
              }
            } else {
              payload[imagesFieldName] = JSON.stringify(local.images || []);
            }
          }

          const resRemote = await this.apiRequest('trees/records', 'POST', payload, uploadFields.length > 0 ? uploadFields : undefined);
          this.addLog('success', `✓ Tree '${local.name || local.species}' created on PocketBase.`);
          if (resRemote && resRemote.updated) {
            return { ...local, updatedAt: resRemote.updated };
          }
          return local;
        } else if (!local && remote) {
          let parsedAccolades: any[] = [];
          try {
            parsedAccolades = typeof remote.accoladesList === 'string' ? JSON.parse(remote.accoladesList) : (remote.accoladesList || []);
          } catch {}

          let parsedImages: any[] = [];
          if (hasImagesField && remote[imagesFieldName]) {
            if (imagesIsFileField) {
              const rawImgNames = Array.isArray(remote[imagesFieldName]) ? remote[imagesFieldName] : [];
              parsedImages = await resolveRemoteImages(remote, rawImgNames);
            } else {
              try {
                parsedImages = typeof remote[imagesFieldName] === 'string' ? JSON.parse(remote[imagesFieldName]) : (remote[imagesFieldName] || []);
              } catch {}
            }
          }

          const photoBase64Resolved = await resolveRemotePhoto(remote);

          this.addLog('info', `Imported remote tree '${remote.name || remote.species}' locally.`);
          return {
            id: remote.id,
            userId: remote.userId,
            name: remote.name,
            species: remote.species,
            dateAcquired: remote.dateAcquired,
            approximateAge: remote.approximateAge,
            originDate: remote.originDate,
            style: remote.style,
            status: remote.status,
            notes: remote.notes,
            photoBase64: photoBase64Resolved,
            isDead: remote.isDead,
            lessonLearned: remote.lessonLearned,
            accolades: remote.accolades,
            accoladesList: parsedAccolades,
            images: parsedImages,
            createdAt: remote.created,
            updatedAt: remote.updated,
          };
        } else if (local && remote) {
          const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
          const remoteTime = remote.updated ? new Date(remote.updated).getTime() : 0;

          if (localTime > remoteTime + 1000) {
            this.addLog('info', `Updating remote tree '${local.name || local.species}' (Local is newer)...`);

            // Hydrate base64 data for local.images if missing using IndexedDB cache
            if (Array.isArray(local.images) && getPhotoLocalFn) {
              for (const img of local.images) {
                if (img && typeof img === 'object' && (!img.base64 || img.base64 === '')) {
                  try {
                    const cachedB64 = await getPhotoLocalFn(img.id);
                    if (cachedB64) {
                      img.base64 = cachedB64;
                    }
                  } catch (err) {
                    console.warn('Failed restoring image base64 from IndexedDB for PATCH:', err);
                  }
                }
              }
            }

            const hasBase64Images = Array.isArray(local.images) && local.images.some((img: any) => img && typeof img === 'object' && img.base64 && typeof img.base64 === 'string' && img.base64.startsWith('data:image/'));

            const payload: any = {
              name: local.name,
              species: local.species,
              dateAcquired: local.dateAcquired || '',
              approximateAge: local.approximateAge || 0,
              originDate: local.originDate || '',
              style: local.style || '',
              status: local.status,
              notes: local.notes || '',
              isDead: !!local.isDead,
              lessonLearned: local.lessonLearned || '',
              accolades: local.accolades || '',
              accoladesList: JSON.stringify(local.accoladesList || []),
            };

            const uploadFields: string[] = [];

            if (typeof local.photoBase64 === 'string' && local.photoBase64.startsWith('data:image/')) {
              payload.photoBase64 = local.photoBase64;
              uploadFields.push('photoBase64');
            }

            if (hasImagesField) {
              if (imagesIsFileField) {
                if (hasBase64Images) {
                  payload[imagesFieldName] = local.images || [];
                  uploadFields.push(imagesFieldName);
                }
              } else {
                payload[imagesFieldName] = JSON.stringify(local.images || []);
              }
            }

            const resRemote = await this.apiRequest(`trees/records/${treeId}`, 'PATCH', payload, uploadFields.length > 0 ? uploadFields : undefined);
            this.addLog('success', `✓ Updated remote tree '${local.name || local.species}'.`);
            if (resRemote && resRemote.updated) {
              return { ...local, updatedAt: resRemote.updated };
            }
            return local;
          } else {
            let parsedAccolades: any[] = [];
            try {
              parsedAccolades = typeof remote.accoladesList === 'string' ? JSON.parse(remote.accoladesList) : (remote.accoladesList || []);
            } catch {}

            let parsedImages: any[] = local.images || [];
            if (hasImagesField && remote[imagesFieldName]) {
              if (imagesIsFileField) {
                const rawImgNames = Array.isArray(remote[imagesFieldName]) ? remote[imagesFieldName] : [];
                parsedImages = await resolveRemoteImages(remote, rawImgNames);
              } else {
                try {
                  parsedImages = typeof remote[imagesFieldName] === 'string' ? JSON.parse(remote[imagesFieldName]) : (remote[imagesFieldName] || []);
                } catch {}
              }
            }

            // Robust Merge: Preserve any local images/base64 strings that might not be in remote yet or had download errors
            const mergedImagesList = Array.isArray(parsedImages) ? [...parsedImages] : [];
            if (local.images && Array.isArray(local.images)) {
              for (const localImg of local.images) {
                if (typeof localImg === 'object' && localImg !== null) {
                  const idx = mergedImagesList.findIndex((p: any) => typeof p === 'object' && p !== null && (p.id === localImg.id || (p.takenAt === localImg.takenAt && p.id && localImg.id && p.id === localImg.id)));
                  if (idx !== -1) {
                    // If resolved remote image is missing base64 or has error, but localImg has base64, restore localImg's base64!
                    if (!mergedImagesList[idx].base64 && localImg.base64) {
                      mergedImagesList[idx] = { ...mergedImagesList[idx], base64: localImg.base64 };
                    }
                  } else {
                    // Local image is not in remote list yet, preserve it!
                    mergedImagesList.push(localImg);
                  }
                }
              }
            }
            parsedImages = mergedImagesList;

            const photoBase64Resolved = await resolveRemotePhoto(remote);

            return {
              id: remote.id,
              userId: remote.userId,
              name: remote.name,
              species: remote.species,
              dateAcquired: remote.dateAcquired,
              approximateAge: remote.approximateAge,
              originDate: remote.originDate,
              style: remote.style,
              status: remote.status,
              notes: remote.notes,
              photoBase64: photoBase64Resolved,
              isDead: remote.isDead,
              lessonLearned: remote.lessonLearned,
              accolades: remote.accolades,
              accoladesList: parsedAccolades,
              images: parsedImages,
              createdAt: remote.created,
              updatedAt: remote.updated,
            };
          }
        }
        return null;
      });

      const chunkResults = await Promise.all(chunkPromises);
      chunkResults.forEach((t) => {
        if (t) finalTrees.push(t);
      });
    }


    // Step 3: Merge Measurements
    onProgress?.('Syncing Measurements...');
    const finalM: Record<string, Measurement[]> = {};
    const localMFlattened = Object.values(localM).flat();
    const remoteMFlattened = Object.values(remoteM).flat();
    const localMMap = new Map(localMFlattened.map(m => [m.id, m]));
    const remoteMMap = new Map(remoteMFlattened.map(m => [m.id, m]));
    const deletedMIds = new Set(this.getDeletedIds('measurements'));
    const allMIds = new Set([...localMMap.keys(), ...remoteMMap.keys(), ...deletedMIds]);
    this.addLog('info', `Reconciling ${allMIds.size} Measurements...`);

    for (const mId of allMIds) {
      const local = localMMap.get(mId);
      const remote = remoteMMap.get(mId);
      const isDeletedLocally = deletedMIds.has(mId);

      if (isDeletedLocally) {
        if (remote) {
          try {
            await this.apiRequest(`measurements/records/${mId}`, 'DELETE');
            this.addLog('success', `✓ Deleted remote measurement '${mId}'.`);
          } catch (err: any) {
            this.addLog('warn', `Failed deleting remote measurement '${mId}': ${err.message}`);
          }
        }
        this.removeDeletedId('measurements', mId);
        continue;
      }

      let chosen: Measurement | null = null;
      if (local && !remote) {
        await this.apiRequest('measurements/records', 'POST', {
          id: local.id,
          userId,
          treeId: local.treeId,
          date: local.date,
          width: local.width,
          notes: local.notes || '',
        });
        chosen = local;
      } else if (!local && remote) {
        chosen = remote;
      } else if (local && remote) {
        if (local.width !== remote.width || local.date !== remote.date || (local.notes || '') !== (remote.notes || '')) {
          await this.apiRequest(`measurements/records/${mId}`, 'PATCH', {
            date: local.date,
            width: local.width,
            notes: local.notes || '',
          });
          this.addLog('success', `✓ Updated remote measurement '${mId}'.`);
        }
        chosen = local;
      }

      if (chosen) {
        if (!finalM[chosen.treeId]) finalM[chosen.treeId] = [];
        finalM[chosen.treeId].push(chosen);
      }
    }

    // Step 4: Merge Care Logs
    onProgress?.('Syncing Care Logs...');
    const finalL: Record<string, CareLog[]> = {};
    const localLFlattened = Object.values(localL).flat();
    const remoteLFlattened = Object.values(remoteL).flat();
    const localLMap = new Map(localLFlattened.map(l => [l.id, l]));
    const remoteLMap = new Map(remoteLFlattened.map(l => [l.id, l]));
    const deletedLIds = new Set(this.getDeletedIds('care_logs'));
    const allLIds = new Set([...localLMap.keys(), ...remoteLMap.keys(), ...deletedLIds]);
    this.addLog('info', `Reconciling ${allLIds.size} Care Logs...`);

    for (const lId of allLIds) {
      const local = localLMap.get(lId);
      const remote = remoteLMap.get(lId);
      const isDeletedLocally = deletedLIds.has(lId);

      if (isDeletedLocally) {
        if (remote) {
          try {
            await this.apiRequest(`care_logs/records/${lId}`, 'DELETE');
            this.addLog('success', `✓ Deleted remote care log '${lId}'.`);
          } catch (err: any) {
            this.addLog('warn', `Failed deleting remote care log '${lId}': ${err.message}`);
          }
        }
        this.removeDeletedId('care_logs', lId);
        continue;
      }

      let chosen: CareLog | null = null;
      if (local && !remote) {
        await this.apiRequest('care_logs/records', 'POST', {
          id: local.id,
          userId,
          treeId: local.treeId,
          type: local.type,
          date: local.date,
          notes: local.notes || '',
        });
        chosen = local;
      } else if (!local && remote) {
        chosen = remote;
      } else if (local && remote) {
        if (local.type !== remote.type || local.date !== remote.date || (local.notes || '') !== (remote.notes || '')) {
          await this.apiRequest(`care_logs/records/${lId}`, 'PATCH', {
            type: local.type,
            date: local.date,
            notes: local.notes || '',
          });
          this.addLog('success', `✓ Updated remote care log '${lId}'.`);
        }
        chosen = local;
      }

      if (chosen) {
        if (!finalL[chosen.treeId]) finalL[chosen.treeId] = [];
        finalL[chosen.treeId].push(chosen);
      }
    }

    // Step 5: Merge Tasks
    onProgress?.('Syncing Care Tasks...');
    const finalT: Record<string, Task[]> = {};
    const localTFlattened = Object.values(localT).flat();
    const remoteTFlattened = Object.values(remoteT).flat();
    const localTMap = new Map(localTFlattened.map(t => [t.id, t]));
    const remoteTMap = new Map(remoteTFlattened.map(t => [t.id, t]));
    const deletedTIds = new Set(this.getDeletedIds('tasks'));
    const allTIds = new Set([...localTMap.keys(), ...remoteTMap.keys(), ...deletedTIds]);
    this.addLog('info', `Reconciling ${allTIds.size} Chores...`);

    for (const tId of allTIds) {
      const local = localTMap.get(tId);
      const remote = remoteTMap.get(tId);
      const isDeletedLocally = deletedTIds.has(tId);

      if (isDeletedLocally) {
        if (remote) {
          try {
            await this.apiRequest(`tasks/records/${tId}`, 'DELETE');
            this.addLog('success', `✓ Deleted remote task '${tId}'.`);
          } catch (err: any) {
            this.addLog('warn', `Failed deleting remote task '${tId}': ${err.message}`);
          }
        }
        this.removeDeletedId('tasks', tId);
        continue;
      }

      let chosen: Task | null = null;
      if (local && !remote) {
        await this.apiRequest('tasks/records', 'POST', {
          id: local.id,
          userId,
          treeId: local.treeId,
          title: local.title,
          type: local.type,
          dueDate: local.dueDate,
          completed: !!local.completed,
          completedAt: local.completedAt || '',
        });
        chosen = local;
      } else if (!local && remote) {
        chosen = remote;
      } else if (local && remote) {
        if (local.completed !== remote.completed ||
            local.title !== remote.title ||
            local.type !== remote.type ||
            local.dueDate !== remote.dueDate) {
          await this.apiRequest(`tasks/records/${tId}`, 'PATCH', {
            title: local.title,
            type: local.type,
            dueDate: local.dueDate,
            completed: local.completed,
            completedAt: local.completedAt || '',
          });
          this.addLog('success', `✓ Updated remote task '${tId}'.`);
        }
        chosen = local;
      }

      if (chosen) {
        if (!finalT[chosen.treeId]) finalT[chosen.treeId] = [];
        finalT[chosen.treeId].push(chosen);
      }
    }

    // Step 6: Merge Care Guides
    onProgress?.('Syncing Care Guides...');
    const finalGuides: CareGuide[] = [];
    const localGuidesMap = new Map((localGuides || []).map(g => [g.id, g]));
    const remoteGuidesMap = new Map((remoteGItems || []).map(g => [g.id, g]));
    const deletedGuideIds = new Set(this.getDeletedIds('care_guides'));
    const allGuideIds = new Set([...localGuidesMap.keys(), ...remoteGuidesMap.keys(), ...deletedGuideIds]);
    this.addLog('info', `Reconciling ${allGuideIds.size} Care Guides...`);

    for (const guideId of allGuideIds) {
      const local = localGuidesMap.get(guideId);
      const remote = remoteGuidesMap.get(guideId);
      const isDeletedLocally = deletedGuideIds.has(guideId);

      if (isDeletedLocally) {
        if (remote) {
          try {
            this.addLog('info', `Deleting remote care guide '${remote.species || guideId}'...`);
            await this.apiRequest(`care_guides/records/${guideId}`, 'DELETE');
            this.addLog('success', `✓ Deleted remote care guide '${remote.species || guideId}'.`);
          } catch (err: any) {
            this.addLog('warn', `Failed deleting remote care guide '${guideId}': ${err.message}`);
          }
        }
        this.removeDeletedId('care_guides', guideId);
        continue;
      }

      if (local && !remote) {
        this.addLog('info', `Uploading care guide '${local.species}' to PocketBase...`);
        await this.apiRequest('care_guides/records', 'POST', {
          id: local.id,
          species: local.species,
          scientificName: local.scientificName,
          difficulty: local.difficulty,
          placement: local.placement,
          watering: local.watering,
          fertilizing: local.fertilizing || '',
          pruning: local.pruning,
          repotting: local.repotting,
          summary: local.summary,
          seasonCare: JSON.stringify(local.seasonCare || {}),
        });
        this.addLog('success', `✓ Care guide '${local.species}' created on PocketBase.`);
        finalGuides.push(local);
      } else if (!local && remote) {
        let parsedSeasonCare = { spring: '', summer: '', autumn: '', winter: '' };
        try {
          parsedSeasonCare = typeof remote.seasonCare === 'string' ? JSON.parse(remote.seasonCare) : (remote.seasonCare || parsedSeasonCare);
        } catch {}

        finalGuides.push({
          id: remote.id,
          species: remote.species,
          scientificName: remote.scientificName,
          difficulty: remote.difficulty,
          placement: remote.placement,
          watering: remote.watering,
          fertilizing: remote.fertilizing || '',
          pruning: remote.pruning,
          repotting: remote.repotting,
          summary: remote.summary,
          seasonCare: parsedSeasonCare,
        });
        this.addLog('info', `Imported remote care guide '${remote.species}' locally.`);
      } else if (local && remote) {
        const payload = {
          species: local.species,
          scientificName: local.scientificName,
          difficulty: local.difficulty,
          placement: local.placement,
          watering: local.watering,
          fertilizing: local.fertilizing || '',
          pruning: local.pruning,
          repotting: local.repotting,
          summary: local.summary,
          seasonCare: JSON.stringify(local.seasonCare || {}),
        };
        
        let needsUpdate = false;
        if (remote.species !== local.species || 
            remote.scientificName !== local.scientificName ||
            remote.difficulty !== local.difficulty ||
            remote.placement !== local.placement ||
            remote.watering !== local.watering ||
            remote.fertilizing !== local.fertilizing ||
            remote.pruning !== local.pruning ||
            remote.repotting !== local.repotting ||
            remote.summary !== local.summary) {
          needsUpdate = true;
        }

        if (needsUpdate) {
          this.addLog('info', `Updating remote care guide '${local.species}'...`);
          await this.apiRequest(`care_guides/records/${guideId}`, 'PATCH', payload);
          this.addLog('success', `✓ Updated remote care guide '${local.species}'.`);
        }
        finalGuides.push(local);
      }
    }

    this.addLog('success', '✓ PocketBase sync completed successfully!', `Data is convergent on ${this.getUrl()}`);
    onProgress?.('Sync completed successfully!');
    return {
      trees: finalTrees,
      measurements: finalM,
      careLogs: finalL,
      tasks: finalT,
      careGuides: finalGuides,
      updatedAt: getIsoNow(),
    };
  }

  /**
   * Delete all remote items on PocketBase to allow a clean wipe.
   */
  public static async purgeAllRemoteData(): Promise<void> {
    if (!this.isEnabled()) return;
    this.addLog('info', 'Purging all remote collections on PocketBase...');
    
    // 1. Purge Measurements
    try {
      this.addLog('info', 'Fetching remote measurements to delete...');
      const mRes = await this.apiRequest('measurements/records?perPage=500', 'GET');
      const items = mRes.items || [];
      for (const m of items) {
        await this.apiRequest(`measurements/records/${m.id}`, 'DELETE');
      }
      this.addLog('success', `✓ Purged ${items.length} remote measurements.`);
    } catch (e: any) {
      console.warn('Failed to purge measurements from PocketBase:', e);
      this.addLog('warn', `⚠️ Failed to purge measurements: ${e.message}`);
    }

    // 2. Purge Care Logs
    try {
      this.addLog('info', 'Fetching remote care logs to delete...');
      const lRes = await this.apiRequest('care_logs/records?perPage=500', 'GET');
      const items = lRes.items || [];
      for (const l of items) {
        await this.apiRequest(`care_logs/records/${l.id}`, 'DELETE');
      }
      this.addLog('success', `✓ Purged ${items.length} remote care logs.`);
    } catch (e: any) {
      console.warn('Failed to purge care logs from PocketBase:', e);
      this.addLog('warn', `⚠️ Failed to purge care logs: ${e.message}`);
    }

    // 3. Purge Tasks
    try {
      this.addLog('info', 'Fetching remote tasks to delete...');
      const tRes = await this.apiRequest('tasks/records?perPage=500', 'GET');
      const items = tRes.items || [];
      for (const t of items) {
        await this.apiRequest(`tasks/records/${t.id}`, 'DELETE');
      }
      this.addLog('success', `✓ Purged ${items.length} remote tasks.`);
    } catch (e: any) {
      console.warn('Failed to purge tasks from PocketBase:', e);
      this.addLog('warn', `⚠️ Failed to purge tasks: ${e.message}`);
    }

    // 4. Purge Custom Care Guides
    try {
      this.addLog('info', 'Fetching remote care guides to delete...');
      const gRes = await this.apiRequest('care_guides/records?perPage=500', 'GET');
      const items = gRes.items || [];
      for (const g of items) {
        await this.apiRequest(`care_guides/records/${g.id}`, 'DELETE');
      }
      this.addLog('success', `✓ Purged ${items.length} remote care guides.`);
    } catch (e: any) {
      console.warn('Failed to purge care guides from PocketBase:', e);
      this.addLog('warn', `⚠️ Failed to purge care guides: ${e.message}`);
    }

    // 5. Purge Trees
    try {
      this.addLog('info', 'Fetching remote trees to delete...');
      const treesRes = await this.apiRequest('trees/records?perPage=500', 'GET');
      const items = treesRes.items || [];
      for (const t of items) {
        await this.apiRequest(`trees/records/${t.id}`, 'DELETE');
      }
      this.addLog('success', `✓ Purged ${items.length} remote trees.`);
    } catch (e: any) {
      console.warn('Failed to purge trees from PocketBase:', e);
      this.addLog('warn', `⚠️ Failed to purge trees: ${e.message}`);
    }
    
    this.addLog('success', '✓ All remote collections on PocketBase purged.');
  }
}
