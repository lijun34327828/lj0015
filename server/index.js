const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8655;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/temp', express.static(path.join(__dirname, 'temp')));

const logger = require('./utils/logger');
const rateLimiter = require('./middleware/rateLimiter');
const cleanupTemp = require('./utils/cleanupTemp');

app.use(logger);
app.use('/api', rateLimiter);

app.use('/api/generate', require('./routes/generate'));
app.use('/api/decode', require('./routes/decode'));
app.use('/api/batch', require('./routes/batch'));
app.use('/api/history', require('./routes/history'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || '服务器内部错误'
  });
});

cleanupTemp.start();

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  条码综合工具服务已启动`);
  console.log(`  端口: ${PORT}`);
  console.log(`  访问: http://localhost:${PORT}`);
  console.log(`========================================\n`);
});
