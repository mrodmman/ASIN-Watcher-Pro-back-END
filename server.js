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

app.use(cors());
app.use(express.json());

async function ensureDataDirectory() {
  const dataDir = path.join(__dirname, 'data');
  try { await fs.access(dataDir); } 
  catch { await fs.mkdir(dataDir, { recursive: true }); }
}

async function readDeals() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, 'utf-8')); } 
  catch { return []; }
}

async function writeDeals(deals) {
  await fs.writeFile(DATA_FILE, JSON.stringify(deals, null, 2));
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

app.get('/api/deals', async (req, res) => {
  try { res.json({ deals: await readDeals() }); } 
  catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/ingest', async (req, res) => {
  try {
    const { asin, title, price, code, discount } = req.body;
    if (!asin) return res.status(400).json({ error: 'ASIN required' });
    
    const deals = await readDeals();
    const idx = deals.findIndex(d => d.asin === asin);
    
    const merged = {
      asin, 
      title: title || deals[idx]?.title,
      price: price || deals[idx]?.price,
      code: code || deals[idx]?.code,
      discount: discount || deals[idx]?.discount,
      lastUpdated: Date.now(),
      imageUrl: `https://picsum.photos/seed/${asin}/400/400`,
      status: 'Incomplete'
    };
    
    if (merged.title && merged.price && (merged.code || merged.discount)) merged.status = 'Ready';
    
    idx > -1 ? deals[idx] = merged : deals.unshift(merged);
    await writeDeals(deals);
    res.json({ success: true, deal: merged });
  } catch (error) {
    res.status(500).json({ error: 'Failed to ingest' });
  }
});

app.post('/api/deals', async (req, res) => {
  try { await writeDeals(req.body.deals); res.json({ success: true }); } 
  catch { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/deals', async (req, res) => {
  try { await writeDeals([]); res.json({ success: true }); } 
  catch { res.status(500).json({ error: 'Failed' }); }
});

async function start() {
  await ensureDataDirectory();
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
}

start();