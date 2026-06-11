const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024;

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `operation-${date}.log`);
}

function rotateLog(filePath) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > MAX_LOG_SIZE) {
    const ts = Date.now();
    fs.renameSync(filePath, filePath.replace('.log', `-${ts}.log`));
  }
}

module.exports = function (req, res, next) {
  const start = Date.now();
  const originalSend = res.send;
  let responseBody = '';

  res.send = function (body) {
    responseBody = typeof body === 'string' ? body.substring(0, 200) : JSON.stringify(body).substring(0, 200);
    return originalSend.apply(this, arguments);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      ip: req.ip || req.connection.remoteAddress,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    const logFile = getLogFile();
    rotateLog(logFile);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf8');
  });

  next();
};

module.exports.LOG_DIR = LOG_DIR;
