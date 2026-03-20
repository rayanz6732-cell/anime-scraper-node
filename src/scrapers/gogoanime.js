const axios = require('axios');
const cheerio = require('cheerio');
const { getPage } = require('../browser');
const cache = require('../cache');

const BASE = process.env.GOGO_URL || 'https://gogoanime3.cc';
const AJAX = 'https://ajax.gogocdn.net';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: BASE + '/',
};

async function search(query) {
  const key = `gogo:search:${query.toLowerCase().trim()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const page = await getPage();
  try {
    const url = `${BASE}/search.html?keyword=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const html = await page.content();
    const $ = cheerio.load(html);

    const results = [];
    $('ul.items li, div.last_episodes ul li').each((_, el) => {
      const a = $(el).find('p.name a, div.name a, a').first();
      const img = $(el).find('img').first();
      const released = $(el).find('p.released, p.year').first();
      if (!a.length) return;

      const href = a.attr('href') || '';
      const animeId = href.replace(/^\//, '').replace('category/', '');

      results.push({
        id: animeId,
        title: a.attr('title') || a.text().trim(),
        poster: img.attr('src') || '',
        released: released.text().replace('Released:', '').trim() || null,
        url: BASE + '/' + animeId,
        source: 'gogoanime',
      });
    });

    cache.set(key, results, cache.TTL.SEARCH);
    return results;
  } finally {
    await page.close();
  }
}

async function getInfo(animeId) {
  const key = `gogo:info:${animeId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const page = await getPage();
  try {
    await page.goto(`${BASE}/category/${animeId}`, { waitUntil: 'networkidle2', timeout: 30000 });
    const html = await page.content();
    const $ = cheerio.load(html);

    const title = $('div.anime_info_body_bg h1').text().trim() || $('h1').first().text().trim();
    const poster = $('div.anime_info_body_bg img').attr('src') || '';
    const movieId = $('#movie_id').val();

    const info = {};
    $('div.anime_info_body_bg p.type').each((_, el) => {
      const span = $(el).find('span');
      if (span.length) {
        const label = span.text().replace(':', '').trim().toLowerCase();
        const value = $(el).text().replace(span.text(), '').trim();
        info[label] = value;
      }
    });

    const genres = $('p.type a[href*="genre"]').map((_, el) => $(el).text().trim()).get();

    const epPages = $('#episode_page a');
    let totalEps = null;
    if (epPages.length) {
      totalEps = parseInt(epPages.last().attr('ep_end') || '0', 10) || null;
    }

    const result = {
      id: animeId,
      title,
      poster,
      genres,
      type: info.type || null,
      status: info.status || null,
      released: info.released || null,
      summary: info['plot summary'] || null,
      total_episodes: totalEps,
      movie_id: movieId,
      url: `${BASE}/category/${animeId}`,
      source: 'gogoanime',
    };

    cache.set(key, result, cache.TTL.INFO);
    return result;
  } finally {
    await page.close();
  }
}

async function getEpisodes(animeId) {
  const key = `gogo:eps:${animeId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const info = await getInfo(animeId);
  if (!info.movie_id) throw new Error(`Anime not found: ${animeId}`);

  const page = await getPage();
  let epStart = '0', epEnd = '0';
  try {
    await page.goto(`${BASE}/category/${animeId}`, { waitUntil: 'networkidle2', timeout: 30000 });
    const data = await page.evaluate(() => {
      const pages = document.querySelectorAll('#episode_page a');
      if (!pages.length) return { start: '0', end: '0' };
      return {
        start: pages[0].getAttribute('ep_start') || '0',
        end: pages[pages.length - 1].getAttribute('ep_end') || '0',
      };
    });
    epStart = data.start;
    epEnd = data.end;
  } finally {
    await page.close();
  }

  const ajaxUrl = `${AJAX}/ajax/load-list-episode?ep_start=${epStart}&ep_end=${epEnd}&id=${info.movie_id}`;
  const res = await axios.get(ajaxUrl, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);

  const episodes = [];
  $('li').each((_, el) => {
    const a = $(el).find('a');
    const epNum = $(el).find('.name');
    const sub = $(el).find('.cate');
    if (!a.length) return;

    const href = a.attr('href')?.trim() || '';
    const epId = href.replace(/^\//, '');
    const number = epNum.text().replace('EP', '').trim();

    episodes.push({
      id: epId,
      number,
      type: sub.text().trim() || 'SUB',
      url: `${BASE}/${epId}`,
      source: 'gogoanime',
    });
  });

  episodes.reverse();
  const result = { anime_id: animeId, total: episodes.length, data: episodes };
  cache.set(key, result, cache.TTL.EPISODES);
  return result;
}

async function getStreamingSources(episodeId) {
  const key = `gogo:stream:${episodeId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const page = await getPage();
  try {
    await page.goto(`${BASE}/${episodeId}`, { waitUntil: 'networkidle2', timeout: 30000 });
    const html = await page.content();
    const $ = cheerio.load(html);

    const sources = [];
    const seen = new Set();

    $('div.anime_muti_link ul li, div.list-server-items li').each((_, el) => {
      const a = $(el).find('a');
      const serverName = a.text().trim() || $(el).attr('class') || 'Unknown';
      const dataVideo = a.attr('data-video') || a.attr('href') || '';
      if (!dataVideo || dataVideo === '#' || seen.has(dataVideo)) return;
      seen.add(dataVideo);
      sources.push({
        server: serverName,
        url: dataVideo.startsWith('http') ? dataVideo : 'https:' + dataVideo,
      });
    });

    const defaultSrc = $('div.play-video iframe, div.anime-video-body iframe').attr('src');
    if (defaultSrc) {
      const url = defaultSrc.startsWith('http') ? defaultSrc : 'https:' + defaultSrc;
      sources.unshift({ server: 'default', url });
    }

    const result = {
      episode_id: episodeId,
      sources,
      watch_url: `${BASE}/${episodeId}`,
      source: 'gogoanime',
    };

    cache.set(key, result, cache.TTL.STREAM);
    return result;
  } finally {
    await page.close();
  }
}

module.exports = { search, getInfo, getEpisodes, getStreamingSources };
