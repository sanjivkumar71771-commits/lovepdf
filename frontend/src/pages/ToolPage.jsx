import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PDFDocument, degrees } from 'pdf-lib';
import * as Icons from 'lucide-react';
import { ChevronRight, X, RotateCw, Trash2, Download, Loader2, CheckCircle2, ArrowLeft, Sparkles } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Seo from '../components/Seo';
import FileDrop from '../components/FileDrop';
import { TOOLS, ICON_TILE, SERVER_TOOLS, OCR_LANGS } from '../mock';
import * as pdf from '../lib/pdfUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api/pdf`;

const positions = [
  { id: 'bottom-center', label: 'Bottom center' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-right', label: 'Bottom right' },
  { id: 'top-center', label: 'Top center' },
  { id: 'top-left', label: 'Top left' },
  { id: 'top-right', label: 'Top right' },
];

const MultiPreview = ({ file }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    if (file.type && file.type.startsWith('image/')) {
      const u = URL.createObjectURL(file);
      setSrc(u);
      return () => URL.revokeObjectURL(u);
    }
    if (/\.pdf$/i.test(file.name || '')) {
      pdf.renderPageImage(file, 0, 400).then((p) => { if (alive) setSrc(p.dataUrl); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [file]);
  if (!src) return (
    <div className="flex flex-col items-center gap-1 text-rose-500">
      <Icons.FileText className="w-10 h-10" />
    </div>
  );
  return <img src={src} alt="" className="w-full h-full object-contain" draggable={false} />;
};

const ToolPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const tool = useMemo(() => TOOLS.find((t) => t.slug === slug), [slug]);

  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // {name, bytes} | {parts:[]} | {images:[]}
  const [thumbs, setThumbs] = useState([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [order, setOrder] = useState([]);
  const [rotations, setRotations] = useState({});
  const [progress, setProgress] = useState(0);
  const [opts, setOpts] = useState({ ranges: '1', position: 'bottom-center', start: 1, wtext: 'CONFIDENTIAL', opacity: 0.25, angle: 90, quality: 2, targetVal: 200, targetUnit: 'KB', password: '', lang: 'eng', margin: 5, url: '', html: '' });
  const [file2, setFile2] = useState(null);
  const [preview, setPreview] = useState(null);

  // Drag-and-drop reorder for multi-file tools (Merge / JPG to PDF)
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const serverCfg = SERVER_TOOLS[slug];

  const DEFAULT_OPTS = { ranges: '1', position: 'bottom-center', start: 1, wtext: 'CONFIDENTIAL', opacity: 0.25, angle: 90, quality: 2, targetVal: 200, targetUnit: 'KB', password: '', lang: 'eng', margin: 5, url: '', html: '' };

  // Reset every piece of state whenever the tool (slug) changes so each tool starts fresh
  useEffect(() => {
    window.scrollTo(0, 0);
    setFiles([]);
    setBusy(false);
    setError('');
    setResult(null);
    setThumbs([]);
    setTotal(0);
    setSelected(new Set());
    setOrder([]);
    setRotations({});
    setProgress(0);
    setFile2(null);
    setPreview(null);
    setDragOverIndex(null);
    dragItem.current = null;
    dragOverItem.current = null;
    setOpts(DEFAULT_OPTS);
  }, [slug]);
  useEffect(() => { if (!tool) navigate('/'); }, [tool, navigate]);

  const Icon = tool ? (Icons[tool.icon] || Icons.FileText) : Icons.FileText;
  const isMulti = tool && ['merge', 'jpg-to-pdf'].includes(tool.engine);
  const isImageInput = tool && tool.engine === 'jpg-to-pdf';
  const needsThumbs = tool && ['organize', 'extract', 'remove'].includes(tool.engine);

  const reset = () => { setResult(null); setError(''); };

  const onFiles = async (list) => {
    reset();
    if (isMulti) {
      setFiles((prev) => [...prev, ...list]);
    } else {
      const f = list[0];
      setFiles([f]);
      setPreview(null);
      if (f.type && f.type.startsWith('image/')) {
        setPreview(URL.createObjectURL(f));
      } else if (/\.pdf$/i.test(f.name || '')) {
        pdf.renderPageImage(f, 0, 720).then((p) => setPreview(p.dataUrl)).catch(() => {});
      }
      if (!isImageInput && needsThumbs) {
        setBusy(true);
        try {
          const { thumbs: th, total: tt } = await pdf.renderThumbnails(f);
          setThumbs(th); setTotal(tt);
          setOrder(th.map((x) => x.index));
          setSelected(new Set());
          setRotations({});
        } catch (e) { setError('Could not read this PDF. It may be encrypted or damaged.'); }
        setBusy(false);
      }
    }
  };

  const move = (i, dir) => {
    setFiles((prev) => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };
  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  // Drag-and-drop reorder handlers for the multi-file grid
  const handleDragStart = (i) => { dragItem.current = i; };
  const handleDragEnter = (i) => { dragOverItem.current = i; setDragOverIndex(i); };
  const handleDragEnd = () => {
    const from = dragItem.current;
    const to = dragOverItem.current;
    if (from !== null && to !== null && from !== to) {
      setFiles((prev) => {
        const arr = [...prev];
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        return arr;
      });
      reset();
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverIndex(null);
  };

  const toggleSelect = (idx) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };

  const moveThumb = (pos, dir) => {
    setOrder((prev) => {
      const arr = [...prev];
      const j = pos + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[pos], arr[j]] = [arr[j], arr[pos]];
      return arr;
    });
  };
  const rotateThumb = (idx) => setRotations((r) => ({ ...r, [idx]: ((r[idx] || 0) + 90) % 360 }));
  const deleteThumb = (idx) => setOrder((prev) => prev.filter((x) => x !== idx));

  const process = async () => {
    reset();
    if (!files.length) { setError('Please add a file first.'); return; }
    setBusy(true);
    try {
      const base = files[0].name.replace(/\.[^.]+$/, '');
      switch (tool.engine) {
        case 'merge': {
          const bytes = await pdf.mergePdfs(files);
          setResult({ name: 'merged.pdf', bytes });
          break;
        }
        case 'jpg-to-pdf': {
          const bytes = await pdf.imagesToPdf(files);
          setResult({ name: 'images.pdf', bytes });
          break;
        }
        case 'split': {
          const parts = await pdf.splitByRanges(files[0], opts.ranges);
          if (!parts.length) throw new Error('No valid page ranges.');
          setResult({ parts });
          break;
        }
        case 'compress': {
          const orig = files[0].size;
          const mult = opts.targetUnit === 'MB' ? 1024 * 1024 : 1024;
          const target = Math.max(1, Number(opts.targetVal) || 0) * mult;
          setProgress(1);
          const { bytes, size } = await pdf.compressToTarget(files[0], target, { onProgress: (p) => setProgress(p) });
          setResult({ name: `${base}_compressed.pdf`, bytes, meta: { orig, size, target } });
          setProgress(0);
          break;
        }
        case 'rotate': {
          const bytes = await pdf.rotatePdf(files[0], opts.angle);
          setResult({ name: `${base}_rotated.pdf`, bytes });
          break;
        }
        case 'extract': {
          const idx = [...selected].sort((a, b) => a - b);
          if (!idx.length) throw new Error('Select at least one page to extract.');
          const bytes = await pdf.extractPages(files[0], idx);
          setResult({ name: `${base}_extracted.pdf`, bytes });
          break;
        }
        case 'remove': {
          const idx = [...selected];
          if (!idx.length) throw new Error('Select the pages you want to remove.');
          const bytes = await pdf.removePages(files[0], idx);
          setResult({ name: `${base}_edited.pdf`, bytes });
          break;
        }
        case 'organize': {
          const src = await PDFDocument.load(await pdf.readFile(files[0]), { ignoreEncryption: true });
          const out = await PDFDocument.create();
          const pages = await out.copyPages(src, order);
          pages.forEach((p, i) => {
            const rot = rotations[order[i]] || 0;
            if (rot) p.setRotation(degrees(rot));
            out.addPage(p);
          });
          setResult({ name: `${base}_organized.pdf`, bytes: await out.save() });
          break;
        }
        case 'page-numbers': {
          const bytes = await pdf.addPageNumbers(files[0], { position: opts.position, start: Number(opts.start) || 1 });
          setResult({ name: `${base}_numbered.pdf`, bytes });
          break;
        }
        case 'watermark': {
          const bytes = await pdf.addWatermark(files[0], { text: opts.wtext || 'WATERMARK', opacity: Number(opts.opacity) });
          setResult({ name: `${base}_watermarked.pdf`, bytes });
          break;
        }
        case 'pdf-to-jpg': {
          const images = await pdf.pdfToImages(files[0], { scale: Number(opts.quality) || 2 });
          setResult({ images, zipName: `${base}_images.zip` });
          break;
        }
        default:
          throw new Error('unsupported');
      }
    } catch (e) {
      setError(e.message === 'unsupported' ? '' : (e.message || 'Something went wrong. Please try another file.'));
    }
    setBusy(false);
  };

  if (!tool) return null;

  const serverProcess = async () => {
    reset();
    setBusy(true);
    setProgress(0);
    try {
      const fd = new FormData();
      if (serverCfg.kind === 'html') {
        if (!opts.url && !opts.html) throw new Error('Enter a URL or paste HTML content.');
        if (opts.url) fd.append('url', opts.url);
        if (opts.html) fd.append('html', opts.html);
      } else if (serverCfg.kind === 'compare') {
        if (!files[0] || !file2) throw new Error('Please add both PDF files to compare.');
        fd.append('file1', files[0]);
        fd.append('file2', file2);
      } else {
        if (!files[0]) throw new Error('Please add a file first.');
        fd.append('file', files[0]);
      }
      (serverCfg.fields || []).forEach((f) => {
        if (f === 'password' && !opts.password && slug === 'protect-pdf') throw new Error('Please set a password.');
        fd.append(f, opts[f]);
      });

      const res = await fetch(`${API}/${serverCfg.endpoint}`, { method: 'POST', body: fd });
      if (!res.ok) {
        let msg = 'Processing failed. Please try another file.';
        try { const j = await res.json(); msg = j.detail || msg; } catch (_) { /* ignore */ }
        throw new Error(msg);
      }
      if (serverCfg.kind === 'compare') {
        const data = await res.json();
        setResult({ compare: data });
      } else {
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        const m = cd.match(/filename="?([^";]+)"?/);
        const extMap = {
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
          'application/pdf': 'pdf', 'application/zip': 'zip', 'text/plain': 'txt',
        };
        const fallbackExt = extMap[blob.type] || 'pdf';
        const base0 = (files[0]?.name || 'result').replace(/\.[^.]+$/, '');
        const name = m ? m[1] : `${base0}.${fallbackExt}`;
        setResult({ blob, name });
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    }
    setBusy(false);
  };

  const relatedTools = TOOLS.filter((t) => t.slug !== slug && t.category === tool.category).slice(0, 4);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0d16] text-slate-900 dark:text-slate-100 transition-colors">
      <Seo
        path={`/tool/${slug}`}
        title={`${tool.name} — Free Online Tool | LovePDF`}
        description={tool.desc}
        keywords={`${tool.name.toLowerCase()}, ${slug.replace(/-/g, ' ')}, free ${tool.name.toLowerCase()} online`}
        jsonLd={{ '@context': 'https://schema.org', '@type': 'WebApplication', name: `${tool.name} - LovePDF`, applicationCategory: 'Utility', operatingSystem: 'Any', description: tool.desc, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }}
      />
      <Header />

      <section className="relative overflow-hidden grid-hero border-b border-slate-200 dark:border-white/10">
        <div className="absolute -top-24 right-0 w-96 h-96 rounded-full bg-rose-500/15 blur-[110px]" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-10 pb-8 text-center">
          <div className="flex items-center justify-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 mb-6">
            <Link to="/" className="hover:text-rose-500">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-700 dark:text-slate-200 font-medium">{tool.name}</span>
          </div>
          <div className={`grid place-items-center w-16 h-16 mx-auto rounded-2xl ${ICON_TILE[tool.color] || ICON_TILE.rose}`}>
            <Icon className="w-8 h-8" />
          </div>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl mt-5">{tool.name}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-xl mx-auto leading-relaxed">{tool.desc}</p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        {(!tool.ready && !serverCfg) ? (
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-10 text-center">
            <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-violet-500/10 text-violet-500"><Sparkles className="w-7 h-7" /></div>
            <h3 className="font-display font-bold text-xl mt-5">Advanced engine coming soon</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-md mx-auto leading-relaxed">
              {tool.name} needs an editor experience we’re wiring up next. Meanwhile, try our other tools — they work right now.
            </p>
            <button onClick={() => navigate('/#tools')} className="mt-6 inline-flex items-center gap-2 btn-primary text-white font-semibold px-6 py-3 rounded-xl transition">
              <ArrowLeft className="w-4 h-4" /> Browse working tools
            </button>
          </div>
        ) : result ? (
          <ResultView result={result} onReset={() => { setResult(null); setFiles([]); setFile2(null); setThumbs([]); setPreview(null); }} />
        ) : (serverCfg && serverCfg.kind === 'html') ? (
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-7 space-y-5">
            <Field label="Webpage URL">
              <input value={opts.url} onChange={(e) => setOpts({ ...opts, url: e.target.value })} placeholder="https://example.com" className="input" />
            </Field>
            <div className="text-center text-xs text-slate-400 font-semibold">— OR —</div>
            <Field label="Paste HTML code">
              <textarea value={opts.html} onChange={(e) => setOpts({ ...opts, html: e.target.value })} rows={6} placeholder="<h1>Hello</h1>" className="input font-mono text-xs" />
            </Field>
            {error && <p className="text-sm text-rose-500 font-medium">{error}</p>}
            <button onClick={serverProcess} disabled={busy} className="w-full btn-primary text-white font-semibold py-4 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-70">
              {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Converting...</> : <><Icon className="w-5 h-5" /> Convert to PDF</>}
            </button>
          </div>
        ) : (serverCfg && serverCfg.kind === 'compare') ? (
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-7 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium mb-2">Original PDF</p>
                {files[0] ? (
                  <FileChip name={files[0].name} onRemove={() => setFiles([])} />
                ) : <FileDrop accept=".pdf" multiple={false} onFiles={(l) => setFiles([l[0]])} label="Select PDF" />}
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Changed PDF</p>
                {file2 ? (
                  <FileChip name={file2.name} onRemove={() => setFile2(null)} />
                ) : <FileDrop accept=".pdf" multiple={false} onFiles={(l) => setFile2(l[0])} label="Select PDF" />}
              </div>
            </div>
            {error && <p className="text-sm text-rose-500 font-medium">{error}</p>}
            <button onClick={serverProcess} disabled={busy} className="w-full btn-primary text-white font-semibold py-4 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-70">
              {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Comparing...</> : <><Icon className="w-5 h-5" /> Compare PDFs</>}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {files.length === 0 ? (
              <FileDrop
                accept={serverCfg ? serverCfg.accept : (isImageInput ? 'image/*' : (slug === 'merge-pdf' ? '.pdf,image/*' : '.pdf'))}
                multiple={isMulti}
                onFiles={onFiles}
                label={isImageInput ? 'Select images' : (slug === 'merge-pdf' ? 'Select PDFs & images' : (isMulti ? 'Select PDF files' : (serverCfg && serverCfg.accept !== '.pdf' ? 'Select file' : 'Select PDF file')))}
              />
            ) : (
              <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-7 space-y-5">
                {/* Preview grid for multi tools (Merge / JPG to PDF) */}
                {isMulti && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-sm font-medium">{files.length} file{files.length > 1 ? 's' : ''} added</p>
                      {files.length > 1 && (
                        <p className="text-xs text-slate-400 flex items-center gap-1.5">
                          <Icons.Move className="w-3.5 h-3.5" /> Drag to reorder {isImageInput ? 'pages' : 'files'}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {files.map((f, i) => (
                        <div
                          key={`${f.name}-${i}`}
                          data-testid={`multi-file-card-${i}`}
                          draggable
                          onDragStart={() => handleDragStart(i)}
                          onDragEnter={() => handleDragEnter(i)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => e.preventDefault()}
                          className={`relative group rounded-xl border-2 bg-slate-50 dark:bg-white/[0.02] p-2 cursor-move transition-all ${dragOverIndex === i ? 'border-rose-500 ring-2 ring-rose-500/30 scale-[1.02]' : 'border-slate-200 dark:border-white/10'}`}
                        >
                          <div className="aspect-[3/4] rounded-lg overflow-hidden bg-white dark:bg-black/20 grid place-items-center">
                            <MultiPreview file={f} />
                          </div>
                          <span className="absolute top-3 left-3 grid place-items-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-rose-500 text-white text-xs font-bold shadow">{i + 1}</span>
                          <button
                            onClick={() => removeFile(i)}
                            data-testid={`remove-file-${i}`}
                            className="absolute top-3 right-3 grid place-items-center w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-500 transition-opacity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <p className="text-xs truncate mt-2 text-center px-1" title={f.name}>{f.name}</p>
                          <p className="text-[10px] text-slate-400 text-center">{(f.size / 1024).toFixed(0)} KB</p>
                          <div className="flex justify-center gap-1 mt-1">
                            <button onClick={() => move(i, -1)} disabled={i === 0} title="Move left" className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"><ArrowLeft className="w-3.5 h-3.5" /></button>
                            <button onClick={() => move(i, 1)} disabled={i === files.length - 1} title="Move right" className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"><Icons.ArrowRight className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                      {/* Add-more tile fits inline in the grid (next to the images) to save space */}
                      <label
                        data-testid="add-more-tile"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); const fl = Array.from(e.dataTransfer.files || []); if (fl.length) onFiles(fl); }}
                        className="group rounded-xl border-2 border-dashed border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-white/[0.02] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-500/5 text-slate-400 hover:text-rose-500 transition-colors p-2 min-h-full"
                      >
                        <span className="grid place-items-center w-11 h-11 rounded-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 group-hover:border-rose-300 transition-colors">
                          <Icons.Plus className="w-5 h-5" />
                        </span>
                        <span className="text-xs font-semibold">Add more</span>
                        <input
                          type="file"
                          accept={isImageInput ? 'image/*' : (slug === 'merge-pdf' ? '.pdf,image/*' : '.pdf')}
                          multiple
                          className="hidden"
                          onChange={(e) => { const fl = Array.from(e.target.files || []); if (fl.length) onFiles(fl); e.target.value = ''; }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Single file summary */}
                {!isMulti && (
                  <div className="space-y-3">
                    {preview && !needsThumbs && (
                      <div data-testid="file-preview" className="flex justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] p-4">
                        <img src={preview} alt="File preview" className="max-h-[32rem] w-auto max-w-full rounded-lg shadow-md object-contain" />
                      </div>
                    )}
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] px-4 py-3">
                      <Icons.FileText className="w-5 h-5 text-rose-500" />
                      <span className="text-sm truncate flex-1">{files[0].name}</span>
                      {total > 0 && <span className="text-xs text-slate-400">{total} pages</span>}
                      <button onClick={() => { setFiles([]); setThumbs([]); setPreview(null); }} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}

                {/* Options */}
                {tool.engine === 'split' && (
                  <Field label="Page ranges (comma separated groups)">
                    <input value={opts.ranges} onChange={(e) => setOpts({ ...opts, ranges: e.target.value })}
                      placeholder="e.g. 1-3, 4-6, 8" className="input" />
                    <p className="hint">Each group becomes a separate PDF. Example: <b>1-3, 4-6</b> creates 2 files.</p>
                  </Field>
                )}
                {tool.engine === 'rotate' && (
                  <Field label="Rotation">
                    <div className="flex gap-2">
                      {[90, 180, 270].map((a) => (
                        <button key={a} onClick={() => setOpts({ ...opts, angle: a })}
                          className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${opts.angle === a ? 'btn-primary text-white border-transparent' : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'}`}>{a}°</button>
                      ))}
                    </div>
                  </Field>
                )}
                {tool.engine === 'page-numbers' && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Position">
                      <select value={opts.position} onChange={(e) => setOpts({ ...opts, position: e.target.value })} className="input">
                        {positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Start from">
                      <input type="number" min="1" value={opts.start} onChange={(e) => setOpts({ ...opts, start: e.target.value })} className="input" />
                    </Field>
                  </div>
                )}
                {tool.engine === 'watermark' && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Watermark text">
                      <input value={opts.wtext} onChange={(e) => setOpts({ ...opts, wtext: e.target.value })} className="input" />
                    </Field>
                    <Field label={`Opacity: ${Math.round(opts.opacity * 100)}%`}>
                      <input type="range" min="0.05" max="0.6" step="0.05" value={opts.opacity} onChange={(e) => setOpts({ ...opts, opacity: e.target.value })} className="w-full accent-rose-500" />
                    </Field>
                  </div>
                )}
                {tool.engine === 'compress' && (
                  <Field label="Compress this PDF to (choose your target size)">
                    <div className="flex items-stretch gap-2">
                      <input type="number" min="1" value={opts.targetVal} onChange={(e) => setOpts({ ...opts, targetVal: e.target.value })} className="input flex-1" placeholder="e.g. 50" />
                      <select value={opts.targetUnit} onChange={(e) => setOpts({ ...opts, targetUnit: e.target.value })} className="input w-24">
                        <option value="KB">KB</option>
                        <option value="MB">MB</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {[{ v: 50, u: 'KB' }, { v: 100, u: 'KB' }, { v: 200, u: 'KB' }, { v: 500, u: 'KB' }, { v: 1, u: 'MB' }, { v: 2, u: 'MB' }].map((p) => (
                        <button key={`${p.v}${p.u}`} onClick={() => setOpts({ ...opts, targetVal: p.v, targetUnit: p.u })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${Number(opts.targetVal) === p.v && opts.targetUnit === p.u ? 'btn-primary text-white border-transparent' : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'}`}>{p.v} {p.u}</button>
                      ))}
                    </div>
                    <p className="hint">Enter the size you want (for example <b>50 KB</b>). We’ll bring your PDF at or below it while keeping it readable — perfect for uploads with strict size limits.</p>
                  </Field>
                )}
                {tool.engine === 'pdf-to-jpg' && (
                  <Field label="Image quality">
                    <div className="flex gap-2">
                      {[{ v: 1.5, l: 'Standard' }, { v: 2, l: 'High' }, { v: 3, l: 'Ultra' }].map((q) => (
                        <button key={q.v} onClick={() => setOpts({ ...opts, quality: q.v })}
                          className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${Number(opts.quality) === q.v ? 'btn-primary text-white border-transparent' : 'border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5'}`}>{q.l}</button>
                      ))}
                    </div>
                  </Field>
                )}

                {serverCfg && (serverCfg.fields || []).includes('password') && (
                  <Field label={slug === 'unlock-pdf' ? 'PDF password (leave blank if none)' : 'Set a password'}>
                    <input type="password" value={opts.password} onChange={(e) => setOpts({ ...opts, password: e.target.value })} placeholder="Enter password" className="input" />
                  </Field>
                )}
                {serverCfg && (serverCfg.fields || []).includes('lang') && (
                  <Field label="Document language (for OCR)">
                    <select value={opts.lang} onChange={(e) => setOpts({ ...opts, lang: e.target.value })} className="input">
                      {OCR_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                  </Field>
                )}
                {serverCfg && (serverCfg.fields || []).includes('margin') && (
                  <Field label={`Crop margin: ${opts.margin}%`}>
                    <input type="range" min="1" max="40" step="1" value={opts.margin} onChange={(e) => setOpts({ ...opts, margin: e.target.value })} className="w-full accent-rose-500" />
                  </Field>
                )}

                {/* Thumbnail selection for extract/remove */}
                {(tool.engine === 'extract' || tool.engine === 'remove') && thumbs.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-3">Click the pages to {tool.engine === 'extract' ? 'extract' : 'remove'} ({selected.size} selected)</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 max-h-96 overflow-y-auto pr-1">
                      {thumbs.map((t) => (
                        <button key={t.index} onClick={() => toggleSelect(t.index)}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${selected.has(t.index) ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-slate-200 dark:border-white/10'}`}>
                          <img src={t.url} alt="" className="w-full" />
                          <span className="absolute bottom-1 right-1 text-[10px] font-semibold bg-black/60 text-white px-1.5 rounded">{t.index + 1}</span>
                          {selected.has(t.index) && <span className="absolute top-1 left-1 grid place-items-center w-5 h-5 rounded-full bg-rose-500 text-white"><CheckCircle2 className="w-3.5 h-3.5" /></span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Organize grid */}
                {tool.engine === 'organize' && thumbs.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-3">Reorder, rotate or delete pages</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 max-h-[28rem] overflow-y-auto pr-1">
                      {order.map((idx, pos) => {
                        const th = thumbs.find((x) => x.index === idx);
                        return (
                          <div key={idx} className="relative rounded-lg overflow-hidden border-2 border-slate-200 dark:border-white/10 group">
                            <img src={th?.url} alt="" className="w-full transition-transform" style={{ transform: `rotate(${rotations[idx] || 0}deg)` }} />
                            <span className="absolute bottom-1 right-1 text-[10px] font-semibold bg-black/60 text-white px-1.5 rounded">{pos + 1}</span>
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                              <button onClick={() => moveThumb(pos, -1)} className="p-1.5 rounded bg-white/20 text-white hover:bg-white/30"><ArrowLeft className="w-3.5 h-3.5" /></button>
                              <button onClick={() => rotateThumb(idx)} className="p-1.5 rounded bg-white/20 text-white hover:bg-white/30"><RotateCw className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteThumb(idx)} className="p-1.5 rounded bg-rose-500 text-white hover:bg-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => moveThumb(pos, 1)} className="p-1.5 rounded bg-white/20 text-white hover:bg-white/30"><Icons.ArrowRight className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-rose-500 font-medium">{error}</p>}

                {busy && tool.engine === 'compress' && progress > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                      <span>Compressing…</span><span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                      <div className="h-full btn-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                {busy && serverCfg && (
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Working on the server, this can take a few moments…
                  </div>
                )}

                <button onClick={serverCfg ? serverProcess : process} disabled={busy}
                  className="w-full btn-primary text-white font-semibold py-4 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-70">
                  {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</> : <><Icon className="w-5 h-5" /> {tool.name}</>}
                </button>
              </div>
            )}

            {busy && files.length === 0 && (
              <div className="flex items-center justify-center gap-2 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading preview...</div>
            )}
          </div>
        )}

        {/* Related */}
        {relatedTools.length > 0 && (
          <div className="mt-14">
            <h3 className="font-display font-semibold text-lg mb-4">You might also need</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {relatedTools.map((t) => {
                const RI = Icons[t.icon] || Icons.FileText;
                return (
                  <Link key={t.slug} to={`/tool/${t.slug}`} className="card-hover flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-3">
                    <span className={`grid place-items-center w-9 h-9 rounded-lg ${ICON_TILE[t.color]}`}><RI className="w-4.5 h-4.5" /></span>
                    <span className="text-sm font-medium">{t.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <Footer />
    </div>
  );
};

const Field = ({ label, children }) => (
  <div>
    <label className="block text-sm font-medium mb-2">{label}</label>
    {children}
  </div>
);

const FileChip = ({ name, onRemove }) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] px-4 py-3">
    <Icons.FileText className="w-5 h-5 text-rose-500" />
    <span className="text-sm truncate flex-1">{name}</span>
    <button onClick={onRemove} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"><X className="w-4 h-4" /></button>
  </div>
);

const ResultView = ({ result, onReset }) => {
  const isImages = !!result.images;
  const isParts = !!result.parts;
  const isBlob = !!result.blob;
  const isCompare = !!result.compare;
  useEffect(() => {
    if (result.autoDone || isCompare || isImages || isParts) return;
    result.autoDone = true;
    if (isBlob) pdf.download(result.blob, result.name, result.blob.type);
    else if (result.bytes) pdf.download(result.bytes, result.name);
  }, []);
  const meta = result.meta;
  const fmt = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${(b / 1024).toFixed(0)} KB`);
  const [zipping, setZipping] = useState(false);
  const downloadAllImages = async () => {
    if (zipping) return;
    setZipping(true);
    try {
      await pdf.downloadImagesAsZip(result.images, result.zipName || 'images.zip');
    } catch (e) {
      // Fallback: if zipping fails, download individually as a last resort.
      result.images.forEach((im) => pdf.download(im.blob, im.name, 'image/jpeg'));
    }
    setZipping(false);
  };

  if (isCompare) {
    const { similarity, rows } = result.compare;
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 sm:p-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <h3 className="font-display font-bold text-xl">Comparison result</h3>
          <span className="text-sm font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">{similarity}% similar</span>
        </div>
        <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5 text-sm font-mono">
          {rows.length === 0 && <p className="p-4 text-slate-500">No extractable text found in these PDFs.</p>}
          {rows.map((r, i) => (
            <div key={i} className={`px-4 py-1.5 flex gap-2 ${r.type === 'added' ? 'bg-emerald-500/10' : r.type === 'removed' ? 'bg-rose-500/10' : ''}`}>
              <span className={`select-none w-4 ${r.type === 'added' ? 'text-emerald-500' : r.type === 'removed' ? 'text-rose-500' : 'text-slate-300 dark:text-slate-600'}`}>{r.type === 'added' ? '+' : r.type === 'removed' ? '−' : ''}</span>
              <span className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">{r.text || ' '}</span>
            </div>
          ))}
        </div>
        <button onClick={onReset} className="mt-6 block mx-auto text-sm font-semibold text-slate-500 hover:text-rose-500 transition-colors">Compare other files</button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/[0.06] p-8 text-center">
      <div className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 text-emerald-500"><CheckCircle2 className="w-8 h-8" /></div>
      <h3 className="font-display font-bold text-2xl mt-5">All done!</h3>
      <p className="text-slate-500 dark:text-slate-400 mt-2">Your file is ready to download.</p>

      {meta && (
        <div className="mt-4 inline-flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-2.5 text-sm">
          <span className="text-slate-500 dark:text-slate-400 line-through">{fmt(meta.orig)}</span>
          <Icons.ArrowRight className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(meta.size)}</span>
          {meta.orig > meta.size && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">-{Math.round((1 - meta.size / meta.orig) * 100)}%</span>
          )}
        </div>
      )}

      {isBlob && (
        <button onClick={() => pdf.download(result.blob, result.name, result.blob.type)} className="mt-6 inline-flex items-center gap-2 btn-primary text-white font-semibold px-7 py-3.5 rounded-xl transition">
          <Download className="w-5 h-5" /> Download {result.name}
        </button>
      )}

      {!isImages && !isParts && !isBlob && (
        <button onClick={() => pdf.download(result.bytes, result.name)} className="mt-6 inline-flex items-center gap-2 btn-primary text-white font-semibold px-7 py-3.5 rounded-xl transition">
          <Download className="w-5 h-5" /> Download {result.name}
        </button>
      )}

      {isParts && (
        <div className="mt-6 space-y-2 max-w-md mx-auto">
          {result.parts.map((p) => (
            <button key={p.name} onClick={() => pdf.download(p.bytes, p.name)} className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-3 hover:border-rose-300 transition-colors">
              <span className="text-sm truncate">{p.name}</span>
              <Download className="w-4 h-4 text-rose-500" />
            </button>
          ))}
        </div>
      )}

      {isImages && (
        <>
          <button data-testid="download-all-zip-button" onClick={downloadAllImages} disabled={zipping} className="mt-6 inline-flex items-center gap-2 btn-primary text-white font-semibold px-7 py-3.5 rounded-xl transition disabled:opacity-60">
            {zipping ? <><Loader2 className="w-5 h-5 animate-spin" /> Preparing ZIP…</> : <><Download className="w-5 h-5" /> Download All Images (ZIP)</>}
          </button>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Downloads all {result.images.length} images together in one .zip file.</p>

          <div className="mt-8 border-t border-slate-200 dark:border-white/10 pt-6">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Download This Image</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Click any image below to save just that single page.</p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {result.images.map((im, i) => (
                <div key={im.name} className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] flex flex-col">
                  <div className="relative bg-slate-50 dark:bg-white/[0.02]">
                    <img src={im.url} alt={im.name} className="w-full" />
                    <span data-testid={`page-badge-${i}`} className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/55 text-white">Page {i + 1}</span>
                  </div>
                  <button
                    data-testid={`download-image-button-${i}`}
                    onClick={() => pdf.download(im.blob, im.name, 'image/jpeg')}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border-t border-slate-200 dark:border-white/10 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download This Image
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <button onClick={onReset} className="mt-6 block mx-auto text-sm font-semibold text-slate-500 hover:text-rose-500 transition-colors">Start over</button>
    </div>
  );
};

export default ToolPage;
