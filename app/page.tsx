"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileText,
  Download,
  Copy,
  Check,
  Loader2,
  X,
  File,
  Image as ImageIcon,
  Sparkles,
  Terminal,
} from "lucide-react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    maxSize: 50 * 1024 * 1024,
  });

  const processOCR = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "OCR processing failed");
      }

      setText(data.text || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

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
            className="text-sm font-mono hover:underline"
            style={{ color: "#39ff14", textShadow: "0 0 10px #39ff14" }}
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
                      or click to browse
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
                      <File className="w-5 h-5 text-cursor-muted" />
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

                {/* Extract Button */}
                <button
                  onClick={processOCR}
                  disabled={isProcessing}
                  className="btn-primary w-full py-3 px-4 bg-lime-500 hover:bg-lime-400 disabled:bg-lime-500/50 text-black font-medium rounded-xl flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Extract Text
                    </>
                  )}
                </button>
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
