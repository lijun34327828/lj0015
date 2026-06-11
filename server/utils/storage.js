const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_ITEMS = 500;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return { generate: [], decode: [] };
    }
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { generate: [], decode: [] };
  }
}

function writeHistory(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function addRecord(type, record) {
  const history = readHistory();
  if (!history[type]) history[type] = [];
  history[type].unshift({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    timestamp: Date.now(),
    ...record
  });
  if (history[type].length > MAX_ITEMS) {
    history[type] = history[type].slice(0, MAX_ITEMS);
  }
  writeHistory(history);
  return history[type][0];
}

function getRecords(type, limit = 100) {
  const history = readHistory();
  return (history[type] || []).slice(0, limit);
}

function deleteRecord(type, id) {
  const history = readHistory();
  if (!history[type]) return false;
  const idx = history[type].findIndex(r => r.id === id);
  if (idx === -1) return false;
  history[type].splice(idx, 1);
  writeHistory(history);
  return true;
}

function clearRecords(type) {
  const history = readHistory();
  history[type] = [];
  writeHistory(history);
  return true;
}

function searchRecords(type, keyword) {
  const history = readHistory();
  const records = history[type] || [];
  const kw = keyword.toLowerCase();
  return records.filter(r => {
    return Object.values(r).some(v =>
      typeof v === 'string' && v.toLowerCase().includes(kw)
    );
  }).slice(0, 100);
}

function filterRecords(type, options = {}) {
  const { keyword, codeType, timeRange, limit = 500 } = options;
  const history = readHistory();
  let records = history[type] || [];

  if (keyword) {
    const kw = keyword.toLowerCase();
    records = records.filter(r =>
      Object.values(r).some(v =>
        typeof v === 'string' && v.toLowerCase().includes(kw)
      )
    );
  }

  if (codeType) {
    if (codeType === 'qrcode') {
      records = records.filter(r => r.type === 'qrcode');
    } else if (codeType === 'barcode') {
      records = records.filter(r => r.type && r.type !== 'qrcode');
    } else {
      records = records.filter(r => r.type === codeType);
    }
  }

  if (timeRange) {
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOf7DaysAgo = new Date();
    startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 7);
    startOf7DaysAgo.setHours(0, 0, 0, 0);

    if (timeRange === 'today') {
      records = records.filter(r => r.timestamp >= startOfDay.getTime());
    } else if (timeRange === '7days') {
      records = records.filter(r => r.timestamp >= startOf7DaysAgo.getTime());
    }
  }

  return records.slice(0, limit);
}

function getRecordById(type, id) {
  const history = readHistory();
  const records = history[type] || [];
  return records.find(r => r.id === id) || null;
}

function updateRecord(type, id, updates) {
  const history = readHistory();
  if (!history[type]) return null;
  const idx = history[type].findIndex(r => r.id === id);
  if (idx === -1) return null;
  history[type][idx] = { ...history[type][idx], ...updates };
  writeHistory(history);
  return history[type][idx];
}

module.exports = {
  readHistory,
  writeHistory,
  addRecord,
  getRecords,
  deleteRecord,
  clearRecords,
  searchRecords,
  filterRecords,
  getRecordById,
  updateRecord
};
