import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Save, Download, Loader2, X, CheckCircle2, MousePointerClick,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Type,
  ZoomIn, ZoomOut, PenLine, Shapes, StickyNote, FormInput, Image as ImageIcon,
  RotateCcw, Minus, Plus, Square, Highlighter, Trash2, UploadCloud, Move,
} from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import FileDrop from '../components/FileDrop';
import * as pdf from '../lib/pdfUtils';
import { krutiToUnicode } from '../lib/krutidev';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const TABS = [
  { id: 'annotate', label: 'Annotate', icon: StickyNote },
  { id: 'shapes', label: 'Shapes', icon: Shapes },
  { id: 'insert', label: 'Insert', icon: ImageIcon },
  { id: 'edit-text', label: 'Edit Text', icon: Type },
  { id: 'forms', label: 'Forms', icon: FormInput },
];

const FAMILIES = [
  { id: 'sans', label: 'Sans · Helvetica', css: 'Helvetica, Arial, sans-serif' },
  { id: 'serif', label: 'Serif · Times', css: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono · Courier', css: 'ui-monospace, "Courier New", monospace' },
];
const famCss = (id) => (FAMILIES.find((f) => f.id === id) || FAMILIES[0]).css;

// Measure how wide a string renders (CSS px) for the given style, so an edited
// line — especially converted Devanagari, which is wider than the original
// ASCII/Latin glyphs — can be shrunk to fit its original box instead of
// overflowing onto the next column / line.
let _measureCanvas = null;
const measureTextWidthPx = (text, sizePx, st) => {
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d');
  ctx.font = `${st.italic ? 'italic ' : ''}${st.bold ? '700' : '400'} ${sizePx}px ${famCss(st.family)}`;
  return ctx.measureText(text || '').width;
};

const StyleToggle = ({ active, onClick, title, children }) => (
  <button type="button" onClick={onClick} title={title}
    className={`grid place-items-center w-9 h-9 rounded-lg border transition-colors ${active ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-200 dark:border-white/10 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'}`}>
    {children}
  </button>
);

const deriveStyle = (it) => ({
  family: it.mono ? 'mono' : it.serif ? 'serif' : 'sans',
  size: Math.max(6, Math.round(it.sizePt)),
  bold: !!it.bold,
  italic: !!it.italic,
  underline: false,
  color: (it.color || '#0f172a').slice(0, 7),
  align: 'left',
});

const EditPdfPage = () => {
  const [file, setFile] = useState(null);
  const [docName, setDocName] = useState('');
  const [thumbs, setThumbs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('edit-text');
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [objects, setObjects] = useState([]); // {id, kind:'shape'|'image', pageIndex, n, ...}
  const [selectedObjId, setSelectedObjId] = useState(null);
  const [legacyHindi, setLegacyHindi] = useState(false);
  const stageRef = useRef(null);
  const objDrag = useRef(null);
  const imgInputRef = useRef(null);

  const loadPage = useCallback(async (f, idx, convert = false) => {
    setLoading(true); setError('');
    try {
      const p = await pdf.extractPageText(f, idx, 780);
      // Legacy (Kruti Dev / DevLys) PDFs store Hindi as ASCII-mapped codes; convert
      // each run to real Unicode Devanagari so it displays & edits correctly.
      if (convert && p.items) {
        p.items = p.items.map((it) => ({ ...it, str: krutiToUnicode(it.str) }));
      }
      setPreview(p); setTotal(p.total);
    } catch (e) {
      setError('Could not read this PDF. It may be scanned (image-only) or password protected.');
    }
    setLoading(false);
  }, []);

  const onFiles = async (list) => {
    const f = list[0];
    setFile(f); setDocName(f.name || 'document.pdf');
    setPageIndex(0); setEdits({}); setSelectedId(null); setResult(null); setZoom(1);
    setObjects([]); setSelectedObjId(null);
    // Ask the backend whether this PDF uses a legacy (non-Unicode) Hindi font.
    // Content-based auto-detection: convert Kruti/DevLys ASCII text to Unicode when
    // the font is a known legacy one, OR the text layer is non-empty yet has almost
    // no real Devanagari (devanagari_ratio < 0.15) — a strong signal of a legacy
    // encoding even when the font name isn't in our known list. A safeguard skips
    // genuine English PDFs (which also have ~0 Devanagari) so their text isn't
    // garbled by the Kruti->Unicode mapping.
    let legacy = false;
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch(`${BACKEND}/api/pdf/inspect`, { method: 'POST', body: fd });
      if (r.ok) {
        const d = await r.json();
        const ratio = typeof d.devanagari_ratio === 'number' ? d.devanagari_ratio : 0;
        legacy = !!d.legacy_hindi || (!!d.has_text && ratio < 0.15 && !d.looks_english);
      }
    } catch (e) { /* detection optional */ }
    setLegacyHindi(legacy);
    await loadPage(f, 0, legacy);
    try {
      const t = await pdf.renderThumbnails(f, 60, 0.28);
      setThumbs(t.thumbs); setTotal(t.total);
    } catch (e) { /* thumbnails optional */ }
  };

  const goPage = async (idx) => {
    if (idx === pageIndex || idx < 0 || idx >= total) return;
    setSelectedId(null); setPageIndex(idx);
    await loadPage(file, idx, legacyHindi);
  };

  const selectItem = (it) => {
    setActiveTab('edit-text');
    setSelectedId(it.id);
    setEdits((prev) => (prev[it.id] ? prev : { ...prev, [it.id]: { pageIndex, item: it, text: it.str, style: deriveStyle(it), touched: false } }));
  };

  const patchText = (id, text) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], text, touched: true } }));
  const patchStyle = (id, patch) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], style: { ...prev[id].style, ...patch }, touched: true } }));
  const resetOne = (id) => {
    setEdits((prev) => { const n = { ...prev }; delete n[id]; return n; });
    if (selectedId === id) setSelectedId(null);
  };

  const touchedList = Object.entries(edits).filter(([, e]) => e.touched);
  const editedCount = touchedList.length;
  // Don't count empty (not-yet-typed) text boxes toward the change counter.
  const activeObjCount = objects.filter((o) => o.kind !== 'text' || (o.text || '').trim()).length;
  const changeCount = editedCount + activeObjCount;

  // ---- Shapes & inserted images (movable objects) ----
  const addShape = (type) => {
    const id = 'o' + Math.random().toString(36).slice(2);
    const defaults = type === 'line'
      ? { n: { x: 0.25, y: 0.5, w: 0.5, h: 0.02 }, color: '#0f172a', strokeWidth: 2 }
      : type === 'highlight'
      ? { n: { x: 0.2, y: 0.3, w: 0.4, h: 0.05 }, color: '#fde047', opacity: 0.4 }
      : { n: { x: 0.25, y: 0.3, w: 0.35, h: 0.14 }, color: '#e11d48', strokeWidth: 2, fill: false, opacity: 0.25 };
    setObjects((prev) => [...prev, { id, kind: 'shape', type, pageIndex, ...defaults }]);
    setSelectedObjId(id); setActiveTab('shapes');
  };

  // ---- Add new text box (type Hindi/English on blank space) ----
  const addTextBox = () => {
    if (!preview) return;
    const id = 'o' + Math.random().toString(36).slice(2);
    // Cascade each new box so consecutive boxes don't stack exactly on top.
    const off = (objects.filter((o) => o.kind === 'text').length % 6) * 0.035;
    setObjects((prev) => [...prev, {
      id, kind: 'text', pageIndex,
      n: { x: 0.22 + off, y: 0.28 + off, w: 0.42, h: 0.06 },
      ptW: preview.ptW, ptH: preview.ptH,
      text: '', size: 16, family: 'sans',
      bold: false, italic: false, underline: false,
      color: '#0f172a', align: 'left',
    }]);
    setSelectedObjId(id); setSelectedId(null); setActiveTab('annotate');
  };

  const addImageObj = (fileList) => {
    const f = fileList && fileList[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const id = 'o' + Math.random().toString(36).slice(2);
        const ratio = img.height / img.width;
        const w = 0.3; const h = w * ratio * (preview.ptW / preview.ptH);
        setObjects((prev) => [...prev, { id, kind: 'image', pageIndex, dataUrl: r.result, ratio, n: { x: 0.35, y: 0.3, w, h } }]);
        setSelectedObjId(id); setActiveTab('insert');
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  };

  const updateObj = (id, patch) => setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const removeObj = (id) => { setObjects((prev) => prev.filter((o) => o.id !== id)); if (selectedObjId === id) setSelectedObjId(null); };

  const startObjDrag = (e, id, mode) => {
    e.preventDefault(); e.stopPropagation();
    setSelectedObjId(id); setSelectedId(null);
    const t = e.touches ? e.touches[0] : e;
    const o = objects.find((x) => x.id === id);
    const rect = stageRef.current.getBoundingClientRect();
    objDrag.current = { id, mode, startX: t.clientX, startY: t.clientY, n0: { ...o.n }, ratio: o.ratio, rw: rect.width, rh: rect.height, keepRatio: o.kind === 'image' };
    window.addEventListener('mousemove', onObjDrag);
    window.addEventListener('mouseup', stopObjDrag);
    window.addEventListener('touchmove', onObjDrag, { passive: false });
    window.addEventListener('touchend', stopObjDrag);
  };
  const onObjDrag = (e) => {
    if (!objDrag.current) return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    const d = objDrag.current;
    const dnx = (t.clientX - d.startX) / d.rw;
    const dny = (t.clientY - d.startY) / d.rh;
    setObjects((prev) => prev.map((o) => {
      if (o.id !== d.id) return o;
      if (d.mode === 'move') {
        return { ...o, n: { ...o.n, x: Math.max(0, Math.min(1 - d.n0.w, d.n0.x + dnx)), y: Math.max(0, Math.min(1 - d.n0.h, d.n0.y + dny)) } };
      }
      const w = Math.max(0.03, Math.min(1 - d.n0.x, d.n0.w + dnx));
      let h;
      if (d.keepRatio) h = w * (d.ratio || 0.5) * (preview.ptW / preview.ptH);
      else h = Math.max(0.01, Math.min(1 - d.n0.y, d.n0.h + dny));
      return { ...o, n: { ...o.n, w, h } };
    }));
  };
  const stopObjDrag = () => {
    objDrag.current = null;
    window.removeEventListener('mousemove', onObjDrag);
    window.removeEventListener('mouseup', stopObjDrag);
    window.removeEventListener('touchmove', onObjDrag);
    window.removeEventListener('touchend', stopObjDrag);
  };

  const save = async () => {
    if (!changeCount) return;
    setBusy(true); setError('');
    try {
      const texts = touchedList.map(([, e]) => ({
        pageIndex: e.pageIndex,
        xPt: e.item.xPt, yPt: e.item.yPt, widthPt: e.item.widthPt, bg: e.item.bg,
        text: e.text,
        family: e.style.family, bold: e.style.bold, italic: e.style.italic,
        underline: e.style.underline, size: e.style.size, color: e.style.color, align: e.style.align,
      }));
      const shapes = objects.filter((o) => o.kind === 'shape').map((o) => ({ pageIndex: o.pageIndex, type: o.type, n: o.n, color: o.color, opacity: o.opacity, strokeWidth: o.strokeWidth, fill: o.fill }));
      const images = objects.filter((o) => o.kind === 'image').map((o) => ({ pageIndex: o.pageIndex, dataUrl: o.dataUrl, n: o.n }));
      // Brand-new text boxes -> text edits placed by normalized coords (no cover box).
      const newTexts = objects.filter((o) => o.kind === 'text' && (o.text || '').trim()).map((o) => {
        const size = o.size || 16;
        const topPt = o.ptH - o.n.y * o.ptH; // box top, PDF points from bottom
        return {
          pageIndex: o.pageIndex,
          xPt: o.n.x * o.ptW,
          yPt: topPt - size,
          widthPt: o.n.w * o.ptW,
          noBg: true,
          text: o.text,
          family: o.family, bold: o.bold, italic: o.italic, underline: o.underline,
          size, color: o.color, align: o.align,
        };
      });
      const bytes = await pdf.applyPdfEdits(file, { texts: [...texts, ...newTexts], shapes, images });
      const name = (docName || 'document').replace(/\.pdf$/i, '') + '-edited.pdf';
      pdf.download(bytes, name);
      setResult({ name });
    } catch (e) {
      setError('Something went wrong while saving your changes. Please try again.');
    }
    setBusy(false);
  };

  const scale = preview ? preview.pxW / preview.ptW : 1;
  const selectedEntry = selectedId ? edits[selectedId] : null;

  const renderEditTextPanel = () => {
    if (!selectedEntry) {
      return (
        <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          <div className="grid place-items-center w-12 h-12 rounded-xl bg-rose-500/10 text-rose-500 mb-3"><MousePointerClick className="w-6 h-6" /></div>
          Click any text on the page to select it. Then change its words, font, size, colour, weight and alignment here.
        </div>
      );
    }
    const st = selectedEntry.style;
    const id = selectedId;
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Text</label>
          <textarea value={selectedEntry.text} onChange={(e) => patchText(id, e.target.value)} rows={2}
            className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-rose-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Font</label>
          <select value={st.family} onChange={(e) => patchStyle(id, { family: e.target.value })}
            className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-rose-400">
            {FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Size</label>
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
              <button type="button" onClick={() => patchStyle(id, { size: Math.max(6, st.size - 1) })} className="px-2.5 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><Minus className="w-4 h-4" /></button>
              <input type="number" min={6} max={200} value={st.size} onChange={(e) => patchStyle(id, { size: Math.max(6, Math.min(200, parseInt(e.target.value || '0', 10) || 6)) })}
                className="w-full text-center text-sm bg-transparent outline-none py-2" />
              <button type="button" onClick={() => patchStyle(id, { size: Math.min(200, st.size + 1) })} className="px-2.5 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Colour</label>
            <input type="color" value={st.color} onChange={(e) => patchStyle(id, { color: e.target.value })}
              className="w-11 h-10 rounded-lg border border-slate-200 dark:border-white/10 bg-white cursor-pointer" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Style</label>
          <div className="flex gap-2">
            <StyleToggle active={st.bold} onClick={() => patchStyle(id, { bold: !st.bold })} title="Bold"><Bold className="w-4 h-4" /></StyleToggle>
            <StyleToggle active={st.italic} onClick={() => patchStyle(id, { italic: !st.italic })} title="Italic"><Italic className="w-4 h-4" /></StyleToggle>
            <StyleToggle active={st.underline} onClick={() => patchStyle(id, { underline: !st.underline })} title="Underline"><Underline className="w-4 h-4" /></StyleToggle>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Alignment</label>
          <div className="flex gap-2">
            <StyleToggle active={st.align === 'left'} onClick={() => patchStyle(id, { align: 'left' })} title="Align left"><AlignLeft className="w-4 h-4" /></StyleToggle>
            <StyleToggle active={st.align === 'center'} onClick={() => patchStyle(id, { align: 'center' })} title="Align center"><AlignCenter className="w-4 h-4" /></StyleToggle>
            <StyleToggle active={st.align === 'right'} onClick={() => patchStyle(id, { align: 'right' })} title="Align right"><AlignRight className="w-4 h-4" /></StyleToggle>
          </div>
        </div>
        <button type="button" onClick={() => resetOne(id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-rose-500"><RotateCcw className="w-4 h-4" /> Reset this text</button>
      </div>
    );
  };

  const renderAnnotatePanel = () => {
    const o = selectedObj && selectedObj.kind === 'text' ? selectedObj : null;
    return (
      <div className="space-y-4">
        <button onClick={addTextBox} disabled={!preview} data-testid="add-text-box-button"
          className="w-full flex flex-col items-center justify-center gap-2 py-7 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-500/[0.05] transition-colors text-slate-500 disabled:opacity-50">
          <Type className="w-7 h-7 text-rose-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Add a text box</span>
          <span className="text-xs text-center px-3">Type Hindi or English anywhere — perfect for filling forms &amp; adding notes.</span>
        </button>
        {o ? (
          <div className="space-y-4 pt-1 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Text box selected</span>
              <button onClick={() => removeObj(o.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Text</label>
              <input value={o.text} data-testid="add-text-input" autoFocus
                onChange={(e) => updateObj(o.id, { text: e.target.value })}
                placeholder="Type your text…"
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-rose-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Font</label>
              <select value={o.family} onChange={(e) => updateObj(o.id, { family: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-rose-400">
                {FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Size</label>
                <div className="flex items-center rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
                  <button type="button" onClick={() => updateObj(o.id, { size: Math.max(6, (o.size || 16) - 1) })} className="px-2.5 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><Minus className="w-4 h-4" /></button>
                  <input type="number" min={6} max={200} value={o.size || 16} onChange={(e) => updateObj(o.id, { size: Math.max(6, Math.min(200, parseInt(e.target.value || '0', 10) || 6)) })} className="w-full text-center text-sm bg-transparent outline-none py-2" />
                  <button type="button" onClick={() => updateObj(o.id, { size: Math.min(200, (o.size || 16) + 1) })} className="px-2.5 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Colour</label>
                <input type="color" value={o.color} onChange={(e) => updateObj(o.id, { color: e.target.value })} className="w-11 h-10 rounded-lg border border-slate-200 dark:border-white/10 bg-white cursor-pointer" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Style</label>
              <div className="flex gap-2">
                <StyleToggle active={o.bold} onClick={() => updateObj(o.id, { bold: !o.bold })} title="Bold"><Bold className="w-4 h-4" /></StyleToggle>
                <StyleToggle active={o.italic} onClick={() => updateObj(o.id, { italic: !o.italic })} title="Italic"><Italic className="w-4 h-4" /></StyleToggle>
                <StyleToggle active={o.underline} onClick={() => updateObj(o.id, { underline: !o.underline })} title="Underline"><Underline className="w-4 h-4" /></StyleToggle>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Alignment</label>
              <div className="flex gap-2">
                <StyleToggle active={o.align === 'left'} onClick={() => updateObj(o.id, { align: 'left' })} title="Align left"><AlignLeft className="w-4 h-4" /></StyleToggle>
                <StyleToggle active={o.align === 'center'} onClick={() => updateObj(o.id, { align: 'center' })} title="Align center"><AlignCenter className="w-4 h-4" /></StyleToggle>
                <StyleToggle active={o.align === 'right'} onClick={() => updateObj(o.id, { align: 'right' })} title="Align right"><AlignRight className="w-4 h-4" /></StyleToggle>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Add a text box, then drag it into position and type your text in this panel. Hindi (Devanagari) is fully supported on export.</p>
        )}
      </div>
    );
  };

  const comingSoon = (label) => (
    <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
      <div className="grid place-items-center w-12 h-12 rounded-xl bg-slate-500/10 text-slate-400 mb-3"><StickyNote className="w-6 h-6" /></div>
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
      This workspace is coming soon. For now, use <span className="font-semibold text-rose-500">Edit Text</span>, <span className="font-semibold text-rose-500">Shapes</span> or <span className="font-semibold text-rose-500">Insert</span>.
    </div>
  );

  const selectedObj = selectedObjId ? objects.find((o) => o.id === selectedObjId) : null;

  const renderShapesPanel = () => {
    const shapeBtns = [
      { type: 'rect', label: 'Rectangle', icon: Square },
      { type: 'line', label: 'Line', icon: Minus },
      { type: 'highlight', label: 'Highlight', icon: Highlighter },
    ];
    const o = selectedObj && selectedObj.kind === 'shape' ? selectedObj : null;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {shapeBtns.map((b) => (
            <button key={b.type} onClick={() => addShape(b.type)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-slate-200 dark:border-white/10 hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-500/[0.05] text-slate-600 dark:text-slate-300 text-xs font-semibold">
              <b.icon className="w-5 h-5 text-rose-500" /> {b.label}
            </button>
          ))}
        </div>
        {o ? (
          <div className="space-y-4 pt-1 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 capitalize">{o.type} selected</span>
              <button onClick={() => removeObj(o.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Colour</label>
                <input type="color" value={o.color} onChange={(e) => updateObj(o.id, { color: e.target.value })} className="w-11 h-10 rounded-lg border border-slate-200 dark:border-white/10 bg-white cursor-pointer" />
              </div>
              {o.type !== 'highlight' && (
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Thickness</label>
                  <input type="range" min={1} max={12} value={o.strokeWidth || 2} onChange={(e) => updateObj(o.id, { strokeWidth: parseInt(e.target.value, 10) })} className="w-full accent-rose-500" />
                </div>
              )}
            </div>
            {o.type === 'rect' && (
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={!!o.fill} onChange={(e) => updateObj(o.id, { fill: e.target.checked })} className="accent-rose-500 w-4 h-4" /> Fill with colour
              </label>
            )}
            {(o.type === 'highlight' || o.fill) && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Opacity</label>
                <input type="range" min={5} max={100} value={Math.round((o.opacity ?? 0.35) * 100)} onChange={(e) => updateObj(o.id, { opacity: parseInt(e.target.value, 10) / 100 })} className="w-full accent-rose-500" />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Add a shape, then drag to position and resize it. Select any shape to change its colour and thickness.</p>
        )}
      </div>
    );
  };

  const renderInsertPanel = () => {
    const o = selectedObj && selectedObj.kind === 'image' ? selectedObj : null;
    return (
      <div className="space-y-4">
        <input ref={imgInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => addImageObj(e.target.files)} />
        <button onClick={() => imgInputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-7 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-500/[0.05] transition-colors text-slate-500">
          <UploadCloud className="w-7 h-7 text-rose-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Insert an image</span>
          <span className="text-xs">JPG or PNG · logo, photo, stamp…</span>
        </button>
        {o ? (
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-white/5">
            <span className="text-xs font-semibold text-slate-500">Image selected</span>
            <button onClick={() => removeObj(o.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">After inserting, drag the image to position it and pull the corner to resize.</p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0d16] text-slate-900 dark:text-slate-100 transition-colors">
      <Header />

      {!file ? (
        <section className="relative overflow-hidden grid-hero border-b border-slate-200 dark:border-white/10">
          <div className="absolute -top-24 right-0 w-96 h-96 rounded-full bg-rose-500/15 blur-[110px]" />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-12 text-center">
            <div className="flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 mb-6">
              <Link to="/" className="hover:text-rose-500">Home</Link><ChevronRight className="w-4 h-4" /><span className="text-slate-700 dark:text-slate-200 font-medium">Edit PDF</span>
            </div>
            <div className="grid place-items-center w-16 h-16 mx-auto rounded-2xl bg-rose-500/12 text-rose-500 dark:text-rose-400"><PenLine className="w-8 h-8" /></div>
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl mt-5">Edit PDF</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-xl mx-auto">A professional PDF editor in your browser. Click any text to change its words, font, size, colour and style — then save a fresh PDF.</p>
            <div className="mt-8"><FileDrop accept=".pdf" multiple={false} onFiles={onFiles} label="Select PDF file" /></div>
          </div>
        </section>
      ) : result ? (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
          <div className="rounded-3xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/[0.06] p-8 text-center">
            <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 text-emerald-500"><CheckCircle2 className="w-8 h-8" /></div>
            <h3 className="font-display font-bold text-2xl mt-5">Your edited PDF is ready!</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2">Saved {changeCount} change{changeCount === 1 ? '' : 's'} to <span className="font-medium">{result.name}</span>.</p>
            <button onClick={save} className="mt-6 inline-flex items-center gap-2 btn-primary text-white font-semibold px-7 py-3.5 rounded-xl transition"><Download className="w-5 h-5" /> Download again</button>
            <button onClick={() => setResult(null)} className="mt-5 block mx-auto text-sm font-semibold text-slate-500 hover:text-rose-500">Keep editing</button>
          </div>
        </section>
      ) : (
        <section className="max-w-[1400px] mx-auto px-3 sm:px-4 py-5">
          {/* Top toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => { setFile(null); setPreview(null); setEdits({}); setThumbs([]); setObjects([]); setSelectedObjId(null); }} className="text-sm font-medium text-slate-500 hover:text-rose-500 flex items-center gap-1 shrink-0"><X className="w-4 h-4" /> Close</button>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[180px]">{docName}</span>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5 order-3 sm:order-2 w-full sm:w-auto overflow-x-auto">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${activeTab === t.id ? 'bg-white dark:bg-white/10 shadow-sm text-rose-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>
            <button onClick={save} disabled={busy || changeCount === 0} data-testid="edit-save-button"
              className="order-2 sm:order-3 inline-flex items-center gap-2 btn-primary text-white font-semibold px-5 py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save changes{changeCount > 0 ? ` (${changeCount})` : ''}
            </button>
          </div>

          {error && <div className="text-sm text-rose-500 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl px-4 py-2.5 mb-4">{error}</div>}

          <div className="flex gap-4">
            {/* Left: thumbnails */}
            <aside className="hidden md:block w-36 shrink-0">
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-2 h-[74vh] overflow-y-auto">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-2 py-1.5">Pages</p>
                <div className="space-y-2">
                  {(thumbs.length ? thumbs : [{ index: pageIndex, url: null }]).map((th) => (
                    <button key={th.index} onClick={() => goPage(th.index)}
                      className={`block w-full rounded-lg overflow-hidden border-2 transition ${th.index === pageIndex ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-200 dark:border-white/10 hover:border-rose-300'}`}>
                      {th.url ? <img src={th.url} alt={`Page ${th.index + 1}`} className="w-full block" /> : <div className="aspect-[3/4] bg-white" />}
                      <span className="block text-[11px] font-medium text-slate-500 py-1">{th.index + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* Center: canvas + zoom */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 mb-3">
                <MousePointerClick className="w-4 h-4 text-rose-500 shrink-0" />
                Click any highlighted text to edit and restyle it. Changes save into a fresh PDF.
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/20 overflow-auto h-[68vh] grid place-items-start justify-center p-6">
                {loading || !preview ? (
                  <div className="flex items-center gap-2 text-slate-500 place-self-center"><Loader2 className="w-5 h-5 animate-spin" /> Reading page…</div>
                ) : (
                  <div style={{ width: preview.pxW * zoom, height: preview.pxH * zoom }}>
                    <div ref={stageRef} style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: preview.pxW, height: preview.pxH }}
                      className="relative bg-white shadow-xl" onClick={(e) => { if (e.target === e.currentTarget) { setSelectedId(null); setSelectedObjId(null); } }}>
                      <img src={preview.dataUrl} alt={`page ${pageIndex + 1}`} className="block select-none pointer-events-none" style={{ width: preview.pxW, height: preview.pxH }} draggable={false} />
                      {preview.items.map((it) => {
                        const entry = edits[it.id];
                        const st = entry ? entry.style : deriveStyle(it);
                        const text = entry ? entry.text : it.str;
                        const active = selectedId === it.id || (entry && entry.touched);
                        // Keep the on-page glyph size IDENTICAL to the original when
                        // the user hasn't manually changed the size: st.size starts as
                        // the rounded point size, so scale the exact original pixel
                        // height (it.fontPx) by (current size / baseline size). When
                        // unchanged this factor is 1 -> no size jump on click/edit.
                        const baseSize = Math.max(6, Math.round(it.sizePt));
                        let fontPx = it.fontPx * (st.size / baseSize);
                        // Shrink-to-fit: if the (edited/converted) text is wider than
                        // its original box, reduce the font size so it fits instead of
                        // overflowing. Only shrinks — never enlarges — so text that
                        // already fits keeps its exact original size.
                        if (it.widthPx > 4) {
                          const measured = measureTextWidthPx(text, fontPx * 0.92, st);
                          if (measured > it.widthPx) {
                            fontPx = Math.max(5, fontPx * (it.widthPx / measured));
                          }
                        }
                        const baselinePx = it.top + it.fontPx;
                        const top = baselinePx - fontPx;
                        if (active) {
                          const w = Math.max(it.widthPx, fontPx, 14);
                          return (
                            <input key={it.id} value={text} data-testid="pdf-text-input"
                              onChange={(e) => patchText(it.id, e.target.value)}
                              onFocus={() => selectItem(it)}
                              spellCheck={false}
                              style={{
                                position: 'absolute', left: it.left, top,
                                width: w, height: fontPx * 1.32,
                                fontFamily: famCss(st.family), fontSize: fontPx * 0.92,
                                lineHeight: `${fontPx * 1.32}px`,
                                fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal',
                                textDecoration: st.underline ? 'underline' : 'none',
                                textAlign: st.align, color: st.color, background: it.bg,
                                border: selectedId === it.id ? '1px solid rgba(244,63,94,0.9)' : '1px dashed rgba(244,63,94,0.45)',
                                borderRadius: 3, padding: 0, paddingLeft: 1, outline: 'none',
                                boxSizing: 'content-box', zIndex: selectedId === it.id ? 30 : 10,
                              }} />
                          );
                        }
                        return (
                          <div key={it.id} onClick={() => selectItem(it)} title="Click to edit" data-testid="pdf-text-run"
                            style={{
                              position: 'absolute', left: it.left, top: it.top,
                              width: it.widthPx, height: it.fontPx * 1.25,
                              fontSize: it.fontPx * 0.92, lineHeight: `${it.fontPx * 1.25}px`,
                              fontFamily: famCss(st.family), color: 'transparent',
                              cursor: 'text', borderRadius: 3, whiteSpace: 'pre', overflow: 'hidden',
                            }}
                            className="hover:bg-rose-400/20 hover:outline hover:outline-1 hover:outline-rose-400/60">
                            {it.str}
                          </div>
                        );
                      })}
                      {objects.filter((o) => o.pageIndex === pageIndex).map((o) => {
                        const left = o.n.x * preview.pxW, top = o.n.y * preview.pxH, w = o.n.w * preview.pxW, h = o.n.h * preview.pxH;
                        const sel = selectedObjId === o.id;
                        let inner;
                        if (o.kind === 'image') {
                          inner = <img src={o.dataUrl} alt="inserted" className="w-full h-full object-fill pointer-events-none select-none" />;
                        } else if (o.kind === 'text') {
                          inner = (
                            <div className="w-full h-full overflow-hidden select-none pointer-events-none" style={{
                              fontFamily: famCss(o.family), fontSize: (o.size || 16) * scale,
                              fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? 'italic' : 'normal',
                              textDecoration: o.underline ? 'underline' : 'none', textAlign: o.align || 'left',
                              color: (o.text || '').trim() ? o.color : '#94a3b8', lineHeight: 1.15,
                              whiteSpace: 'pre', padding: '0 1px',
                            }}>{(o.text || '').trim() ? o.text : 'Type your text…'}</div>
                          );
                        } else if (o.type === 'highlight') {
                          inner = <div className="w-full h-full" style={{ background: o.color, opacity: o.opacity ?? 0.35 }} />;
                        } else if (o.type === 'line') {
                          inner = <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', borderTop: `${(o.strokeWidth || 2) * scale}px solid ${o.color}` }} />;
                        } else {
                          inner = <div className="w-full h-full" style={{ border: `${(o.strokeWidth || 2) * scale}px solid ${o.color}`, background: o.fill ? o.color : 'transparent', opacity: o.fill ? (o.opacity ?? 0.25) : 1 }} />;
                        }
                        return (
                          <div key={o.id} className={`absolute ${sel ? 'outline outline-2 outline-rose-500/80' : ''}`}
                            style={{ left, top, width: w, height: h, zIndex: sel ? 25 : 15, cursor: 'move', ...(o.kind === 'text' && !sel ? { outline: '1px dashed rgba(148,163,184,0.7)' } : {}) }}
                            onMouseDown={(e) => startObjDrag(e, o.id, 'move')} onTouchStart={(e) => startObjDrag(e, o.id, 'move')}>
                            {inner}
                            {sel && (
                              <>
                                <span className="absolute -top-3 -left-3 grid place-items-center w-6 h-6 rounded-full bg-rose-500 text-white cursor-move"><Move className="w-3.5 h-3.5" /></span>
                                <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); removeObj(o.id); }} className="absolute -top-3 -right-3 grid place-items-center w-6 h-6 rounded-full bg-white border border-rose-300 text-rose-500 hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /></button>
                                <span onMouseDown={(e) => startObjDrag(e, o.id, 'resize')} onTouchStart={(e) => startObjDrag(e, o.id, 'resize')} className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-white border-2 border-rose-500 cursor-se-resize" />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {/* Bottom zoom bar */}
              <div className="flex items-center justify-between mt-3 px-1">
                <span className="text-sm text-slate-500">Page {pageIndex + 1} of {total}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="grid place-items-center w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><ZoomOut className="w-4 h-4" /></button>
                  <span className="text-sm font-semibold w-14 text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} className="grid place-items-center w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"><ZoomIn className="w-4 h-4" /></button>
                  <button onClick={() => setZoom(1)} className="text-sm font-medium text-slate-500 hover:text-rose-500 ml-1">Fit</button>
                </div>
              </div>
            </div>

            {/* Right: styling panel */}
            <aside className="w-72 shrink-0 hidden lg:block">
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 h-[74vh] overflow-y-auto">
                <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
                  {(TABS.find((t) => t.id === activeTab) || {}).label}
                </h3>
                {activeTab === 'edit-text' ? renderEditTextPanel()
                  : activeTab === 'shapes' ? renderShapesPanel()
                  : activeTab === 'insert' ? renderInsertPanel()
                  : activeTab === 'annotate' ? renderAnnotatePanel()
                  : comingSoon('Forms')}
              </div>
            </aside>
          </div>
        </section>
      )}
      <Footer />
    </div>
  );
};

export default EditPdfPage;
