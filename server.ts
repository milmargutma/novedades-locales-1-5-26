import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Set up file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, uuidv4() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});
const upload = multer({ storage });
app.use('/uploads', express.static(uploadDir));

// JSON Database Setup
const dbFile = path.join(process.cwd(), 'database.json');
if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, JSON.stringify([]));
}

const getNews = () => JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const saveNews = (data: any) => fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));

// API Routes
app.get('/api/news', (req, res) => {
  res.json(getNews());
});

app.post('/api/news', (req, res) => {
  const news = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
  const allNews = getNews();
  allNews.push(news);
  saveNews(allNews);
  res.status(201).json(news);
});

app.put('/api/news/:id', (req, res) => {
  const allNews = getNews();
  const index = allNews.findIndex((n: any) => n.id === req.params.id);
  if (index !== -1) {
    allNews[index] = { ...allNews[index], ...req.body, id: req.params.id };
    saveNews(allNews);
    res.json(allNews[index]);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

app.delete('/api/news/:id', (req, res) => {
  let allNews = getNews();
  allNews = allNews.filter((n: any) => n.id !== req.params.id);
  saveNews(allNews);
  res.status(204).send();
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, name: req.file.originalname });
});

// Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
