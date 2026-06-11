const fs = require('fs');
const path = require('path');

const TEMP_DIR = path.join(__dirname, '..', 'temp');
const EXPIRE_MS = 30 * 60 * 1000;
const CHECK_INTERVAL = 5 * 60 * 1000;

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function cleanup() {
  try {
    const now = Date.now();
    const files = fs.readdirSync(TEMP_DIR);
    let removed = 0;

    for (const file of files) {
      if (file === '.gitkeep') continue;
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > EXPIRE_MS) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch (e) {
        // skip
      }
    }

    if (removed > 0) {
      console.log(`[Cleanup] 已清理 ${removed} 个过期临时文件`);
    }
  } catch (e) {
    console.error('[Cleanup] 清理失败:', e.message);
  }
}

let timer = null;

module.exports = {
  start() {
    if (timer) return;
    cleanup();
    timer = setInterval(cleanup, CHECK_INTERVAL);
    console.log('[Cleanup] 临时文件清理任务已启动');
  },
  stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  },
  cleanup,
  TEMP_DIR
};
