const express = require('express');
const storage = require('../utils/storage');
const fs = require('fs');
const path = require('path');
const { TEMP_DIR } = require('../utils/cleanupTemp');

const router = express.Router();

router.get('/:type', (req, res) => {
  const { type } = req.params;
  const { limit, keyword } = req.query;

  if (!['generate', 'decode'].includes(type)) {
    return res.status(400).json({
      success: false,
      error: '类型无效，仅支持 generate 或 decode'
    });
  }

  let records;
  if (keyword) {
    records = storage.searchRecords(type, keyword);
  } else {
    records = storage.getRecords(type, parseInt(limit) || 100);
  }

  res.json({
    success: true,
    data: records
  });
});

router.delete('/:type/:id', (req, res) => {
  const { type, id } = req.params;

  if (!['generate', 'decode'].includes(type)) {
    return res.status(400).json({
      success: false,
      error: '类型无效'
    });
  }

  const records = storage.getRecords(type, 1);
  const record = records.find(r => r.id === id);
  if (record && record.fileName) {
    const filePath = path.join(TEMP_DIR, record.fileName);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
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
      const filePath = path.join(TEMP_DIR, r.fileName);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }
  }

  const cleared = storage.clearRecords(type);
  res.json({ success: cleared });
});

module.exports = router;
