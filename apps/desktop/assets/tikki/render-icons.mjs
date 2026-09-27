// Rendert tikki.svg in alle Formate, die apps/desktop/assets erwartet.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import png2icons from 'png2icons'

const here = path.dirname(new URL(import.meta.url).pathname)
const out = process.argv[2] || path.join(here, 'out')
fs.mkdirSync(out, { recursive: true })
const svg = fs.readFileSync(path.join(here, 'tikki.svg'))

// 1) Volles Icon (Windows/Linux): 1024, ohne Rand
const full = await sharp(svg, { density: 300 }).resize(1024, 1024).png().toBuffer()
fs.writeFileSync(path.join(out, 'icon.png'), full)
fs.writeFileSync(path.join(out, 'icon-dark.png'), full)

// 2) macOS-Variante: Apple-Vorgabe, Bild auf 824/1024 verkleinert, transparenter Rand
const inner = await sharp(svg, { density: 300 }).resize(824, 824).png().toBuffer()
const mac = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: inner, left: 100, top: 100 }])
  .png()
  .toBuffer()
fs.writeFileSync(path.join(out, 'icon-mac.png'), mac)

// 3) ICNS und ICO
const icns = png2icons.createICNS(mac, png2icons.BICUBIC, 0)
const ico = png2icons.createICO(full, png2icons.BICUBIC, 0, false)
fs.writeFileSync(path.join(out, 'icon.icns'), icns)
fs.writeFileSync(path.join(out, 'icon-dark.icns'), icns)
fs.writeFileSync(path.join(out, 'icon.ico'), ico)
fs.writeFileSync(path.join(out, 'icon-dark.ico'), ico)

// 4) Vorschau in klein, um die Lesbarkeit zu prüfen
for (const s of [16, 32, 64, 128, 256, 512]) {
  fs.writeFileSync(path.join(out, `preview-${s}.png`), await sharp(full).resize(s, s).png().toBuffer())
}
console.log('fertig:', fs.readdirSync(out).join(', '))
