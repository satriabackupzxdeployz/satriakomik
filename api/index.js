const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = "https://komiku.org/";

const getAbsoluteUrl = (relativePath) => {
  try {
    if (!relativePath) return 'N/A';
    if (relativePath.startsWith('http')) return relativePath;
    return new URL(relativePath, BASE_URL).href;
  } catch {
    return relativePath;
  }
};

async function scrapeKomikuSearch(keyword) {
  const url = `https://api.komiku.org/?post_type=manga&s=${encodeURIComponent(keyword)}`;
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const mangas = [];
    $('.bge').each((i, el) => {
      const manga = {};
      const bgei = $(el).find('.bgei > a');
      manga.href = `https://komiku.org${bgei.attr('href')}`;
      manga.thumbnail = bgei.find('img').attr('src');
      const tipeGenreText = bgei.find('.tpe1_inf').text().trim();
      const tipe = bgei.find('b').text().trim();
      const genre = tipeGenreText.replace(tipe, '').trim();
      manga.type = tipe;
      manga.genre = genre;
      manga.title = $(el).find('.kan > a > h3').text().trim();
      manga.last_update = $(el).find('.kan > p').text().trim();
      mangas.push(manga);
    });
    return mangas;
  } catch {
    return [];
  }
}

async function getAllEpisodes(comicUrl) {
  const episodes = [];
  let pageNum = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    try {
      const pageUrl = pageNum === 1 ? comicUrl : `${comicUrl}?page=${pageNum}`;
      const { data } = await axios.get(pageUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000 
      });
      const $ = cheerio.load(data);
      
      let foundEpisodes = 0;
      
      const selectors = [
        '#Daftar_Chapter tbody tr',
        '.chapter-list tr',
        '.episode-list .episode',
        '.list-chapter .chapter'
      ];
      
      for (const selector of selectors) {
        if ($(selector).length > 0) {
          $(selector).each((i, el) => {
            if (i === 0 && $(el).find('th').length > 0) return;
            
            const chapterLinkElement = $(el).find('td.judulseries a, .chapter-title a, .episode-title a, a');
            const chapterTitle = chapterLinkElement.find('span').text().trim() || chapterLinkElement.text().trim();
            const relativeChapterLink = chapterLinkElement.attr('href');
            
            if (chapterTitle && relativeChapterLink) {
              const chapterLink = getAbsoluteUrl(relativeChapterLink);
              const views = $(el).find('td.pembaca i, .views, .reader-count').text().trim();
              const date = $(el).find('td.tanggalseries, .date, .release-date').text().trim();
              
              if (!episodes.find(ep => ep.link === chapterLink)) {
                episodes.push({
                  title: chapterTitle,
                  link: chapterLink,
                  views: views || 'N/A',
                  release_date: date || 'N/A'
                });
                foundEpisodes++;
              }
            }
          });
          break;
        }
      }
      
      if (foundEpisodes === 0) {
        const loadMoreButton = $('.load-more, .show-more, #load-more');
        if (loadMoreButton.length > 0) {
          const ajaxUrl = loadMoreButton.attr('data-url') || loadMoreButton.attr('href');
          if (ajaxUrl) {
            try {
              const ajaxResponse = await axios.get(ajaxUrl, { 
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000 
              });
              const $ajax = cheerio.load(ajaxResponse.data);
              
              $ajax('.chapter, .episode, tr').each((i, el) => {
                const chapterLinkElement = $ajax(el).find('a');
                const chapterTitle = chapterLinkElement.text().trim();
                const relativeChapterLink = chapterLinkElement.attr('href');
                
                if (chapterTitle && relativeChapterLink) {
                  const chapterLink = getAbsoluteUrl(relativeChapterLink);
                  if (!episodes.find(ep => ep.link === chapterLink)) {
                    episodes.push({
                      title: chapterTitle,
                      link: chapterLink,
                      views: 'N/A',
                      release_date: 'N/A'
                    });
                    foundEpisodes++;
                  }
                }
              });
            } catch (e) {}
          }
        }
      }
      
      const nextPageLink = $('.next-page, .pagination .next, .page-next, a[rel="next"]');
      const hasNextButton = nextPageLink.length > 0 && !nextPageLink.hasClass('disabled');
      
      if (foundEpisodes === 0 && !hasNextButton) {
        hasMorePages = false;
      } else if (foundEpisodes === 0) {
        pageNum++;
        if (pageNum > 50) hasMorePages = false;
      } else {
        pageNum++;
      }
      
      if (episodes.length > 1000) hasMorePages = false;
      
    } catch (error) {
      hasMorePages = false;
    }
  }
  
  return episodes;
}

async function getComicDetails(comicUrl) {
  try {
    const { data } = await axios.get(comicUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000 
    });
    const $ = cheerio.load(data);
    const details = {};
    
    details.title = $('h1 span[itemprop="name"]').text().trim() || 'N/A';
    details.title_indonesian = $('p.j2').text().trim() || 'N/A';
    details.short_description = $('p[itemprop="description"]').text().trim().replace(/^Komik\s.*?\s-\s-\s/, '') || 'Tidak ada deskripsi singkat.';
    details.full_synopsis = $('section#Sinopsis p').first().text().trim() || 'Tidak ada sinopsis lengkap.';
    
    details.metaInfo = {};
    $('.inftable tr').each((i, el) => {
      const label = $(el).find('td').first().text().trim();
      const value = $(el).find('td').eq(1).text().trim();
      if (label === 'Judul Komik') details.metaInfo.original_title = value;
      else if (label === 'Judul Indonesia') details.metaInfo.indonesian_title = value;
      else if (label === 'Jenis Komik') details.metaInfo.type = value;
      else if (label === 'Konsep Cerita') details.metaInfo.concept = value;
      else if (label === 'Pengarang') details.metaInfo.author = value;
      else if (label === 'Status') details.metaInfo.status = value;
      else if (label === 'Umur Pembaca') details.metaInfo.age_rating = value;
      else if (label === 'Cara Baca') details.metaInfo.read_direction = value;
    });
    
    details.genres = [];
    $('ul.genre li.genre a span[itemprop="genre"]').each((i, el) => {
      details.genres.push($(el).text().trim());
    });
    
    details.thumbnail_url = $('img[itemprop="image"]').attr('src') || 'N/A';
    
    details.episodes = await getAllEpisodes(comicUrl);
    
    details.episodes.sort((a, b) => {
      const aNum = parseFloat(a.title.match(/\d+(\.\d+)?/)?.[0] || 0);
      const bNum = parseFloat(b.title.match(/\d+(\.\d+)?/)?.[0] || 0);
      return bNum - aNum;
    });
    
    return details;
  } catch (error) {
    return null;
  }
}

async function getChapterImages(chapterUrl) {
  try {
    const { data } = await axios.get(chapterUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    });
    const $ = cheerio.load(data);
    const images = [];
    $('#Baca_Komik img').each((i, el) => {
      let src = $(el).attr('src');
      if (src && src.startsWith('http')) images.push(src);
    });
    return images;
  } catch {
    return [];
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, q, slug, url } = req.query;

  try {
    if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'Missing q parameter' });
      const results = await scrapeKomikuSearch(q);
      return res.status(200).json(results);
    }
    
    if (action === 'detail') {
      if (!slug) return res.status(400).json({ error: 'Missing slug parameter' });
      const comicUrl = `https://komiku.org/${slug}/`;
      const details = await getComicDetails(comicUrl);
      if (!details) return res.status(404).json({ error: 'Comic not found' });
      return res.status(200).json(details);
    }
    
    if (action === 'chapter') {
      if (!url) return res.status(400).json({ error: 'Missing url parameter' });
      const images = await getChapterImages(url);
      return res.status(200).json({ images });
    }
    
    return res.status(400).json({ error: 'Invalid action parameter' });
    
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};const