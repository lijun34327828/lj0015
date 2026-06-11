const express = require('express');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const multer = require('multer');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { batch: batchLimiter } = require('../middleware/rateLimiter');
const storage = require('../utils/storage');
const { preprocessBarcodeImage } = require('../utils/imagePreprocess');
const { TEMP_DIR } = require('../utils/cleanupTemp');
const { BrowserMultiFormatReader, NotFoundException } = require('@zxing/library');

const router = express.Router();
const codeReader = new BrowserMultiFormatReader();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post('/generate', batchLimiter, async (req, res, next) => {
  try {
    const { items = [], options = {} } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        errors: ['批量生成内容不能为空']
      });
    }

    if (items.length > 100) {
      return res.status(400).json({
        success: false,
        errors: ['单次批量生成最多100个']
      });
    }

    const {
      type = 'qrcode',
      size = 300,
      errorLevel = 'M',
      bgColor = '#FFFFFF',
      fgColor = '#000000',
      height = 100,
      margin = 2
    } = options;

    const results = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        let buffer;
        const content = typeof item === 'string' ? item : item.content;
        const label = item.label || content.substring(0, 20);

        if (!content) {
          errors.push(`第${i + 1}项：内容为空`);
          continue;
        }

        if (type === 'qrcode') {
          buffer = await QRCode.toBuffer(content, {
            errorCorrectionLevel: errorLevel,
            width: parseInt(size),
            margin: parseInt(margin),
            color: { dark: fgColor, light: bgColor }
          });
        } else {
          buffer = await bwipjs.toBuffer({
            bcid: type,
            text: content,
            scale: 3,
            height: parseInt(height) / 72 * 25.4,
            includetext: true,
            textxalign: 'center',
            backgroundcolor: bgColor,
            barcolor: fgColor,
            paddingwidth: parseInt(margin) || 10,
            paddingheight: 10
          });
        }

        const safeLabel = label.replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `batch_${Date.now()}_${i}_${safeLabel}.png`;
        const filePath = path.join(TEMP_DIR, fileName);
        fs.writeFileSync(filePath, buffer);

        results.push({
          index: i,
          content: content.substring(0, 200),
          label,
          fileName,
          url: `/temp/${fileName}`,
          image: `data:image/png;base64,${buffer.toString('base64')}`
        });

        storage.addRecord('generate', {
          type,
          content: content.substring(0, 200),
          batch: true,
          fileName
        });
      } catch (e) {
        errors.push(`第${i + 1}项：${e.message}`);
      }
    }

    const zipFileName = `batch_${Date.now()}.zip`;
    const zipPath = path.join(TEMP_DIR, zipFileName);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    for (const r of results) {
      const imgBuffer = Buffer.from(r.image.split(',')[1], 'base64');
      archive.append(imgBuffer, { name: `${r.index + 1}_${r.label || r.content.substring(0, 10)}.png` });
    }
    await archive.finalize();

    res.json({
      success: true,
      data: {
        results,
        errors,
        total: items.length,
        successCount: results.length,
        zipUrl: `/temp/${zipFileName}`
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/decode', batchLimiter, upload.array('images', 50), async (req, res, next) => {
  try {
    const files = req.files || [];
    let images = files.map(f => ({ buffer: f.buffer, name: f.originalname }));

    if (req.body.images && Array.isArray(req.body.images)) {
      for (const img of req.body.images) {
        if (typeof img === 'string' && img.startsWith('data:image')) {
          images.push({
            buffer: Buffer.from(img.split(',')[1], 'base64'),
            name: `screenshot_${Date.now()}.png`
          });
        }
      }
    }

    if (images.length === 0) {
      return res.status(400).json({
        success: false,
        errors: ['请上传待解析的图片']
      });
    }

    if (images.length > 50) {
      return res.status(400).json({
        success: false,
        errors: ['单次批量解析最多50张图片']
      });
    }

    const results = [];

    for (let i = 0; i < images.length; i++) {
      const { buffer, name } = images[i];
      let result = null;
      let usedMethod = null;

      try {
        const preprocessed = await preprocessBarcodeImage(buffer);
        for (const [key, buf] of Object.entries(preprocessed)) {
          try {
            const img = await Jimp.read(buf);
            const w = img.bitmap.width;
            const h = img.bitmap.height;
            const luminanceSource = {
              getWidth: () => w,
              getHeight: () => h,
              getRow: (y, row) => {
                if (!row || row.length < w) row = new Uint8ClampedArray(w);
                for (let x = 0; x < w; x++) {
                  const idx = (y * w + x) * 4;
                  row[x] = (img.bitmap.data[idx] + img.bitmap.data[idx + 1] + img.bitmap.data[idx + 2]) / 3;
                }
                return row;
              },
              getMatrix: () => {
                const matrix = new Uint8ClampedArray(w * h);
                for (let y = 0; y < h; y++) {
                  for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    matrix[y * w + x] = (img.bitmap.data[idx] + img.bitmap.data[idx + 1] + img.bitmap.data[idx + 2]) / 3;
                  }
                }
                return matrix;
              }
            };
            const decoded = await codeReader.decodeFromLuminanceSource(luminanceSource, w, h);
            if (decoded) {
              result = decoded;
              usedMethod = key;
              break;
            }
          } catch (e) {
            if (!(e instanceof NotFoundException)) {
              // skip
            }
          }
        }
      } catch (e) {
        // skip
      }

      const fileName = `batch_decode_${Date.now()}_${i}.png`;
      fs.writeFileSync(path.join(TEMP_DIR, fileName), buffer);

      results.push({
        index: i,
        name,
        success: !!result,
        text: result ? result.text : null,
        format: result ? result.format : null,
        method: usedMethod,
        url: `/temp/${fileName}`
      });

      if (result) {
        storage.addRecord('decode', {
          success: true,
          content: result.text.substring(0, 500),
          format: result.format,
          method: usedMethod,
          originalName: name,
          fileName,
          batch: true
        });
      }
    }

    res.json({
      success: true,
      data: {
        results,
        total: images.length,
        successCount: results.filter(r => r.success).length
      }
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
