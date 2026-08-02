import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Bypass self-signed SSL/TLS verification issues for home-hosted PocketBase servers
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = 3000;

// Increase limits to comfortably handle custom compressed photo uploads
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ limit: '150mb', extended: true }));

// Lazy init the Gemini client so it does not crash during startup if keys are missing
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is required to run AI diagnostics.');
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

// API Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

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

// Proxy endpoint to bypass browser Mixed Content/CORS restrictions for home PocketBase servers
app.post('/api/pb-proxy', async (req, res) => {
  try {
    const { targetUrl, method = 'GET', headers = {}, body, uploadBase64FieldsAsFiles } = req.body;

    console.log('[Proxy Debug] Received request:', {
      targetUrl,
      method,
      hasBody: !!body,
      uploadFields: uploadBase64FieldsAsFiles
    });

    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing targetUrl parameter' });
    }

    // Only allow proxying to PocketBase api or admin auth endpoints for safety
    if (!targetUrl.includes('/api/')) {
      return res.status(400).json({ error: 'Invalid target URL' });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        ...headers,
        'Accept': 'application/json',
      },
    };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
      // Auto-detect and force photoBase64 as native file upload if it's sent to the trees collection
      let fieldsToUpload: string[] = Array.isArray(uploadBase64FieldsAsFiles) ? [...uploadBase64FieldsAsFiles] : [];
      
      const imagesKey = body.images ? 'images' : (body.Images ? 'Images' : null);
      let hasBase64Images = false;
      if (imagesKey) {
        let imgs: any[] = [];
        try {
          imgs = typeof body[imagesKey] === 'string' ? JSON.parse(body[imagesKey]) : (Array.isArray(body[imagesKey]) ? body[imagesKey] : []);
        } catch {}
        hasBase64Images = imgs.some((img: any) => img && typeof img === 'object' && img.base64 && img.base64.startsWith('data:image/'));
      }

      if (typeof body.photoBase64 === 'string' && body.photoBase64.startsWith('data:') && !fieldsToUpload.includes('photoBase64')) {
        fieldsToUpload.push('photoBase64');
      }
      if (hasBase64Images && imagesKey && !fieldsToUpload.includes(imagesKey)) {
        fieldsToUpload.push(imagesKey);
      }

      Object.keys(body).forEach(k => {
        const val = body[k];
        if (typeof val === 'string' && val.startsWith('data:') && !fieldsToUpload.includes(k)) {
          fieldsToUpload.push(k);
        }
      });

      if (Array.isArray(fieldsToUpload) && fieldsToUpload.length > 0) {
        console.log('[Proxy Debug] Attempting native file upload mapping for fields:', fieldsToUpload);
        // Create form-data for native PocketBase file upload support
        const formData = new FormData();
        
        Object.keys(body).forEach((key) => {
          const value = body[key];
          const isFileField = fieldsToUpload.includes(key) || key === 'photoBase64' || key === 'images' || key === 'Images';

          if (isFileField) {
            if (key === 'images' || key === 'Images') {
              let imagesArray: any[] = [];
              try {
                imagesArray = typeof value === 'string' ? JSON.parse(value) : (Array.isArray(value) ? value : []);
              } catch {}
              
              if (imagesArray.length > 250) {
                console.warn(`[Proxy Warning] Tree has ${imagesArray.length} images, exceeding PocketBase's limit of 250. Slicing to the first 250.`);
              }
              
              imagesArray.slice(0, 250).forEach((img: any) => {
                if (typeof img === 'object' && img !== null && img.base64 && typeof img.base64 === 'string' && img.base64.startsWith('data:image/')) {
                  const parsed = parseBase64DataUrl(img.base64);
                  if (parsed) {
                    const buffer = Buffer.from(parsed.base64Data, 'base64');
                    let ext = parsed.mimeType.split('/')[1] || 'jpg';
                    if (ext === 'jpeg') ext = 'jpg';
                    
                    const meta = {
                      id: img.id,
                      takenAt: img.takenAt || '',
                      isStarred: !!img.isStarred,
                      cameraModel: img.cameraModel || '',
                      location: img.location || ''
                    };
                    const metaStr = Buffer.from(JSON.stringify(meta)).toString('base64');
                    const safeMetaStr = metaStr.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                    const filename = `photo_${safeMetaStr}.${ext}`;
                    
                    const blob = new Blob([buffer], { type: parsed.mimeType });
                    formData.append(key, blob, filename);
                    console.log(`[Proxy Debug] Appended images file field item as binary file ${filename}`);
                  }
                }
              });
              return;
            }

            if (typeof value === 'string' && value.startsWith('data:')) {
              const parsed = parseBase64DataUrl(value);
              console.log(`[Proxy Debug] Found base64 field match for: ${key}. Parsed result:`, parsed ? 'Success' : 'Failed');
              if (parsed) {
                const buffer = Buffer.from(parsed.base64Data, 'base64');
                let ext = parsed.mimeType.split('/')[1] || 'jpg';
                if (ext === 'jpeg') ext = 'jpg';
                const filename = `photo_${Date.now()}.${ext}`;
                const blob = new Blob([buffer], { type: parsed.mimeType });
                formData.append(key, blob, filename);
                console.log(`[Proxy Debug] Appended file field: ${key} as binary file ${filename}`);
                return;
              }
            }

            if (typeof value === 'string' && value.trim().length > 0 && !value.startsWith('data:')) {
              formData.append(key, value);
              return;
            }

            // Skip non-data-URL string values for file fields to prevent PocketBase "Invalid new files" error
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
        
        fetchOptions.body = formData as any;
        
        // CRITICAL: Explicitly remove Content-Type and content-type headers so fetch can set the correct boundary for multipart/form-data!
        if (fetchOptions.headers) {
          delete (fetchOptions.headers as any)['Content-Type'];
          delete (fetchOptions.headers as any)['content-type'];
        }
      } else {
        fetchOptions.headers = {
          ...fetchOptions.headers,
          'Content-Type': 'application/json',
        };
        fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : body;
      }
    }

    const response = await fetch(targetUrl, fetchOptions);

    let responseData: any;
    const contentType = response.headers.get('content-type') || '';
    const isImage = contentType.startsWith('image/') || targetUrl.includes('/api/files/');

    if (isImage) {
      console.log(`[Proxy Debug] Processing image/file download: ${targetUrl} (${contentType})`);
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      responseData = `data:${contentType || 'image/jpeg'};base64,${base64}`;
    } else if (contentType.includes('application/json')) {
      responseData = await response.json().catch(() => ({}));
    } else {
      responseData = await response.text().catch(() => '');
    }

    // We always return HTTP 200 to the browser if we successfully performed the fetch to the target.
    // This allows the client-side proxiedFetch wrapper to unpack the real response code and body
    // without triggering unhandled browser error catchers.
    res.status(200).json({
      ok: response.ok,
      status: response.status,
      headers: {
        'content-type': contentType,
      },
      data: responseData,
    });
  } catch (error) {
    console.error('PocketBase proxy route failed:', error);
    res.status(500).json({ 
      error: 'Proxy request failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Gemini Diagnostic Consult Endpoint
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const { 
      name, 
      species, 
      style, 
      status, 
      age, 
      dateAcquired, 
      notes, 
      photos = [], 
      measurements = [], 
      careLogs = [],
      imageBase64,
      careGuide
    } = req.body;
    
    const ai = getGeminiClient();
    
    let historyText = '';
    
    if (measurements && measurements.length > 0) {
      historyText += '\nTrunk Growth History (measurements in cm):\n';
      measurements.forEach((m: any) => {
        historyText += `- ${m.date}: ${m.width} cm${m.notes ? ` (${m.notes})` : ''}\n`;
      });
    }
    
    if (careLogs && careLogs.length > 0) {
      historyText += '\nMaintenance & Care Records (Updates):\n';
      careLogs.forEach((l: any) => {
        historyText += `- ${l.date}: ${l.notes}\n`;
      });
    }

    if (photos && photos.length > 0) {
      historyText += '\nPhoto Logs Timeline:\n';
      photos.forEach((p: any, idx: number) => {
        historyText += `- Photo ${idx + 1} taken on ${p.takenAt}${p.cameraModel ? ` with ${p.cameraModel}` : ''}${p.isMostRecent ? ' (THIS IS THE MOST RECENT PICTURE)' : ''}\n`;
      });
    }

    let guidePromptText = '';
    if (careGuide) {
      guidePromptText = `
INTEGRATED SPECIES CARE GUIDE REFERENCE:
The user has attached their customized care guide manual for this species (${careGuide.species} / Scientific name: ${careGuide.scientificName || 'Unknown'}):
- Summary Overview: ${careGuide.summary}
- Placement & Lighting: ${careGuide.placement}
- Watering Protocol Requirements: ${careGuide.watering}
- Fertilizing Requirements: ${careGuide.fertilizing || 'Not specific'}
- Pruning/Wiring/Styling Guidelines: ${careGuide.pruning}
- Repotting Guidelines: ${careGuide.repotting}
- Specific Seasonal Care Breakdown:
  * Spring: ${careGuide.seasonCare?.spring || 'No specific guidance'}
  * Summer: ${careGuide.seasonCare?.summer || 'No specific guidance'}
  * Autumn: ${careGuide.seasonCare?.autumn || 'No specific guidance'}
  * Winter: ${careGuide.seasonCare?.winter || 'No specific guidance'}

CRITICAL METRIC FOR SUCCESS: Your analysis MUST heavily prioritize and align with the guidelines stated in the Integrated Species Care Guide above. Integrate its specifications closely with your recommendations to provide smart, tailored, localized advice.`;
    }

    const prompt = `You are an expert, professional horticulturalist and professional AI Bonsai Consultant. 
Analyze the bonsai specimen detail, complete photo timeline, growth records, and updates/logs list to give helpful advice on what should be done with this tree over the next year.

Tree Details:
- Name: ${name || 'Unnamed Specimen'}
- Species: ${species || 'Unknown'}
- Style: ${style || 'Not declared'}
- Declared Status: ${status || 'Healthy'}
- Age: ${age ? `${age} years old` : 'Not specified'}
- Date Acquired: ${dateAcquired || 'Not specified'}
- Notes: ${notes || 'None'}
${historyText}
${guidePromptText}

Format your response using clean Markdown. Provide specific horticulturally sound, clear advice:
1. **Current Assessment**: Review and assess the overall health, growth change (trunk width difference), and status based on the notes, measurements, and recent pictures.
2. **Upcoming Care Advice (Next 12 Months)**: Give a clear, step-by-step roadmap on watering, feeding, repotting, wiring, or styling that should be done over the next year. Specify what season or timing applies for each action.
3. **Actionable Care Checklist**: A concise 2-3 item list of high-priority tasks the user should focus on right now.

Maintain a professional, objective, encouraging yet strictly factual tone. Do NOT use fake spiritual, Zen, or Master tropes. Keep it clear, practical, and highly specific to the tree species and growth stage. Address the timing of the next year explicitly.`;

    const contentParts: any[] = [];
    
    // Add any images we want the AI to review, starting with the most recent, clearly labeled with the date/context in text parts.
    if (photos && Array.isArray(photos) && photos.length > 0) {
      // Find photos with base64 data
      const photosWithData = photos.filter(p => p.imageBase64);
      
      photosWithData.forEach((p) => {
        let mimeType = 'image/jpeg';
        let cleanBase64 = p.imageBase64;
        
        const parsed = parseBase64DataUrl(p.imageBase64);
        if (parsed) {
          mimeType = parsed.mimeType;
          cleanBase64 = parsed.base64Data;
        }
        
        // Push a descriptive text part preceding the image to orient the AI on which picture they are looking at
        contentParts.push({
          text: `[IMAGE DATA: Photo representation taken on ${p.takenAt}.${p.isMostRecent ? ' THIS IS THE CURRENT MOST RECENT VISUAL STATE OF THE TREE.' : ''}]`
        });
        
        contentParts.push({
          inlineData: {
            mimeType: mimeType,
            data: cleanBase64,
          },
        });
      });
    } else if (imageBase64) {
      // Fallback for legacy format
      let mimeType = 'image/jpeg';
      let cleanBase64 = imageBase64;
      
      const parsed = parseBase64DataUrl(imageBase64);
      if (parsed) {
        mimeType = parsed.mimeType;
        cleanBase64 = parsed.base64Data;
      }
      
      contentParts.push({
        inlineData: {
          mimeType: mimeType,
          data: cleanBase64,
        },
      });
    }
    
    // Push the core prompt text
    contentParts.push({ text: prompt });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: contentParts },
    });
    
    res.json({ analysis: response.text });
  } catch (error) {
    console.error('Gemini diagnostic route failed:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to consult Gemini AI.' });
  }
});

// Care Guide AI Generator Endpoint with Confidence Verification
app.post('/api/gemini/generate-care-guide', async (req, res) => {
  try {
    const { speciesName } = req.body;
    if (!speciesName || typeof speciesName !== 'string' || !speciesName.trim()) {
      return res.status(400).json({ error: 'Species name is required.' });
    }

    const ai = getGeminiClient();

    const prompt = `You are a professional botanical and bonsai species care guide expert.
Evaluate the following plant or species name provided by the user: "${speciesName.trim()}".

First, assess your confidence level in recognizing this specific plant/tree species and providing accurate horticultural care guidelines for it as a bonsai.
- "High": The species name clearly identifies a recognized plant or bonsai species (e.g. "Japanese Black Pine", "Ficus retusa", "Trident Maple", "Juniperus procumbens", "Jade Plant", "Acer palmatum", etc.).
- "Medium": The name is somewhat generic or ambiguous (e.g. "Pine", "Maple", "Ficus", "Potted Evergreen"), where general advice exists but specific cultivar details are missing.
- "Low": The input is vague, gibberish, non-existent, or unrelated to plants (e.g. "asdf", "my plant", "tree", "unknown", "green thing", "123").

Only if your confidence level is strictly "High", generate a complete, accurate, professional bonsai care guide.
If confidence is "Low" or "Medium", set canGenerate to false and leave data null.

Respond EXCLUSIVELY with a JSON object (no markdown codeblock markers) following this schema:
{
  "confidence": "Low" | "Medium" | "High",
  "confidenceReason": "Short explanation of the confidence level assessment",
  "canGenerate": true or false,
  "data": {
    "species": "Common Name",
    "scientificName": "Latin scientific botanical name",
    "difficulty": "Beginner" | "Intermediate" | "Advanced",
    "summary": "Brief 1-2 sentence overview introducing the species and its general bonsai characteristics.",
    "placement": "Specific light, sun, air, and indoor/outdoor placement instructions.",
    "watering": "Detailed watering rules, moisture checks, and soil drying tolerance.",
    "pruning": "Pruning, trimming, wiring, and styling strategies.",
    "repotting": "Repotting frequency, best timing, and substrate/soil mixture recommendations.",
    "seasonCare": {
      "spring": "Spring care guidelines (e.g. bud break, fertilizing, frost protection).",
      "summer": "Summer care guidelines (e.g. high heat watering, afternoon shade).",
      "autumn": "Autumn care guidelines (e.g. hardening off, reduction of nitrogen).",
      "winter": "Winter care guidelines (e.g. dormancy, root freeze protection)."
    }
  }
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
    });

    const rawText = response.text || '';
    const jsonText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonText);

    res.json(result);
  } catch (error) {
    console.error('Care guide generation failed:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate care guide.' });
  }
});

// Vite middleware integration
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

setupVite();
