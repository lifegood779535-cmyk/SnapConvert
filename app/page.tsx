"use client";

import { useEffect, useRef, useState } from "react";
import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";
import jsPDF from "jspdf";
import JSZip from "jszip";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

type ToolId = "scanner" | "image" | "pdfjpg" | "merge" | "split" | "rotate" | "delete" | "extract" | "watermark" | "numbers" | "compress" | "repair" | "organize" | "ocr";

type Tool = { id: ToolId; name: string; description: string; icon: string; category: string };

const tools: Tool[] = [
  { id: "scanner", name: "Camera Scanner", description: "Scan multiple pages into a PDF", icon: "▣", category: "Scan & OCR" },
  { id: "merge", name: "Merge PDF", description: "Combine multiple PDFs", icon: "▤", category: "PDF Tools" },
  { id: "split", name: "Split PDF", description: "Divide a PDF into pages", icon: "✂", category: "PDF Tools" },
  { id: "rotate", name: "Rotate PDF", description: "Rotate page orientation", icon: "↻", category: "PDF Tools" },
  { id: "delete", name: "Remove Pages", description: "Delete unwanted pages", icon: "▣", category: "PDF Tools" },
  { id: "extract", name: "Extract Pages", description: "Save selected pages", icon: "⇧", category: "PDF Tools" },
  { id: "watermark", name: "Watermark PDF", description: "Add text watermark", icon: "✎", category: "PDF Tools" },
  { id: "numbers", name: "Page Numbers", description: "Number PDF pages", icon: "№", category: "PDF Tools" },
  { id: "compress", name: "Compress PDF", description: "Reduce PDF size by optimizing page images", icon: "❖", category: "PDF Tools" },
  { id: "repair", name: "Repair PDF", description: "Re-save readable PDF files", icon: "✚", category: "PDF Tools" },
  { id: "organize", name: "Organize Pages", description: "Reorder PDF pages", icon: "☷", category: "PDF Tools" },
  { id: "ocr", name: "OCR PDF", description: "Extract searchable text from scanned PDF pages", icon: "OCR", category: "Scan & OCR" },
  { id: "image", name: "JPG to PDF", description: "Convert images into PDF", icon: "▧", category: "Convert Tools" },
  { id: "pdfjpg", name: "PDF to JPG", description: "Convert PDF pages to JPG", icon: "▧", category: "Convert Tools" }
];

const categories = [
  { name: "PDF Tools", icon: "▤", ids: ["merge", "split", "compress", "rotate", "delete", "extract", "organize", "repair", "watermark", "numbers"] as ToolId[] },
  { name: "Convert Tools", icon: "⇄", ids: ["image", "pdfjpg"] as ToolId[] },
  { name: "Scan & OCR", icon: "▣", ids: ["scanner", "ocr"] as ToolId[] },
  { name: "PPT Studio", icon: "▧", ids: [] as ToolId[] },
  { name: "Student Tools", icon: "♧", ids: [] as ToolId[] },
  { name: "Document Editor", icon: "✎", ids: [] as ToolId[] },
  { name: "Image Tools", icon: "▧", ids: [] as ToolId[] },
  { name: "Resume & Career", icon: "▤", ids: [] as ToolId[] },
  { name: "Study Planner", icon: "▦", ids: [] as ToolId[] }
];

function safeName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]/gi, "_") || "document";
}

function pdfBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes);
  return new Blob([copy.buffer as ArrayBuffer], { type: "application/pdf" });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parsePages(value: string, total: number) {
  const result: number[] = [];
  for (const part of value.split(",")) {
    const p = part.trim();
    if (!p) continue;
    if (p.includes("-")) {
      const [start, end] = p.split("-").map(Number);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > total) {
        throw new Error("Invalid page range. Example: 1,3,5-7");
      }
      for (let n = start; n <= end; n++) result.push(n);
    } else {
      const n = Number(p);
      if (!Number.isInteger(n) || n < 1 || n > total) throw new Error("Invalid page number.");
      result.push(n);
    }
  }
  return [...new Set(result)];
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authNotice, setAuthNotice] = useState("");
  const [active, setActive] = useState<ToolId>("merge");
  const [files, setFiles] = useState<File[]>([]);
  const [pageNumbers, setPageNumbers] = useState("");
  const [watermark, setWatermark] = useState("SnapConvert");
  const [compressQuality, setCompressQuality] = useState("medium");
  const [ocrLanguage, setOcrLanguage] = useState("eng");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose a tool and select your files.");
  const [search, setSearch] = useState("");
  const [openCategory, setOpenCategory] = useState("PDF Tools");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [allToolsOpen, setAllToolsOpen] = useState(false);
  const [allToolsMenuPosition, setAllToolsMenuPosition] = useState({ top: 76, left: 0, width: 0 });
  const allToolsMenuRef = useRef<HTMLElement>(null);
  const allToolsTriggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionPanelRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerViewRef = useRef<HTMLDivElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [scannedPages, setScannedPages] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState("");
  const [pagePreviews, setPagePreviews] = useState<Array<{ key: string; fileIndex: number; pageNumber: number; fileName: string; image: string }>>([]);
  const [selectedPageKeys, setSelectedPageKeys] = useState<string[]>([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // Close the mega menu when the user clicks outside it or scrolls the page.
  useEffect(() => {
    if (!allToolsOpen) return;

    const handleOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const clickedMenu = allToolsMenuRef.current?.contains(target) ?? false;
      const clickedTrigger = allToolsTriggerRef.current?.contains(target) ?? false;
      if (!clickedMenu && !clickedTrigger) setAllToolsOpen(false);
    };

    const handleScroll = () => setAllToolsOpen(false);

    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("touchstart", handleOutsidePointer, { passive: true });
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("touchstart", handleOutsidePointer);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [allToolsOpen]);

  const selected = tools.find((tool) => tool.id === active) ?? tools[0];
  const filteredTools = tools.filter((tool) =>
    `${tool.name} ${tool.description}`.toLowerCase().includes(search.toLowerCase())
  );

  function selectTool(id: ToolId) {
    if (id !== "scanner" && cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setAllToolsOpen(false);
    setActive(id);
    setFiles([]);
    setPagePreviews([]);
    setSelectedPageKeys([]);
    setPageNumbers("");
    setMessage("Select your files to continue.");
    if (inputRef.current) inputRef.current.value = "";
    if (id === "scanner") setMessage("Allow camera access, capture pages, then create a PDF.");
    // After selecting a tool, move the user directly to its working area.
    requestAnimationFrame(() => {
      const panel = actionPanelRef.current;
      if (!panel) return;
      const headerHeight = document.querySelector(".app-header")?.getBoundingClientRect().height ?? 0;
      const top = window.scrollY + panel.getBoundingClientRect().top - headerHeight - 14;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  async function startCamera() {
    setCameraError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires localhost or HTTPS in a supported browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setCameraStream(stream);
      setMessage("Camera started. Place a page in view and capture it.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Camera permission denied or camera unavailable.";
      setCameraError(text);
      setMessage(text);
    }
  }

  async function openScannerFullscreen() {
    const scannerView = scannerViewRef.current;
    if (!scannerView) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (scannerView.requestFullscreen) {
        await scannerView.requestFullscreen();
      }
    } catch {
      setCameraError("Full screen is not available in this browser. You can still use the large camera preview.");
    }
  }

  function capturePage() {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setCameraError("Camera is still starting. Please wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Could not capture this page in your browser.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setScannedPages((current) => [...current, canvas.toDataURL("image/jpeg", 0.92)]);
    setCameraError("");
    setMessage(`Captured page ${scannedPages.length + 1}. You can capture another page.`);
  }

  function stopCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setMessage("Camera stopped.");
  }

  async function loadPagePreviews(selectedFiles: File[]) {
    setLoadingPreviews(true);
    setPagePreviews([]);
    setSelectedPageKeys([]);
    try {
      const previews: Array<{ key: string; fileIndex: number; pageNumber: number; fileName: string; image: string }> = [];
      for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex++) {
        const file = selectedFiles[fileIndex];
        if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
          throw new Error(`${file.name} is not a PDF file. Please select PDF files only.`);
        }
        const fileBytes = new Uint8Array(await file.arrayBuffer());
        if (fileBytes.length < 5 || String.fromCharCode(...fileBytes.slice(0, 5)) !== "%PDF-") {
          throw new Error(`${file.name} does not appear to be a valid PDF. Please try another file.`);
        }
        const pdf = await pdfjs.getDocument({ data: fileBytes }).promise;
        if (pdf.numPages > 100) {
          throw new Error(`${file.name} has ${pdf.numPages} pages. Preview is limited to 100 pages per file.`);
        }
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 0.42 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not create PDF page preview.");
          await page.render({ canvasContext: context, viewport } as any).promise;
          previews.push({
            key: `${fileIndex}:${pageNumber}`,
            fileIndex,
            pageNumber,
            fileName: file.name,
            image: canvas.toDataURL("image/jpeg", 0.72),
          });
          canvas.width = 1;
          canvas.height = 1;
        }
      }
      setPagePreviews(previews);
      setSelectedPageKeys(previews.map((page) => page.key));
      setMessage(`Preview ready: ${previews.length} page(s). Untick pages you want to remove.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not preview PDF pages.");
    } finally {
      setLoadingPreviews(false);
    }
  }

  function togglePage(key: string) {
    setSelectedPageKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  }

  function moveOrganizePage(key: string, direction: -1 | 1) {
    setPagePreviews((current) => {
      const index = current.findIndex((item) => item.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function processFiles() {
    if (active === "scanner") {
      if (!scannedPages.length) {
        setMessage("Capture at least one page before creating a PDF.");
        return;
      }
      setBusy(true);
      setMessage("Creating PDF from scanned pages...");
      try {
        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        for (let index = 0; index < scannedPages.length; index++) {
          const data = scannedPages[index];
          const image = new Image();
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("A captured page could not be loaded."));
            image.src = data;
          });
          if (index > 0) doc.addPage();
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
          const width = image.width * scale;
          const height = image.height * scale;
          doc.addImage(data, "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
        }
        saveBlob(doc.output("blob"), "snapconvert-scanned-document.pdf");
        setMessage(`Created PDF with ${scannedPages.length} scanned page(s).`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not create scanned PDF.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!files.length) {
      setMessage("Please select a file first.");
      return;
    }
    setBusy(true);
    setMessage("Processing your files...");
    try {
      if (active === "image") {
        const images = files.filter((file) => file.type.startsWith("image/"));
        if (!images.length) throw new Error("Select JPG, PNG or WebP images.");
        const doc = new jsPDF({ format: "a4", unit: "pt" });
        for (let i = 0; i < images.length; i++) {
          const data = await readAsDataUrl(images[i]);
          const image = new Image();
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("Could not load image."));
            image.src = data;
          });
          if (i > 0) doc.addPage();
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
          const width = image.width * scale;
          const height = image.height * scale;
          const format = images[i].type.includes("png") ? "PNG" : "JPEG";
          doc.addImage(data, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
        }
        saveBlob(doc.output("blob"), "snapconvert-images.pdf");
        setMessage("Images successfully converted to PDF.");
        return;
      }

      if (active === "pdfjpg") {
        const file = files[0];
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const zip = new JSZip();
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas is not supported by this browser.");
          await page.render({ canvasContext: context, viewport } as any).promise;
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((result) => result ? resolve(result) : reject(new Error("JPG export failed.")), "image/jpeg", 0.9);
          });
          zip.file(`${safeName(file.name)}-page-${i}.jpg`, blob);
        }
        saveBlob(await zip.generateAsync({ type: "blob" }), `${safeName(file.name)}-jpg-pages.zip`);
        setMessage("PDF pages converted to JPG successfully.");
        return;
      }

      if (active === "ocr") {
        const file = files[0];
        if (file.size > 30 * 1024 * 1024) {
          throw new Error("OCR currently supports PDF files up to 30 MB.");
        }

        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
        }).promise;

        if (pdf.numPages > 20) {
          throw new Error("OCR currently supports up to 20 pages per PDF.");
        }

        setMessage("Loading OCR engine. The first run may download language data...");
        const Tesseract = await import("tesseract.js");
        const worker = await Tesseract.createWorker(ocrLanguage);
        let fullText = "";

        try {
          for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            setMessage(`Recognizing text on page ${pageNo} of ${pdf.numPages}...`);
            const page = await pdf.getPage(pageNo);
            const viewport = page.getViewport({ scale: 1.8 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas is not supported by this browser.");

            await page.render({ canvasContext: context, viewport } as any).promise;
            const result = await worker.recognize(canvas);
            fullText += `\n\n========== PAGE ${pageNo} ==========\n\n${result.data.text.trim()}\n`;
            canvas.width = 1;
            canvas.height = 1;
          }
        } finally {
          await worker.terminate();
        }

        if (!fullText.trim()) throw new Error("No readable text was detected in this PDF.");
        const textBlob = new Blob([fullText.trim()], { type: "text/plain;charset=utf-8" });
        saveBlob(textBlob, `${safeName(file.name)}-ocr.txt`);
        setMessage(`OCR completed for ${pdf.numPages} page(s). Extracted text downloaded as TXT.`);
        return;
      }

      if (active === "merge") {
        if (files.length < 2) throw new Error("Merge needs at least 2 PDF files. Add another PDF using the + button.");
        if (loadingPreviews || !pagePreviews.length) throw new Error("Page previews are not ready yet. Wait for previews to finish.");
        if (!selectedPageKeys.length) throw new Error("No pages are selected. Select at least one page card.");

        const output = await PDFDocument.create();
        let mergedCount = 0;

        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
          const pageIndices = pagePreviews
            .filter((item) => item.fileIndex === fileIndex && selectedPageKeys.includes(item.key))
            .map((item) => item.pageNumber - 1);

          if (!pageIndices.length) continue;

          setMessage(`Adding selected pages from ${files[fileIndex].name}...`);
          let source: PDFDocument;
          try {
            source = await PDFDocument.load(await files[fileIndex].arrayBuffer(), {
              ignoreEncryption: false,
              updateMetadata: false,
            });
          } catch {
            throw new Error(`Could not read "${files[fileIndex].name}". It may be password-protected or damaged. Try exporting an unlocked PDF.`);
          }

          const copied = await output.copyPages(source, pageIndices);
          copied.forEach((page) => output.addPage(page));
          mergedCount += copied.length;
        }

        if (!mergedCount || !output.getPageCount()) throw new Error("No pages were included. Select at least one page from your PDFs.");
        const resultBytes = await output.save();
        const resultBlob = pdfBlob(resultBytes);
        saveBlob(resultBlob, "SnapConvert-Merged.pdf");
        setMessage(`Success! ${mergedCount} selected page(s) from ${files.length} PDF files merged. Download started.`);
        return;
      }

      const file = files[0];

      if (active === "compress") {
        if (file.size > 40 * 1024 * 1024) {
          throw new Error("This browser compressor currently supports PDFs up to 40 MB. Try a smaller file.");
        }

        const qualitySettings: Record<string, { scale: number; quality: number; label: string }> = {
          strong: { scale: 1.0, quality: 0.48, label: "Strong compression" },
          medium: { scale: 1.35, quality: 0.65, label: "Recommended compression" },
          light: { scale: 1.7, quality: 0.82, label: "Light compression" },
        };
        const settings = qualitySettings[compressQuality] ?? qualitySettings.medium;
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
        }).promise;

        if (pdf.numPages > 30) {
          throw new Error("This browser compressor currently supports up to 30 pages per PDF.");
        }

        let output: jsPDF | null = null;

        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
          const page = await pdf.getPage(pageNo);
          const viewport = page.getViewport({ scale: settings.scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas is not supported by this browser.");

          await page.render({ canvasContext: context, viewport } as any).promise;

          const imageData = canvas.toDataURL("image/jpeg", settings.quality);
          const widthPt = viewport.width / settings.scale;
          const heightPt = viewport.height / settings.scale;

          if (!output) {
            output = new jsPDF({
              orientation: widthPt > heightPt ? "landscape" : "portrait",
              unit: "pt",
              format: [widthPt, heightPt],
              compress: true,
            });
          } else {
            output.addPage([widthPt, heightPt], widthPt > heightPt ? "landscape" : "portrait");
          }

          output.addImage(imageData, "JPEG", 0, 0, widthPt, heightPt, undefined, "FAST");
          canvas.width = 1;
          canvas.height = 1;
        }

        if (!output) throw new Error("No pages found in this PDF.");

        const compressedBlob = output.output("blob");
        const originalKB = file.size / 1024;
        const compressedKB = compressedBlob.size / 1024;
        saveBlob(compressedBlob, `${safeName(file.name)}-compressed.pdf`);
        setMessage(
          `${settings.label} complete. Original: ${originalKB.toFixed(0)} KB; output: ${compressedKB.toFixed(0)} KB. ` +
          (compressedBlob.size < file.size
            ? `Reduced by ${((1 - compressedBlob.size / file.size) * 100).toFixed(1)}%.`
            : "This file did not become smaller; try Strong compression.")
        );
        return;
      }

      if (active === "repair") {
        const originalBytes = await file.arrayBuffer();

        // First try a structural rewrite with pdf-lib (keeps text and vector content).
        try {
          const sourceDoc = await PDFDocument.load(originalBytes, {
            ignoreEncryption: false,
            updateMetadata: false,
          });
          const repairedBytes = await sourceDoc.save({
            useObjectStreams: true,
            addDefaultPage: false,
          });
          saveBlob(pdfBlob(repairedBytes), `${safeName(file.name)}-repaired.pdf`);
          setMessage("Repair successful: PDF structure was parsed and rewritten. Text and vector content are preserved.");
          return;
        } catch (structuralError) {
          // Fallback: if PDF.js can still render it, rebuild pages as images.
          setMessage("Trying visual recovery. This may take a little longer...");
        }

        const recoveryPdf = await pdfjs.getDocument({
          data: new Uint8Array(originalBytes),
          stopAtErrors: false,
        }).promise;

        if (recoveryPdf.numPages > 25) {
          throw new Error("Visual recovery supports up to 25 pages. Try a smaller PDF.");
        }

        let rebuilt: jsPDF | null = null;
        for (let pageNo = 1; pageNo <= recoveryPdf.numPages; pageNo++) {
          setMessage(`Recovering page ${pageNo} of ${recoveryPdf.numPages}...`);
          const page = await recoveryPdf.getPage(pageNo);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas is not supported by this browser.");

          await page.render({ canvasContext: context, viewport } as any).promise;
          const image = canvas.toDataURL("image/jpeg", 0.88);
          const widthPt = viewport.width / 1.5;
          const heightPt = viewport.height / 1.5;

          if (!rebuilt) {
            rebuilt = new jsPDF({
              orientation: widthPt > heightPt ? "landscape" : "portrait",
              unit: "pt",
              format: [widthPt, heightPt],
              compress: true,
            });
          } else {
            rebuilt.addPage([widthPt, heightPt], widthPt > heightPt ? "landscape" : "portrait");
          }

          rebuilt.addImage(image, "JPEG", 0, 0, widthPt, heightPt, undefined, "FAST");
          canvas.width = 1;
          canvas.height = 1;
        }

        if (!rebuilt) throw new Error("No recoverable pages were found.");
        saveBlob(rebuilt.output("blob"), `${safeName(file.name)}-visually-recovered.pdf`);
        setMessage("Visual recovery successful. Note: recovered pages are images, so text is not selectable.");
        return;
      }

      if (active === "organize") {
        if (loadingPreviews || !pagePreviews.length) throw new Error("Page previews are not ready yet. Wait for previews to finish.");
        const sourceDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
        const order = pagePreviews.filter((item) => item.fileIndex === 0).map((item) => item.pageNumber - 1);
        if (order.length !== sourceDoc.getPageCount() || new Set(order).size !== sourceDoc.getPageCount()) {
          throw new Error("Every page must appear exactly once in the page organizer.");
        }
        const output = await PDFDocument.create();
        const reordered = await output.copyPages(sourceDoc, order);
        reordered.forEach((page) => output.addPage(page));
        saveBlob(pdfBlob(await output.save()), `${safeName(file.name)}-organized.pdf`);
        setMessage("PDF pages reorganized successfully. Original PDF remains unchanged.");
        return;
      }

      const source = await PDFDocument.load(await file.arrayBuffer());
      const total = source.getPageCount();
      const name = safeName(file.name);

      if (active === "delete") {
        if (loadingPreviews || !pagePreviews.length) throw new Error("Page previews are not ready yet. Wait for previews to finish.");
        const keptPages = pagePreviews
          .filter((item) => item.fileIndex === 0 && selectedPageKeys.includes(item.key))
          .map((item) => item.pageNumber - 1);
        if (keptPages.length === pagePreviews.length) throw new Error("No pages are marked for removal. Click the × button on pages you want to remove.");
        if (!keptPages.length) throw new Error("At least one page must remain in the new PDF.");
        const output = await PDFDocument.create();
        const copied = await output.copyPages(source, keptPages);
        copied.forEach((page) => output.addPage(page));
        saveBlob(pdfBlob(await output.save()), `${name}-pages-removed.pdf`);
        setMessage(`Success! Removed ${pagePreviews.length - keptPages.length} page(s). Your original PDF was not changed.`);
        return;
      }

      if (active === "split") {
        if (loadingPreviews || !pagePreviews.length) throw new Error("Page previews are not ready yet. Wait for previews to finish.");
        const chosenPages = pagePreviews
          .filter((item) => item.fileIndex === 0 && selectedPageKeys.includes(item.key))
          .map((item) => item.pageNumber);
        if (!chosenPages.length) throw new Error("No pages selected. Select at least one page card.");
        const zip = new JSZip();
        for (const pageNumber of chosenPages) {
          setMessage(`Preparing selected page ${pageNumber}...`);
          const output = await PDFDocument.create();
          const [page] = await output.copyPages(source, [pageNumber - 1]);
          output.addPage(page);
          zip.file(`${name}-page-${pageNumber}.pdf`, await output.save());
        }
        const archive = await zip.generateAsync({ type: "blob" });
        saveBlob(archive, `${name}-selected-pages-split.zip`);
        setMessage(`Success! ${chosenPages.length} separate PDF file(s) created. ZIP download started.`);
        return;
      }

      if (active === "rotate") {
        source.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + 90) % 360)));
        saveBlob(pdfBlob(await source.save()), `${name}-rotated.pdf`);
        setMessage("PDF rotated 90 degrees successfully.");
        return;
      }

      if (active === "extract") {
        const chosen = parsePages(pageNumbers, total);
        if (!chosen.length) throw new Error("Enter page numbers, for example 1,3,5-7.");
        const keep = chosen.map((n) => n - 1);
        const output = await PDFDocument.create();
        const copied = await output.copyPages(source, keep);
        copied.forEach((page) => output.addPage(page));
        saveBlob(pdfBlob(await output.save()), `${name}-extract.pdf`);
        setMessage("Selected PDF pages extracted successfully.");
        return;
      }

      if (active === "watermark") {
        const font = await source.embedFont(StandardFonts.Helvetica);
        source.getPages().forEach((page) => {
          const { width, height } = page.getSize();
          page.drawText(watermark || "SnapConvert", {
            x: width * 0.15, y: height * 0.5, size: 30, font,
            color: rgb(0.48, 0.48, 0.62), opacity: 0.3, rotate: degrees(35)
          });
        });
        saveBlob(pdfBlob(await source.save()), `${name}-watermarked.pdf`);
        setMessage("Watermark added successfully.");
        return;
      }

      if (active === "numbers") {
        const font = await source.embedFont(StandardFonts.Helvetica);
        source.getPages().forEach((page, index) => {
          const { width } = page.getSize();
          page.drawText(`${index + 1} / ${total}`, {
            x: width - 75, y: 22, size: 10, font, color: rgb(0.2, 0.2, 0.2)
          });
        });
        saveBlob(pdfBlob(await source.save()), `${name}-numbered.pdf`);
        setMessage("Page numbers added successfully.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      {showAuth && (
        <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAuth(false); }}>
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="auth-close" type="button" aria-label="Close login" onClick={() => setShowAuth(false)}>×</button>
            <div className="auth-brand-mark">S</div>
            <p className="auth-eyebrow">WELCOME TO SNAPCONVERT</p>
            <h2 id="auth-title">{authMode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="auth-subtitle">{authMode === "login" ? "Sign in to your SnapConvert account." : "Create an account to get started."}</p>
            <div className="auth-tabs">
              <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthNotice(""); }}>Login</button>
              <button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setAuthNotice(""); }}>Sign up</button>
            </div>
            <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setAuthNotice("Account authentication will be activated when the secure backend is connected. You can use SnapConvert as a guest right now."); }}>
              {authMode === "signup" && <label>Full name<input type="text" name="name" placeholder="Your name" autoComplete="name" required /></label>}
              <label>Email address<input type="email" name="email" placeholder="you@example.com" autoComplete="email" required /></label>
              <label>Password<input type="password" name="password" placeholder="At least 8 characters" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>
              <button className="auth-submit" type="submit">{authMode === "login" ? "Login" : "Create account"} <span>→</span></button>
            </form>
            {authNotice && <p className="auth-notice" role="status">{authNotice}</p>}
            <div className="auth-divider"><span>OR</span></div>
            <button className="auth-guest" type="button" onClick={() => setShowAuth(false)}>Continue as Guest <span>→</span></button>
            <p className="auth-privacy">Guest access is free. All existing tools remain available without an account.</p>
          </section>
        </div>
      )}
      <header className="app-header">
        <a className="nav-brand" href="#" onClick={(e) => { e.preventDefault(); selectTool("merge"); }}>
          <span className="nav-logo">S</span>
          <span className="nav-brand-copy"><b>SnapConvert</b><small>Scan · Convert · Create · Study</small></span>
        </a>
        <nav className="top-nav">
          <a className="nav-active" href="#home">⌂ <span>Home</span></a>
          <button ref={allToolsTriggerRef} className={`all-tools-trigger ${allToolsOpen ? "is-open" : ""}`} type="button" aria-expanded={allToolsOpen} onClick={() => {
            if (!allToolsOpen && allToolsTriggerRef.current) {
              const rect = allToolsTriggerRef.current.getBoundingClientRect();
              setAllToolsMenuPosition({ top: rect.bottom + 8, left: 0, width: window.innerWidth });
            }
            setAllToolsOpen((open) => !open);
          }}>▦ <span>All Tools</span><span className="all-tools-chevron">{allToolsOpen ? "⌃" : "⌄"}</span></button>
          <a href="/ppt-studio">▣ <span>PPT Studio</span></a>
          <a href="/student-hub">♧ <span>Student Hub</span></a>
          <a href="#ai-assistant">✣ <span>AI Assistant</span></a>
        </nav>
        <div className="header-actions"><button className="theme-button" aria-label="Theme">☾</button><button className="auth-open-button" type="button" onClick={() => { setAuthMode("login"); setAuthNotice(""); setShowAuth(true); }}>Login / Sign up</button><span className="no-login">✓ Guest access</span></div>
      </header>

      {allToolsOpen && (
        <>
          <button className="mega-menu-backdrop" aria-label="Close all tools menu" onClick={() => setAllToolsOpen(false)} />
          <section ref={allToolsMenuRef} className="all-tools-mega" aria-label="All SnapConvert tools" style={{ top: `${allToolsMenuPosition.top}px`, left: "3.2%", right: "3.2%", maxHeight: `calc(100vh - ${allToolsMenuPosition.top + 16}px)` }}>
            {[
              { title: "ORGANIZE PDF", items: [["▤", "Merge PDF", "merge"], ["✂", "Split PDF", "split"], ["×", "Remove pages", "delete"], ["⇧", "Extract pages", "extract"], ["☷", "Organize PDF", "organize"], ["▣", "Scan to PDF", "scanner"]] },
              { title: "OPTIMIZE PDF", items: [["❖", "Compress PDF", "compress"], ["✚", "Repair PDF", "repair"], ["OCR", "OCR PDF", "ocr"]] },
              { title: "CONVERT TO PDF", items: [["▧", "JPG to PDF", "image"], ["W", "WORD to PDF", "word"], ["P", "POWERPOINT to PDF", "ppt"], ["X", "EXCEL to PDF", "excel"], ["◎", "HTML to PDF", "html"]] },
              { title: "CONVERT FROM PDF", items: [["▧", "PDF to JPG", "pdfjpg"], ["W", "PDF to WORD", "pdfword"], ["P", "PDF to POWERPOINT", "pdfppt"], ["X", "PDF to EXCEL", "pdfexcel"], ["A", "PDF to PDF/A", "pdfa"]] },
              { title: "EDIT PDF", items: [["↻", "Rotate PDF", "rotate"], ["№", "Add page numbers", "numbers"], ["✎", "Add watermark", "watermark"], ["▣", "Crop PDF", "crop"], ["✐", "Edit PDF", "edit"]] },
              { title: "PDF SECURITY", items: [["▣", "Unlock PDF", "unlock"], ["⬡", "Protect PDF", "protect"], ["✒", "Sign PDF", "sign"], ["▤", "Redact PDF", "redact"], ["◫", "Compare PDF", "compare"]] },
              { title: "PDF INTELLIGENCE", items: [["✦", "AI Summarizer", "ai-summary"], ["文", "Translate PDF", "translate"], ["{ }", "PDF to Markdown", "markdown"]] }
            ].map((group) => (
              <div className="mega-tool-column" key={group.title}>
                <h3>{group.title}</h3>
                {group.items.map(([icon, label, id]) => (
                  <button className="mega-tool-item" key={id} onClick={() => {
                    const match = tools.find((tool) => tool.id === id || tool.name.toLowerCase() === label.toLowerCase());
                    if (match) selectTool(match.id);
                    else { setAllToolsOpen(false); setMessage(`${label} is listed in SnapConvert, but its dedicated module is not enabled in this build yet.`); }
                  }}>
                    <span className={`mega-tool-icon mega-${id}`}>{icon}</span><span>{label}</span>
                  </button>
                ))}
              </div>
            ))}
          </section>
        </>
      )}

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <button className="sidebar-link current">⌂ <span>Dashboard</span></button>
          <div className="sidebar-label">WORKSPACE</div>
          {[
            ["PDF Tools", "▤", ["Merge PDF","Split PDF","Compress PDF","Rotate PDF","Remove Pages","OCR PDF","Watermark PDF","Page Numbers"]],
            ["Convert Tools", "⇄", ["JPG to PDF","PDF to JPG","Word to PDF","PDF to Word","PPT to PDF","Excel to PDF"]],
            ["Scan & OCR", "▣", ["Scan with Camera","Image OCR","PDF OCR"]],
            ["PPT Studio", "▧", ["Create PPT","PPT Templates"]],
            ["Student Tools", "♧", ["Summarize Notes","Flashcards","MCQ Practice","Make Assignment"]],
            ["Document Editor", "✎", ["Text Editor","Document Converter"]],
            ["Image Tools", "▧", ["Compress Image","Resize Image","Crop Image"]],
            ["Resume & Career", "▤", ["Resume Builder","Cover Letter"]],
            ["Study Planner", "▦", ["Study Planner","Task List"]]
          ].map(([label, icon, items]) => (
            <div className="sidebar-group" key={String(label)}>
              <button className="sidebar-heading" onClick={() => setMessage(`${label}: select a tool from the dashboard cards.`)}>
                <span>{icon}</span>{label}<small>⌄</small>
              </button>
              {(items as string[]).slice(0, 3).map((item) => (
                <button className="sidebar-subitem" key={item} onClick={() => {
                  const match = tools.find(t => t.name.toLowerCase() === item.toLowerCase() || t.name.toLowerCase().includes(item.toLowerCase()));
                  if (match) selectTool(match.id);
                  else setMessage(`${item} is listed in the workspace. This feature needs its dedicated module and is not enabled in this build yet.`);
                }}>{item}</button>
              ))}
            </div>
          ))}
        </aside>

        <main className="dashboard-main" id="home">
          <section className="dashboard-hero">
            <div className="hero-content">
              <div className="hero-kicker">STUDENT PRODUCTIVITY • NO LOGIN REQUIRED</div>
              <h1>Your All-in-One<br/>Student Productivity Hub</h1>
              <p>PDF Tools, Document Conversion, Camera Scanner, PPT Maker,<br className="desktop-break"/> AI Study Assistant and much more — for School & College Students.</p>
              <label className="hero-search">
                <span>⌕</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for tools... (e.g. Merge PDF, Scan to PDF, PPT Maker)"/>
                <kbd>Ctrl + K</kbd>
              </label>
            </div>
            <div className="hero-art" aria-hidden="true">
              <span className="float-file pdf-float">PDF</span><span className="float-file word-float">W</span>
              <div className="laptop-screen"><div className="screen-logo">S</div></div>
              <div className="laptop-base"></div><div className="stack-docs"><i></i><i></i><i></i></div>
            </div>
          </section>

          <section className="quick-actions">
            {[
              ["📷","Scan with Camera","Direct to PDF/Word","scan"],
              ["▣","Create PPT","AI or Manual","ppt"],
              ["⇄","Convert File","PDF, Word, Excel, PPT","convert"],
              ["✎","Edit PDF","Text, Crop, Watermark","edit"],
              ["▤","Summarize Notes","AI Study Assistant","notes"],
              ["▤","Make Assignment","College & School","assignment"]
            ].map(([icon,title,desc,id]) => (
              <button className="quick-card" key={id} onClick={() => id === "scan" ? selectTool("scanner") : id === "ppt" ? (window.location.href = "/ppt-studio") : id === "notes" || id === "assignment" ? (window.location.href = "/student-hub") : setMessage(`${title} is part of the SnapConvert workspace. Its dedicated module is not enabled in this build yet.`)}>
                <span className="quick-icon">{icon}</span><span><b>{title}</b><small>{desc}</small></span>
              </button>
            ))}
          </section>

          <section className="tool-section" id="all-tools">
            <div className="section-title-row"><div><span className="section-mark">▮ ▮ ▮</span><h2>PDF Tools</h2><em>Most Used</em></div><a href="#all-tools">View All →</a></div>
            <div className="dashboard-tool-grid">
              {[
                ["merge","▤","Merge PDF","Combine multiple PDFs","red"],
                ["split","✂","Split PDF","Divide a PDF into parts","red"],
                ["compress","❖","Compress PDF","Optimize PDF structure","green"],
                ["repair","✚","Repair PDF","Re-save readable PDF files","green"],
                ["organize","☷","Organize Pages","Reorder pages by number","blue"],
                ["rotate","↻","Rotate PDF","Rotate page orientation","purple"],
                ["delete","▣","Remove Pages","Delete unwanted pages","red"],
                ["ocr","OCR","OCR PDF","Extract text from PDF","green"],
                ["extract","⇧","Extract Pages","Save selected pages","blue"],
                ["watermark","✎","Watermark PDF","Add text watermark","purple"],
                ["numbers","№","Page Numbers","Add page numbers","blue"]
              ].map(([id,icon,title,desc,color]) => (
                <button className="dashboard-tool-card" key={id} onClick={() => {
                  const match = tools.find(t => t.id === id);
                  if (match) selectTool(match.id);
                  else setMessage(`${title} is not enabled in this build yet.`);
                }}>
                  <span className={`dashboard-tool-icon ${color}`}>{icon}</span><span><b>{title}</b><small>{desc}</small></span>
                </button>
              ))}
            </div>
          </section>

          <section className="tool-section">
            <div className="section-title-row"><div><span className="section-mark">⇄</span><h2>Convert Tools</h2></div><a href="#all-tools">View All →</a></div>
            <div className="dashboard-tool-grid">
              {[
                ["image","▧","JPG to PDF","Convert images into PDF","blue"],
                ["pdfjpg","▧","PDF to JPG","Convert PDF pages to images","blue"],
                ["word","W","Word to PDF","Convert DOCX files","purple"],
                ["ppt","P","PPT to PDF","Convert presentations","orange"],
                ["excel","X","Excel to PDF","Convert spreadsheets","green"],
                ["pdfword","PDF","PDF to Word","Export editable documents","red"]
              ].map(([id,icon,title,desc,color]) => (
                <button className="dashboard-tool-card" key={id} onClick={() => {
                  const match = tools.find(t => t.id === id);
                  if (match) selectTool(match.id);
                  else setMessage(`${title} requires an Office conversion module which is not enabled in this build.`);
                }}>
                  <span className={`dashboard-tool-icon ${color}`}>{icon}</span><span><b>{title}</b><small>{desc}</small></span>
                </button>
              ))}
            </div>
          </section>

          <section className="tool-section extra-sections" id="ppt-studio">
            <div className="section-title-row"><div><span className="section-mark">▧</span><h2>PPT Studio</h2></div><span className="module-note">Workspace module</span></div>
            <div className="dashboard-tool-grid">
              <button className="dashboard-tool-card" onClick={() => { window.location.href = "/ppt-studio"; }}><span className="dashboard-tool-icon orange">▣</span><span><b>Create PPT</b><small>Build a presentation</small></span></button>
              <button className="dashboard-tool-card" onClick={() => { window.location.href = "/ppt-studio"; }}><span className="dashboard-tool-icon purple">▤</span><span><b>PPT Templates</b><small>Start from a template</small></span></button>
              <button className="dashboard-tool-card" onClick={() => { window.location.href = "/student-hub"; }}><span className="dashboard-tool-icon blue">✧</span><span><b>Student Hub</b><small>Study and revision tools</small></span></button>
            </div>
          </section>

          <section className="action-panel" ref={actionPanelRef} id="tool-workspace">
            {(active === "merge" || active === "split" || active === "delete" || active === "organize") ? (
              <div className="ms-workspace">
                <header className="ms-topbar">
                  <div className="ms-brand"><span className="ms-logo">S</span><span><b>SnapConvert</b><small>PDF WORKSPACE</small></span></div>
                  <nav className="ms-nav">
                    <button className={active === "merge" ? "active" : ""} onClick={() => selectTool("merge")}>MERGE PDF</button>
                    <button className={active === "split" ? "active" : ""} onClick={() => selectTool("split")}>SPLIT PDF</button>
                    <button className={active === "delete" ? "active" : ""} onClick={() => selectTool("delete")}>REMOVE PAGES</button>
                    <button className={active === "organize" ? "active" : ""} onClick={() => selectTool("organize")}>ORGANIZE</button>
                  </nav>
                  <span className="ms-private">✓ No Login Required</span>
                </header>

                <div className="ms-main">
                  <div className="ms-canvas">
                    {!files.length ? (
                      <div className="ms-empty">
                        <div className="ms-empty-icon">{active === "merge" ? "▤" : active === "split" ? "✂" : active === "organize" ? "☷" : "▣"}</div>
                        <h2>{active === "merge" ? "Merge PDF files" : active === "split" ? "Split PDF pages" : active === "organize" ? "Organize PDF pages" : "Remove PDF pages"}</h2>
                        <p>{active === "merge" ? "Combine PDFs and choose exactly which pages to include." : active === "split" ? "Choose the pages you want to separate into individual PDF files." : active === "organize" ? "Preview every page, then move pages up or down to create your preferred PDF order." : "Preview every page, mark unwanted pages for removal, and download a clean PDF."}</p>
                        <button className="ms-primary" onClick={() => inputRef.current?.click()}>＋ Select PDF file</button>
                        <small>PDF files · processed locally in your browser</small>
                      </div>
                    ) : (
                      <>
                        <div className="ms-canvas-head">
                          <div><b>{active === "merge" ? "Your PDF files" : active === "delete" ? "Review all PDF pages" : active === "organize" ? "Arrange your PDF pages" : "Your PDF pages"}</b><small>{active === "merge" ? `${files.length} file(s) · arrange files by adding them in the desired order` : active === "delete" ? `${pagePreviews.length} page(s) · click × on pages to remove` : active === "organize" ? `${pagePreviews.length} page(s) · use arrows or drag pages to reorder` : `${pagePreviews.length} page(s) · select pages to split`}</small></div>
                          <button className="ms-add" onClick={() => inputRef.current?.click()} title="Add PDF files">＋</button>
                        </div>
                        {active === "merge" && files.map((file, fileIndex) => (
                          <div className="ms-file-heading" key={`${file.name}-${fileIndex}`}>
                            <span className="ms-pdf-icon">PDF</span>
                            <span><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(2)} MB · {pagePreviews.filter(p => p.fileIndex === fileIndex).length} pages</small></span>
                            <button onClick={() => {
                              const next = files.filter((_, i) => i !== fileIndex);
                              setFiles(next);
                              void loadPagePreviews(next);
                            }}>Remove file</button>
                          </div>
                        ))}
                        {loadingPreviews && <div className="ms-loading"><span className="spinner"/> Creating page previews…</div>}
                        {!loadingPreviews && pagePreviews.length > 0 && (
                          <div className="ms-page-grid">
                            {pagePreviews.map((item) => {
                              const checked = selectedPageKeys.includes(item.key);
                              return (
                                <div className={`ms-page-card ${checked ? "is-selected" : "is-removed"}`} key={item.key}>
                                  {active === "delete" ? (
                                    <>
                                      <span className={`ms-page-state ${checked ? "keep-state" : "remove-state"}`}>{checked ? "✓ Keep page" : "× Will be removed"}</span>
                                      <img src={item.image} alt={`Page ${item.pageNumber} preview`}/>
                                      <span className="ms-page-label">Page {item.pageNumber}</span>
                                      <button type="button" className={`ms-remove-page ${checked ? "marked" : "restore"}`} onClick={() => togglePage(item.key)}>{checked ? "× Remove page" : "↶ Keep page"}</button>
                                    </>
                                  ) : active === "organize" ? (
                                    <div className="ms-organize-card" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", item.key)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                                      event.preventDefault();
                                      const draggedKey = event.dataTransfer.getData("text/plain");
                                      if (!draggedKey || draggedKey === item.key) return;
                                      setPagePreviews((current) => {
                                        const from = current.findIndex((page) => page.key === draggedKey);
                                        const to = current.findIndex((page) => page.key === item.key);
                                        if (from < 0 || to < 0) return current;
                                        const next = [...current];
                                        const [moved] = next.splice(from, 1);
                                        next.splice(to, 0, moved);
                                        return next;
                                      });
                                    }}>
                                      <span className="ms-page-state organize-state">↕ Position {pagePreviews.findIndex((page) => page.key === item.key) + 1}</span>
                                      <img src={item.image} alt={`Original page ${item.pageNumber} preview`}/>
                                      <span className="ms-page-label">Original page {item.pageNumber}</span>
                                      <div className="ms-organize-actions">
                                        <button type="button" disabled={pagePreviews.findIndex((page) => page.key === item.key) === 0} onClick={() => moveOrganizePage(item.key, -1)} aria-label="Move page left">↑ Up</button>
                                        <button type="button" disabled={pagePreviews.findIndex((page) => page.key === item.key) === pagePreviews.length - 1} onClick={() => moveOrganizePage(item.key, 1)} aria-label="Move page right">↓ Down</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button type="button" className="ms-page-inner" onClick={() => togglePage(item.key)} aria-pressed={checked}>
                                      <span className="ms-page-state">{checked ? "✓ Included" : "＋ Add page"}</span>
                                      <img src={item.image} alt={`Page ${item.pageNumber} preview`}/>
                                      <span className="ms-page-label">{active === "merge" ? `PDF ${item.fileIndex + 1} · Page ${item.pageNumber}` : `Page ${item.pageNumber}`}</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="ms-selection-bar">
                          <span><b>{active === "organize" ? pagePreviews.length : active === "delete" ? pagePreviews.length - selectedPageKeys.length : selectedPageKeys.length}</b> {active === "organize" ? "pages in new order" : active === "delete" ? "pages marked for removal" : `of ${pagePreviews.length} pages selected`}</span>
                          {active !== "organize" && <div><button onClick={() => setSelectedPageKeys(pagePreviews.map(p => p.key))}>{active === "delete" ? "Keep all" : "Select all"}</button><button onClick={() => setSelectedPageKeys([])}>{active === "delete" ? "Remove all (disabled)" : "Clear selection"}</button></div>}
                          {active === "organize" && <small className="ms-drag-hint">Drag a page card or use Up / Down to change its position.</small>}
                        </div>
                      </>
                    )}
                    <input ref={inputRef} className="ms-hidden-input" type="file" accept="application/pdf,.pdf" multiple={active === "merge"} onChange={(event) => {
                      const picked = Array.from(event.target.files || []);
                      if ((active === "split" || active === "delete" || active === "organize") && picked.length > 1) {
                        setMessage(active === "delete" ? "Remove Pages accepts one PDF at a time." : active === "organize" ? "Organize Pages accepts one PDF at a time." : "Split PDF accepts one PDF at a time.");
                        return;
                      }
                      const combined = active === "merge"
                        ? [...files, ...picked.filter((candidate) => !files.some((existing) =>
                            existing.name === candidate.name &&
                            existing.size === candidate.size &&
                            existing.lastModified === candidate.lastModified
                          ))]
                        : picked;
                      if (!combined.length) {
                        setMessage("These PDF files are already added.");
                        return;
                      }
                      setFiles(combined);
                      setMessage(`${combined.length} PDF file(s) selected. Loading page previews…`);
                      void loadPagePreviews(combined);
                      event.currentTarget.value = "";
                    }}/>
                  </div>

                  <aside className="ms-sidebar">
                    <div className="ms-sidebar-title">{active === "merge" ? "Merge PDF" : active === "split" ? "Split PDF" : active === "organize" ? "Organize Pages" : "Remove Pages"}</div>
                    <div className="ms-info"><span>ⓘ</span><p>{active === "merge" ? "Add two or more PDF files. Select the pages you want to keep. Selected pages will be combined in file order." : active === "split" ? "Upload one PDF. Select the pages you want to split. Each selected page will be downloaded as a separate PDF in a ZIP file." : active === "organize" ? "Upload one PDF. All pages appear as previews. Drag and drop any page, or use Up / Down controls to change the order. The original PDF remains unchanged." : "Upload one PDF. All pages are shown below. Click × Remove page on every page you do not want in the new PDF. The original stays unchanged."}</p></div>
                    <div className="ms-summary">
                      <div><span>PDF files</span><b>{files.length}</b></div>
                      <div><span>Total pages</span><b>{pagePreviews.length}</b></div>
                      {active === "delete" ? <><div><span>Pages to remove</span><b className="ms-red-number">{pagePreviews.length - selectedPageKeys.length}</b></div><div><span>Pages remaining</span><b>{selectedPageKeys.length}</b></div></> : active === "organize" ? <><div><span>Total pages</span><b>{pagePreviews.length}</b></div><div><span>New order</span><b>Custom</b></div></> : <div><span>Selected pages</span><b>{selectedPageKeys.length}</b></div>}
                      {active === "merge" && files.length < 2 && <small>Add at least 2 PDF files to merge.</small>}
                      {active === "split" && files.length === 1 && <small>Selected pages will be exported separately.</small>}
                      {active === "organize" && pagePreviews.length > 0 && <small>Page order shown in the preview will be used in the downloaded PDF.</small>}
                      {active === "delete" && selectedPageKeys.length === pagePreviews.length && <small>Click × on at least one page to mark it for removal.</small>}
                      {active === "delete" && selectedPageKeys.length === 0 && <small>Keep at least one page in the new PDF.</small>}
                    </div>
                    <button className="ms-download" disabled={busy || loadingPreviews || !files.length || (!selectedPageKeys.length && active !== "organize") || (active === "merge" && files.length < 2) || (active === "delete" && selectedPageKeys.length === pagePreviews.length)} onClick={processFiles}>
                      {busy ? "Processing…" : active === "merge" ? "Merge PDF  →" : active === "split" ? "Split PDF  →" : active === "organize" ? "Apply Order & Download PDF  →" : "Remove Pages & Download PDF  →"}
                    </button>
                    <p className="ms-privacy">🔒 Your files stay on your device. Processing happens in this browser.</p>
                    <div className="ms-status" role="status">{busy && <span className="spinner"/>}{message}</div>
                  </aside>
                </div>
              </div>
            ) : (
              <>
            <div className="action-heading">
              <div className="action-icon">{selected.icon}</div>
              <div><div className="eyebrow">{selected.category.toUpperCase()}</div><h3>{selected.name}</h3><p>{selected.description}</p></div>
            </div>
            <div className="file-area">
              {active === "scanner" && (
                <section className="scanner-workspace">
                  <div className="scanner-intro">
                    <div className="scanner-intro-icon">▤</div>
                    <div>
                      <span className="scanner-kicker">PAPER TO PDF</span>
                      <h4>Turn paper documents into clean PDFs</h4>
                      <p>Capture one or more pages, review them, then save everything as a single PDF.</p>
                    </div>
                  </div>

                  <div className="scanner-steps">
                    <div className={!cameraStream && scannedPages.length === 0 ? "scanner-step active" : "scanner-step done"}><i>1</i><span>Capture pages</span></div>
                    <div className={scannedPages.length ? "scanner-step active" : "scanner-step"}><i>2</i><span>Review scans</span></div>
                    <div className={scannedPages.length ? "scanner-step" : "scanner-step"}><i>3</i><span>Create PDF</span></div>
                  </div>

                  <div className="scanner-work-grid">
                    <div className="scanner-preview-card">
                      <div className="scanner-card-heading">
                        <div><b>Camera preview</b><small>{cameraStream ? "Camera is ready — position your document" : "Your camera preview will appear here"}</small></div>
                        <span className={cameraStream ? "camera-status live" : "camera-status"}><i/> {cameraStream ? "LIVE" : "NOT CONNECTED"}</span>
                      </div>
                      {cameraStream ? (
                        <div ref={scannerViewRef} className="camera-live scanner-live-view">
                          <div className="scanner-live-topbar">
                            <span><i /> Camera is live</span>
                            <button type="button" className="scanner-fullscreen-button" onClick={openScannerFullscreen}>
                              ⛶ Full screen
                            </button>
                          </div>
                          <video ref={(node) => { videoRef.current = node; if (node && cameraStream && node.srcObject !== cameraStream) node.srcObject = cameraStream; }} autoPlay playsInline muted />
                          <div className="scanner-live-controls">
                            <button className="scanner-capture-button" onClick={capturePage}><span>＋</span> Capture page</button>
                            <button className="scanner-stop-button" onClick={stopCamera}>Stop camera</button>
                          </div>
                        </div>
                      ) : (
                        <div className="scanner-empty-preview">
                          <div className="scanner-document-art"><span/><span/><span/><b>PDF</b></div>
                          <b>Ready when you are</b>
                          <p>Place your document in the frame and use your camera to capture each page.</p>
                          <button className="scanner-start-button" onClick={startCamera}><span>▣</span> Start camera</button>
                          <small>Camera permission is requested by your browser. HTTPS or localhost is required.</small>
                        </div>
                      )}
                    </div>

                    <aside className="scanner-side-card">
                      <div className="scanner-card-heading"><div><b>Scan summary</b><small>Your document progress</small></div><span className="scanner-count">{scannedPages.length}</span></div>
                      <div className="scanner-summary-row"><span>Pages captured</span><b>{scannedPages.length}</b></div>
                      <div className="scanner-summary-row"><span>Output format</span><b>PDF document</b></div>
                      <div className="scanner-summary-row"><span>Processing</span><b className="scanner-local-label">In your browser</b></div>
                      <div className="scanner-tip"><b>For a clearer scan</b><p>Use bright, even lighting. Keep the page flat and fit all four corners inside the camera view.</p></div>
                      {cameraError && <div className="scanner-error" role="alert">{cameraError}</div>}
                      <button className="scanner-create-button" disabled={busy || scannedPages.length === 0} onClick={processFiles}>{busy ? "Creating your PDF…" : "Create PDF"}<span>→</span></button>
                      <small className="scanner-secure-note">🔒 Your captured pages stay in this browser.</small>
                    </aside>
                  </div>

                  {scannedPages.length > 0 && <div className="scanner-pages-card">
                    <div className="scanner-pages-heading"><div><b>Captured pages</b><small>Review your scans before creating the PDF.</small></div><span>{scannedPages.length} {scannedPages.length === 1 ? "page" : "pages"}</span></div>
                    <div className="scanner-page-grid">{scannedPages.map((page, index) => (
                      <div className="scanner-page-item" key={`${index}-${page.length}`}>
                        <div className="scanner-page-image"><img src={page} alt={`Captured page ${index + 1}`} /></div>
                        <div className="scanner-page-meta"><b>Page {index + 1}</b><button className="scanner-remove-page" aria-label={`Remove page ${index + 1}`} onClick={() => setScannedPages(current => current.filter((_, i) => i !== index))}>Remove</button></div>
                      </div>
                    ))}</div>
                  </div>}
                </section>
              )}
              {active !== "scanner" && <>
              <label className="dropzone">
                <input ref={inputRef} type="file" multiple={active === "image"} accept={active === "image" ? "image/*" : "application/pdf"}
                  onChange={(event) => {
                    const picked = Array.from(event.target.files || []);
                    setFiles(picked);
                    setMessage(`${picked.length} file(s) selected.`);
                    setPagePreviews([]);
                    setSelectedPageKeys([]);
                  }}/>
                <span className="upload">↑</span><b>Choose files or drop them here</b>
                <small>{active === "image" ? "JPG, PNG or WebP images" : active === "ocr" ? "Scanned or image-based PDF files · up to 20 pages" : active === "repair" ? "Try structural repair, with visual recovery fallback" : "Select PDF files from your device"}</small><span className="browse">Browse files</span>
              </label>
              {files.length > 0 && <div className="file-list"><div className="list-title">Selected files ({files.length})</div>
                {files.map((file,index) => <div className="file-row" key={`${file.name}-${index}`}><span className="pdf-symbol">{file.type.startsWith("image/") ? "IMG" : "PDF"}</span><span className="file-info"><b>{file.name}</b><small>{(file.size/1024/1024).toFixed(2)} MB</small></span><button className="remove" onClick={() => setFiles(current => current.filter((_,i) => i !== index))}>Remove</button></div>)}
              </div>}
              {active === "extract" && <label className="field-label">Page numbers<input value={pageNumbers} onChange={e => setPageNumbers(e.target.value)} placeholder="Example: 1,3,5-7"/></label>}
              {active === "watermark" && <label className="field-label">Watermark text<input value={watermark} onChange={e => setWatermark(e.target.value)} placeholder="Enter watermark text"/></label>}
              {active === "ocr" && <label className="field-label">OCR language
                <select value={ocrLanguage} onChange={e => setOcrLanguage(e.target.value)}>
                  <option value="eng">English</option>
                  <option value="hin">Hindi</option>
                  <option value="eng+hin">English + Hindi</option>
                </select>
                <small>Language data downloads the first time. Processing runs in your browser.</small>
              </label>}
              {active === "compress" && (
                <section className="compression-control" aria-label="Choose compression level">
                  <div className="compression-heading">
                    <div>
                      <span className="compression-eyebrow">PDF OPTIMIZATION</span>
                      <h3>Choose compression level</h3>
                      <p>Balance smaller file size with visual quality.</p>
                    </div>
                    <span className="compression-current">
                      {compressQuality === "strong" ? "Maximum savings" : compressQuality === "light" ? "Best quality" : "Recommended"}
                    </span>
                  </div>
                  <div className="compression-options">
                    <button type="button" className={`compression-option ${compressQuality === "strong" ? "selected" : ""}`} onClick={() => setCompressQuality("strong")} aria-pressed={compressQuality === "strong"}>
                      <span className="compression-option-top"><b>Strong</b><span className="compression-badge">Smallest</span></span>
                      <span className="compression-meter strong-meter"><i /></span>
                      <span className="compression-option-desc">Smaller file · Lower image quality</span>
                    </button>
                    <button type="button" className={`compression-option ${compressQuality === "medium" ? "selected" : ""}`} onClick={() => setCompressQuality("medium")} aria-pressed={compressQuality === "medium"}>
                      <span className="compression-option-top"><b>Balanced</b><span className="compression-badge recommended">Recommended</span></span>
                      <span className="compression-meter medium-meter"><i /></span>
                      <span className="compression-option-desc">Good size · Good image quality</span>
                    </button>
                    <button type="button" className={`compression-option ${compressQuality === "light" ? "selected" : ""}`} onClick={() => setCompressQuality("light")} aria-pressed={compressQuality === "light"}>
                      <span className="compression-option-top"><b>Light</b><span className="compression-badge quality">Best quality</span></span>
                      <span className="compression-meter light-meter"><i /></span>
                      <span className="compression-option-desc">Larger file · Sharper images</span>
                    </button>
                  </div>
                  <div className="compression-scale"><span>Smaller file</span><span>Higher image quality</span></div>
                  <p className="compression-note"><span>ⓘ</span> Pages are converted to images. Text in the compressed PDF will not be selectable or searchable.</p>
                </section>
              )}
              <button className="primary process" onClick={processFiles} disabled={busy || files.length === 0}>{busy ? "Processing..." : "Process & Download →"}</button>
              </>}
            </div>
            <div className="status" role="status">{busy && <span className="spinner"/>}{message}</div>
            <div className="notice"><b>Privacy note:</b> Supported PDF and image operations run locally in your browser. Compression may not reduce every PDF. Repair only works on PDFs that can still be parsed. OCR and cloud AI need separate modules.</div>
              </>
            )}
          </section>
          <footer className="dashboard-footer"><b>SnapConvert</b><small>© {new Date().getFullYear()} SnapConvert · Built for students · Free guest access · Developed by <strong>Manbir Singh</strong></small></footer>
        </main>
      </div>
    </div>
  );
}
