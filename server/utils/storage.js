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

module.exports = {
  readHistory,
  writeHistory,
  addRecord,
  getRecords,
  deleteRecord,
  clearRecords,
  searchRecords
};
