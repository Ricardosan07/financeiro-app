const sharp = require('sharp')
const path = require('path')

const input = path.join(__dirname, '../public/icon-512.png')
const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

async function generate() {
  for (const size of sizes) {
    await sharp(input)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, `../public/icon-${size}.png`))
    console.log(`✓ icon-${size}.png`)
  }
  console.log('Concluído!')
}

generate()
