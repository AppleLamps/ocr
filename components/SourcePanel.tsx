import {
  Upload,
  FileText,
  Loader2,
  X,
  File as FileIcon,
  Image as ImageIcon,
} from "lucide-react";
import { inferMimeType, isImageMime, isPdfMime } from "@/lib/ocr";
import type { OcrProgress } from "@/hooks/useOcr";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SourcePanelProps = {
  file: File | null;
  preview: string | null;
  isProcessing: boolean;
  statusMessage: string | null;
  progress: OcrProgress | null;
  isDragActive: boolean;
  onClear: () => void;
  onBrowse: () => void;
  onCancel: () => void;
};

/** Left column: upload dropzone, file info, preview, and processing status. */
export function SourcePanel({
  file,
  preview,
  isProcessing,
  statusMessage,
  progress,
  isDragActive,
  onClear,
  onBrowse,
  onCancel,
}: SourcePanelProps) {
  const mimeType = file ? inferMimeType(file.name, file.type) : "";
  const progressPercent = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-4 min-h-[400px] lg:min-h-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-cursor-terminal font-mono uppercase tracking-wider">
          Source
        </h2>
        {file && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
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
                PNG, JPG, WebP or PDF (larger files are prepared automatically)
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBrowse();
                }}
                className="px-4 py-2 rounded-lg border border-cursor-border bg-cursor-surface hover:bg-cursor-bg hover:border-cursor-muted text-sm text-cursor-text transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/60"
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
              {isImageMime(mimeType) ? (
                <ImageIcon className="w-4 h-4 text-cursor-muted" />
              ) : (
                <FileIcon className="w-4 h-4 text-cursor-muted" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-cursor-text font-medium truncate">
                {file.name}
              </p>
              <p className="text-xs text-cursor-muted">
                {formatFileSize(file.size)}
              </p>
            </div>
            {!isProcessing && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBrowse();
                }}
                className="flex-shrink-0 text-xs text-cursor-muted hover:text-cursor-text transition-colors px-2.5 py-1 rounded-md border border-cursor-border hover:border-cursor-muted"
              >
                Replace
              </button>
            )}
          </div>

          {/* Image preview */}
          {preview && (
            <div className="flex-1 bg-cursor-surface border border-cursor-border rounded-xl overflow-hidden min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Preview"
                loading="lazy"
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* PDF placeholder */}
          {!preview && isPdfMime(mimeType) && (
            <div className="flex-1 bg-cursor-surface border border-cursor-border rounded-xl flex items-center justify-center min-h-[160px]">
              <div className="text-center">
                <FileText className="w-14 h-14 text-cursor-muted mx-auto mb-2" />
                <p className="text-sm text-cursor-muted">PDF Document</p>
              </div>
            </div>
          )}

          {/* Processing status + progress */}
          {isProcessing && (
            <div
              className="bg-cursor-surface border border-lime-500/30 rounded-xl p-4"
              aria-live="polite"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-lime-300 text-sm font-medium">
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span className="truncate">
                    {statusMessage || "Processing..."}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel();
                  }}
                  className="flex-shrink-0 text-xs text-cursor-muted hover:text-red-400 transition-colors px-2 py-0.5 ml-2 rounded border border-cursor-border hover:border-red-500/50"
                >
                  Cancel
                </button>
              </div>
              {progress && (
                <div>
                  <div className="flex justify-between text-xs text-cursor-muted mb-1.5">
                    <span>
                      Chunk {progress.current}/{progress.total}
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div
                    className="h-1.5 bg-cursor-bg rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full bg-lime-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
