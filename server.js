import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'deals.json');

// CORS Configuration - Allow frontend and extension
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://asin-watcher-frontend.mathias2413.workers.dev',
    'https://asin-watcher-frontendt2.mathias2413.workers.dev',
    /^chrome-extension:\/\//
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Ensure data directory exists
async function ensureDataDirectory() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Read deals from file
async function readDeals() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Write deals to file
async function writeDeals(deals) {
  await fs.writeFile(DATA_FILE, JSON.stringify(deals, null, 2));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    message: 'ASIN Watcher API is running'
  });
});

// Get all deals
app.get('/api/deals', async (req, res) => {
  try {
    const deals = await readDeals();
    res.json({ deals });
  } catch (error) {
    console.error('Error reading deals:', error);
    res.status(500).json({ error: 'Failed to read deals' });
  }
});

// Ingest/update a single deal
app.post('/api/ingest', async (req, res) => {
  try {
    const { asin, title, price, code, discount, imageUrl, affiliateLink } = req.body;
    
    if (!asin) {
      return res.status(400).json({ error: 'ASIN is required' });
    }
    
    const deals = await readDeals();
    const existingIndex = deals.findIndex(d => d.asin === asin);
    
    // Merge new data with existing data
    const mergedDeal = {
      asin,
      title: title || (existingIndex > -1 ? deals[existingIndex].title : undefined),
      price: price || (existingIndex > -1 ? deals[existingIndex].price : undefined),
      code: code || (existingIndex > -1 ? deals[existingIndex].code : undefined),
      discount: discount || (existingIndex > -1 ? deals[existingIndex].discount : undefined),
      imageUrl: imageUrl || (existingIndex > -1 ? deals[existingIndex].imageUrl : `https://picsum.photos/seed/${asin}/400/400`),
      affiliateLink: affiliateLink || (existingIndex > -1 ? deals[existingIndex].affiliateLink : undefined),
      lastUpdated: Date.now(),
      status: 'Incomplete'
    };
    
    // Determine if deal is ready
    if (mergedDeal.title && mergedDeal.price && (mergedDeal.code || mergedDeal.discount)) {
      mergedDeal.status = 'Ready';
    }
    
    // Update or add deal
    if (existingIndex > -1) {
      deals[existingIndex] = mergedDeal;
    } else {
      deals.unshift(mergedDeal);
    }
    
    await writeDeals(deals);
    
    res.json({ 
      success: true, 
      deal: mergedDeal,
      message: `Deal ${asin} ${existingIndex > -1 ? 'updated' : 'added'}`
    });
  } catch (error) {
    console.error('Error ingesting deal:', error);
    res.status(500).json({ error: 'Failed to ingest deal' });
  }
});

// Update all deals
app.post('/api/deals', async (req, res) => {
  try {
    const { deals } = req.body;
    
    if (!Array.isArray(deals)) {
      return res.status(400).json({ error: 'Deals must be an array' });
    }
    
    await writeDeals(deals);
    res.json({ success: true, count: deals.length });
  } catch (error) {
    console.error('Error updating deals:', error);
    res.status(500).json({ error: 'Failed to update deals' });
  }
});

// Clear all deals
app.delete('/api/deals', async (req, res) => {
  try {
    await writeDeals([]);
    res.json({ success: true, message: 'All deals cleared' });
  } catch (error) {
    console.error('Error clearing deals:', error);
    res.status(500).json({ error: 'Failed to clear deals' });
  }
});

// Start server
async function start() {
  await ensureDataDirectory();
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   ASIN Watcher API Server Running     ║
╠════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(32)}  ║
║  Health: http://localhost:${PORT}/api/health  ║
╚════════════════════════════════════════╝
    `);
  });
}

start().catch(console.error);
