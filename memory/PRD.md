# PDFPro Studio (LOVEPDF) — PRD

## Original Problem Statement
ilovepdf-style PDF tools website (repo: sanjusaharan10704-svg/LOVEPDF). Bug fix (PDF→Word on scanned PDFs), phir new features (Sign PDF drag-drop editor, Batch processing, Image tools, Name/DOB photo tool), aur `lovepdf.co.in` pe live deploy (Railway/Render Docker + MongoDB Atlas).

## User Choices
- Phase scope: SIRF bug fix pehle, baaki features baad me
- Background remover (future): rembg / remove.bg
- Deployment: Emergent preview pe ready + Railway/Render + DNS step-by-step guide (user khud karega)
- Light mode default (explicit requirement)

## Architecture
- Frontend: React (CRA), pdf-lib + pdfjs-dist@4.4.168 (client-side tools), Tailwind + shadcn
- Backend: FastAPI (/api/pdf/* router in pdf_tools.py), LibreOffice, Ghostscript, Tesseract, Poppler, pikepdf, ocrmypdf, pdf2docx, pdfplumber
- DB: MongoDB (status checks only for now)
- System deps recorded in /app/.emergent/system_deps.txt (libreoffice, ghostscript, tesseract-ocr, poppler-utils)

## Implemented (June 2026)
### Phase C — UX round (testing agent verified 100%)
- Merge PDF ab PDFs + images (JPG/PNG/WebP) mix accept karta hai (images full pages bante hain)
- Auto-download on completion (download button bhi rehta hai) — ToolPage + image tools
- Word download bug fixed: CORS expose Content-Disposition, OCR text XML-sanitize, pdf2docx output validation + OCR fallback
- Hero search suggestions dropdown (solid bg, z-40 stacking fix, polished look with category chips)
- Header: Image Tools dropdown (NEW badge), All Tools grouped by category, logo→home+scroll-top
- ScrollToTop on route change/refresh; rebrand PDFPro → LovePDF (logo, footer, title); outline default off in photo-text

### Phase B — File Preview + Image Tools (testing agent verified 100%)
- File Preview: PDF first-page render + image preview before processing (ToolPage single + multi-file thumbnails via MultiThumb)
- Compress Image (/tool/compress-image): backend Pillow, quality slider + max-width presets, before/after size
- Crop Image (/tool/crop-image): react-easy-crop, preset aspects + exact custom px output, client-side
- Remove Background (/tool/remove-background): remove.bg API via backend (/api/image/remove-bg, REMOVEBG_API_KEY in backend/.env, 50 calls/month free quota)
- Photo Name & DOB (/tool/photo-text): live canvas, 9 position presets, 6 fonts, color picker, size slider, outline toggle, JPG download
- New backend router /app/backend/image_tools.py (/api/image/*); new page /app/frontend/src/pages/ImageToolPage.jsx
- Home: 'Image tools' category, 30 tools total

### Phase A — Bug fix
- Repo cloned from GitHub into this environment (backend + frontend code)
- All Python/Node deps installed; pdfjs-dist pinned to 4.4.168 (node 20 compatible)
- **BUG FIX (root cause):** pdf2docx scanned/image-only PDFs pe text extract nahi karta tha
  - `_has_text_layer()` (pdfplumber) detects missing text layer
  - `_scanned_pdf_to_docx()` runs ocrmypdf (sidecar) → builds editable docx via python-docx
  - Same OCR fallback in pdf-to-excel
- Default theme changed dark → light (ThemeContext.jsx)
- Testing agent verified E2E: real UI upload for text + scanned PDFs → valid docx with correct text; merge, protect, repair, health all pass (backend 6/6, frontend 100% critical)
- Regression suite: /app/backend/tests/test_pdf_tools.py (pytest)

## Known / Notes
- Landing stats/reviews are MOCK (sample data) — user aware
- qpdf not installed (not needed by current tools)
- No file-size limits on uploads (noted, not MVP-blocking)
- Some tools marked "soon" badge if not ready && no server config; all 26 slugs routable

## Backlog (priority order)
- DONE (July 2025): Sign PDF "Image" tab — upload image → background auto-removed → transparent cutout placed/resized on page (SignPage.jsx). Background removal switched from remove.bg (API key) to LOCAL rembg (keyless, offline; u2net model auto-downloads to /root/.rembg on first call). /api/image/remove-bg now uses rembg for both Sign PDF and the Remove Background image tool. Backend deps: rembg==2.0.81, onnxruntime==1.29.0.
- DONE (July 2025): Edit PDF PRO EDITOR (/tool/edit-pdf) — professional layout: left page-thumbnail sidebar (click to navigate), top toolbar tabs (Annotate/Shapes/Insert/Edit Text/Forms — only Edit Text functional, others are polished "coming soon" panels), center zoomable canvas, right styling panel (text, font family [Helvetica/Times/Courier], size +/- input, bold, italic, underline, colour picker, left/center/right alignment), bottom zoom in/out + Fit, prominent "Save changes" button. applyPdfTextEdits (lib/pdfUtils.js) extended to honour family/size/bold/italic/underline/color/alignment. Verified end-to-end (styled export rendered correctly). NOTE: original text still remains in the file text layer under the cover box (copy/search reveals it) — true removal is future work.
- DONE (July 2025): Sign PDF MULTIPLE STAMPS + MANUAL TOUCH-UP — place many signatures/images per page (each draggable/resizable/deletable, normalized coords), and an eraser brush (TouchUpCanvas) to clean up background-removal edges before placing. Touch-up now has: Eraser on/off toggle (erases only when active), live brush-size cursor circle, mouse-wheel to resize brush, Undo (stroke history), zoom in/out for fine detail, and Reset. pdf.placeStamps() bakes all stamps (embedPng).\n- DONE (July 2025): Edit PDF SHAPES + INSERT IMAGES — Shapes tab (rectangle/line/highlight with colour, thickness, fill, opacity) and Insert tab (upload image), both as movable/resizable canvas objects. pdf.applyPdfEdits({texts,shapes,images}) bakes text edits + shapes (drawRectangle/drawLine) + images (embedPng/Jpg + drawImage) in one pass. Verified end-to-end via rendered exports.
- DONE (July 2025): Reinstalled system tools (LibreOffice, Ghostscript, Tesseract, Poppler) — /api/pdf/health now true for soffice/gs/tesseract/pdftoppm. Recreated missing backend/.env + frontend/.env.
- P0: Batch processing (multi-file upload → same tool on all → zip download)
- P1: Edit PDF v2 — add-new-text-box + delete/whiteout regions; true text removal
- P2: Deployment guide — Railway/Render Docker image, MongoDB Atlas, lovepdf.co.in DNS (A/CNAME + api subdomain), SSL
- P2: Replace mock stats/reviews or label as "sample"

## Aug 2025 — Admin panel integration + PDF/Hindi fixes (this session)
- Recreated missing backend/.env + frontend/.env (app was down). DB_NAME=lovepdf_db.
- ADMIN PANEL integrated from GitHub repo LOVEPDFDEV2026 (SEO + Blog CMS, JWT): backend/seo_admin.py wired in server.py (startup ensure_default_admin). Frontend: /admin/login, /admin dashboard (Pages SEO / Site & Analytics / Blog / Account), Blog + BlogPost pages, SeoContext + Seo component. Creds admin@lovepdf.com / Admin@12345 (backend/.env ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_JWT_SECRET). Backend 21/21 tests pass. NOTE: deployment env must also set these 3 admin vars.
- SYSTEM TOOLS installed + persisted in .emergent/system_deps.txt: ghostscript, tesseract-ocr(+eng,+hin,+script-deva), poppler-utils, libreoffice(writer/calc/impress), qpdf, unpaper, fonts-lohit-deva. /api/pdf/health now all true.
- PDF CONVERSION hardening (pdf_tools.py): strict _docx_is_valid + _xlsx_is_valid; LibreOffice normalize (_normalize_office) so Word/Excel open cleanly in MS Office; _sanitize_lang; OCR quality via unpaper clean+deskew (_run_ocr).
- HINDI: pdf-to-word 3-tier (pdf2docx -> Unicode text-layer -> OCR). LEGACY (Kruti Dev/DevLys) fonts: deterministic ASCII->Unicode converter (backend/krutidev.py + krutidev_map.json, Python port byte-identical to vendored JS frontend/src/lib/krutidev). Applied to pdf-to-word AND pdf-to-excel. New POST /api/pdf/inspect {legacy_hindi,devanagari_ratio,fonts}. EditPdfPage now calls /inspect and converts legacy text runs to Unicode for display/edit.
- BUG FIX: /api/image/remove-bg (rembg) was 500 due to missing pymatting/pooch/scikit-image — installed + added to requirements.txt. Fixes SignPage "Image" tab + Remove Background tool.
- ToolPage.jsx merged from LOVEPDFDEV2026: state clears on tool switch; improved multi-file preview grid (thumbnails, numbered badges, drag-to-reorder, inline Add-more) for Merge/JPG-to-PDF. Edit PDF, Sign PDF, image_tools (keyless rembg) preserved.
- KNOWN: Editing Hindi text and SAVING via Edit PDF export uses pdf-lib standard fonts (no Devanagari embedding) — display/edit is fixed, but exporting edited Devanagari into the PDF needs a future embedded-font step. OCR of dotted form-lines can still add minor noise (legacy PDFs now use the clean deterministic converter instead).

## June 2026 — GitHub repo (rajnyol) merge + P0 Hindi export fix (this session)
Merged bug fixes from https://github.com/nyolraj3188-creator/rajnyol (verified via testing_agent iteration_6: backend 6/6, frontend 4/4 flows).
- **P0 FIXED — Edit PDF Hindi export**: `frontend/src/lib/pdfUtils.js` now embeds a bundled Devanagari font (`frontend/public/fonts/Lohit-Devanagari.ttf`) via `@pdf-lib/fontkit` + `regenerator-runtime` whenever text has non-Latin chars (`needsUnicodeFont`). Edited Hindi text now exports correctly in the downloaded PDF (was `?`/boxes before). Shrink-to-fit keeps converted Hindi within its original box width (no overflow, no size jump on click). New deps: `@pdf-lib/fontkit@1.1.1`, `jszip@3.10.1`, `regenerator-runtime@0.14.1`.
- **Edit PDF auto legacy detection**: `EditPdfPage.jsx` uses `/api/pdf/inspect` fields — `legacy = legacy_hindi || (has_text && devanagari_ratio<0.15 && !looks_english)` — so Kruti/DevLys PDFs convert even when font name isn't a known legacy token; English PDFs are safeguarded.
- **Backend `/api/pdf/inspect`**: now returns `has_text`, `looks_english` (new `_looks_like_english()` common-word heuristic) alongside `legacy_hindi`, `devanagari_ratio`, `fonts`.
- **PDF to JPG ZIP**: `pdf.downloadImagesAsZip` (jszip) bundles all rendered pages into ONE `.zip` (avoids browser multi-download blocking). ToolPage shows "Download All Images (ZIP)" + spinner, plus per-page "Download This Image" with "Page N" badges. data-testids: download-all-zip-button, download-image-button-{i}, page-badge-{i}.
- **Home**: "Most popular tools" now curated incl. PDF to JPG (POPULAR_SLUGS).
- **Footer**: clickable `mailto:lovepdf.support@gmail.com` on every page.
- SignPage / image_tools.py unchanged (no repo diff). Admin/blog CRUD not retested (unchanged since iteration 5, 19/19).
- Non-blocking notes (optional backlog): backend pdf-to-word/excel legacy conversion still keys off font name (`_is_legacy_hindi`); Edit-PDF export leaves original text in the hidden text layer under the cover box (true redaction is future work).

### Add New Text Box (Edit PDF) — June 2026
- **NEW FEATURE (verified iteration_7)**: `/tool/edit-pdf` Annotate tab is now functional. "Add a text box" (`add-text-box-button`) drops a draggable/resizable text object on any blank spot; right panel edits text (`add-text-input`), font, size, colour, bold/italic/underline, alignment. Great for filling forms & adding notes/signatures. On Save, new boxes convert to text edits (normalized coords, `noBg:true` so no cover rectangle) baked via `applyPdfEdits` — Hindi/Devanagari exports correctly using the embedded Lohit font (verified: real Devanagari, 0 '?', Lohit Type0 embedded). `applyPdfEdits` now skips the cover rectangle when `e.noBg`. Polish: empty boxes not counted toward Save counter; consecutive boxes cascade position.
- KNOWN (non-blocking): Annotate/styling panel is desktop-only (`hidden lg:block`, viewport ≥1024px); multi-line typed text is single-line on export.
