import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Increase limits to comfortably handle custom compressed photo uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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

// Gemini Diagnostic Consult Endpoint
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const { species, style, status, notes, age, dateAcquired, imageBase64 } = req.body;
    
    const ai = getGeminiClient();
    
    const prompt = `You are an expert Bonsai master with decades of horticulture experience. 
You are diagnosing a tree in a user's collection. Below are its details:
- Member Name / Species: ${species || 'Unknown'}
- Bonsai Style: ${style || 'Not declared'}
- Current Declared Status: ${status || 'Healthy'}
- Age: ${age ? `${age} years old` : 'Not specified'}
- Date Acquired: ${dateAcquired || 'Not specified'}
- User's care notes & symptoms: ${notes || 'No symptoms reported.'}

Please provide a highly professional, compassionate, and specific Bonsai Master Diagnosis. Keep it structured and easy to read.
Format your response using Markdown:
1. **Diagnosis & Status Assessment**: Assess its general health status.
2. **Watering & Placement Guidance**: Give precise, customized instructions based on the species and style.
3. **Pruning & Styling Tips**: Describe how to manage growth or guide the styling.
4. **Actionable Care Schedule**: Provide a practical 2-3 step list of what the user can do right now.

Be supportive, using humble language fitting for a traditional Zen bonsai master. Keep the length concise (around 200 words).`;

    const contentParts: any[] = [];
    if (imageBase64) {
      let mimeType = 'image/jpeg';
      let cleanBase64 = imageBase64;
      
      const matches = imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        cleanBase64 = matches[2];
      }
      
      contentParts.push({
        inlineData: {
          mimeType: mimeType,
          data: cleanBase64,
        },
      });
    }
    
    contentParts.push({ text: prompt });
    
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: { parts: contentParts },
    });
    
    res.json({ analysis: response.text });
  } catch (error) {
    console.error('Gemini diagnostic route failed:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to consult Gemini AI.' });
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
