"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import {
  DROPZONE_MAX_BYTES,
  inferMimeType,
  isImageMime,
  isSupportedOcrMime,
} from "@/lib/ocr";
import { useOcr } from "@/hooks/useOcr";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { DropOverlay } from "@/components/DropOverlay";
import { SourcePanel } from "@/components/SourcePanel";
import { OutputPanel, type ViewMode } from "@/components/OutputPanel";

function formatDropzoneError(rejections: FileRejection[]): string {
  const messages = rejections.flatMap((rejection) =>
    rejection.errors.map((err) => {
      if (err.code === "file-too-large") {
        return `File is too large (max ${Math.round(
          DROPZONE_MAX_BYTES / (1024 * 1024)
        )}MB).`;
      }
      if (err.code === "file-invalid-type") {
        return "Unsupported file type. Use PNG, JPG, WebP, or PDF.";
      }
      return err.message;
    })
  );
  return messages[0] || "Could not accept this file.";
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("raw");

  const ocr = useOcr();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const selectedFile = acceptedFiles[0];
      if (!selectedFile) return;

      const mimeType = inferMimeType(selectedFile.name, selectedFile.type);
      if (!isSupportedOcrMime(mimeType)) {
        ocr.setError(
          "Unsupported file type. Please upload PNG, JPEG, WebP, or PDF."
        );
        return;
      }

      setFile(selectedFile);
      ocr.setError(null);
      ocr.setText("");
      setViewMode("raw");

      if (isImageMime(mimeType)) {
        const reader = new FileReader();
        reader.onload = () => setPreview(reader.result as string);
        reader.readAsDataURL(selectedFile);
      } else {
        setPreview(null);
      }
    },
    [ocr]
  );

  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      ocr.setError(formatDropzoneError(rejections));
      setFile(null);
      setPreview(null);
      ocr.setText("");
    },
    [ocr]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    maxSize: DROPZONE_MAX_BYTES,
    disabled: ocr.isProcessing,
    noClick: true,
  });

  const { process } = ocr;
  useEffect(() => {
    void process(file);
  }, [file, process]);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(ocr.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadText = () => {
    const blob = new Blob([ocr.text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file?.name.replace(/\.[^/.]+$/, "") || "extracted"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    ocr.reset();
    setFile(null);
    setPreview(null);
  };

  const retryProcessing = () => {
    ocr.setError(null);
    void process(file);
  };

  return (
    <div
      {...getRootProps()}
      className="min-h-screen bg-cursor-bg flex flex-col lg:h-screen lg:overflow-hidden"
    >
      <input {...getInputProps()} />

      {isDragActive && <DropOverlay />}

      <AppHeader />

      <main className="flex-1 lg:min-h-0 max-w-7xl mx-auto w-full px-6 py-6 overflow-y-auto lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-full">
          <SourcePanel
            file={file}
            preview={preview}
            isProcessing={ocr.isProcessing}
            statusMessage={ocr.statusMessage}
            progress={ocr.progress}
            isDragActive={isDragActive}
            onClear={clearAll}
            onBrowse={open}
            onCancel={ocr.cancel}
          />

          <OutputPanel
            text={ocr.text}
            onTextChange={ocr.setText}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            copied={copied}
            onCopy={copyToClipboard}
            onDownload={downloadText}
            fileName={file?.name ?? null}
            isProcessing={ocr.isProcessing}
            hasFile={Boolean(file)}
            error={ocr.error}
            onRetry={retryProcessing}
          />
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
