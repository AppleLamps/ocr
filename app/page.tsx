"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import ReactMarkdown from "react-markdown";
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
  RefreshCw,
  Eye,
  Code,
  Zap,
} from "lucide-react";
import {
  DROPZONE_MAX_BYTES,
  inferMimeType,
  isImageMime,
  isPdfMime,
  isSupportedOcrMime,
  OCR_PDF_LIMIT_BYTES,
  OCR_PDF_PAGE_LIMIT,
} from "@/lib/ocr";
import {
  loadPdfPageCount,
  prepareImageForOcr,
  splitPdfForOcr,
} from "@/lib/ocr-client";
import { submitFileToOcr } from "@/lib/ocr-fetch";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDropzoneError(rejections: FileRejection[]): string {
  const messages = rejections.flatMap((rejection) =>
    rejection.errors.map((err) => {
      if (err.code === "file-too-large") {
        return `File is too large (max ${Math.round(DROPZONE_MAX_BYTES / (1024 * 1024))}MB).`;
      }
      if (err.code === "file-invalid-type") {
        return "Unsupported file type. Use PNG, JPG, WebP, or PDF.";
      }
      return err.message;
    })
  );
  return messages[0] || "Could not accept this file.";
}

type ViewMode = "raw" | "preview";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("raw");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const processOCR = useCallback(async (fileToProcess: File | null) => {
    if (!fileToProcess) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setIsProcessing(true);
    setStatusMessage("Preparing file...");
    setProgress(null);
    setError(null);

    const mimeType = inferMimeType(fileToProcess.name, fileToProcess.type);
    if (!isSupportedOcrMime(mimeType)) {
      setError("Unsupported file type. Please upload PNG, JPEG, WebP, or PDF.");
      setIsProcessing(false);
      setStatusMessage(null);
      return;
    }

    try {
      if (isImageMime(mimeType)) {
        const preparedImage = await prepareImageForOcr(fileToProcess);
        if (abortController.signal.aborted) return;

        setStatusMessage(
          preparedImage.size === fileToProcess.size &&
            preparedImage.type === fileToProcess.type
            ? "Processing image..."
            : "Image prepared for OCR..."
        );
        const imageText = await submitFileToOcr(preparedImage, {
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;
        setText(imageText);
        return;
      }

      if (isPdfMime(mimeType)) {
        const pageCount = await loadPdfPageCount(fileToProcess);
        if (abortController.signal.aborted) return;

        const fitsSingleRequest =
          fileToProcess.size <= OCR_PDF_LIMIT_BYTES &&
          pageCount <= OCR_PDF_PAGE_LIMIT;

        if (fitsSingleRequest) {
          setStatusMessage("Processing PDF...");
          const pdfText = await submitFileToOcr(fileToProcess, {
            signal: abortController.signal,
          });
          if (abortController.signal.aborted) return;
          setText(pdfText);
          return;
        }

        setStatusMessage("Splitting PDF into chunks...");
        const { chunks, pageCount: totalPages } =
          await splitPdfForOcr(fileToProcess);
        if (abortController.signal.aborted) return;

        if (totalPages > OCR_PDF_PAGE_LIMIT) {
          setStatusMessage(
            `Processing ${chunks.length} chunks (${totalPages} pages)...`
          );
        }

        setProgress({ current: 0, total: chunks.length });

        const chunkTexts: string[] = [];
        for (let i = 0; i < chunks.length; i += 1) {
          if (abortController.signal.aborted) return;
          setProgress({ current: i + 1, total: chunks.length });
          setStatusMessage(`Processing chunk ${i + 1} of ${chunks.length}...`);
          const chunkText = await submitFileToOcr(chunks[i], {
            signal: abortController.signal,
          });
          chunkTexts.push(chunkText);
        }

        if (abortController.signal.aborted) return;
        setText(
          chunkTexts
            .filter(Boolean)
            .map((part, index) =>
              chunks.length > 1 ? `<!-- Part ${index + 1} -->\n\n${part}` : part
            )
            .join("\n\n")
        );
        return;
      }

      throw new Error("Unsupported file type. Please upload an image or PDF.");
    } catch (err) {
      if (abortController.signal.aborted) return;
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null;
      }
      setIsProcessing(false);
      setStatusMessage(null);
      setProgress(null);
    }
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const selectedFile = acceptedFiles[0];
      if (!selectedFile) return;

      const mimeType = inferMimeType(selectedFile.name, selectedFile.type);
      if (!isSupportedOcrMime(mimeType)) {
        setError("Unsupported file type. Please upload PNG, JPEG, WebP, or PDF.");
        return;
      }

      setFile(selectedFile);
      setError(null);
      setText("");
      setViewMode("raw");

      if (isImageMime(mimeType)) {
        const reader = new FileReader();
        reader.onload = () => setPreview(reader.result as string);
        reader.readAsDataURL(selectedFile);
      } else {
        setPreview(null);
      }
    },
    []
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    setError(formatDropzoneError(rejections));
    setFile(null);
    setPreview(null);
    setText("");
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    maxSize: DROPZONE_MAX_BYTES,
    disabled: isProcessing,
    noClick: true,
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
    abortRef.current?.abort();
    abortRef.current = null;
    setFile(null);
    setPreview(null);
    setText("");
    setStatusMessage(null);
    setError(null);
    setProgress(null);
  };

  const cancelProcessing = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsProcessing(false);
    setStatusMessage(null);
    setProgress(null);
    setError("Processing cancelled.");
  };

  const retryProcessing = () => {
    setError(null);
    void processOCR(file);
  };

  const charCount = text.length;
  const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div
      {...getRootProps()}
      className="min-h-screen bg-cursor-bg flex flex-col lg:h-screen lg:overflow-hidden"
    >
      <input {...getInputProps()} />

      {/* Full-page drag overlay */}
      {isDragActive && (
        <div className="fixed inset-0 z-50 bg-lime-500/10 border-4 border-dashed border-lime-500/70 flex items-center justify-center pointer-events-none">
          <div className="bg-cursor-surface/95 border border-lime-500/40 rounded-2xl px-10 py-8 flex flex-col items-center gap-4 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-lime-500/10 border border-lime-500/40 flex items-center justify-center">
              <Upload className="w-8 h-8 text-lime-400" />
            </div>
            <p className="text-xl font-semibold text-lime-300">Drop to extract text</p>
            <p className="text-sm text-cursor-muted">PNG, JPG, WebP, or PDF</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-shrink-0 border-b border-cursor-border bg-cursor-surface/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="https://z.ai/model-api"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <img src="/logo.svg" alt="Z.AI Logo" className="w-8 h-8" />
            </a>
            <h1 className="text-lg font-semibold text-cursor-text">OCR Studio</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cursor-bg border border-cursor-border text-xs font-mono text-cursor-terminal">
              <Zap className="w-3 h-3" />
              GLM-OCR
            </div>
            <a
              href="https://x.com/lamps_apple"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-mono text-cursor-muted hover:text-cursor-text transition-colors"
            >
              @lamps_apple
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 lg:min-h-0 max-w-7xl mx-auto w-full px-6 py-6 overflow-y-auto lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-full">

          {/* Left Panel – Source */}
          <div className="flex flex-col gap-4 min-h-[400px] lg:min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-cursor-terminal font-mono uppercase tracking-wider">
                Source
              </h2>
              {file && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearAll(); }}
                  disabled={isProcessing}
                  className="text-sm text-cursor-muted hover:text-cursor-text transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            {!file ? (
              /* Empty dropzone */
              <div
                className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all ${
                  isDragActive
                    ? "border-lime-500 bg-lime-500/5"
                    : "border-cursor-border bg-cursor-surface/30 hover:border-cursor-muted"
                }`}
              >
                <div className="flex flex-col items-center gap-5 p-8 text-center">
                  <div
                    className={`w-16 h-16 rounded-2xl border flex items-center justify-center transition-all ${
                      isDragActive
                        ? "bg-lime-500/10 border-lime-500/50"
                        : "bg-cursor-surface border-cursor-border"
                    }`}
                  >
                    <Upload
                      className={`w-7 h-7 transition-colors ${
                        isDragActive ? "text-lime-400" : "text-cursor-muted"
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-cursor-text font-medium mb-1">
                      {isDragActive ? "Release to upload" : "Drop your file here"}
                    </p>
                    <p className="text-sm text-cursor-muted mb-4">
                      PNG, JPG, WebP (≤10 MB) or PDF (≤50 MB per chunk)
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); open(); }}
                      className="px-4 py-2 rounded-lg border border-cursor-border bg-cursor-surface hover:bg-cursor-bg hover:border-cursor-muted text-sm text-cursor-text transition-all"
                    >
                      Browse files
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {["PNG", "JPG", "WebP", "PDF"].map((fmt) => (
                      <span
                        key={fmt}
                        className="px-2 py-0.5 text-xs bg-cursor-surface border border-cursor-border rounded-md text-cursor-muted"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* File loaded */
              <div className="flex-1 flex flex-col gap-3">
                {/* File info bar */}
                <div className="bg-cursor-surface border border-cursor-border rounded-xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cursor-bg border border-cursor-border flex items-center justify-center flex-shrink-0">
                    {isImageMime(inferMimeType(file.name, file.type)) ? (
                      <ImageIcon className="w-4 h-4 text-cursor-muted" />
                    ) : (
                      <FileIcon className="w-4 h-4 text-cursor-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-cursor-text font-medium truncate">{file.name}</p>
                    <p className="text-xs text-cursor-muted">{formatFileSize(file.size)}</p>
                  </div>
                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); open(); }}
                      className="flex-shrink-0 text-xs text-cursor-muted hover:text-cursor-text transition-colors px-2.5 py-1 rounded-md border border-cursor-border hover:border-cursor-muted"
                    >
                      Replace
                    </button>
                  )}
                </div>

                {/* Image preview */}
                {preview && (
                  <div className="flex-1 bg-cursor-surface border border-cursor-border rounded-xl overflow-hidden min-h-0">
                    <img
                      src={preview}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {/* PDF placeholder */}
                {!preview && isPdfMime(inferMimeType(file.name, file.type)) && (
                  <div className="flex-1 bg-cursor-surface border border-cursor-border rounded-xl flex items-center justify-center min-h-[160px]">
                    <div className="text-center">
                      <FileText className="w-14 h-14 text-cursor-muted mx-auto mb-2" />
                      <p className="text-sm text-cursor-muted">PDF Document</p>
                    </div>
                  </div>
                )}

                {/* Processing status + progress */}
                {isProcessing && (
                  <div className="bg-cursor-surface border border-lime-500/30 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-lime-300 text-sm font-medium">
                        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                        <span className="truncate">{statusMessage || "Processing..."}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); cancelProcessing(); }}
                        className="flex-shrink-0 text-xs text-cursor-muted hover:text-red-400 transition-colors px-2 py-0.5 ml-2 rounded border border-cursor-border hover:border-red-500/50"
                      >
                        Cancel
                      </button>
                    </div>
                    {progress && (
                      <div>
                        <div className="flex justify-between text-xs text-cursor-muted mb-1.5">
                          <span>Chunk {progress.current}/{progress.total}</span>
                          <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-cursor-bg rounded-full overflow-hidden">
                          <div
                            className="h-full bg-lime-500 rounded-full transition-all duration-300"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel – Output */}
          <div className="flex flex-col gap-4 min-h-[400px] lg:min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-cursor-terminal font-mono uppercase tracking-wider">
                Output
              </h2>
              <div className="flex items-center gap-2">
                {text && (
                  <>
                    {/* Raw / Preview toggle */}
                    <div className="flex items-center rounded-lg border border-cursor-border overflow-hidden">
                      <button
                        onClick={() => setViewMode("raw")}
                        className={`px-2.5 py-1 text-xs font-mono flex items-center gap-1 transition-colors ${
                          viewMode === "raw"
                            ? "bg-cursor-surface text-cursor-text"
                            : "text-cursor-muted hover:text-cursor-text"
                        }`}
                        aria-label="Raw markdown view"
                      >
                        <Code className="w-3 h-3" />
                        Raw
                      </button>
                      <button
                        onClick={() => setViewMode("preview")}
                        className={`px-2.5 py-1 text-xs font-mono flex items-center gap-1 transition-colors ${
                          viewMode === "preview"
                            ? "bg-cursor-surface text-cursor-text"
                            : "text-cursor-muted hover:text-cursor-text"
                        }`}
                        aria-label="Rendered preview"
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </button>
                    </div>

                    <button
                      onClick={copyToClipboard}
                      className="text-sm text-cursor-muted hover:text-cursor-text transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-cursor-surface"
                      aria-label="Copy to clipboard"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-lime-400" />
                          <span className="text-xs text-lime-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span className="text-xs">Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={downloadText}
                      className="text-sm text-cursor-muted hover:text-cursor-text transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-cursor-surface"
                      aria-label="Download as Markdown"
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-xs">Download</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Editor container */}
            <div className="flex-1 min-h-0 bg-cursor-surface border border-cursor-border rounded-xl overflow-hidden flex flex-col">
              {/* Mac-style titlebar */}
              <div className="bg-cursor-bg/50 border-b border-cursor-border px-4 py-2 flex items-center gap-2 flex-shrink-0">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <span className="ml-2 text-sm text-cursor-terminal font-mono">
                  {file ? `${file.name.replace(/\.[^/.]+$/, "")}.md` : "output.md"}
                </span>
              </div>

              {/* Editor body */}
              <div className="flex-1 overflow-hidden min-h-0">
                {viewMode === "raw" || !text ? (
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      isProcessing
                        ? "Extracting text…"
                        : !file
                        ? "Drop or browse a file to extract text…"
                        : "Extracted text will appear here…"
                    }
                    className="editor-textarea bg-transparent text-cursor-text p-4 w-full h-full overflow-y-auto placeholder:text-cursor-muted/50"
                    spellCheck={false}
                  />
                ) : (
                  <div className="markdown-preview p-4 h-full overflow-y-auto text-cursor-text">
                    <ReactMarkdown>{text}</ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Status bar */}
              <div className="bg-cursor-bg/50 border-t border-cursor-border px-4 py-2 flex items-center justify-between text-xs text-cursor-terminal font-mono flex-shrink-0">
                <span>Markdown</span>
                <span>
                  {text ? `${wordCount} words · ${charCount} chars` : "Ready"}
                </span>
              </div>
            </div>

            {/* Error banner with retry */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start justify-between gap-3 fade-in">
                <p className="text-red-400 text-sm flex-1">{error}</p>
                {file && !isProcessing && !error.includes("cancelled") && (
                  <button
                    onClick={(e) => { e.stopPropagation(); retryProcessing(); }}
                    className="flex-shrink-0 flex items-center gap-1 text-xs text-cursor-muted hover:text-cursor-text transition-colors px-2 py-1 rounded border border-cursor-border hover:border-cursor-muted"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-cursor-border py-3">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <p className="text-xs text-cursor-muted font-mono">
            Built with{" "}
            <a
              href="https://z.ai/model-api"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-cursor-terminal hover:underline"
            >
              Z.AI
            </a>{" "}
            GLM-OCR · Not affiliated with Z.AI
          </p>
          <p className="hidden sm:block text-xs text-cursor-muted font-mono">
            PNG · JPG · WebP · PDF
          </p>
        </div>
      </footer>
    </div>
  );
}
