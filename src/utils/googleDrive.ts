export interface GoogleDriveBonsaiData {
  trees: any[];
  measurements: Record<string, any[]>;
  careLogs: Record<string, any[]>;
  tasks: Record<string, any[]>;
  updatedAt: string;
}

export interface GoogleOneDriveQuota {
  limit: number;
  usage: number;
  limitFormatted: string;
  usageFormatted: string;
  percentUsed: number;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getErrorFromResponse(res: Response, defaultMessage: string): Promise<string> {
  let details = '';
  try {
    const errorJson = await res.json();
    if (errorJson && errorJson.error) {
      details = `${errorJson.error.code || res.status}: ${errorJson.error.message || JSON.stringify(errorJson.error)}`;
    } else {
      details = JSON.stringify(errorJson);
    }
  } catch (err) {
    details = `HTTP ${res.status} ${res.statusText || ''}`.trim();
  }
  return `${defaultMessage}${details ? ` -> ${details}` : ''}`;
}

/**
 * Fetch storage space parameters from Google One (Drive Limit & Usage)
 */
export async function getGoogleDriveQuota(token: string): Promise<GoogleOneDriveQuota | null> {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const errMsg = await getErrorFromResponse(res, 'Failed to fetch quota: ');
      throw new Error(errMsg);
    }
    const data = await res.json();
    if (data.storageQuota) {
      const limit = parseInt(data.storageQuota.limit || '0', 10);
      const usage = parseInt(data.storageQuota.usage || '0', 10);
      return {
        limit,
        usage,
        limitFormatted: formatBytes(limit),
        usageFormatted: formatBytes(usage),
        percentUsed: limit > 0 ? parseFloat(((usage / limit) * 100).toFixed(2)) : 0
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching Drive quota:', error);
    return null;
  }
}

/**
 * Searches for 'bonsai_garden_data.json' in user's Drive. If not found, creates it.
 */
export async function findOrCreateBonsaiFile(token: string, initialData: GoogleDriveBonsaiData): Promise<{ fileId: string; data: GoogleDriveBonsaiData }> {
  try {
    // 1. Search for existing file
    const searchUrl = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent("name = 'bonsai_garden_data.json' and trashed = false");
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!searchRes.ok) {
      const errMsg = await getErrorFromResponse(searchRes, 'Search failed: ');
      throw new Error(errMsg);
    }
    const searchResult = await searchRes.json();
    const file = searchResult.files?.[0];

    if (file) {
      // 2. Fetch its content
      const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (contentRes.ok) {
        const fileData = await contentRes.json();
        // Fallbacks for any missing attributes
        return { 
          fileId: file.id, 
          data: {
            trees: fileData.trees || [],
            measurements: fileData.measurements || {},
            careLogs: fileData.careLogs || {},
            tasks: fileData.tasks || {},
            updatedAt: fileData.updatedAt || new Date().toISOString()
          } 
        };
      } else {
        const errMsg = await getErrorFromResponse(contentRes, 'Fetch file content failed: ');
        console.warn(errMsg);
      }
    }

    // 3. Create a new file with initialData
    const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'bonsai_garden_data.json',
        mimeType: 'application/json',
        description: 'Bonsai Care Horticulture Tracker Data File (Google One Storage)'
      })
    });
    if (!metaRes.ok) {
      const errMsg = await getErrorFromResponse(metaRes, 'Failed to create file metadata: ');
      throw new Error(errMsg);
    }
    const metaData = await metaRes.json();
    const newFileId = metaData.id;

    // 4. Update its content with initialData
    const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${newFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(initialData)
    });
    if (!uploadRes.ok) {
      const errMsg = await getErrorFromResponse(uploadRes, 'Failed to upload file content: ');
      throw new Error(errMsg);
    }

    return { fileId: newFileId, data: initialData };
  } catch (error) {
    console.error('Error finding or creating file in Drive:', error);
    throw error;
  }
}

/**
 * Saves current data to the specific fileId in Google Drive
 */
export async function updateBonsaiFileInDrive(token: string, fileId: string, data: Omit<GoogleDriveBonsaiData, 'updatedAt'>): Promise<boolean> {
  try {
    const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...data, updatedAt: new Date().toISOString() })
    });
    if (!uploadRes.ok) {
      const errMsg = await getErrorFromResponse(uploadRes, 'PATCH upload failed: ');
      throw new Error(errMsg);
    }
    return true;
  } catch (error) {
    console.error('Error updating drive data file:', error);
    return false;
  }
}
