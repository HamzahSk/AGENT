import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import WebSocket from 'ws';
import { createWriteStream } from 'fs';
import { Scrap } from '#scrap';

const decodeHtmlEntities = (str) => {
  if (!str) return str;
  return str.replace(/&#x2B;/gi, '+')
            .replace(/&#x3D;/gi, '=')
            .replace(/&#x26;/gi, '&')
            .replace(/&amp;/g, '&');
};

const regxurl = /^https?:\/\/.+/i;

const downloadFile = async (url, outputFilename) => {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const fileStream = createWriteStream(outputFilename);
    const reader = response.body.getReader();
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      fileStream.write(Buffer.from(value));
      receivedBytes += value.length;
    }

    fileStream.end();
    return { success: true, filename: outputFilename, size: receivedBytes };
  } catch (error) {
    throw new Error(`Gagal mengunduh file: ${error.message}`);
  }
};

const downloadConvertedVideo = (jobId, outputFilename = 'converted_video.mp4') => {
  return new Promise((resolve, reject) => {
    const wsUrl = `wss://s3.tik-cdn.com/sub/${jobId}?fname=SaveTik.io`;
    const ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
        'Origin': 'https://savetik.io',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    let downloadUrl = null;
    let receivedBytes = 0;
    let isCompleted = false;
    const fileStream = createWriteStream(outputFilename);
    const timeoutId = setTimeout(() => {
      ws.terminate();
      reject(new Error('WebSocket timeout: Tidak ada respon dalam 60 detik'));
    }, 60000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      fileStream.end();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    ws.on('open', () => {
      // WebSocket terbuka
    });

    ws.on('message', async (data, isBinary) => {
      try {
        if (isBinary) {
          fileStream.write(Buffer.from(data));
          receivedBytes += data.length;
          return;
        }

        const message = data.toString();
        const parsed = JSON.parse(message);

        if (parsed.action === 'success' && parsed.url) {
          downloadUrl = parsed.url;
          ws.close();
          return;
        }

        if (parsed.action === 'end' || parsed.action === 'complete') {
          isCompleted = true;
          ws.close();
        }
      } catch (error) {
        // Abaikan error parsing
      }
    });

    ws.on('close', async () => {
      clearTimeout(timeoutId);
      
      try {
        if (downloadUrl) {
          fileStream.end();
          const result = await downloadFile(downloadUrl, outputFilename);
          cleanup();
          resolve(result);
          return;
        }

        if (receivedBytes > 0) {
          fileStream.end();
          cleanup();
          resolve({ success: true, filename: outputFilename, size: receivedBytes });
          return;
        }

        if (isCompleted) {
          cleanup();
          reject(new Error('Proses selesai tetapi tidak ada data yang diterima'));
          return;
        }

        cleanup();
        reject(new Error('Tidak ada data video atau URL download yang diterima'));
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeoutId);
      fileStream.end();
      ws.close();
      reject(new Error(`WebSocket error: ${error.message}`));
    });
  });
};

const downloadTikTok = async (tiktokUrl) => {
  const url = 'https://savetik.io/api/ajaxSearch';
  const headers = {
    'Accept': '*/*',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': 'https://savetik.io',
    'Referer': 'https://savetik.io/en',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
  };

  const formData = new URLSearchParams({
    q: tiktokUrl,
    cursor: '0',
    page: '0',
    lang: 'en'
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();

    if (result.status !== 'ok' || !result.data) {
      throw new Error('Gagal mendapatkan data HTML yang valid dari server');
    }

    const $ = cheerio.load(result.data);
    const parsedData = {
      title: $('h3').first().text().trim() || null,
      thumbnail: $('.thumbnail .image-tik img').attr('src') || 
                 $('.thumbnail img').first().attr('src') || 
                 null,
      videos: [],
      photos: [],
      audioUrl: null,
      imageDataUrl: null,
      contentType: 'video',
      tiktokId: $('#TikTokId').val() || null,
      k_exp: null,
      k_token: null,
      k_url_convert: null
    };

    // Parse videos
    $('.dl-action a').each((i, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr('href');
      if (text.includes('Download MP4') || text.includes('Download Video')) {
        parsedData.videos.push({
          label: text.replace(/\s+/g, ' '),
          url: href
        });
      }
    });

    parsedData.videoUrl = parsedData.videos[0]?.url || null;

    // Parse MP3
    $('.dl-action a').each((i, el) => {
      const text = $(el).text().trim();
      if (text.includes('Download MP3')) {
        parsedData.mp3Url = $(el).attr('href');
        return false;
      }
    });

    // Parse photos
    $('.download-box li, .download-items').each((index, element) => {
      const thumb = $(element).find('.download-items__thumb img').attr('src');
      const downloadLink = $(element).find('.download-items__btn a').attr('href');
      if (downloadLink) {
        parsedData.photos.push({
          index: index + 1,
          thumbnail: thumb || null,
          downloadUrl: downloadLink
        });
      }
    });

    // Parse audio and image data
    const renderElem = $('#ConvertToVideo').length ? $('#ConvertToVideo') : $('[data-audiourl]');
    const rawAudioUrl = renderElem.attr('data-audiourl');
    const rawImageData = renderElem.attr('data-imagedata');

    parsedData.audioUrl = rawAudioUrl ? decodeHtmlEntities(rawAudioUrl) : null;
    parsedData.imageDataUrl = rawImageData ? decodeHtmlEntities(rawImageData) : null;
    parsedData.contentType = parsedData.photos.length > 0 ? 'slide' : 'video';

    // Parse script data
    const scriptText = $('script').text();
    parsedData.k_exp = scriptText.match(/k_exp\s*=\s*"([^"]+)"/)?.[1] || null;
    parsedData.k_token = scriptText.match(/k_token\s*=\s*"([^"]+)"/)?.[1] || null;
    parsedData.k_url_convert = scriptText.match(/k_url_convert\s*=\s*"([^"]+)"/)?.[1] || null;

    return parsedData;
  } catch (error) {
    throw new Error(`Gagal memproses downloadTikTok: ${error.message}`);
  }
};

const convertSlideToVideo = async (parsedData) => {
  if (!parsedData || parsedData.contentType !== 'slide') {
    throw new Error('Konten bukan bertipe slide/foto');
  }

  if (!parsedData.audioUrl || !parsedData.imageDataUrl) {
    throw new Error('audioUrl atau imageDataUrl tidak ditemukan');
  }

  const url = parsedData.k_url_convert || 'https://s3.tik-cdn.com/api/json/convert';
  const headers = {
    'Accept': '*/*',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': 'https://savetik.io',
    'Referer': 'https://savetik.io/',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
  };

  const formData = new URLSearchParams({
    ftype: 'mp4',
    v_id: parsedData.tiktokId,
    audioUrl: parsedData.audioUrl,
    audioType: 'audio/mp3',
    imageUrl: parsedData.imageDataUrl,
    fquality: '1080p',
    fname: 'SaveTik.io',
    exp: parsedData.k_exp,
    token: parsedData.k_token
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`Gagal menghubungi server convert. Status: ${response.status}`);
    }

    const convertResult = await response.json();

    // Cek apakah ada jobId atau result langsung
    if (convertResult.status === 'success' && convertResult.jobId) {
      return { type: 'job', data: convertResult };
    }

    if (convertResult.result && regxurl.test(convertResult.result)) {
      return { type: 'direct', data: convertResult };
    }

    throw new Error('Gagal mendapatkan jobId atau result dari server konversi');
  } catch (error) {
    throw new Error(`Gagal mengonversi slide: ${error.message}`);
  }
};

export const getTikTokVideo = async (url) => {
  try {
    // Step 1: Scrape data
    const scrapedData = await downloadTikTok(url);

    // Step 2: Handle slide content
    if (scrapedData.contentType === 'slide') {
      const convertResult = await convertSlideToVideo(scrapedData);
      
      // Jika dapat direct URL
      if (convertResult.type === 'direct') {
        const videoUrl = convertResult.data.result;
        const downloadResult = await downloadFile(videoUrl, 'slide_to_video.mp4');
        
        return {
          status: 'success',
          data: {
            type: 'converted_slide',
            video: downloadResult.filename,
            size: downloadResult.size,
            url: videoUrl,
            original: scrapedData
          }
        };
      }
      
      // Jika dapat jobId
      if (convertResult.type === 'job') {
        const jobId = convertResult.data.jobId;
        
        // Tunggu 3 detik sebelum download
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const downloadResult = await downloadConvertedVideo(jobId, 'slide_to_video.mp4');
        
        return {
          status: 'success',
          data: {
            type: 'converted_slide',
            video: downloadResult.filename,
            size: downloadResult.size,
            jobId: jobId,
            original: scrapedData
          }
        };
      }
    }

    // Step 3: Handle regular video
    if (scrapedData.videoUrl) {
      return {
        status: 'success',
        data: {
          type: 'video',
          title: scrapedData.title,
          thumbnail: scrapedData.thumbnail,
          videoUrl: scrapedData.videoUrl,
          mp3Url: scrapedData.mp3Url || null,
          photos: scrapedData.photos
        }
      };
    }

    throw new Error('Tidak ada video yang dapat diunduh');
  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
};
/*
// Example usage
const init = async () => {
  const targetUrl = 'https://vm.tiktok.com/ZS926oGFNUuYw-uz16y/';
  const result = await getTikTokVideo(targetUrl);
  console.log(JSON.stringify(result, null, 2));
  
  if (result.status === 'error') {
    throw new Error(result.message);
  }
};

init().catch(console.error);

*/