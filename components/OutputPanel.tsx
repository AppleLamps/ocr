import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Download, Copy, Check, RefreshCw, Eye, Code } from "lucide-react";

export type ViewMode = "raw" | "preview";

type OutputPanelProps = {
  text: string;
  onTextChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  copied: boolean;
  onCopy: () => void;
  onDownload: () => void;
  fileName: string | null;
  isProcessing: boolean;
  hasFile: boolean;
  error: string | null;
  onRetry: () => void;
};

/** Right column: extracted-text editor, raw/preview toggle, and error banner. */
export function OutputPanel({
  text,
  onTextChange,
  viewMode,
  onViewModeChange,
  copied,
  onCopy,
  onDownload,
  fileName,
  isProcessing,
  hasFile,
  error,
  onRetry,
}: OutputPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = text.length;
  const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const baseName = fileName ? fileName.replace(/\.[^/.]+$/, "") : null;

  return (
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
                  onClick={() => onViewModeChange("raw")}
                  className={`px-2.5 py-1 text-xs font-mono flex items-center gap-1 transition-colors ${
                    viewMode === "raw"
                      ? "bg-cursor-surface text-cursor-text"
                      : "text-cursor-muted hover:text-cursor-text"
                  }`}
                  aria-label="Raw markdown view"
                  aria-pressed={viewMode === "raw"}
                >
                  <Code className="w-3 h-3" />
                  Raw
                </button>
                <button
                  onClick={() => onViewModeChange("preview")}
                  className={`px-2.5 py-1 text-xs font-mono flex items-center gap-1 transition-colors ${
                    viewMode === "preview"
                      ? "bg-cursor-surface text-cursor-text"
                      : "text-cursor-muted hover:text-cursor-text"
                  }`}
                  aria-label="Rendered preview"
                  aria-pressed={viewMode === "preview"}
                >
                  <Eye className="w-3 h-3" />
                  Preview
                </button>
              </div>

              <button
                onClick={onCopy}
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
                onClick={onDownload}
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
            {baseName ? `${baseName}.md` : "output.md"}
          </span>
        </div>

        {/* Editor body */}
        <div className="flex-1 overflow-hidden min-h-0">
          {viewMode === "raw" || !text ? (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              aria-label="Extracted text"
              placeholder={
                isProcessing
                  ? "Extracting text…"
                  : !hasFile
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
        <div
          className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start justify-between gap-3 fade-in"
          role="alert"
        >
          <p className="text-red-400 text-sm flex-1">{error}</p>
          {hasFile && !isProcessing && !error.includes("cancelled") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="flex-shrink-0 flex items-center gap-1 text-xs text-cursor-muted hover:text-cursor-text transition-colors px-2 py-1 rounded border border-cursor-border hover:border-cursor-muted"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
