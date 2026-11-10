import { readFileSync } from 'fs';
import { randomBytes } from 'crypto'; // Tambahkan import crypto bawaan Node.js
import { Scrap } from '#scrap'
// ==========================================
// FUNGSI BANTUAN (HELPERS)
// ==========================================

// Fungsi untuk membuat jeda (delay) dalam milidetik
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fungsi untuk generate Product-Serial acak (32 karakter hexadecimal)
function generateProductSerial() {
  // randomBytes(16) menghasilkan 16 bytes raw data. 
  // Saat diubah ke 'hex', 1 byte = 2 karakter, jadi totalnya pas 32 karakter.
  return randomBytes(16).toString('hex');
}

// Fungsi untuk mendeteksi dan mengubah input gambar menjadi Buffer
async function resolveImageInputToBuffer(input) {
  if (Buffer.isBuffer(input)) {
    return input;
  } else if (typeof input === 'string') {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      console.log('   -> Mengunduh gambar dari URL...');
      const response = await fetch(input);
      if (!response.ok) throw new Error(`Gagal mengunduh gambar dari URL. Status: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else {
      console.log('   -> Membaca gambar dari file lokal...');
      return readFileSync(input);
    }
  } else {
    throw new Error('Tipe input gambar tidak dikenali! Gunakan Buffer, URL string, atau Path string.');
  }
}

// ==========================================
// FUNGSI UTAMA
// ==========================================

Scrap.processEzCreateJob = async (imageInput, promptText) => {
  const createUrl = 'https://api.ezcreate.ai/ec/ez-create/create-job';
  
  // Generate Product-Serial baru untuk request ini
  const currentProductSerial = generateProductSerial();
  console.log(`🔑 Menggunakan Product-Serial: ${currentProductSerial}`);

  // Setup Headers (Digunakan untuk CREATE maupun GET)
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'id-ID',
    'Origin': 'https://ezcreate.ai',
    'Priority': 'u=1, i',
    'Product-Serial': currentProductSerial, // Gunakan variabel hasil generate di sini
    'Referer': 'https://ezcreate.ai/',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0'
  };

  try {
    // ==========================================
    // TAHAP 1: MEMBUAT JOB
    // ==========================================
    console.log('1. Menyiapkan gambar...');
    const imageBuffer = await resolveImageInputToBuffer(imageInput);
    const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });

    const formData = new FormData();
    formData.append('model_name', 'photoeditor_4.0');
    formData.append('target_images', imageBlob, 'gambar_kamu.jpg');
    formData.append('prompt', promptText);
    formData.append('ratio', 'match_input_image');

    console.log('2. Mengirim request Create Job...');
    
    const createResponse = await fetch(`https://proxy-rockydev.vercel.app/proxy?url=${encodeURIComponent(createUrl)}`, {
      method: 'POST',
      headers: headers,
      body: formData
    });
    
    console.log(createResponse)

    const createJson = await createResponse.json();
    
    if (createJson.code !== 100000 || !createJson.result || !createJson.result.job_id) {
      throw new Error(`Gagal membuat job. Detail: ${JSON.stringify(createJson)}`);
    }

    const jobId = createJson.result.job_id;
    console.log(`✅ Job ID didapatkan: ${jobId}`);

    // ==========================================
    // TAHAP 2: LOOP UNTUK MENGECEK STATUS (POLLING)
    // ==========================================
    console.log('3. Mulai mengecek status (menunggu hasil dari server)...');
    
    let isDone = false;
    let attempt = 0;
    const maxAttempts = 30;
    const delayTime = 3000;

    while (!isDone && attempt < maxAttempts) {
      attempt++;
      await delay(delayTime);

      console.log(`   [Cek ke-${attempt}] Mengambil status...`);
      const statusUrl = `https://api.ezcreate.ai/ec/ez-create/get-job/${jobId}`;
      
      const statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: headers
      });

      const statusJson = await statusResponse.json();

      if (statusJson.code === 100000 && statusJson.result) {
        const jobStatus = statusJson.result.status;
        
        if (jobStatus === 2 && statusJson.result.output) {
          console.log('\n🎉 JOB SELESAI!');
          statusJson.result.output.forEach((url, index) => {
            console.log(`👉 Hasil ${index + 1}: ${url}`);
          });

          isDone = true;
          return statusJson.result.output;
          
        } else if (statusJson.result.error) {
          throw new Error(`Job gagal diproses server: ${statusJson.result.error}`);
        } else {
          console.log(`   Status saat ini: ${jobStatus}. Masih diproses...`);
        }
      } else {
        console.log(`   Respons tidak terduga, mencoba lagi...`);
      }
    }

    if (!isDone) {
      console.log('\n❌ Timeout: Melewati batas maksimal percobaan.');
    }

  } catch (error) {
    console.error('\n❌ Terjadi kesalahan pada proses:', error.message);
  }
}