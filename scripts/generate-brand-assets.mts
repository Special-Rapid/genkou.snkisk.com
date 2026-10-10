import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = resolve(root, 'assets/brand')
const outputDirectory = resolve(root, 'generated/brand-assets')
await mkdir(outputDirectory, { recursive: true })
const iconSource = await readFile(resolve(sourceDirectory, 'brand-icon.svg'))
const ogSource = await readFile(resolve(sourceDirectory, 'og-image.svg'))
await writeFile(resolve(outputDirectory, 'brand-icon.svg'), iconSource)
await writeFile(resolve(outputDirectory, 'og-image.svg'), ogSource)
const iconSourceText = iconSource.toString()
const darkIconSourceText = iconSourceText.replace('fill="#f4f5f6"', 'fill="#151515"').replace('fill="#fff"', 'fill="#242424"')
if (darkIconSourceText === iconSourceText) throw new Error('Expected both icon background colors in assets/brand/brand-icon.svg.')
await writeFile(resolve(outputDirectory, 'brand-icon-dark.svg'), darkIconSourceText)

async function renderIcon(size: number) {
  return sharp(iconSource)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

function encodeIco(pngImages: ReadonlyArray<{ size: number; data: Buffer }>) {
  const header = Buffer.alloc(6 + pngImages.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngImages.length, 4)

  let offset = header.length
  pngImages.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16
    header[entry] = size === 256 ? 0 : size
    header[entry + 1] = size === 256 ? 0 : size
    header[entry + 2] = 0
    header[entry + 3] = 0
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })

  return Buffer.concat([header, ...pngImages.map(({ data }) => data)])
}

const sizes = [16, 32, 48, 180, 192, 512]
const images = new Map<number, Buffer>()
for (const size of sizes) images.set(size, await renderIcon(size))

await writeFile(resolve(outputDirectory, 'favicon-32.png'), images.get(32)!)
await writeFile(resolve(outputDirectory, 'favicon-48.png'), images.get(48)!)
await writeFile(resolve(outputDirectory, 'apple-touch-icon.png'), images.get(180)!)
await writeFile(resolve(outputDirectory, 'icon-192.png'), images.get(192)!)
await writeFile(resolve(outputDirectory, 'icon-512.png'), images.get(512)!)
await writeFile(resolve(outputDirectory, 'favicon.ico'), encodeIco([16, 32, 48].map((size) => ({ size, data: images.get(size)! }))))

const ogBase = await sharp(ogSource).png().toBuffer()
const ogIcon = await sharp(iconSource).resize(96, 96, { fit: 'contain' }).png().toBuffer()
const ogPng = await sharp(ogBase).composite([{ input: ogIcon, left: 104, top: 85 }]).png({ compressionLevel: 9 }).toBuffer()
await writeFile(resolve(outputDirectory, 'og-image.png'), ogPng)
await sharp(ogPng).webp({ quality: 92 }).toFile(resolve(outputDirectory, 'og-image.webp'))

console.log(`Generated light/dark SVG marks, favicon 16/32/48 ICO, 32/48 PNG, 180 Apple, 192/512 web icons, and 1200x630 PNG/WebP OG image in generated/brand-assets from assets/brand SVG sources. No public files or CDN uploads were changed.`)
