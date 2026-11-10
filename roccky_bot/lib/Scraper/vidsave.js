import { Scrap } from '#scrap';
import { URLSearchParams } from 'url';

// Konfigurasi
const CONFIG = {
  AUTH: '20250901majwlqo',
  DOMAIN: 'api-ak.vidssave.com',
  BASE_URL: 'https://api.vidssave.com/api/contentsite_api/media',
  SSE_URL: 'https://api.vidssave.com/sse/contentsite_api/media/download_query',
  QUALITY_ORDER: ['256KBPS', 'LOW', '128KBPS', '48KBPS', '1080P', '720P', '480P', '360P', '240P', '144P']
};

// Headers default
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'sec-ch-ua-platform': '"Android"',
  'save-data': 'on',
  'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
  'dnt': '1',
  'sec-ch-ua-mobile': '?1',
  'origin': 'https://id.vidssave.com',
  'sec-fetch-site': 'same-site',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
  'referer': 'https://id.vidssave.com/',
  'accept-language': 'id,en-US;q=0.9,en;q=0.8,ms;q=0.7,fr;q=0.6',
  'priority': 'u=1, i'
};

// Utility functions
function formatFileSize(bytes) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  return `${minutes}m ${secs}s`;
}

// Core functions
async function parseVideo(url) {
  const params = new URLSearchParams();
  params.append('auth', CONFIG.AUTH);
  params.append('domain', CONFIG.DOMAIN);
  params.append('origin', 'source');
  params.append('link', url);

  const response = await fetch(`${CONFIG.BASE_URL}/parse`, {
    method: 'POST',
    headers: { ...DEFAULT_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  
  return response.json();
}

function selectResource(resources, quality) {
  if (!resources || resources.length === 0) return null;
  
  let selected = resources.find(r => r.quality === quality);
  if (selected) return selected;
  
  for (const q of CONFIG.QUALITY_ORDER) {
    const found = resources.find(r => r.quality === q);
    if (found) return found;
  }
  
  return null;
}

async function requestDownload(resourceUrl) {
  const params = new URLSearchParams();
  params.append('auth', CONFIG.AUTH);
  params.append('domain', CONFIG.DOMAIN);
  params.append('request', resourceUrl);
  params.append('no_encrypt', '1');

  const response = await fetch(`${CONFIG.BASE_URL}/download`, {
    method: 'POST',
    headers: { ...DEFAULT_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  
  return response.json();
}

async function getDownloadUrlViaSSE(taskId) {
  const url = `${CONFIG.SSE_URL}?auth=${CONFIG.AUTH}&domain=${CONFIG.DOMAIN}&task_id=${taskId}&download_domain=vidssave.com&origin=content_site`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { ...DEFAULT_HEADERS, 'Accept': 'text/event-stream', 'cache-control': 'no-cache' }
  });
  
  if (!response.ok) return null;
  
  const result = await response.text();
  const lines = result.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const jsonData = JSON.parse(line.substring(6));
        if (jsonData?.download_link) return jsonData.download_link;
      } catch {
        continue;
      }
    }
  }
  return null;
}

// Main Function (Exportable for API)
export async function vidSave(url, quality = '480P') {
  try {
    if (!url) throw new Error('URL cannot be empty');

    // 1. Parse Video Metadata
    const parseResult = await parseVideo(url);
    if (!parseResult.data || !parseResult.data.resources) {
      throw new Error('No resources found for this video');
    }
    
    const videoData = parseResult.data;
    
    // 2. Pilih Kualitas Resource
    const selectedResource = selectResource(videoData.resources, quality);
    if (!selectedResource) {
      throw new Error('No matching quality resource found');
    }
    
    // 3. Request Download Process
    const downloadResult = await requestDownload(selectedResource.resource_content);
    
    let taskId = null;
    let downloadUrl = null;
    
    if (downloadResult.data?.task_id) {
      taskId = downloadResult.data.task_id;
      downloadUrl = await getDownloadUrlViaSSE(taskId);
    }
    
    if (!downloadUrl && downloadResult.data?.download_url) {
      downloadUrl = downloadResult.data.download_url;
    }
    
    // 4. Return API Standard JSON Response
    return {
      status: 200,
      success: true,
      message: "Success processing media download",
      data: {
        metadata: {
          id: videoData.id || null,
          title: videoData.title || "Unknown Title",
          thumbnail: videoData.thumbnail || null,
          duration: videoData.duration || 0,
          duration_formatted: formatDuration(videoData.duration)
        },
        selected_resource: {
          quality: selectedResource.quality,
          format: selectedResource.format,
          type: selectedResource.type,
          size: selectedResource.size || 0,
          size_formatted: formatFileSize(selectedResource.size)
        },
        download: {
          task_id: taskId,
          download_url: downloadUrl || selectedResource.resource_content
        },
        available_qualities: videoData.resources.map(r => r.quality)
      }
    };
    
  } catch (error) {
    return {
      status: 400,
      success: false,
      message: error.message,
      data: null
    };
  }
}

Scrap.vidSave = vidSave