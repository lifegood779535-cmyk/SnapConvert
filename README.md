# SnapConvert — Student Productivity Hub

A browser-first Next.js toolkit. No account required. Files are processed locally in the browser for the included tools.

## Run locally

1. Install Node.js 20.9+.
2. Extract this ZIP.
3. Open the extracted `SnapConvert-Full-Working` folder in VS Code.
4. Open Terminal in that folder and run:

```bash
npm install
npm run dev
```

5. Open http://localhost:3000

For a production build:

```bash
npm run build
npm start
```

## Working tools included

### Scan & convert
- Camera Scanner: live camera, capture multiple pages, preview, remove captures, create a multi-page PDF.
- JPG/PNG/WebP to PDF: multiple images, previews, reorder, remove, rotate, fit to A4.
- PDF to JPG: renders each page and downloads a ZIP.

### PDF tools
- Merge PDFs.
- Split PDF into one-page PDFs (ZIP).
- Rotate all pages.
- Delete selected pages.
- Extract selected pages.
- Reorder pages.
- Add page numbers.
- Add a text watermark.
- Repair/re-save readable PDFs.
- Optimize/re-save PDF object streams (this does not guarantee a smaller file).

### Student Hub
- Notes pad: write and download notes as TXT.
- Flashcards: create and flip your own cards.
- MCQ practice: create a quiz from your own question/options/answer entries and score it.

## Honest limitations
- This project does not claim to include cloud AI, OCR, DOCX/PPTX conversion, or guaranteed compression. Those need additional services/libraries and, for AI, an API key.
- PDF password-protected files may not open in pdf-lib.
- Browser camera requires permission and HTTPS or localhost.
- Large files may use significant browser memory. Keep files reasonably sized.
- “Repair PDF” can re-save PDFs that pdf-lib can parse; it cannot recover every damaged PDF.
- “Optimize PDF” re-saves structure; file size can increase or remain unchanged.

## Privacy
The included document tools run client-side. Files are not uploaded to a SnapConvert server by this starter project.
