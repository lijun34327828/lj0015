const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { BrowserMultiFormatReader, NotFoundException } = require('@zxing/library');
const Jimp = require('jimp');
const { strict: strictLimiter } = require('../middleware/rateLimiter');
const storage = require('../utils/storage');
const { preprocessBarcodeImage } = require('../utils/imagePreprocess');
const { TEMP_DIR } = require('../utils/cleanupTemp');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持图片文件'));
    }
  }
});

const codeReader = new BrowserMultiFormatReader();

async function decodeFromBuffer(buffer) {
  const img = await Jimp.read(buffer);
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  const luminanceSource = {
    getWidth: () => w,
    getHeight: () => h,
    getRow: (y, row) => {
      if (!row || row.length < w) row = new Uint8ClampedArray(w);
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = img.bitmap.data[idx];
        const g = img.bitmap.data[idx + 1];
        const b = img.bitmap.data[idx + 2];
        row[x] = (r + g + b) / 3;
      }
      return row;
    },
    getMatrix: () => {
      const matrix = new Uint8ClampedArray(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const r = img.bitmap.data[idx];
          const g = img.bitmap.data[idx + 1];
          const b = img.bitmap.data[idx + 2];
          matrix[y * w + x] = (r + g + b) / 3;
        }
      }
      return matrix;
    }
  };

  try {
    const result = await codeReader.decodeFromLuminanceSource(luminanceSource, w, h);
    return {
      text: result.text,
      format: result.format,
      timestamp: Date.now()
    };
  } catch (e) {
    if (e instanceof NotFoundException) {
      return null;
    }
    throw e;
  }
}

router.post('/image', strictLimiter, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file && !req.body.image) {
      return res.status(400).json({
        success: false,
        errors: ['请上传图片或提供图片数据']
      });
    }

    let buffer;
    let originalName;

    if (req.file) {
      buffer = req.file.buffer;
      originalName = req.file.originalname;
    } else if (req.body.image) {
      const base64 = req.body.image.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64, 'base64');
      originalName = 'screenshot.png';
    }

    const fileName = `decode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    const filePath = path.join(TEMP_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    const preprocessed = await preprocessBarcodeImage(buffer);

    let result = null;
    let usedMethod = 'original';

    for (const [key, buf] of Object.entries(preprocessed)) {
      try {
        const decoded = await decodeFromBuffer(buf);
        if (decoded) {
          result = decoded;
          usedMethod = key;
          break;
        }
      } catch (e) {
        // skip
      }
    }

    const record = storage.addRecord('decode', {
      success: !!result,
      content: result ? result.text.substring(0, 500) : '',
      format: result ? result.format : null,
      method: usedMethod,
      originalName,
      fileName
    });

    if (!result) {
      return res.json({
        success: false,
        error: '未能识别到条码信息，请尝试更清晰的图片',
        id: record.id
      });
    }

    res.json({
      success: true,
      data: {
        text: result.text,
        format: result.format,
        method: usedMethod,
        url: `/temp/${fileName}`,
        id: record.id
      }
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
