"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { PDFDocument } from "pdf-lib";
import {
  Upload,
  FileText,
  Download,
  Copy,
  Check,
  Loader2,
  X,
  File as FileIcon,
  Image as ImageIcon,
} from "lucide-react";

const MAX_ERROR_BODY_LENGTH = 500;
type OcrApiResponse = { text?: string; error?: string };
const OCR_IMAGE_LIMIT_BYTES = 10 * 1024 * 1024;
const OCR_PDF_LIMIT_BYTES = 50 * 1024 * 1024;
const OCR_PDF_PAGE_LIMIT = 100;
const DROPZONE_MAX_BYTES = 200 * 1024 * 1024;
const PDF_CHUNK_TARGET_BYTES = 45 * 1024 * 1024;
const PDF_CHUNK_MAX_PAGES = 40;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function replaceExtension(name: string, nextExt: string) {
  return `${name.replace(/\.[^/.]+$/, "")}.${nextExt}`;
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((createdBlob) => resolve(createdBlob), "image/jpeg", quality);
  });

  if (!blob) {
    throw new Error("Could not encode compressed image");
  }

  return blob;
}

async function compressImageForOcr(file: File): Promise<File> {
  if (file.size <= OCR_IMAGE_LIMIT_BYTES) {
    return file;
  }

  const image = await loadImageElement(file);
  const scales = [1, 0.9, 0.8, 0.7, 0.6];
  const qualities = [0.9, 0.8, 0.7, 0.6, 0.5];

  for (const scale of scales) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not initialize canvas for image compression");
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= OCR_IMAGE_LIMIT_BYTES) {
        return new File([blob], replaceExtension(file.name, "jpg"), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }
  }

  throw new Error(
    "Image is still too large after compression. Please resize it manually and try again."
  );
}

async function createPdfChunk(
  source: PDFDocument,
  startPage: number,
  endPageExclusive: number,
  fileName: string,
  partNumber: number
) {
  const chunkDoc = await PDFDocument.create();
  const pageIndexes = Array.from(
    { length: endPageExclusive - startPage },
    (_, idx) => startPage + idx
  );
  const pages = await chunkDoc.copyPages(source, pageIndexes);
  pages.forEach((page) => chunkDoc.addPage(page));
  const chunkBytes = await chunkDoc.save();
  const chunkArrayBuffer = Uint8Array.from(chunkBytes).buffer;

  return new File([chunkArrayBuffer], replaceExtension(fileName, `part-${partNumber}.pdf`), {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}

async function splitPdfForOcr(file: File): Promise<{ chunks: File[]; pageCount: number }> {
  const bytes = await file.arrayBuffer();
  const source = await PDFDocument.load(bytes);
  const pageCount = source.getPageCount();

  const chunks: File[] = [];
  let cursor = 0;
  let partNumber = 1;

  while (cursor < pageCount) {
    let end = Math.min(cursor + PDF_CHUNK_MAX_PAGES, pageCount);
    let chunk = await createPdfChunk(source, cursor, end, file.name, partNumber);

    while (chunk.size > PDF_CHUNK_TARGET_BYTES && end - cursor > 1) {
      end -= 1;
      chunk = await createPdfChunk(source, cursor, end, file.name, partNumber);
    }

    if (chunk.size > OCR_PDF_LIMIT_BYTES) {
      throw new Error(
        "A single PDF page exceeds the OCR API file size limit. Please reduce page resolution and try again."
      );
    }

    chunks.push(chunk);
    cursor = end;
    partNumber += 1;
  }

  return { chunks, pageCount };
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const processOCR = useCallback(async (fileToProcess: File | null) => {
    if (!fileToProcess) return;

    const submitFileToOcr = async (sourceFile: File) => {
      const formData = new FormData();
      formData.append("file", sourceFile);
      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const bodyText = await response.text();
      const nonJsonError =
        bodyText.length > MAX_ERROR_BODY_LENGTH
          ? `Non-JSON response: ${bodyText.slice(0, MAX_ERROR_BODY_LENGTH)}…`
          : `Non-JSON response: ${bodyText}`;
      let data: OcrApiResponse;
      if (isJson) {
        try {
          data = JSON.parse(bodyText) as OcrApiResponse;
        } catch {
          data = { error: nonJsonError };
        }
      } else {
        data = { error: nonJsonError };
      }
      if (!response.ok) {
        const statusHint = ` (HTTP ${response.status})`;
        throw new Error((data.error || "OCR processing failed") + statusHint);
      }
      return String(data.text || "");
    };

    setIsProcessing(true);
    setStatusMessage("Preparing file...");
    setError(null);

    try {
      if (fileToProcess.type.startsWith("image/")) {
        const preparedImage = await compressImageForOcr(fileToProcess);
        setStatusMessage(
          preparedImage.size === fileToProcess.size
            ? "Processing image..."
            : "Image compressed. Running OCR..."
        );
        const imageText = await submitFileToOcr(preparedImage);
        setText(imageText);
        return;
      }

      if (fileToProcess.type === "application/pdf") {
        const needsSplitBySize = fileToProcess.size > OCR_PDF_LIMIT_BYTES;
        if (!needsSplitBySize) {
          const pdfBytes = await fileToProcess.arrayBuffer();
          const pdfDoc = await PDFDocument.load(pdfBytes);
          const pageCount = pdfDoc.getPageCount();
          if (pageCount <= OCR_PDF_PAGE_LIMIT) {
            setStatusMessage("Processing PDF...");
            const pdfText = await submitFileToOcr(fileToProcess);
            setText(pdfText);
            return;
          }
        }

        setStatusMessage("Splitting PDF into OCR-safe chunks...");
        const { chunks, pageCount } = await splitPdfForOcr(fileToProcess);

        if (pageCount > OCR_PDF_PAGE_LIMIT) {
          setStatusMessage(
            `PDF has ${pageCount} pages. Processing ${chunks.length} chunks...`
          );
        }

        const chunkTexts: string[] = [];
        for (let i = 0; i < chunks.length; i += 1) {
          setStatusMessage(`Processing PDF chunk ${i + 1}/${chunks.length}...`);
          const chunkText = await submitFileToOcr(chunks[i]);
          chunkTexts.push(chunkText);
          if (i < chunks.length - 1) {
            await sleep(250);
          }
        }

        setText(chunkTexts.filter(Boolean).join("\n\n"));
        return;
      }

      throw new Error("Unsupported file type. Please upload an image or PDF.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsProcessing(false);
      setStatusMessage(null);
    }
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setText("");

      if (selectedFile.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => setPreview(reader.result as string);
        reader.readAsDataURL(selectedFile);
      } else {
        setPreview(null);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    maxSize: DROPZONE_MAX_BYTES,
  });

  useEffect(() => {
    void processOCR(file);
  }, [file, processOCR]);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadText = () => {
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file?.name.replace(/\.[^/.]+$/, "") || "extracted"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setFile(null);
    setPreview(null);
    setText("");
    setStatusMessage(null);
    setError(null);
  };

  const charCount = text.length;
  const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="min-h-screen bg-cursor-bg flex flex-col lg:h-screen lg:overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-cursor-border bg-cursor-surface/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="https://z.ai/model-api"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
            </a>
            <h1 className="text-lg font-semibold text-cursor-text">
              OCR Studio
            </h1>
          </div>
          <a
            href="https://x.com/lamps_apple"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-mono hover:underline neon-link"
          >
            built by @lamps_apple
          </a>
          <div className="text-sm text-cursor-terminal font-mono">
            Powered by GLM-OCR
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 lg:min-h-0 max-w-7xl mx-auto w-full px-6 py-6 overflow-y-auto lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-full">
          {/* Left Panel - Upload */}
          <div className="flex flex-col gap-4 min-h-[400px] lg:min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-cursor-terminal font-mono uppercase tracking-wider">
                Source
              </h2>
              {file && (
                <button
                  onClick={clearAll}
                  className="text-sm text-cursor-muted hover:text-cursor-text transition-colors flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            {!file ? (
              <div
                {...getRootProps()}
                className={`dropzone flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all ${
                  isDragActive
                    ? "dropzone-active border-lime-500 bg-lime-500/5"
                    : "border-cursor-border hover:border-cursor-muted bg-cursor-surface/30"
                }`}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-4 p-8">
                  <div className="w-16 h-16 rounded-2xl bg-cursor-surface border border-cursor-border flex items-center justify-center">
                    <Upload className="w-7 h-7 text-cursor-muted" />
                  </div>
                  <div className="text-center">
                    <p className="text-cursor-text font-medium mb-1">
                      Drop your file here
                    </p>
                    <p className="text-sm text-cursor-muted">
                      or click to browse (up to 200MB, auto-chunked for OCR limits)
                    </p>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <span className="px-2 py-1 text-xs bg-cursor-surface border border-cursor-border rounded-md text-cursor-muted">
                      PNG
                    </span>
                    <span className="px-2 py-1 text-xs bg-cursor-surface border border-cursor-border rounded-md text-cursor-muted">
                      JPG
                    </span>
                    <span className="px-2 py-1 text-xs bg-cursor-surface border border-cursor-border rounded-md text-cursor-muted">
                      PDF
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4">
                {/* File Info */}
                <div className="bg-cursor-surface border border-cursor-border rounded-xl p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-cursor-bg border border-cursor-border flex items-center justify-center">
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="w-5 h-5 text-cursor-muted" />
                    ) : (
                      <FileIcon className="w-5 h-5 text-cursor-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-cursor-text font-medium truncate">
                      {file.name}
                    </p>
                    <p className="text-sm text-cursor-muted">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>

                {/* Preview */}
                {preview && (
                  <div className="flex-1 bg-cursor-surface border border-cursor-border rounded-xl overflow-hidden">
                    <img
                      src={preview}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {!preview && file.type === "application/pdf" && (
                  <div className="flex-1 bg-cursor-surface border border-cursor-border rounded-xl flex items-center justify-center">
                    <div className="text-center">
                      <FileText className="w-16 h-16 text-cursor-muted mx-auto mb-3" />
                      <p className="text-cursor-muted">PDF Document</p>
                    </div>
                  </div>
                )}

                {isProcessing && (
                  <div className="w-full py-3 px-4 bg-lime-500/10 border border-lime-500/40 text-lime-300 font-medium rounded-xl flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {statusMessage || "Processing..."}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel - Editor */}
          <div className="flex flex-col gap-4 min-h-[400px] lg:min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-cursor-terminal font-mono uppercase tracking-wider">
                Output
              </h2>
              {text && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="text-sm text-cursor-muted hover:text-cursor-text transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-cursor-surface"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-green-500" />
                        <span className="text-green-500">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={downloadText}
                    className="text-sm text-cursor-muted hover:text-cursor-text transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-cursor-surface"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              )}
            </div>

            {/* Editor */}
            <div className="flex-1 min-h-0 bg-cursor-surface border border-cursor-border rounded-xl overflow-hidden flex flex-col">
              {/* Editor Header */}
              <div className="bg-cursor-bg/50 border-b border-cursor-border px-4 py-2 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                </div>
                <span className="ml-2 text-sm text-cursor-terminal font-mono">
                  {file
                    ? `${file.name.replace(/\.[^/.]+$/, "")}.md`
                    : "output.md"}
                </span>
              </div>

              {/* Editor Content */}
              <div className="flex-1 overflow-hidden min-h-0">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    isProcessing
                      ? "Extracting text..."
                      : "Extracted text will appear here..."
                  }
                  className="editor-textarea bg-transparent text-cursor-text p-4 w-full h-full overflow-y-auto placeholder:text-cursor-muted/50"
                  spellCheck={false}
                />
              </div>

              {/* Editor Footer */}
              <div className="bg-cursor-bg/50 border-t border-cursor-border px-4 py-2 flex items-center justify-between text-xs text-cursor-terminal font-mono">
                <span>Markdown</span>
                <span>
                  {text ? `${wordCount} words · ${charCount} chars` : "Ready"}
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm fade-in">
                {error}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-cursor-border py-4">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="text-sm text-cursor-terminal font-mono">
            Built with{" "}
            <a
              href="https://z.ai/model-api"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Z.AI
            </a>{" "}
            GLM-OCR
          </div>
          <div className="text-xs text-cursor-muted mt-1">
            Not affiliated with Z.AI
          </div>
        </div>
      </footer>
    </div>
  );
}
