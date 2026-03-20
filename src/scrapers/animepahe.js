const { getPage } = require('../browser');
const cache = require('../cache');

const BASE = process.env.ANIMEPAHE_URL || 'https://animepahe.ru';

async function search(query) {
  const key = `animepahe:search:${query.toLowerCase().trim()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const page = await getPage();
  try {
    const url = `${BASE}/api?m=search&q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const text = await page.evaluate(() => document.body.innerText);
    const data = JSON.parse(text);

    const results = (data.data || []).map((item) => ({
      id: item.id,
      session: item.session,
      title: item.title,
      type: item.type,
      episodes: item.episodes,
      status: item.status,
      year: item.year,
      score: item.score,
      poster: item.poster,
      source: 'animepahe',
    }));

    cache.set(key, results, cache.TTL.SEARCH);
    return results;
  } finally {
    await page.close();
  }
}

async function getEpisodes(session, page = 1) {
  const key = `animepahe:eps:${session}:${page}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const browserPage = await getPage();
  try {
    const url = `${BASE}/api?m=release&id=${session}&sort=episode_asc&page=${page}`;
    await browserPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const text = await browserPage.evaluate(() => document.body.innerText);
    const data = JSON.parse(text);

    const episodes = (data.data || []).map((ep) => ({
      id: ep.id,
      number: ep.episode,
      title: ep.title || `Episode ${ep.episode}`,
      snapshot: ep.snapshot,
      duration: ep.duration,
      session: ep.session,
      filler: !!ep.filler,
      created_at: ep.created_at,
      source: 'animepahe',
    }));

    const result = {
      total: data.total || episodes.length,
      per_page: data.per_page || 30,
      current_page: data.current_page || page,
      last_page: data.last_page || 1,
      data: episodes,
    };

    cache.set(key, result, cache.TTL.EPISODES);
    return result;
  } finally {
    await browserPage.close();
  }
}

async function getAllEpisodes(session) {
  const key = `animepahe:alleps:${session}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const first = await getEpisodes(session, 1);
  let all = [...first.data];

  for (let p = 2; p <= first.last_page; p++) {
    const page = await getEpisodes(session, p);
    all = all.concat(page.data);
  }

  const result = { total: all.length, data: all };
  cache.set(key, result, cache.TTL.EPISODES);
  return result;
}

async function getStreamingSources(animeSession, episodeSession) {
  const key = `animepahe:stream:${animeSession}:${episodeSession}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const page = await getPage();
  try {
    const watchUrl = `${BASE}/play/${animeSession}/${episodeSession}`;
    await page.goto(watchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('#pickServers', { timeout: 10000 }).catch(() => {});

    const sources = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      document.querySelectorAll('#pickServers .server-item, div.dropdown-menu a[data-src]').forEach((el) => {
        const src = el.getAttribute('data-src') || el.getAttribute('href') || '';
        if (!src || seen.has(src)) return;
        seen.add(src);
        results.push({
          server: el.textContent.trim() || 'Unknown',
          url: src,
          quality: el.getAttribute('data-res') || 'unknown',
          fansub: el.getAttribute('data-fansub') || null,
          audio: el.getAttribute('data-audio') || 'jpn',
        });
      });

      if (!results.length) {
        const html = document.documentElement.innerHTML;
        const matches = html.match(/https?:\/\/kwik\.[a-z]+\/e\/[a-zA-Z0-9]+/g) || [];
        [...new Set(matches)].forEach((url) => {
          results.push({ server: 'Kwik', url, quality: 'unknown', fansub: null, audio: 'jpn' });
        });
      }

      return results;
    });

    const result = { animeSession, episodeSession, watchUrl, sources, source: 'animepahe' };
    cache.set(key, result, cache.TTL.STREAM);
    return result;
  } finally {
    await page.close();
  }
}

module.exports = { search, getEpisodes, getAllEpisodes, getStreamingSources };
