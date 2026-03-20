require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cache = require('./cache');
const animepahe = require('./scrapers/animepahe');
const gogoanime = require('./scrapers/gogoanime');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`, req.query);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', cache: cache.stats() });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'Anime Scraper API (Node.js)',
    version: '1.0.0',
    endpoints: {
      'GET /search?q=naruto&source=auto': 'Search (source: animepahe|gogoanime|auto)',
      'GET /search/animepahe?q=naruto': 'Search Animepahe',
      'GET /search/gogo?q=naruto': 'Search Gogoanime',
      'GET /episodes/animepahe/:session': 'Episodes from Animepahe',
      'GET /episodes/gogo/:animeId': 'Episodes from Gogoanime',
      'GET /stream/animepahe/:animeSession/:episodeSession': 'Streams from Animepahe',
      'GET /stream/gogo?id=:episodeId': 'Streams from Gogoanime',
    },
  });
});

app.get('/search', async (req, res) => {
  const { q, source = 'auto' } = req.query;
  if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters.' });

  try {
    if (source === 'animepahe') {
      const results = await animepahe.search(q);
      return res.json({ query: q, source: 'animepahe', count: results.length, results });
    }
    if (source === 'gogoanime') {
      const results = await gogoanime.search(q);
      return res.json({ query: q, source: 'gogoanime', count: results.length, results });
    }

    let results = [];
    let usedSource = 'animepahe';
    try {
      results = await animepahe.search(q);
    } catch (err) {
      console.warn('Animepahe search failed, falling back:', err.message);
    }
    if (!results.length) {
      results = await gogoanime.search(q);
      usedSource = 'gogoanime';
    }
    res.json({ query: q, source: usedSource, count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: 'Search failed.', details: err.message });
  }
});

app.get('/search/animepahe', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required.' });
  try {
    const results = await animepahe.search(q);
    res.json({ query: q, source: 'animepahe', count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/search/gogo', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required.' });
  try {
    const results = await gogoanime.search(q);
    res.json({ query: q, source: 'gogoanime', count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/episodes/animepahe/:session', async (req, res) => {
  try {
    const data = await animepahe.getAllEpisodes(req.params.session);
    res.json({ session: req.params.session, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/episodes/gogo/:animeId', async (req, res) => {
  try {
    const data = await gogoanime.getEpisodes(req.params.animeId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/stream/animepahe/:animeSession/:episodeSession', async (req, res) => {
  try {
    const data = await animepahe.getStreamingSources(req.params.animeSession, req.params.episodeSession);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/stream/gogo', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Episode ID required as ?id=...' });
  try {
    const data = await gogoanime.getStreamingSources(id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/info/gogo/:animeId', async (req, res) => {
  try {
    const data = await gogoanime.getInfo(req.params.animeId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`Anime Scraper API running on port ${PORT}`));

module.exports = app;
