const express = require('express');
const storage = require('../utils/storage');
const fs = require('fs');
const path = require('path');
const { TEMP_DIR } = require('../utils/cleanupTemp');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const Jimp = require('jimp');

const router = express.Router();

const PERMANENT_DIR = path.join(__dirname, '..', 'permanent');
if (!fs.existsSync(PERMANENT_DIR)) {
  fs.mkdirSync(PERMANENT_DIR, { recursive: true });
}

router.get('/:type', (req, res) => {
  const { type } = req.params;
  const { limit, keyword, codeType, timeRange } = req.query;

  if (!['generate', 'decode'].includes(type)) {
    return res.status(400).json({
      success: false,
      error: '类型无效，仅支持 generate 或 decode'
    });
  }

  let records;
  if (keyword || codeType || timeRange) {
    records = storage.filterRecords(type, {
      keyword,
      codeType,
      timeRange,
      limit: parseInt(limit) || 500
    });
  } else {
    records = storage.getRecords(type, parseInt(limit) || 500);
  }

  res.json({
    success: true,
    data: records,
    total: records.length
  });
});

router.get('/:type/:id', (req, res) => {
  const { type, id } = req.params;

  if (!['generate', 'decode'].includes(type)) {
    return res.status(400).json({
      success: false,
      error: '类型无效'
    });
  }

  const record = storage.getRecordById(type, id);
  if (record) {
    return res.json({ success: true, data: record });
  } else {
    return res.status(404).json({ success: false, error: '记录不存在' });
  }
});

router.post('/regenerate/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = storage.getRecordById('generate', id);
    if (!record) {
      return res.status(404).json({ success: false, error: '记录不存在' });
    }

    let buffer;
    const { type, content, size, errorLevel, bgColor, fgColor,
      height, includeText, margin, width } = record;

    if (type === 'qrcode') {
      const qrOptions = {
        errorCorrectionLevel: errorLevel || 'M',
        width: parseInt(size) || 300,
        margin: parseInt(margin) || 2,
        color: {
          dark: fgColor || '#000000',
          light: bgColor || '#FFFFFF'
        }
      };
      buffer = await QRCode.toBuffer(content, qrOptions);
    } else {
      const targetWidth = parseInt(size) || parseInt(width) || 300;
      const targetHeight = parseInt(height) || 100;
      const marginVal = parseInt(margin) || 10;

      const baseOptions = {
        bcid: type,
        text: content,
        scale: 1,
        height: 50,
        includetext: includeText !== false,
        textxalign: 'center',
        backgroundcolor: bgColor || '#FFFFFF',
        barcolor: fgColor || '#000000',
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

      buffer = await bwipjs.toBuffer(finalOptions);
    }

    const ext = path.extname(record.fileName || '.png');
    const newFileName = `regen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const permanentPath = path.join(PERMANENT_DIR, newFileName);
    fs.writeFileSync(permanentPath, buffer);

    storage.updateRecord('generate', id, {
      fileName: newFileName,
      permanent: true
    });

    res.json({
      success: true,
      data: {
        image: `data:image/png;base64,${buffer.toString('base64')}`,
        url: `/permanent/${newFileName}`,
        fileName: newFileName
      }
    });
  } catch (e) {
    console.error('[Regenerate] 重新生成失败:', e);
    next(e);
  }
});

router.delete('/:type/:id', (req, res) => {
  const { type, id } = req.params;

  if (!['generate', 'decode'].includes(type)) {
    return res.status(400).json({
      success: false,
      error: '类型无效'
    });
  }

  const record = storage.getRecordById(type, id);
  if (record && record.fileName) {
    if (record.permanent) {
      const filePath = path.join(PERMANENT_DIR, record.fileName);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    } else {
      const filePath = path.join(TEMP_DIR, record.fileName);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }
  }

  const deleted = storage.deleteRecord(type, id);
  res.json({ success: deleted });
});

router.delete('/:type', (req, res) => {
  const { type } = req.params;

  if (!['generate', 'decode'].includes(type)) {
    return res.status(400).json({
      success: false,
      error: '类型无效'
    });
  }

  const records = storage.getRecords(type, 1000);
  for (const r of records) {
    if (r.fileName) {
      if (r.permanent) {
        const filePath = path.join(PERMANENT_DIR, r.fileName);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) {}
        }
      } else {
          const filePath = path.join(TEMP_DIR, r.fileName);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }
        }
    }
  }

  const cleared = storage.clearRecords(type);
  res.json({ success: cleared });
});

module.exports = router;
