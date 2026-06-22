import { useState } from "react";
import {
  Upload,
  FileText,
  Loader2,
  X,
  File as FileIcon,
  Image as ImageIcon,
  ScanEye,
  Eye,
} from "lucide-react";
import {
  inferMimeType,
  isImageMime,
  isPdfMime,
  OCR_PDF_PAGE_LIMIT,
} from "@/lib/ocr";
import type { OcrProgress } from "@/hooks/useOcr";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clampPageRange(
  start: number,
  end: number,
  pdfPageCount: number
): { start: number; end: number } {
  const clampedStart = Math.max(1, Math.min(start, pdfPageCount));
  const clampedEnd = Math.max(clampedStart, Math.min(end, pdfPageCount));
  const span = clampedEnd - clampedStart + 1;

  if (span > OCR_PDF_PAGE_LIMIT) {
    return {
      start: clampedEnd - OCR_PDF_PAGE_LIMIT + 1,
      end: clampedEnd,
    };
  }

  return { start: clampedStart, end: clampedEnd };
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
  layoutVisualization: string[] | null;
  pdfPageCount: number | null;
  isLoadingPdfInfo: boolean;
  pageStart: number;
  pageEnd: number;
  onPageRangeChange: (start: number, end: number) => void;
  onReprocess: () => void;
};

/** Left column: upload dropzone, file info, preview, layout visualization, page range, and processing status. */
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
  layoutVisualization,
  pdfPageCount,
  isLoadingPdfInfo,
  pageStart,
  pageEnd,
  onPageRangeChange,
  onReprocess,
}: SourcePanelProps) {
  const mimeType = file ? inferMimeType(file.name, file.type) : "";
  const progressPercent = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const [showLayout, setShowLayout] = useState(false);
  const hasLayoutViz = layoutVisualization && layoutVisualization.length > 0;
  const isPdf = isPdfMime(mimeType);

  const rangeChanged =
    isPdf &&
    pdfPageCount !== null &&
    (pageStart !== 1 || pageEnd !== Math.min(pdfPageCount, 30));

  return (
    <div className="flex flex-col gap-4 min-h-[400px] lg:min-h-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-cursor-text uppercase tracking-wide">
          Source
        </h2>
        {file && !isProcessing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="btn btn-tertiary"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {!file ? (
        /* Empty dropzone */
        <div
          className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-200 ${
            isDragActive
              ? "border-lime-500 bg-lime-500/5"
              : "border-cursor-border bg-gradient-to-b from-cursor-surface/40 to-transparent hover:border-cursor-muted"
          }`}
        >
          <div className="flex flex-col items-center gap-6 p-8 text-center max-w-sm">
            <div
              className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-200 ${
                isDragActive
                  ? "bg-lime-500/10 border-lime-500/50"
                  : "bg-cursor-surface border-cursor-border"
              }`}
            >
              <Upload
                className={`w-8 h-8 transition-colors ${
                  isDragActive ? "text-lime-400" : "text-cursor-muted"
                }`}
              />
            </div>
            <div>
              <p className="text-lg font-semibold text-cursor-text mb-1">
                {isDragActive ? "Release to upload" : "Drop a file to start"}
              </p>
              <p className="text-sm text-cursor-muted">
                PNG, JPG, WebP, or PDF. Large PDFs are split automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onBrowse();
              }}
              className="btn btn-primary"
            >
              Browse files
            </button>
            <p className="text-xs text-cursor-muted">
              Supported formats: PNG · JPG · WebP · PDF
            </p>
          </div>
        </div>
      ) : (
        /* File loaded */
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* File info */}
          <div className="bg-cursor-surface border border-cursor-border rounded-xl p-3 flex items-center gap-3 card-hover">
            <div className="w-10 h-10 rounded-lg bg-cursor-bg border border-cursor-border flex items-center justify-center flex-shrink-0">
              {isImageMime(mimeType) ? (
                <ImageIcon className="w-4 h-4 text-cursor-muted" />
              ) : (
                <FileIcon className="w-4 h-4 text-cursor-muted" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-cursor-text truncate">
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
                className="btn btn-secondary"
              >
                Replace
              </button>
            )}
          </div>

          {/* Page range */}
          {isPdf && pdfPageCount && pdfPageCount > 0 && (
            <div className="bg-cursor-surface border border-cursor-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3 card-hover">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-xs text-cursor-muted">
                  {pdfPageCount} page{pdfPageCount !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="page-start"
                    className="text-xs text-cursor-muted"
                  >
                    Pages
                  </label>
                  <input
                    id="page-start"
                    type="number"
                    min={1}
                    max={pageEnd}
                    value={pageStart}
                    onChange={(e) => {
                      const v = Math.max(1, parseInt(e.target.value) || 1);
                      const next = clampPageRange(v, Math.max(v, pageEnd), pdfPageCount);
                      onPageRangeChange(next.start, next.end);
                    }}
                    disabled={isProcessing}
                    className="w-20 px-2.5 py-1.5 text-sm bg-cursor-bg border border-cursor-border rounded-lg text-cursor-text disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-lime-500/40 focus:border-lime-500/50"
                  />
                  <span className="text-xs text-cursor-muted">–</span>
                  <input
                    id="page-end"
                    type="number"
                    min={pageStart}
                    max={pdfPageCount}
                    value={pageEnd}
                    onChange={(e) => {
                      const v = Math.min(
                        pdfPageCount,
                        Math.max(
                          pageStart,
                          parseInt(e.target.value) || pageStart
                        )
                      );
                      const next = clampPageRange(pageStart, v, pdfPageCount);
                      onPageRangeChange(next.start, next.end);
                    }}
                    disabled={isProcessing}
                    className="w-20 px-2.5 py-1.5 text-sm bg-cursor-bg border border-cursor-border rounded-lg text-cursor-text disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-lime-500/40 focus:border-lime-500/50"
                  />
                </div>
              </div>
              {rangeChanged && !isProcessing && (
                <button
                  type="button"
                  onClick={onReprocess}
                  className="btn btn-primary"
                >
                  Reprocess
                </button>
              )}
            </div>
          )}

          {/* Preview */}
          <div className="flex-1 bg-cursor-surface border border-cursor-border rounded-xl overflow-hidden min-h-0 flex flex-col">
            {/* Preview toolbar */}
            {hasLayoutViz && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-cursor-border bg-cursor-bg/50">
                <span className="text-xs text-cursor-muted">
                  {showLayout ? "Layout visualization" : "Original preview"}
                </span>
                <div className="flex items-center rounded-lg border border-cursor-border overflow-hidden">
                  <button
                    onClick={() => setShowLayout(false)}
                    className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${
                      !showLayout
                        ? "bg-cursor-surface text-cursor-text"
                        : "text-cursor-muted hover:text-cursor-text"
                    }`}
                    aria-label="Show original preview"
                    aria-pressed={!showLayout}
                  >
                    <Eye className="w-3 h-3" />
                    Original
                  </button>
                  <button
                    onClick={() => setShowLayout(true)}
                    className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${
                      showLayout
                        ? "bg-cursor-surface text-cursor-text"
                        : "text-cursor-muted hover:text-cursor-text"
                    }`}
                    aria-label="Show layout visualization"
                    aria-pressed={showLayout}
                  >
                    <ScanEye className="w-3 h-3" />
                    Layout
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 relative min-h-0 bg-cursor-bg/30">
              {preview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={
                    showLayout && hasLayoutViz
                      ? layoutVisualization[0]
                      : preview
                  }
                  alt={showLayout ? "Layout visualization" : "Preview"}
                  loading="lazy"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {showLayout && hasLayoutViz ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={layoutVisualization[0]}
                      alt="Layout visualization"
                      loading="lazy"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center">
                      {isLoadingPdfInfo ? (
                        <>
                          <div className="w-16 h-16 rounded-xl shimmer mx-auto mb-3" />
                          <p className="text-sm text-cursor-muted">
                            Loading PDF info…
                          </p>
                        </>
                      ) : (
                        <>
                          <FileText className="w-16 h-16 text-cursor-muted mx-auto mb-3" />
                          <p className="text-sm text-cursor-muted">
                            PDF Document
                          </p>
                          {pdfPageCount && (
                            <p className="text-xs text-cursor-muted mt-1">
                              {pdfPageCount} page
                              {pdfPageCount !== 1 ? "s" : ""}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Processing status */}
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
                  className="btn btn-destructive"
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
