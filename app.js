const $ = (selector) => document.querySelector(selector);

const state = {
  files: [],
  nextId: 1,
};

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const fileList = $('#fileList');
const emptyState = $('#emptyState');
const mergeBtn = $('#mergeBtn');
const clearBtn = $('#clearBtn');
const sortNameBtn = $('#sortNameBtn');
const demoBtn = $('#demoBtn');
const logEl = $('#log');
const engineStatus = $('#engineStatus');

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
]);

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

function hasPdfLib() {
  return Boolean(window.PDFLib && !window.__PDF_LIB_PLACEHOLDER__);
}

function initEngineStatus() {
  if (hasPdfLib()) {
    engineStatus.className = 'status-card ok';
    engineStatus.textContent = 'Full engine active: images and existing PDFs can be merged locally.';
  } else {
    engineStatus.className = 'status-card warn';
    engineStatus.textContent = 'Image-only mode active. To merge existing PDF files too, replace vendor/pdf-lib.min.js with the real pdf-lib build.';
  }
}

initEngineStatus();
render();

['dragenter', 'dragover'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
fileInput.addEventListener('change', (event) => addFiles(event.target.files));

clearBtn.addEventListener('click', () => {
  state.files = [];
  render();
  writeLog('Cleared file list.');
});

sortNameBtn.addEventListener('click', () => {
  state.files.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
  render();
});

mergeBtn.addEventListener('click', createMergedPdf);

demoBtn.addEventListener('click', async () => {
  const blob = await makeDemoImageBlob();
  const file = new File([blob], 'test-page.jpg', { type: 'image/jpeg' });
  addFiles([file]);
});

function addFiles(fileLikeList) {
  const files = Array.from(fileLikeList || []);
  const accepted = [];
  const rejected = [];

  for (const file of files) {
    const kind = detectKind(file);
    if (kind === 'pdf' || kind === 'image') {
      accepted.push({ id: state.nextId++, file, kind });
    } else {
      rejected.push(file.name);
    }
  }

  state.files.push(...accepted);
  render();

  if (rejected.length) {
    writeLog(`Rejected unsupported files:\n${rejected.map((name) => `• ${name}`).join('\n')}`, 'error');
  } else if (accepted.length) {
    writeLog(`Added ${accepted.length} file${accepted.length === 1 ? '' : 's'}.`);
  }

  fileInput.value = '';
}

function detectKind(file) {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (IMAGE_TYPES.has(file.type)) return 'image';
  if (/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) return 'image';
  return 'unknown';
}

function render() {
  fileList.innerHTML = '';
  emptyState.style.display = state.files.length ? 'none' : 'block';
  mergeBtn.disabled = state.files.length === 0;

  state.files.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = `
      <div>
        <div class="file-name">${escapeHtml(item.file.name)}</div>
        <div class="file-meta">${item.kind.toUpperCase()} · ${formatBytes(item.file.size)}</div>
      </div>
      <div class="file-actions">
        <button type="button" data-action="up" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-action="down" ${index === state.files.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-action="remove" class="danger-light">Remove</button>
      </div>
    `;

    li.querySelector('[data-action="up"]').addEventListener('click', () => moveItem(index, index - 1));
    li.querySelector('[data-action="down"]').addEventListener('click', () => moveItem(index, index + 1));
    li.querySelector('[data-action="remove"]').addEventListener('click', () => removeItem(item.id));
    fileList.appendChild(li);
  });
}

function moveItem(from, to) {
  const [item] = state.files.splice(from, 1);
  state.files.splice(to, 0, item);
  render();
}

function removeItem(id) {
  state.files = state.files.filter((item) => item.id !== id);
  render();
}

async function createMergedPdf() {
  clearLog();
  mergeBtn.disabled = true;
  mergeBtn.textContent = 'Creating…';

  try {
    if (!state.files.length) throw new Error('Add at least one file first.');

    const includesPdf = state.files.some((item) => item.kind === 'pdf');
    if (includesPdf && !hasPdfLib()) {
      throw new Error('PDF inputs require pdf-lib. Replace vendor/pdf-lib.min.js with the real pdf-lib build, then reload the extension. Image-only export still works now.');
    }

    const settings = readSettings();
    const bytes = hasPdfLib()
      ? await createWithPdfLib(state.files, settings)
      : await createImagesOnlyFallback(state.files, settings);

    const outputName = normalizePdfName($('#outputName').value || 'combined.pdf');
    downloadBytes(bytes, outputName, 'application/pdf');
    writeLog(`Done. Created ${outputName} from ${state.files.length} file${state.files.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    writeLog(error.message || String(error), 'error');
  } finally {
    mergeBtn.disabled = state.files.length === 0;
    mergeBtn.textContent = 'Create merged PDF';
  }
}

function readSettings() {
  return {
    pageSize: $('#pageSize').value,
    marginMm: Number($('#marginSize').value),
    jpegQuality: Number($('#jpegQuality').value),
  };
}

async function createWithPdfLib(items, settings) {
  const { PDFDocument } = window.PDFLib;
  const output = await PDFDocument.create();
  output.setTitle('Combined PDF');
  output.setProducer('Local PDF Combiner Chrome Extension');
  output.setCreator('Local PDF Combiner Chrome Extension');

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    writeLog(`Processing ${index + 1}/${items.length}: ${item.file.name}`);

    if (item.kind === 'pdf') {
      const bytes = await item.file.arrayBuffer();
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copied = await output.copyPages(source, source.getPageIndices());
      copied.forEach((page) => output.addPage(page));
      continue;
    }

    const image = await rasterizeImageToJpeg(item.file, settings.jpegQuality);
    const embedded = await output.embedJpg(image.bytes);
    const placement = getImagePlacement(image.width, image.height, settings);
    const page = output.addPage([placement.pageWidth, placement.pageHeight]);
    page.drawImage(embedded, {
      x: placement.x,
      y: placement.y,
      width: placement.drawWidth,
      height: placement.drawHeight,
    });
  }

  return await output.save();
}

async function createImagesOnlyFallback(items, settings) {
  const pdfItems = items.filter((item) => item.kind === 'pdf');
  if (pdfItems.length) {
    throw new Error('The built-in fallback can create PDFs from images only. Install pdf-lib locally to merge existing PDF files.');
  }

  const pages = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    writeLog(`Processing ${index + 1}/${items.length}: ${item.file.name}`);
    const image = await rasterizeImageToJpeg(item.file, settings.jpegQuality);
    const placement = getImagePlacement(image.width, image.height, settings);
    pages.push({ ...image, ...placement });
  }

  return buildSimpleImagePdf(pages);
}

async function rasterizeImageToJpeg(file, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const maxSide = 6000;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error(`Could not encode image: ${file.name}`);
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width,
    height,
  };
}

function getImagePlacement(pixelWidth, pixelHeight, settings) {
  const margin = mmToPt(settings.marginMm);

  let pageWidth;
  let pageHeight;

  if (settings.pageSize === 'image') {
    // Treat image pixels as points, then cap massive pages to keep viewers responsive.
    const maxPageSide = 14400;
    const scale = Math.min(1, maxPageSide / Math.max(pixelWidth, pixelHeight));
    pageWidth = Math.max(72, pixelWidth * scale);
    pageHeight = Math.max(72, pixelHeight * scale);
  } else {
    [pageWidth, pageHeight] = PAGE_SIZES[settings.pageSize] || PAGE_SIZES.a4;
  }

  const usableWidth = Math.max(1, pageWidth - margin * 2);
  const usableHeight = Math.max(1, pageHeight - margin * 2);
  const scale = Math.min(usableWidth / pixelWidth, usableHeight / pixelHeight);
  const drawWidth = pixelWidth * scale;
  const drawHeight = pixelHeight * scale;

  return {
    pageWidth,
    pageHeight,
    drawWidth,
    drawHeight,
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
  };
}

function buildSimpleImagePdf(pages) {
  const encoder = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const objectOffsets = [0];

  const pushText = (text) => {
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    offset += bytes.length;
  };

  const pushBytes = (bytes) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  const addObject = (id, writer) => {
    objectOffsets[id] = offset;
    pushText(`${id} 0 obj\n`);
    writer();
    pushText('\nendobj\n');
  };

  const pageObjectIds = [];
  let nextObjectId = 3;

  pushText('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  for (const page of pages) {
    const pageId = nextObjectId++;
    const contentId = nextObjectId++;
    const imageId = nextObjectId++;
    pageObjectIds.push(pageId);

    addObject(pageId, () => {
      pushText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(page.pageWidth)} ${round(page.pageHeight)}] /Resources << /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    });

    const content = `q\n${round(page.drawWidth)} 0 0 ${round(page.drawHeight)} ${round(page.x)} ${round(page.y)} cm\n/Im1 Do\nQ\n`;
    const contentBytes = encoder.encode(content);
    addObject(contentId, () => {
      pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
      pushBytes(contentBytes);
      pushText('endstream');
    });

    addObject(imageId, () => {
      pushText(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);
      pushBytes(page.bytes);
      pushText('\nendstream');
    });
  }

  addObject(1, () => {
    pushText('<< /Type /Catalog /Pages 2 0 R >>');
  });

  addObject(2, () => {
    const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
    pushText(`<< /Type /Pages /Kids [${kids}] /Count ${pageObjectIds.length} >>`);
  });

  const xrefOffset = offset;
  const size = nextObjectId;
  pushText(`xref\n0 ${size}\n`);
  pushText('0000000000 65535 f \n');
  for (let id = 1; id < size; id += 1) {
    pushText(`${String(objectOffsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

async function makeDemoImageBlob() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 82px system-ui, sans-serif';
  ctx.fillText('Local PDF Combiner', 90, 180);
  ctx.fillStyle = '#374151';
  ctx.font = '42px system-ui, sans-serif';
  ctx.fillText('Test image page', 90, 270);
  ctx.fillStyle = '#dbeafe';
  ctx.fillRect(90, 360, 1020, 860);
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText('Drag files → reorder → export', 145, 800);
  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

function downloadBytes(bytes, filename, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function writeLog(message, type) {
  logEl.className = `log visible ${type || ''}`.trim();
  logEl.textContent = message;
}

function clearLog() {
  logEl.className = 'log';
  logEl.textContent = '';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function normalizePdfName(name) {
  const clean = name.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char]));
}

function mmToPt(mm) {
  return mm * 72 / 25.4;
}

function round(value) {
  return Number(value).toFixed(3).replace(/\.000$/, '');
}
