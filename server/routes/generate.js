const express = require('express');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');
const { strict: strictLimiter } = require('../middleware/rateLimiter');
const storage = require('../utils/storage');
const { TEMP_DIR } = require('../utils/cleanupTemp');

const router = express.Router();

const VALID_BARCODE_TYPES = [
  'qrcode', 'code128', 'code39', 'ean13', 'ean8',
  'upca', 'upce', 'itf14', 'codabar', 'msi',
  'datamatrix', 'pdf417'
];

const QR_ERROR_LEVELS = ['L', 'M', 'Q', 'H'];

function validateHexColor(color) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

function validateParams(body) {
  const errors = [];
  const { type, content, size, errorLevel, bgColor, fgColor, margin } = body;

  if (!type || !VALID_BARCODE_TYPES.includes(type)) {
    errors.push(`条码类型无效，支持: ${VALID_BARCODE_TYPES.join(', ')}`);
  }
  if (!content || typeof content !== 'string' || content.length === 0) {
    errors.push('条码内容不能为空');
  }
  if (content && content.length > 4000) {
    errors.push('条码内容过长（最大4000字符）');
  }
  if (size && (isNaN(size) || size < 50 || size > 2000)) {
    errors.push('尺寸应在50-2000像素之间');
  }
  if (type === 'qrcode' && errorLevel && !QR_ERROR_LEVELS.includes(errorLevel)) {
    errors.push(`纠错等级无效，支持: ${QR_ERROR_LEVELS.join(', ')}`);
  }
  if (bgColor && !validateHexColor(bgColor)) {
    errors.push('背景颜色格式错误，应为十六进制颜色');
  }
  if (fgColor && !validateHexColor(fgColor)) {
    errors.push('前景颜色格式错误，应为十六进制颜色');
  }
  if (margin !== undefined && (isNaN(margin) || margin < 0 || margin > 50)) {
    errors.push('边距应在0-50之间');
  }
  return errors;
}

router.post('/qrcode', strictLimiter, async (req, res, next) => {
  try {
    const errors = validateParams({ ...req.body, type: 'qrcode' });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const {
      content,
      size = 300,
      errorLevel = 'M',
      bgColor = '#FFFFFF',
      fgColor = '#000000',
      margin = 2,
      logo
    } = req.body;

    const qrOptions = {
      errorCorrectionLevel: errorLevel,
      width: parseInt(size),
      margin: parseInt(margin),
      color: {
        dark: fgColor,
        light: bgColor
      }
    };

    let buffer = await QRCode.toBuffer(content, qrOptions);

    if (logo) {
      try {
        const logoBuffer = Buffer.from(logo.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        buffer = await embedLogoToQR(buffer, logoBuffer, parseInt(size));
      } catch (e) {
        console.error('[Logo] LOGO嵌入失败:', e.message);
      }
    }

    const fileName = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    const filePath = path.join(TEMP_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    const record = storage.addRecord('generate', {
      type: 'qrcode',
      content: content.substring(0, 200),
      size: parseInt(size),
      errorLevel,
      bgColor,
      fgColor,
      fileName
    });

    res.json({
      success: true,
      data: {
        image: `data:image/png;base64,${buffer.toString('base64')}`,
        url: `/temp/${fileName}`,
        fileName,
        id: record.id
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/barcode', strictLimiter, async (req, res, next) => {
  try {
    const errors = validateParams(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const {
      type = 'code128',
      content,
      size = 300,
      height = 100,
      bgColor = '#FFFFFF',
      fgColor = '#000000',
      includeText = true,
      margin = 10
    } = req.body;

    if (type === 'qrcode') {
      return res.status(400).json({
        success: false,
        errors: ['请使用二维码接口生成二维码']
      });
    }

    const targetWidth = parseInt(size);
    const targetHeight = parseInt(height);
    const marginVal = parseInt(margin) || 10;

    const baseOptions = {
      bcid: type,
      text: content,
      scale: 1,
      height: 50,
      includetext: includeText,
      textxalign: 'center',
      backgroundcolor: bgColor,
      barcolor: fgColor,
      paddingwidth: marginVal,
      paddingheight: 10
    };

    const basePng = await bwipjs.toBuffer(baseOptions);
    const baseImg = await Jimp.read(basePng);
    const baseWidth = baseImg.bitmap.width;
    const baseHeight = baseImg.bitmap.height;

    const scaleX = targetWidth / baseWidth;
    const scaleY = targetHeight / baseHeight;

    const finalOptions = {
      ...baseOptions,
      scaleX: scaleX,
      scaleY: scaleY
    };

    const png = await bwipjs.toBuffer(finalOptions);
    const finalImg = await Jimp.read(png);
    const actualWidth = finalImg.bitmap.width;
    const actualHeight = finalImg.bitmap.height;

    const fileName = `bar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    const filePath = path.join(TEMP_DIR, fileName);
    fs.writeFileSync(filePath, png);

    const record = storage.addRecord('generate', {
      type,
      content: content.substring(0, 200),
      size: actualWidth,
      width: actualWidth,
      height: actualHeight,
      bgColor,
      fgColor,
      includeText,
      fileName
    });

    res.json({
      success: true,
      data: {
        image: `data:image/png;base64,${png.toString('base64')}`,
        url: `/temp/${fileName}`,
        fileName,
        id: record.id,
        width: actualWidth,
        height: actualHeight
      }
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
});

async function embedLogoToQR(qrBuffer, logoBuffer, size) {
  const qrImg = await Jimp.read(qrBuffer);
  const logoImg = await Jimp.read(logoBuffer);

  const logoSize = Math.floor(size * 0.2);
  logoImg.resize(logoSize, logoSize, Jimp.RESIZE_BILINEAR);

  const x = Math.floor((qrImg.bitmap.width - logoSize) / 2);
  const y = Math.floor((qrImg.bitmap.height - logoSize) / 2);

  const padding = Math.floor(logoSize * 0.1);
  const whiteBg = new Jimp(logoSize + padding * 2, logoSize + padding * 2, 0xFFFFFFFF);
  whiteBg.composite(logoImg, padding, padding);

  qrImg.composite(whiteBg, x - padding, y - padding);

  return await qrImg.getBufferAsync(Jimp.MIME_PNG);
}

router.get('/types', (req, res) => {
  res.json({
    success: true,
    data: {
      barcodeTypes: VALID_BARCODE_TYPES,
      qrErrorLevels: QR_ERROR_LEVELS
    }
  });
});

module.exports = router;
