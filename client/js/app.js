const API = '/api';

const state = {
  codeType: 'qrcode',
  logoData: null,
  decodeImage: null,
  batchMode: 'generate',
  historyType: 'generate',
  batchDecodeFiles: [],
  currentGenerateUrl: null,
  currentGenerateContent: null,
  batchZipUrl: null
};

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showToast(msg, type = 'info') {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制到剪贴板', 'success');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已复制到剪贴板', 'success');
  }
}

function downloadImage(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename || `barcode_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isURL(str) {
  return /^https?:\/\/[^\s]+$/i.test(str);
}

function validateHex(color) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`#tab-${name}`).classList.add('active');
    if (name === 'history') loadHistory();
  });
});

$$('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.codeType = btn.dataset.codeType;

    const isQR = state.codeType === 'qrcode';
    $('#barcode-type-select').style.display = isQR ? 'none' : 'block';
    $('#heightRow').style.display = isQR ? 'none' : 'block';
    $('#logoSection').style.display = isQR ? 'block' : 'none';
    $('#includeTextRow').style.display = isQR ? 'none' : 'block';
    $('#errorLabel').textContent = isQR ? '纠错等级' : '条码密度';
  });
});

function syncColor(pickerId, textId) {
  const picker = $(pickerId);
  const text = $(textId);
  picker.addEventListener('input', () => { text.value = picker.value.toUpperCase(); });
  text.addEventListener('input', () => {
    if (validateHex(text.value)) {
      picker.value = text.value;
    }
  });
}
syncColor('#fgColor', '#fgColorText');
syncColor('#bgColor', '#bgColorText');

$('#contentInput').addEventListener('input', e => {
  $('#contentCount').textContent = e.target.value.length;
  $('#contentError').textContent = '';
});

$('#logoUploader').addEventListener('click', () => $('#logoFile').click());
$('#logoFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.logoData = reader.result;
    $('#logoPreview').innerHTML = `<img src="${reader.result}" alt="LOGO">`;
    $('#clearLogo').style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
});

$('#clearLogo').addEventListener('click', () => {
  state.logoData = null;
  $('#logoFile').value = '';
  $('#logoPreview').innerHTML = `
    <div class="logo-placeholder">
      <svg viewBox="0 0 48 48" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="8" y="8" width="32" height="32" rx="4"/>
        <circle cx="18" cy="18" r="4" fill="currentColor" opacity="0.3"/>
        <path d="M8 34 L18 24 L28 34 L32 30 L40 38"/>
      </svg>
      <span>点击上传LOGO图片</span>
    </div>`;
  $('#clearLogo').style.display = 'none';
});

function validateGenerateParams() {
  const errors = [];
  const content = $('#contentInput').value.trim();
  const size = parseInt($('#sizeInput').value);

  if (!content) errors.push('请输入条码内容');
  else if (content.length > 4000) errors.push('内容过长，最多4000字符');

  if (isNaN(size) || size < 50 || size > 2000) errors.push('尺寸应在50-2000像素之间');

  if (!validateHex($('#bgColorText').value)) errors.push('背景颜色格式错误');
  if (!validateHex($('#fgColorText').value)) errors.push('前景颜色格式错误');

  $('#contentError').textContent = errors.filter(e => e.includes('内容')).join('; ');
  $('#sizeError').textContent = errors.filter(e => e.includes('尺寸')).join('; ');

  return errors;
}

$('#generateBtn').addEventListener('click', async () => {
  const errors = validateGenerateParams();
  if (errors.length > 0) {
    showToast(errors[0], 'error');
    return;
  }

  const btn = $('#generateBtn');
  $('#generateBtnText').textContent = '生成中...';
  $('#generateSpinner').style.display = 'inline-block';
  btn.disabled = true;

  try {
    const payload = {
      content: $('#contentInput').value.trim(),
      size: parseInt($('#sizeInput').value),
      bgColor: $('#bgColorText').value,
      fgColor: $('#fgColorText').value,
      margin: parseInt($('#marginInput').value) || 0
    };

    let url, typeLabel;

    if (state.codeType === 'qrcode') {
      url = `${API}/generate/qrcode`;
      payload.errorLevel = $('#errorLevel').value;
      if (state.logoData) payload.logo = state.logoData;
      typeLabel = '二维码 QR Code';
    } else {
      url = `${API}/generate/barcode`;
      payload.type = $('#barcodeFormat').value;
      payload.height = parseInt($('#heightInput').value) || 100;
      payload.includeText = $('#includeText').checked;
      typeLabel = $('#barcodeFormat').selectedOptions[0].text;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data.success) {
      showToast((data.errors && data.errors[0]) || data.error || '生成失败', 'error');
      return;
    }

    state.currentGenerateUrl = data.data.url;
    state.currentGenerateContent = payload.content;

    $('#previewPlaceholder').style.display = 'none';
    const img = $('#previewImage');
    img.src = data.data.image;
    img.style.display = 'block';

    $('#previewInfo').style.display = 'block';
    $('#infoContent').textContent = payload.content.length > 60 ? payload.content.substring(0, 60) + '...' : payload.content;
    $('#infoContent').title = payload.content;
    $('#infoType').textContent = typeLabel;
    if (state.codeType === 'qrcode') {
      $('#infoSize').textContent = `${payload.size}px`;
    } else {
      const w = data.data.width || payload.size;
      const h = data.data.height || payload.height;
      $('#infoSize').textContent = `${w} × ${h} px`;
    }
    $('#infoTime').textContent = formatTime(Date.now());

    showToast('生成成功', 'success');
  } catch (e) {
    console.error(e);
    showToast('网络错误，请重试', 'error');
  } finally {
    $('#generateBtnText').textContent = '生成条码';
    $('#generateSpinner').style.display = 'none';
    btn.disabled = false;
  }
});

$('#copyContent').addEventListener('click', () => {
  if (!state.currentGenerateContent) {
    showToast('请先生成条码', 'error');
    return;
  }
  copyText(state.currentGenerateContent);
});

$('#downloadBtn').addEventListener('click', () => {
  if (!$('#previewImage').src || $('#previewPlaceholder').style.display !== 'none') {
    showToast('请先生成条码', 'error');
    return;
  }
  downloadImage($('#previewImage').src, `barcode_${Date.now()}.png`);
});

function setupDropZone(el, onFile) {
  el.addEventListener('click', () => el.querySelector('input[type=file]').click());
  el.addEventListener('dragover', e => {
    e.preventDefault();
    el.classList.add('dragover');
  });
  el.addEventListener('dragleave', () => el.classList.remove('dragover'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) onFile(file);
  });
}

function handleDecodeFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.decodeImage = reader.result;
    $('#decodePreviewImg').src = reader.result;
    $('#decodeImagePreview').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

setupDropZone($('#decodeUploader'), handleDecodeFile);

$('#decodeFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) handleDecodeFile(f);
});

$('#clearDecodeImage').addEventListener('click', () => {
  state.decodeImage = null;
  $('#decodeFile').value = '';
  $('#decodeImagePreview').style.display = 'none';
  $('#decodePreviewImg').src = '';
});

$('#screenshotBtn').addEventListener('click', async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      showToast('浏览器不支持截图功能', 'error');
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const capture = new ImageCapture(track);
    const bitmap = await capture.grabFrame();
    stream.getTracks().forEach(t => t.stop());

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    state.decodeImage = dataUrl;
    $('#decodePreviewImg').src = dataUrl;
    $('#decodeImagePreview').style.display = 'flex';
    showToast('截图已获取', 'success');
  } catch (e) {
    if (e.name !== 'NotAllowedError') {
      showToast('截图失败: ' + e.message, 'error');
    }
  }
});

$('#pasteBtn').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      showToast('浏览器不支持读取剪贴板', 'error');
      return;
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          const reader = new FileReader();
          reader.onload = () => {
            state.decodeImage = reader.result;
            $('#decodePreviewImg').src = reader.result;
            $('#decodeImagePreview').style.display = 'flex';
            showToast('已从剪贴板粘贴图片', 'success');
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    }
    showToast('剪贴板中没有图片', 'error');
  } catch (e) {
    showToast('读取剪贴板失败: ' + e.message, 'error');
  }
});

$('#decodeBtn').addEventListener('click', async () => {
  if (!state.decodeImage) {
    showToast('请先上传图片', 'error');
    return;
  }

  const btn = $('#decodeBtn');
  $('#decodeBtnText').textContent = '识别中...';
  $('#decodeSpinner').style.display = 'inline-block';
  btn.disabled = true;

  try {
    const fd = new FormData();
    fd.append('image', state.decodeImage.startsWith('data:') ? dataURLtoBlob(state.decodeImage) : state.decodeImage);

    const res = await fetch(`${API}/decode/image`, { method: 'POST', body: fd });
    const data = await res.json();

    if (!data.success) {
      $('#decodeResultEmpty').style.display = 'flex';
      $('#decodeResultContent').style.display = 'none';
      showToast(data.error || '识别失败', 'error');
      return;
    }

    const { text, format, method } = data.data;

    $('#decodeResultEmpty').style.display = 'none';
    $('#decodeResultContent').style.display = 'block';
    $('#resultText').textContent = text;
    $('#resultFormat').textContent = format;
    $('#resultMethod').textContent = method === 'original' ? '原图识别' : `预处理: ${method}`;
    $('#resultLength').textContent = `${text.length} 字符`;
    $('#resultTime').textContent = formatTime(Date.now());

    if (isURL(text)) {
      $('#openLinkBtn').style.display = 'inline-flex';
      $('#openLinkBtn').onclick = () => window.open(text, '_blank');
    } else {
      $('#openLinkBtn').style.display = 'none';
    }

    $('#regenerateBtn').onclick = () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('.tab[data-tab="generate"]').classList.add('active');
      $('#tab-generate').classList.add('active');
      $('#contentInput').value = text;
      $('#contentCount').textContent = text.length;
      showToast('已填充到生成模块', 'success');
    };

    showToast('识别成功', 'success');
  } catch (e) {
    console.error(e);
    showToast('网络错误，请重试', 'error');
  } finally {
    $('#decodeBtnText').textContent = '开始识别';
    $('#decodeSpinner').style.display = 'none';
    btn.disabled = false;
  }
});

document.querySelectorAll('.copy-inline').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const text = document.getElementById(target).textContent;
    if (text) copyText(text);
  });
});

function dataURLtoBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

$$('.seg-btn[data-batch-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.seg-btn[data-batch-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.batchMode = btn.dataset.batchMode;
    $('#batchGeneratePanel').style.display = state.batchMode === 'generate' ? 'block' : 'none';
    $('#batchDecodePanel').style.display = state.batchMode === 'decode' ? 'block' : 'none';
  });
});

$('#batchContent').addEventListener('input', e => {
  const lines = e.target.value.split('\n').filter(l => l.trim());
  $('#batchLineCount').textContent = lines.length;
});

$('#batchGenBtn').addEventListener('click', async () => {
  const lines = $('#batchContent').value.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length === 0) {
    showToast('请输入内容（每行一个）', 'error');
    return;
  }
  if (lines.length > 100) {
    showToast('单次最多100条', 'error');
    return;
  }

  const btn = $('#batchGenBtn');
  $('#batchGenSpinner').style.display = 'inline-block';
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/batch/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: lines,
        options: {
          type: $('#batchType').value,
          size: parseInt($('#batchSize').value),
          errorLevel: $('#batchError').value,
          margin: parseInt($('#batchMargin').value) || 0
        }
      })
    });
    const data = await res.json();

    if (!data.success) {
      showToast((data.errors && data.errors[0]) || '批量生成失败', 'error');
      return;
    }

    state.batchZipUrl = data.data.zipUrl;
    renderBatchResults(data.data.results, 'generate');
    $('#statSuccess').textContent = data.data.successCount;
    $('#statFail').textContent = data.data.total - data.data.successCount;
    $('#statTotal').textContent = data.data.total;
    $('#batchStats').style.display = 'grid';
    $('#downloadAllZip').style.display = data.data.successCount > 0 ? 'inline-flex' : 'none';

    showToast(`成功生成 ${data.data.successCount} 个条码`, 'success');
  } catch (e) {
    console.error(e);
    showToast('网络错误', 'error');
  } finally {
    $('#batchGenSpinner').style.display = 'none';
    btn.disabled = false;
  }
});

$('#downloadAllZip').addEventListener('click', () => {
  if (state.batchZipUrl) window.location.href = state.batchZipUrl;
});

function handleBatchDecodeFiles(files) {
  for (const f of files) {
    if (f.type.startsWith('image/') && state.batchDecodeFiles.length < 50) {
      state.batchDecodeFiles.push(f);
    }
  }
  renderBatchFileList();
}

function renderBatchFileList() {
  const list = $('#batchDecodeFileList');
  list.innerHTML = state.batchDecodeFiles.map((f, i) => `
    <div class="file-item">
      <span class="fi-name">${f.name}</span>
      <span>${(f.size / 1024).toFixed(1)} KB</span>
      <button class="btn-ghost btn-sm" onclick="window.__removeBatchFile(${i})">移除</button>
    </div>
  `).join('');
}

window.__removeBatchFile = function (i) {
  state.batchDecodeFiles.splice(i, 1);
  renderBatchFileList();
};

setupDropZone($('#batchDecodeUploader'), file => handleBatchDecodeFiles([file]));
$('#batchDecodeFiles').addEventListener('change', e => handleBatchDecodeFiles(Array.from(e.target.files)));

$('#batchDecBtn').addEventListener('click', async () => {
  if (state.batchDecodeFiles.length === 0) {
    showToast('请上传图片', 'error');
    return;
  }

  const btn = $('#batchDecBtn');
  $('#batchDecSpinner').style.display = 'inline-block';
  btn.disabled = true;

  try {
    const fd = new FormData();
    state.batchDecodeFiles.forEach(f => fd.append('images', f));

    const res = await fetch(`${API}/batch/decode`, { method: 'POST', body: fd });
    const data = await res.json();

    if (!data.success) {
      showToast('批量解析失败', 'error');
      return;
    }

    renderBatchResults(data.data.results, 'decode');
    $('#statSuccess').textContent = data.data.successCount;
    $('#statFail').textContent = data.data.total - data.data.successCount;
    $('#statTotal').textContent = data.data.total;
    $('#batchStats').style.display = 'grid';
    $('#downloadAllZip').style.display = 'none';

    showToast(`成功识别 ${data.data.successCount} 个`, 'success');
  } catch (e) {
    console.error(e);
    showToast('网络错误', 'error');
  } finally {
    $('#batchDecSpinner').style.display = 'none';
    btn.disabled = false;
  }
});

function renderBatchResults(results, mode) {
  const grid = $('#batchGrid');
  if (results.length === 0) {
    grid.innerHTML = `<div class="result-empty"><p>无结果</p></div>`;
    return;
  }
  grid.innerHTML = results.map(r => {
    if (mode === 'generate') {
      return `
        <div class="batch-item">
          <div class="batch-item-img"><img src="${r.image}" alt=""></div>
          <div class="batch-item-info">
            <span class="bi-label" title="${r.content}">${r.label || r.content.substring(0, 18)}</span>
            <span class="bi-status success">成功</span>
          </div>
          <div class="bi-actions">
            <button class="btn-ghost btn-sm" onclick='copyText(${JSON.stringify(r.content)})'>复制</button>
            <button class="btn-ghost btn-sm" onclick='downloadImage("${r.image}", "batch_${r.index}.png")'>下载</button>
          </div>
        </div>`;
    } else {
      const success = r.success;
      return `
        <div class="batch-item">
          <div class="batch-item-img"><img src="${r.url}" alt=""></div>
          <div class="batch-item-info">
            <span class="bi-label" title="${r.name}">${r.name}</span>
            <span class="bi-status ${success ? 'success' : 'fail'}">${success ? (r.text || '').substring(0, 15) : '未识别'}</span>
          </div>
          <div class="bi-actions">
            <button class="btn-ghost btn-sm" ${success ? '' : 'disabled'} onclick='copyText(${JSON.stringify(r.text || '')})'>复制</button>
          </div>
        </div>`;
    }
  }).join('');
}

$$('.seg-btn[data-history-type]').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.seg-btn[data-history-type]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.historyType = btn.dataset.historyType;
    loadHistory();
  });
});

let historySearchTimer = null;
$('#historySearch').addEventListener('input', e => {
  clearTimeout(historySearchTimer);
  historySearchTimer = setTimeout(() => loadHistory(e.target.value.trim()), 300);
});

$('#clearHistoryBtn').addEventListener('click', async () => {
  if (!confirm(`确定清空全部${state.historyType === 'generate' ? '生成' : '解析'}记录？`)) return;
  try {
    const res = await fetch(`${API}/history/${state.historyType}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('已清空', 'success');
      loadHistory();
    }
  } catch (e) {
    showToast('操作失败', 'error');
  }
});

async function loadHistory(keyword = '') {
  try {
    const params = keyword ? `?keyword=${encodeURIComponent(keyword)}` : '';
    const res = await fetch(`${API}/history/${state.historyType}${params}`);
    const data = await res.json();
    if (!data.success) return;

    const records = data.data;
    const tbody = $('#historyTbody');
    const empty = $('#historyEmpty');
    const table = $('#historyTable');

    if (records.length === 0) {
      table.style.display = 'none';
      empty.style.display = 'flex';
      return;
    }

    table.style.display = 'table';
    empty.style.display = 'none';

    tbody.innerHTML = records.map(r => {
      const thumb = state.historyType === 'generate' && r.fileName
        ? `<div class="hist-thumb"><img src="/temp/${r.fileName}" alt=""></div>`
        : r.success && r.fileName
          ? `<div class="hist-thumb"><img src="/temp/${r.fileName}" alt=""></div>`
          : `<div class="hist-thumb" style="background:var(--bg-tertiary);color:var(--text-muted);font-size:11px;">无图</div>`;

      const content = state.historyType === 'generate' ? r.content : (r.success ? r.content : '未识别');
      const typeOrFormat = state.historyType === 'generate'
        ? r.type
        : (r.success ? r.format : '失败');
      const extra = state.historyType === 'generate'
        ? `${r.size || ''}px`
        : (r.success ? r.method : '');

      const actions = [];
      if (r.fileName) {
        actions.push(`<button class="btn-ghost btn-sm" onclick="window.__downloadHist('/temp/${r.fileName}', '${r.fileName}')">下载</button>`);
      }
      if (content && r.success !== false) {
        actions.push(`<button class="btn-ghost btn-sm" onclick='copyText(${JSON.stringify(String(content))})'>复制</button>`);
      }
      actions.push(`<button class="btn-danger btn-sm" onclick="window.__deleteHist('${r.id}')">删除</button>`);

      return `
        <tr>
          <td>${thumb}</td>
          <td><span class="hist-type">${typeOrFormat}</span></td>
          <td><div class="hist-content" title="${content}">${content || '-'}</div></td>
          <td>${extra || '-'}</td>
          <td>${formatTime(r.timestamp)}</td>
          <td><div class="hist-actions">${actions.join('')}</div></td>
        </tr>`;
    }).join('');
  } catch (e) {
    console.error(e);
  }
}

window.__downloadHist = function (url, name) {
  downloadImage(url, name);
};

window.__deleteHist = async function (id) {
  try {
    const res = await fetch(`${API}/history/${state.historyType}/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('已删除', 'success');
      loadHistory();
    }
  } catch (e) {
    showToast('删除失败', 'error');
  }
};
