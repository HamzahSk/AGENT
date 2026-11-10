// lib/functions/banner.js
import { Func } from '#func'
import { exec } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

const tmp = os.tmpdir()
const randomFile = (ext = 'jpg') => path.join(tmp, `${crypto.randomBytes(6).toString('hex')}.${ext}`)

async function getInput(input) {
  if (Buffer.isBuffer(input)) {
    const file = randomFile()
    await fs.writeFile(file, input)
    return file
  }
  if (/^https?:\/\//.test(input)) {
    const res = await fetch(input)
    const buff = Buffer.from(await res.arrayBuffer())
    const file = randomFile()
    await fs.writeFile(file, buff)
    return file
  }
  if (await fs.access(input).then(() => true).catch(() => false)) return input
  throw new Error('Input tidak valid')
}

Func.toBannerBuffer = async (input) => {
  const inputPath = await getInput(input)
  const outputPath = randomFile('jpg')
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -i "${inputPath}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black" -q:v 4 -preset veryfast -y "${outputPath}"`
    exec(cmd, async (err) => {
      try {
        if (err) return reject(err)
        const buffer = await fs.readFile(outputPath)
        await fs.unlink(outputPath)
        if (inputPath !== input) await fs.unlink(inputPath)
        resolve(buffer)
      } catch (e) { reject(e) }
    })
  })
}