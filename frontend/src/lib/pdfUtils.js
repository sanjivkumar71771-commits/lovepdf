import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
// @pdf-lib/fontkit's Indic (Devanagari) shaper is compiled with generator
// functions that expect a global `regeneratorRuntime`; importing this polyfill
// defines it so Hindi text shaping works in the browser bundle.
import 'regenerator-runtime/runtime';
import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

// Use a CDN worker that matches the installed pdfjs-dist version.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

// ---- Unicode (Devanagari / Hindi) font support for the PDF writer ----
// pdf-lib's built-in StandardFonts (Helvetica/Times/Courier) only cover WinAnsi
// (Latin) glyphs, so editing Hindi text and saving produced '?' placeholders.
// We bundle a Devanagari TTF and embed it (via fontkit, which performs proper
// Indic OpenType shaping) whenever the text contains non-Latin characters.
const DEVANAGARI_FONT_URL = `${process.env.PUBLIC_URL || ''}/fonts/Lohit-Devanagari.ttf`;
let _uniFontBytesPromise = null;
const loadUnicodeFontBytes = () => {
  if (!_uniFontBytesPromise) {
    _uniFontBytesPromise = fetch(DEVANAGARI_FONT_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Font load failed: ${r.status}`);
        return r.arrayBuffer();
      })
      .catch((err) => { _uniFontBytesPromise = null; throw err; });
  }
  return _uniFontBytesPromise;
};

// True when a string contains characters outside Latin-1 (e.g. Devanagari),
// which the built-in StandardFonts cannot encode.
export const needsUnicodeFont = (t) => /[^\u0000-\u00FF]/.test(t || '');

// Returns a helper bound to a specific PDFDocument that lazily embeds the
// Devanagari font once and reuses it for every subsequent string.
const makeUnicodeFontGetter = (docPdf) => {
  let embedded = null;
  let registered = false;
  return async () => {
    if (!embedded) {
      if (!registered) { docPdf.registerFontkit(fontkit); registered = true; }
      const bytes = await loadUnicodeFontBytes();
      embedded = await docPdf.embedFont(bytes, { subset: true });
    }
    return embedded;
  };
};

export const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

export const download = (bytes, filename, type = 'application/pdf') => {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

// Package multiple rendered images into a single ZIP and download it once.
// Triggering many individual downloads is unreliable (browsers block all but
// the first few), so multi-page PDF->images now always ships one .zip.
export const downloadImagesAsZip = async (images, zipName = 'images.zip') => {
  const zip = new JSZip();
  const pad = String(images.length).length;
  images.forEach((im, i) => {
    const fallback = `page_${String(i + 1).padStart(pad, '0')}.jpg`;
    zip.file(im.name || fallback, im.blob);
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  download(blob, zipName, 'application/zip');
};

export const getPageCount = async (file) => {
  const doc = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  return doc.getPageCount();
};

// Merge multiple PDFs (in given order) into one
export const mergePdfs = async (files) => {
  const out = await PDFDocument.create();
  for (const f of files) {
    if (f.type && f.type.startsWith('image/')) {
      let bytes = new Uint8Array(await readFile(f));
      let img;
      if (f.type === 'image/png') img = await out.embedPng(bytes);
      else if (f.type === 'image/jpeg') img = await out.embedJpg(bytes);
      else {
        const url = URL.createObjectURL(f);
        const el = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = el.naturalWidth; canvas.height = el.naturalHeight;
        canvas.getContext('2d').drawImage(el, 0, 0);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/png');
        img = await out.embedPng(dataUrl);
      }
      const page = out.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } else {
      const src = await PDFDocument.load(await readFile(f), { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
  }
  return out.save();
};

// Parse a range string like "1-3, 5, 8-10" into 0-based unique indices
export const parseRanges = (str, total) => {
  const set = new Set();
  (str || '').split(',').forEach((part) => {
    const t = part.trim();
    if (!t) return;
    if (t.includes('-')) {
      let [a, b] = t.split('-').map((n) => parseInt(n.trim(), 10));
      if (isNaN(a)) a = 1;
      if (isNaN(b)) b = total;
      for (let i = a; i <= b; i++) if (i >= 1 && i <= total) set.add(i - 1);
    } else {
      const n = parseInt(t, 10);
      if (!isNaN(n) && n >= 1 && n <= total) set.add(n - 1);
    }
  });
  return [...set].sort((a, b) => a - b);
};

// Extract only the given 0-based indices into a new PDF
export const extractPages = async (file, indices) => {
  const src = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));
  return out.save();
};

// Split into one PDF per range group -> returns array of {name, bytes}
export const splitByRanges = async (file, rangeStr) => {
  const src = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const total = src.getPageCount();
  const groups = (rangeStr || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const results = [];
  const base = file.name.replace(/\.pdf$/i, '');
  let idx = 1;
  for (const g of groups) {
    const indices = parseRanges(g, total);
    if (!indices.length) continue;
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    results.push({ name: `${base}_part${idx}.pdf`, bytes: await out.save() });
    idx++;
  }
  return results;
};

export const removePages = async (file, indicesToRemove) => {
  const src = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const total = src.getPageCount();
  const keep = [];
  for (let i = 0; i < total; i++) if (!indicesToRemove.includes(i)) keep.push(i);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, keep);
  pages.forEach((p) => out.addPage(p));
  return out.save();
};

// Rebuild the PDF in the exact order given (array of 0-based indices)
export const reorderPages = async (file, order) => {
  const src = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, order);
  pages.forEach((p) => out.addPage(p));
  return out.save();
};

// Rotate: angle applied to all pages (or a subset of indices)
export const rotatePdf = async (file, angle, indices = null) => {
  const doc = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    if (indices && !indices.includes(i)) return;
    const current = p.getRotation().angle || 0;
    p.setRotation(degrees((current + angle) % 360));
  });
  return doc.save();
};

// Images -> single PDF
export const imagesToPdf = async (files, { fit = 'fit', margin = 24 } = {}) => {
  const out = await PDFDocument.create();
  for (const f of files) {
    const bytes = await readFile(f);
    let img;
    if (/png$/i.test(f.type) || /\.png$/i.test(f.name)) img = await out.embedPng(bytes);
    else img = await out.embedJpg(bytes);
    const iw = img.width;
    const ih = img.height;
    const page = out.addPage([iw + margin * 2, ih + margin * 2]);
    page.drawImage(img, { x: margin, y: margin, width: iw, height: ih });
  }
  return out.save();
};

// PDF -> array of JPG blobs (rendered via pdf.js)
export const pdfToImages = async (file, { scale = 2, quality = 0.92, onProgress } = {}) => {
  const data = await readFile(file);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const images = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    images.push({ blob, name: `page_${n}.jpg`, url: URL.createObjectURL(blob) });
    if (onProgress) onProgress(n, pdf.numPages);
  }
  return images;
};

// Render first N page thumbnails (data urls) for previews
export const renderThumbnails = async (file, max = 30, scale = 0.5) => {
  const data = await readFile(file);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const thumbs = [];
  const count = Math.min(pdf.numPages, max);
  for (let n = 1; n <= count; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    thumbs.push({ index: n - 1, url: canvas.toDataURL('image/jpeg', 0.7) });
  }
  return { thumbs, total: pdf.numPages };
};

export const addPageNumbers = async (file, { position = 'bottom-center', start = 1, size = 11 } = {}) => {
  const doc = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const { width, height } = p.getSize();
    const label = `${start + i}`;
    const tw = font.widthOfTextAtSize(label, size);
    let x = width / 2 - tw / 2;
    let y = 18;
    if (position.includes('top')) y = height - 24;
    if (position.includes('left')) x = 28;
    if (position.includes('right')) x = width - tw - 28;
    p.drawText(label, { x, y, size, font, color: rgb(0.25, 0.25, 0.3) });
  });
  return doc.save();
};

export const addWatermark = async (file, { text = 'CONFIDENTIAL', size = 48, opacity = 0.25, rotate = 45 } = {}) => {
  const doc = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.getPages().forEach((p) => {
    const { width, height } = p.getSize();
    const tw = font.widthOfTextAtSize(text, size);
    p.drawText(text, {
      x: width / 2 - tw / 2,
      y: height / 2,
      size,
      font,
      color: rgb(1, 0.18, 0.33),
      opacity,
      rotate: degrees(rotate),
    });
  });
  return doc.save();
};

// Render a single page to a data URL at a target preview width (px).
// Returns pt dimensions so callers can map overlay coordinates back to PDF space.
export const renderPageImage = async (file, pageIndex = 0, previewWidth = 640) => {
  const data = await readFile(file);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(pageIndex + 1);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = previewWidth / vp1.width;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.85),
    ptW: vp1.width,
    ptH: vp1.height,
    pxW: canvas.width,
    pxH: canvas.height,
    total: pdf.numPages,
  };
};

// Embed a PNG signature (data URL) onto one page at preview-space coordinates.
export const placeSignature = async (file, { pageIndex, sigPngDataUrl, box, preview }) => {
  const bytes = await readFile(file);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const png = await doc.embedPng(sigPngDataUrl);
  const page = doc.getPages()[pageIndex];
  const { width: ptW, height: ptH } = page.getSize();
  const sx = ptW / preview.pxW; // pt per preview px
  const sy = ptH / preview.pxH;
  const x = box.x * sx;
  const w = box.w * sx;
  const h = box.h * sy;
  const y = ptH - (box.y + box.h) * sy;
  page.drawImage(png, { x, y, width: w, height: h });
  return doc.save();
};

// Lightweight "compress": re-save with object streams. Real gains vary by source.
export const compressPdf = async (file) => {
  const doc = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  return doc.save({ useObjectStreams: true });
};

// Render all pages once to canvases (kept in memory for re-encoding).
const renderPageCanvases = async (data, baseScale, onProgress) => {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const canvases = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const vp1 = page.getViewport({ scale: 1 }); // points (72dpi)
    const vp = page.getViewport({ scale: baseScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    canvases.push({ canvas, ptW: vp1.width, ptH: vp1.height });
    if (onProgress) onProgress(Math.round((n / pdf.numPages) * 40));
  }
  return canvases;
};

const buildRasterPdf = async (canvases, scaleFactor, quality) => {
  const out = await PDFDocument.create();
  for (const c of canvases) {
    let src = c.canvas;
    if (scaleFactor < 0.999) {
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(c.canvas.width * scaleFactor));
      tmp.height = Math.max(1, Math.round(c.canvas.height * scaleFactor));
      const tctx = tmp.getContext('2d');
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(c.canvas, 0, 0, tmp.width, tmp.height);
      src = tmp;
    }
    const blob = await new Promise((r) => src.toBlob(r, 'image/jpeg', quality));
    const buf = await blob.arrayBuffer();
    const img = await out.embedJpg(buf);
    const page = out.addPage([c.ptW, c.ptH]);
    page.drawImage(img, { x: 0, y: 0, width: c.ptW, height: c.ptH });
  }
  return out.save({ useObjectStreams: true });
};

// ---------------------------------------------------------------------------
// EDIT PDF: extract clickable text items from a page + apply text edits.
// ---------------------------------------------------------------------------

const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');

// Heuristically classify a font name into style buckets used for re-drawing.
const classifyFont = (name = '') => {
  const n = String(name).toLowerCase();
  const bold = /(bold|black|heavy|semibold|[-_ ]?(700|800|900))/.test(n);
  const italic = /(italic|oblique)/.test(n);
  const mono = /(mono|courier|consol|menlo|typewriter)/.test(n);
  const isSans = /sans/.test(n) || /(helvetica|arial|verdana|tahoma|calibri|segoe|roboto|open ?sans|lato)/.test(n);
  const serif = !mono && !isSans && /(times|serif|georgia|roman|garamond|minion|cambria|book antiqua|palatino|ming|song|nimbus ?rom)/.test(n);
  return { bold, italic, mono, serif };
};

// Render one page and return the rendered image + every text run on it with
// preview-space geometry (for the overlay) and PDF-space geometry (for export).
export const extractPageText = async (file, pageIndex = 0, previewWidth = 720) => {
  const data = await readFile(file);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = previewWidth / vp1.width;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  const tc = await page.getTextContent();
  const styles = tc.styles || {};
  const pix = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const cw = canvas.width;

  // Find the text color (darkest) and background (lightest) inside a box.
  const sampleColors = (bx, by, bw, bh) => {
    const x0 = Math.max(0, Math.floor(bx));
    const y0 = Math.max(0, Math.floor(by));
    const x1 = Math.min(canvas.width, Math.ceil(bx + bw));
    const y1 = Math.min(canvas.height, Math.ceil(by + bh));
    let dMin = 1e9, lMax = -1;
    let dark = [15, 23, 42];
    let light = [255, 255, 255];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * cw + x) * 4;
        const r = pix[i], g = pix[i + 1], b = pix[i + 2];
        const s = r + g + b;
        if (s < dMin) { dMin = s; dark = [r, g, b]; }
        if (s > lMax) { lMax = s; light = [r, g, b]; }
      }
    }
    return { color: toHex(dark[0], dark[1], dark[2]), bg: toHex(light[0], light[1], light[2]) };
  };

  const items = [];
  tc.items.forEach((it, idx) => {
    if (!it.str || !it.str.trim()) return;
    const t = pdfjsLib.Util.transform(vp.transform, it.transform);
    const fontPx = Math.hypot(t[2], t[3]);
    if (fontPx < 3) return; // ignore tiny/invisible runs
    const left = t[4];
    const top = t[5] - fontPx;
    const widthPx = (it.width || 0) * scale || fontPx * (it.str.length * 0.5);
    const st = styles[it.fontName] || {};
    const cls = classifyFont(st.fontFamily || it.fontName || '');
    const { color, bg } = sampleColors(left, top, Math.max(widthPx, fontPx * 0.6), fontPx * 1.25);
    items.push({
      id: `${pageIndex}-${idx}`,
      str: it.str,
      // preview-space (CSS px over the rendered image)
      left, top, widthPx, fontPx,
      // pdf-space (points, origin bottom-left) for export
      xPt: it.transform[4],
      yPt: it.transform[5],
      sizePt: Math.hypot(it.transform[0], it.transform[1]) || (fontPx / scale),
      widthPt: it.width || 0,
      color, bg,
      bold: cls.bold, italic: cls.italic, serif: cls.serif, mono: cls.mono,
    });
  });

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    pxW: canvas.width,
    pxH: canvas.height,
    ptW: vp1.width,
    ptH: vp1.height,
    total: doc.numPages,
    items,
  };
};

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return rgb(0.06, 0.09, 0.16);
  const int = parseInt(m[1], 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
};

// Apply a list of styled text edits to the original PDF and return saved bytes.
// edits: [{ pageIndex, xPt, yPt, widthPt, bg, text, family, bold, italic, underline, size, color, align }]
export const applyPdfTextEdits = async (file, edits) => {
  const docPdf = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const pages = docPdf.getPages();
  const cache = {};
  const fontKey = ({ family, bold, italic }) => {
    if (family === 'mono') return bold ? (italic ? 'CourierBoldOblique' : 'CourierBold') : (italic ? 'CourierOblique' : 'Courier');
    if (family === 'serif') return bold ? (italic ? 'TimesRomanBoldItalic' : 'TimesRomanBold') : (italic ? 'TimesRomanItalic' : 'TimesRoman');
    return bold ? (italic ? 'HelveticaBoldOblique' : 'HelveticaBold') : (italic ? 'HelveticaOblique' : 'Helvetica');
  };
  const pick = async (e) => {
    const key = fontKey(e);
    if (!cache[key]) cache[key] = await docPdf.embedFont(StandardFonts[key]);
    return cache[key];
  };

  const getUniFont = makeUnicodeFontGetter(docPdf);
  for (const e of edits) {
    const page = pages[e.pageIndex];
    if (!page) continue;
    const text = e.text || '';
    const font = needsUnicodeFont(text) ? await getUniFont() : await pick(e);
    const measure = (t, sz) => {
      try { return font.widthOfTextAtSize(t, sz); } catch { return (t.length * sz * 0.5); }
    };
    let size = e.size || 12;
    // Shrink-to-fit: keep the (possibly converted / edited) text within its
    // original box width so it doesn't overflow onto neighbouring text.
    if (e.widthPt && e.widthPt > 1) {
      const natural = measure(text, size);
      if (natural > e.widthPt) size = Math.max(4, size * (e.widthPt / natural));
    }
    const tw = measure(text, size);
    const boxW = e.widthPt || tw;
    let drawX = e.xPt;
    if (e.align === 'center') drawX = e.xPt + (boxW - tw) / 2;
    else if (e.align === 'right') drawX = e.xPt + (boxW - tw);

    // cover the original glyphs (union of original box + new text position)
    const left = Math.min(e.xPt, drawX) - 1;
    const right = Math.max(e.xPt + boxW, drawX + tw) + 1;
    page.drawRectangle({
      x: left,
      y: e.yPt - size * 0.30,
      width: right - left,
      height: size * 1.34,
      color: hexToRgb(e.bg),
    });

    const col = hexToRgb(e.color);
    try {
      page.drawText(text, { x: drawX, y: e.yPt, size, font, color: col });
    } catch (err) {
      // Last resort: embed the Unicode (Devanagari) font and retry so Hindi
      // text renders instead of being stripped to '?'.
      try {
        const uni = await getUniFont();
        page.drawText(text, { x: drawX, y: e.yPt, size, font: uni, color: col });
      } catch (err2) {
        page.drawText(text.replace(/[^\x20-\x7E]/g, '?'), { x: drawX, y: e.yPt, size, font, color: col });
      }
    }
    if (e.underline) {
      page.drawRectangle({ x: drawX, y: e.yPt - size * 0.12, width: tw, height: Math.max(0.6, size * 0.06), color: col });
    }
  }
  return docPdf.save();
};

// Unified editor apply: text edits + shapes + inserted images.
// texts: same shape as applyPdfTextEdits.
// shapes: [{ pageIndex, type:'rect'|'line'|'highlight', n:{x,y,w,h}, color, opacity, strokeWidth, fill }]
// images: [{ pageIndex, dataUrl, n:{x,y,w,h} }]
export const applyPdfEdits = async (file, { texts = [], shapes = [], images = [] } = {}) => {
  const docPdf = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const pages = docPdf.getPages();
  const cache = {};
  const fontKey = ({ family, bold, italic }) => {
    if (family === 'mono') return bold ? (italic ? 'CourierBoldOblique' : 'CourierBold') : (italic ? 'CourierOblique' : 'Courier');
    if (family === 'serif') return bold ? (italic ? 'TimesRomanBoldItalic' : 'TimesRomanBold') : (italic ? 'TimesRomanItalic' : 'TimesRoman');
    return bold ? (italic ? 'HelveticaBoldOblique' : 'HelveticaBold') : (italic ? 'HelveticaOblique' : 'Helvetica');
  };
  const pick = async (e) => {
    const key = fontKey(e);
    if (!cache[key]) cache[key] = await docPdf.embedFont(StandardFonts[key]);
    return cache[key];
  };
  const px = (n, ptW, ptH) => ({ x: n.x * ptW, w: n.w * ptW, h: n.h * ptH, y: ptH - n.y * ptH - n.h * ptH });
  const getUniFont = makeUnicodeFontGetter(docPdf);

  for (const e of texts) {
    const page = pages[e.pageIndex];
    if (!page) continue;
    const text = e.text || '';
    const font = needsUnicodeFont(text) ? await getUniFont() : await pick(e);
    const measure = (t, sz) => { try { return font.widthOfTextAtSize(t, sz); } catch { return t.length * sz * 0.5; } };
    let size = e.size || 12;
    // Shrink-to-fit within the original box width (see applyPdfTextEdits).
    if (e.widthPt && e.widthPt > 1) {
      const natural = measure(text, size);
      if (natural > e.widthPt) size = Math.max(4, size * (e.widthPt / natural));
    }
    const tw = measure(text, size);
    const boxW = e.widthPt || tw;
    let drawX = e.xPt;
    if (e.align === 'center') drawX = e.xPt + (boxW - tw) / 2;
    else if (e.align === 'right') drawX = e.xPt + (boxW - tw);
    const left = Math.min(e.xPt, drawX) - 1;
    const right = Math.max(e.xPt + boxW, drawX + tw) + 1;
    page.drawRectangle({ x: left, y: e.yPt - size * 0.30, width: right - left, height: size * 1.34, color: hexToRgb(e.bg) });
    const col = hexToRgb(e.color);
    try { page.drawText(text, { x: drawX, y: e.yPt, size, font, color: col }); }
    catch {
      try { const uni = await getUniFont(); page.drawText(text, { x: drawX, y: e.yPt, size, font: uni, color: col }); }
      catch { page.drawText(text.replace(/[^\x20-\x7E]/g, '?'), { x: drawX, y: e.yPt, size, font, color: col }); }
    }
    if (e.underline) page.drawRectangle({ x: drawX, y: e.yPt - size * 0.12, width: tw, height: Math.max(0.6, size * 0.06), color: col });
  }

  for (const sh of shapes) {
    const page = pages[sh.pageIndex];
    if (!page) continue;
    const { width: ptW, height: ptH } = page.getSize();
    const b = px(sh.n, ptW, ptH);
    const color = hexToRgb(sh.color);
    if (sh.type === 'highlight') {
      page.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, color, opacity: sh.opacity ?? 0.35 });
    } else if (sh.type === 'line') {
      page.drawLine({ start: { x: b.x, y: b.y + b.h / 2 }, end: { x: b.x + b.w, y: b.y + b.h / 2 }, thickness: sh.strokeWidth || 2, color });
    } else { // rect
      page.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, borderColor: color, borderWidth: sh.strokeWidth || 2, ...(sh.fill ? { color, opacity: sh.opacity ?? 0.25 } : {}) });
    }
  }

  for (const im of images) {
    const page = pages[im.pageIndex];
    if (!page) continue;
    const { width: ptW, height: ptH } = page.getSize();
    const b = px(im.n, ptW, ptH);
    const embedded = /^data:image\/png/i.test(im.dataUrl) ? await docPdf.embedPng(im.dataUrl) : await docPdf.embedJpg(im.dataUrl);
    page.drawImage(embedded, { x: b.x, y: b.y, width: b.w, height: b.h });
  }

  return docPdf.save();
};

// Place multiple PNG image stamps on their pages. stamps: [{ pageIndex, dataUrl, n:{x,y,w,h} }]
export const placeStamps = async (file, stamps) => {
  const doc = await PDFDocument.load(await readFile(file), { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const s of stamps) {
    const page = pages[s.pageIndex];
    if (!page) continue;
    const { width: ptW, height: ptH } = page.getSize();
    const png = await doc.embedPng(s.dataUrl);
    const x = s.n.x * ptW, w = s.n.w * ptW, h = s.n.h * ptH;
    const y = ptH - s.n.y * ptH - h;
    page.drawImage(png, { x, y, width: w, height: h });
  }
  return doc.save();
};


// Compress a PDF trying to land at or below targetBytes. Returns { bytes, size }.
export const compressToTarget = async (file, targetBytes, { onProgress } = {}) => {
  const data = await readFile(file);
  // First, a cheap lossless re-save. If it already meets the target, use it.
  const lossless = await compressPdf(file);
  if (targetBytes && lossless.length <= targetBytes) {
    return { bytes: lossless, size: lossless.length };
  }

  const canvases = await renderPageCanvases(data, 2.0, onProgress);
  const scales = [1, 0.8, 0.62, 0.48, 0.36, 0.26];
  let best = null; // best <= target (highest quality)
  let smallest = null; // fallback: smallest overall

  const track = (bytes) => {
    if (!smallest || bytes.length < smallest.length) smallest = bytes;
  };

  outer: for (let si = 0; si < scales.length; si++) {
    const sf = scales[si];
    let lo = 0.28, hi = 0.9, found = null;
    for (let it = 0; it < 6; it++) {
      const q = (lo + hi) / 2;
      const bytes = await buildRasterPdf(canvases, sf, q);
      track(bytes);
      if (onProgress) onProgress(40 + Math.min(55, si * 9 + it * 1.5));
      if (!targetBytes || bytes.length <= targetBytes) {
        found = bytes; // meets target, try higher quality
        lo = q;
      } else {
        hi = q; // too big, lower quality
      }
    }
    if (found) { best = found; break outer; }
    // if even lowest quality at this scale is over target, go smaller scale
  }

  if (onProgress) onProgress(100);
  const chosen = best || smallest || lossless;
  return { bytes: chosen, size: chosen.length };
};
