import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const missing = error => error.code === 'ENOENT'

async function canonicalPath(value) {
  try { return await realpath(value) }
  catch (error) {
    if (!missing(error)) throw error
    return path.join(await canonicalPath(path.dirname(value)), path.basename(value))
  }
}

async function rejectSymlinks(root, relative) {
  let current = root
  for (const component of relative.split('/')) {
    current = path.join(current, component)
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink output rejected: ${relative}`) }
    catch (error) { if (!missing(error)) throw error }
  }
}

async function atomicWrite(filename, bytes) {
  await mkdir(path.dirname(filename), { recursive: true })
  const temporary = await mkdtemp(path.join(path.dirname(filename), '.favicon-'))
  try {
    await writeFile(path.join(temporary, 'bytes'), bytes)
    await rename(path.join(temporary, 'bytes'), filename)
  } finally { await rm(temporary, { recursive: true, force: true }) }
}

export function encodeIco(images) {
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ width, bytes }, index) => {
    const position = 6 + index * 16
    header[position] = width
    header[position + 1] = width
    header.writeUInt16LE(1, position + 4)
    header.writeUInt16LE(32, position + 6)
    header.writeUInt32LE(bytes.length, position + 8)
    header.writeUInt32LE(offset, position + 12)
    offset += bytes.length
  })
  return Buffer.concat([header, ...images.map(image => image.bytes)])
}

function verifyPng(asset, bytes) {
  if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256
    || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.width) throw new Error('Pinned PNG size/hash/dimensions mismatch')
  return bytes
}

async function download(asset, fetcher) {
  const response = await fetcher(asset.url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Accept: 'image/png' } })
  if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== asset.mime || !response.body) {
    await response.body?.cancel()
    throw new Error('PNG CDN status/MIME mismatch')
  }
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > asset.bytes) throw new Error('PNG exceeds pinned size')
      chunks.push(Buffer.from(value))
    }
  } finally { await reader.cancel() }
  return verifyPng(asset, Buffer.concat(chunks))
}

export async function prepareFavicon({ root = projectRoot, cacheDir = process.env.GENKOU_ASSET_CACHE_DIR || path.join(os.homedir(), '.cache/genkou/favicon'), offline = process.env.GENKOU_ASSETS_OFFLINE === '1', fetcher = globalThis.fetch } = {}) {
  root = await realpath(root)
  cacheDir = await canonicalPath(path.resolve(cacheDir))
  const relativeCache = path.relative(root, cacheDir)
  if (!relativeCache || (!relativeCache.startsWith(`..${path.sep}`) && relativeCache !== '..' && !path.isAbsolute(relativeCache))) throw new Error('PNG cache must stay outside checkout')
  const manifest = JSON.parse(await readFile(path.join(root, 'assets/brand/favicon-inputs.json'), 'utf8'))
  if (manifest.version !== 1 || manifest.output?.path !== 'public/favicon.ico'
    || !/^[a-f0-9]{64}$/.test(manifest.output.sha256) || !Array.isArray(manifest.inputs) || manifest.inputs.length !== 3) throw new Error('Invalid favicon mapping')
  for (const [index, asset] of manifest.inputs.entries()) {
    const url = new URL(asset.url)
    if (asset.width !== [16, 32, 48][index] || asset.mime !== 'image/png'
      || !Number.isSafeInteger(asset.bytes) || asset.bytes < 24 || asset.bytes > 99000000
      || !/^[a-f0-9]{64}$/.test(asset.sha256)
      || url.origin !== 'https://images.snkisk.com' || url.username || url.password || url.search || url.hash
      || !/^\/genkou\.snkisk\.com\/[a-f0-9-]+\.png$/.test(url.pathname)) throw new Error('Invalid PNG mapping')
  }
  if (manifest.output.bytes !== 54 + manifest.inputs.reduce((sum, input) => sum + input.bytes, 0)) throw new Error('Invalid ICO size mapping')
  await rejectSymlinks(root, manifest.output.path)
  const images = []
  for (const asset of manifest.inputs) {
    const cached = path.join(cacheDir, asset.sha256)
    let bytes
    try {
      if (!(await lstat(cached)).isFile()) throw new Error('Invalid PNG cache entry')
      if ((await stat(cached)).size !== asset.bytes) throw new Error('Pinned PNG cache size mismatch')
      bytes = verifyPng(asset, await readFile(cached))
    } catch (error) {
      if (!missing(error)) throw error
      if (offline) throw new Error('Offline PNG cache miss; prepare once online')
      bytes = await download(asset, fetcher)
      await atomicWrite(cached, bytes)
    }
    images.push({ width: asset.width, bytes })
  }
  const ico = encodeIco(images)
  if (ico.length !== manifest.output.bytes || digest(ico) !== manifest.output.sha256) throw new Error('Pinned ICO size/hash mismatch')
  await rejectSymlinks(root, manifest.output.path)
  await atomicWrite(path.join(root, manifest.output.path), ico)
  return { bytes: ico.length, sha256: digest(ico), inputs: images.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(argument => argument !== '--offline')) throw new Error('Only --offline is supported')
    const result = await prepareFavicon({ offline: process.argv.includes('--offline') || process.env.GENKOU_ASSETS_OFFLINE === '1' })
    console.log(`Prepared original ${result.bytes}-byte favicon from ${result.inputs} verified PNG inputs.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
