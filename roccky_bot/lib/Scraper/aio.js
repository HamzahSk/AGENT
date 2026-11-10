import * as cheerio from 'cheerio';
import { Scrap } from '#scrap';
// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
const PROXY = 'http://93.115.101.150:11584/proxy?url=';
const SITE_URL = 'https://anydownloader.com';
const API_ACTION_TOKEN_URL = `${SITE_URL}/wp-json/api/action-token/`;
const API_DOWNLOAD_URL = `${SITE_URL}/wp-json/api/download/`;
const HOME_URL = `${SITE_URL}/en/`;

const THEVIDSAVE_BASE_URL = 'https://thevidsave.com';
const THEVIDSAVE_AJAX_ENDPOINT = '/wp-admin/admin-ajax.php';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function calculateHash(url, serverSalt, actionToken) {
  const btoa = (str) => Buffer.from(str).toString('base64');
  return btoa(url) + (url.length + 1000) + btoa(serverSalt) + btoa(actionToken);
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function requestProxy(url, options = {}) {
  const res = await fetch(PROXY + encodeURIComponent(url), options);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ==========================================
// SCRAPER 1: ANYDOWNLOADER (PRIMARY)
// ==========================================
async function fetchPrimaryData(url) {
  const homeResp = await requestProxy(HOME_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const html = typeof homeResp === 'string' ? homeResp : String(homeResp);
  const $ = cheerio.load(html);

  let sec_token, dl_token;

  $('script').each((_, el) => {
    const script = $(el).html();
    if (script?.includes('var WPURLS')) {
      const secMatch = script.match(/"sec_token":\s*"([^"]+)"/);
      const dlMatch = script.match(/"dl_token":\s*"([^"]+)"/);
      if (secMatch) sec_token = secMatch[1];
      if (dlMatch) dl_token = dlMatch[1];
    }
  });

  if (!sec_token || !dl_token) {
    throw new Error('Token primary scraper tidak ditemukan');
  }

  const actionForm = new URLSearchParams({ sec_token });
  const actionData = await requestProxy(API_ACTION_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: SITE_URL,
      Referer: HOME_URL,
      'X-AIO-Fetch': 'true',
      'User-Agent': 'Mozilla/5.0',
    },
    body: actionForm.toString(),
  });

  const action_token = actionData?.action_token;
  const server_salt = actionData?.server_salt;

  if (!action_token || !server_salt) {
    throw new Error('Action token atau server salt tidak valid');
  }

  const hash = calculateHash(url, server_salt, action_token);
  const downloadForm = new URLSearchParams({
    url,
    token: dl_token,
    salt: server_salt,
    action_token,
    hash,
  });

  const downloadData = await requestProxy(API_DOWNLOAD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: SITE_URL,
      Referer: HOME_URL,
      'X-AIO-Fetch': 'true',
      'User-Agent': 'Mozilla/5.0',
    },
    body: downloadForm.toString(),
  });

  if (!downloadData || (!downloadData.medias && !downloadData.title)) {
    throw new Error('Primary scraper gagal mengambil data media');
  }

  const rawMedias = Array.isArray(downloadData?.medias) ? downloadData.medias : [];
  const mappedMedias = rawMedias.map(media => ({
    url: media.url || '',
    quality: media.quality || 'Unknown',
    extension: media.extension || 'mp4',
    size_formatted: media.formattedSize || '',
    requires_rendering: false
  }));

  return {
    type: downloadData?.type || 'video',
    title: downloadData?.title || null,
    thumbnail: downloadData?.thumbnail || null,
    duration: downloadData?.duration || null,
    medias: mappedMedias,
    source: 'anydownloader'
  };
}

// ==========================================
// SCRAPER 2: THEVIDSAVE (FALLBACK)
// ==========================================
async function getTheVidSaveAppData() {
  const response = await fetch(THEVIDSAVE_BASE_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  let appData = null;

  $('script').toArray().forEach((script) => {
    const text = $(script).text();
    if (text && text.includes('window.app_data')) {
      const match = text.match(/window\.app_data\s*=\s*({[^;]+});/);
      if (match) {
        try { appData = JSON.parse(match[1]); } catch { /* ignore */ }
      }
    }
  });

  return {
    ajaxUrl: appData?.ajax_url || `${THEVIDSAVE_BASE_URL}${THEVIDSAVE_AJAX_ENDPOINT}`,
    nonce: appData?.nonce || '',
  };
}

function parseTheVidSaveLinks(videoData) {
  const links = videoData.download_links || videoData.medias || [];
  const valid = [];

  for (const link of links) {
    if (!link || typeof link !== 'object' || !link.url) continue;
    if (link.ext === 'webm' || (link.quality && String(link.quality).includes('webm'))) continue;

    const isSaveNow = link.url.startsWith('savenow:');
    let label = '';
    let fileExt = 'mp4';

    if (link.type === 'audio') {
      if (link.quality && link.quality.includes('kbps')) {
        label = `Audio ${link.quality}`;
      } else {
        label = link.quality || 'Audio MP3';
      }
      fileExt = link.ext || 'mp3';
    } else {
      const qMatch = String(link.quality || '').match(/\d{3,4}/);
      const quality = qMatch ? qMatch[0] : '';
      if (quality) {
        label = `MP4 ${quality}p`;
      } else if (isSaveNow) {
        label = `MP4 ${link.url.replace('savenow:', '')}p`;
      } else {
        label = link.quality || 'MP4 Video';
      }
    }

    valid.push({
      url: isSaveNow ? link.url : decodeHtmlEntities(link.url),
      quality: label,
      extension: fileExt,
      size_formatted: '',
      requires_rendering: isSaveNow
    });
  }

  return valid;
}

async function fetchFallbackData(url) {
  const { ajaxUrl, nonce } = await getTheVidSaveAppData();
  
  const form = new URLSearchParams({
    action: 'download_video',
    video_url: url,
  });
  if (nonce) form.append('nonce', nonce);

  const response = await fetch(ajaxUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Origin: THEVIDSAVE_BASE_URL,
      Referer: THEVIDSAVE_BASE_URL,
      'User-Agent': USER_AGENT,
    },
    body: form.toString(),
  });

  const json = await response.json();
  if (!json.success || !json.data) {
    throw new Error(json.data?.message || 'Fallback scraper gagal mengambil data');
  }

  const videoInfo = json.data;
  const medias = parseTheVidSaveLinks(videoInfo);

  if (medias.length === 0) {
    throw new Error('Tidak ada tautan unduhan yang valid di fallback');
  }

  return {
    type: medias.some(m => !m.quality.includes('Audio')) ? 'video' : 'audio',
    title: videoInfo.title ? decodeHtmlEntities(videoInfo.title) : null,
    thumbnail: videoInfo.cover ? decodeHtmlEntities(videoInfo.cover) : null,
    duration: videoInfo.durationFormatted || null,
    medias,
    source: 'thevidsave-fallback'
  };
}

// ==========================================
// SAVENOW RESOLVER (FOR THEVIDSAVE PROGRESS)
// ==========================================
function selectBestUrl(data) {
  if (data.download_url) return data.download_url;
  if (Array.isArray(data.alternative_download_urls)) {
    const sslUrl = data.alternative_download_urls.find((u) => u.has_ssl && u.url);
    if (sslUrl?.url) return sslUrl.url;
    const anyUrl = data.alternative_download_urls.find((u) => u.url);
    if (anyUrl?.url) return anyUrl.url;
  }
  return Array.isArray(data.download_urls) && data.download_urls.length > 0 ? data.download_urls[0] : null;
}

export async function resolveSaveNow(videoUrl, savenowUrl) {
  try {
    if (!savenowUrl.startsWith('savenow:')) {
      return { status: 200, success: true, downloadUrl: decodeHtmlEntities(savenowUrl) };
    }

    const format = savenowUrl.replace('savenow:', '');
    const { ajaxUrl } = await getTheVidSaveAppData();

    const startForm = new URLSearchParams({ action: 'tvs_savenow_download', url: videoUrl, format });
    const startRes = await fetch(ajaxUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: THEVIDSAVE_BASE_URL, 'User-Agent': USER_AGENT },
      body: startForm.toString(),
    });
    
    const startJson = await startRes.json();
    if (!startJson.success || !startJson.data?.progress_url) {
      throw new Error(startJson.data?.message || 'Gagal menginisialisasi render Savenow');
    }

    const progressUrl = startJson.data.progress_url;
    
    // Polling progress render
    for (let i = 0; i < 30; i++) {
      const pollForm = new URLSearchParams({ action: 'tvs_savenow_progress', progress_url: progressUrl });
      const pollRes = await fetch(ajaxUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: pollForm.toString() });
      const pollJson = await pollRes.json();
      const data = pollJson.data || {};

      const downloadUrl = selectBestUrl(data);
      if (downloadUrl) {
        return { status: 200, success: true, downloadUrl: decodeHtmlEntities(downloadUrl) };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Proses render timeout');
  } catch (err) {
    return { status: 400, success: false, message: err.message };
  }
}

// ==========================================
// MAIN EXPORT FUNCTION (API FORMAT RESPONDER)
// ==========================================
export async function socialDl(url) {
  try {
    if (!url) {
      throw new Error('Parameter URL tidak boleh kosong');
    }

    let resultData;
    
    try {
      // Jalankan Scraper Utama
      resultData = await fetchPrimaryData(url);
    } catch (primaryError) {
      // Jika Gagal, Terjun ke Fallback Scraper (thevidsave)
      resultData = await fetchFallbackData(url);
    }

    return {
      status: 200,
      success: true,
      message: "Media successfully processed",
      creator: "ROCKY",
      result: resultData
    };

  } catch (err) {
    return {
      status: 400,
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error occurred',
      creator: "ROCKY",
      result: null
    };
  }
}

Scrap.socialDl = socialDl;
Scrap.resolveSaveNow = resolveSaveNow
