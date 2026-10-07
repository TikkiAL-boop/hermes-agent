import fs from 'node:fs'
import sharp from 'sharp'
import png2icons from 'png2icons'
const out = 'out-logo'; fs.mkdirSync(out, { recursive: true })
const { data, info } = await sharp('logo-original.png').raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height, C = info.channels
const bg = [28, 28, 28]
const diff = (x, y) => { const i = (y * W + x) * C; return Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) }
let minX = W, minY = H, maxX = 0, maxY = 0
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (diff(x, y) > 24) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
console.log('bbox', minX, minY, maxX, maxY)
const side = Math.max(maxX - minX + 1, maxY - minY + 1)
const cx = Math.round((minX + maxX) / 2), cy = Math.round((minY + maxY) / 2)
const left = Math.max(0, cx - Math.floor(side / 2)), top = Math.max(0, cy - Math.floor(side / 2))
const inner = await sharp('logo-original.png').extract({ left, top, width: Math.min(side, W - left), height: Math.min(side, H - top) }).resize(1024, 1024, { kernel: 'lanczos3' }).png().toBuffer()
// Runde Ecken als Maske (macOS-Radius ~22 %), damit die alte Rundung sauber ist
const r = 226
const mask = Buffer.from(`<svg width="1024" height="1024"><rect x="0" y="0" width="1024" height="1024" rx="${r}" fill="#fff"/></svg>`)
const full = await sharp(inner).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
fs.writeFileSync(`${out}/icon.png`, full); fs.writeFileSync(`${out}/icon-dark.png`, full)
const small = await sharp(full).resize(824, 824).png().toBuffer()
const mac = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: small, left: 100, top: 100 }]).png().toBuffer()
fs.writeFileSync(`${out}/icon-mac.png`, mac)
const icns = png2icons.createICNS(mac, png2icons.BICUBIC, 0); const ico = png2icons.createICO(full, png2icons.BICUBIC, 0, false)
for (const n of ['icon', 'icon-dark']) { fs.writeFileSync(`${out}/${n}.icns`, icns); fs.writeFileSync(`${out}/${n}.ico`, ico) }
for (const s of [64, 512]) fs.writeFileSync(`${out}/preview-${s}.png`, await sharp(full).resize(s, s).png().toBuffer())
// Akzentfarbe: Mittel der hellen Grünpixel
let rs = 0, gs = 0, bs = 0, n = 0
for (let i = 0; i < data.length; i += C) { const [R, G, B] = [data[i], data[i + 1], data[i + 2]]; if (G > 150 && G > R * 1.3 && G > B * 1.8) { rs += R; gs += G; bs += B; n++ } }
const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0')
console.log('akzent #' + hex(rs) + hex(gs) + hex(bs), 'aus', n, 'Pixeln')
