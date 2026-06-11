const Jimp = require('jimp');
const sharp = require('sharp');

async function preprocessBarcodeImage(buffer) {
  const results = {};

  try {
    results.original = buffer;

    const sharpImg = sharp(buffer);
    const metadata = await sharpImg.metadata();

    const enhanced = await sharpImg
      .greyscale()
      .normalize()
      .modulate({ brightness: 1.2, saturation: 0 })
      .sharpen({ sigma: 1.2, flat: false })
      .toBuffer();
    results.enhanced = enhanced;

    const contrast = await sharp(buffer)
      .greyscale()
      .linear(2.0, -(0.5 * 256))
      .toBuffer();
    results.contrast = contrast;

    const threshold = await sharp(buffer)
      .greyscale()
      .threshold(128)
      .toBuffer();
    results.threshold = threshold;

    try {
      const upscale = await sharp(buffer)
        .resize(Math.max(metadata.width * 2, 600), null, {
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: false
        })
        .greyscale()
        .normalize()
        .sharpen({ sigma: 1.5 })
        .toBuffer();
      results.upscale = upscale;
    } catch (e) {
      // skip upscale
    }

    try {
      const medianBuffer = await applyMedianFilter(buffer);
      if (medianBuffer) {
        results.denoised = medianBuffer;
      }
    } catch (e) {
      // skip
    }

    try {
      const jimpImg = await Jimp.read(buffer);
      for (let angle of [5, -5, 10, -10, 15, -15]) {
        try {
          const rotated = await Jimp.read(buffer);
          rotated.rotate(angle, false);
          const rotatedBuf = await rotated.getBufferAsync(Jimp.MIME_PNG);
          results[`rotated_${angle}`] = rotatedBuf;
        } catch (e) {
          // skip
        }
      }
    } catch (e) {
      // skip rotation
    }

    return results;
  } catch (e) {
    console.error('[Preprocess] 预处理失败:', e.message);
    return { original: buffer };
  }
}

async function applyMedianFilter(buffer) {
  try {
    const img = await Jimp.read(buffer);
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    const result = img.clone();

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const vals = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const col = Jimp.intToRGBA(img.getPixelColor(x + dx, y + dy));
            vals.push((col.r + col.g + col.b) / 3);
          }
        }
        vals.sort((a, b) => a - b);
        const median = vals[4];
        const v = Math.round(median);
        result.setPixelColor(Jimp.rgbaToInt(v, v, v, 255), x, y);
      }
    }
    return await result.getBufferAsync(Jimp.MIME_PNG);
  } catch (e) {
    return null;
  }
}

module.exports = {
  preprocessBarcodeImage
};
