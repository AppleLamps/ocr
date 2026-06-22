import { useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  Download,
  Copy,
  Check,
  RefreshCw,
  Eye,
  Code,
  ListTree,
  Image,
  FileText,
  Table2,
  Sigma,
} from "lucide-react";
import type { LayoutDetail } from "@/lib/ocr-fetch";

export type ViewMode = "raw" | "preview" | "structured";

const LAYOUT_LABEL_ICONS: Record<string, React.ReactNode> = {
  text: <FileText className="w-3.5 h-3.5" />,
  table: <Table2 className="w-3.5 h-3.5" />,
  formula: <Sigma className="w-3.5 h-3.5" />,
  image: <Image className="w-3.5 h-3.5" />,
};

const LAYOUT_LABEL_NAMES: Record<string, string> = {
  text: "Text",
  table: "Table",
  formula: "Formula",
  image: "Image",
};

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
  layoutDetails: LayoutDetail[] | null;
};

/** Right column: extracted-text editor, raw/preview/structured toggle, and error banner. */
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
  layoutDetails,
}: OutputPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = text.length;
  const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const baseName = fileName ? fileName.replace(/\.[^/.]+$/, "") : null;

  const hasLayout = layoutDetails && layoutDetails.length > 0;

  const isToolbarVisible = Boolean(text) || (hasLayout && viewMode === "structured");

  return (
    <div className="flex flex-col gap-4 min-h-[400px] lg:min-h-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-cursor-text uppercase tracking-wide">
          Output
        </h2>
      </div>

      {/* Editor container */}
      <div className="flex-1 min-h-0 bg-cursor-surface border border-cursor-border rounded-xl overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="bg-cursor-bg/50 border-b border-cursor-border px-3 py-2 flex items-center justify-between gap-3 flex-shrink-0">
          <span className="text-sm font-mono text-cursor-terminal truncate">
            {viewMode === "structured"
              ? baseName
                ? `${baseName}.layout`
                : "layout.json"
              : baseName
              ? `${baseName}.md`
              : "output.md"}
          </span>
          {isToolbarVisible && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Raw / Preview / Structured toggle */}
              <div className="flex items-center rounded-lg border border-cursor-border overflow-hidden">
                <button
                  onClick={() => onViewModeChange("raw")}
                  className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${
                    viewMode === "raw"
                      ? "bg-cursor-surface text-cursor-text"
                      : "text-cursor-muted hover:text-cursor-text"
                  }`}
                  aria-label="Raw markdown view"
                  aria-pressed={viewMode === "raw"}
                >
                  <Code className="w-3.5 h-3.5" />
                  Raw
                </button>
                <button
                  onClick={() => onViewModeChange("preview")}
                  className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${
                    viewMode === "preview"
                      ? "bg-cursor-surface text-cursor-text"
                      : "text-cursor-muted hover:text-cursor-text"
                  }`}
                  aria-label="Rendered preview"
                  aria-pressed={viewMode === "preview"}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </button>
                {hasLayout && (
                  <button
                    onClick={() => onViewModeChange("structured")}
                    className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${
                      viewMode === "structured"
                        ? "bg-cursor-surface text-cursor-text"
                        : "text-cursor-muted hover:text-cursor-text"
                    }`}
                    aria-label="Structured layout view"
                    aria-pressed={viewMode === "structured"}
                  >
                    <ListTree className="w-3.5 h-3.5" />
                    Struct
                  </button>
                )}
              </div>

              <button
                onClick={onCopy}
                className="btn btn-tertiary"
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
                className="btn btn-tertiary"
                aria-label="Download as Markdown"
              >
                <Download className="w-4 h-4" />
                <span className="text-xs">Download</span>
              </button>
            </div>
          )}
        </div>

        {/* Editor body */}
        <div className="flex-1 overflow-hidden min-h-0">
          {viewMode === "structured" && hasLayout ? (
            <div className="p-4 h-full overflow-y-auto bg-cursor-bg/20">
              {renderStructuredView(layoutDetails)}
            </div>
          ) : viewMode === "raw" || !text ? (
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
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
              >
                {text}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="bg-cursor-bg/50 border-t border-cursor-border px-4 py-2 flex items-center justify-between text-xs flex-shrink-0">
          <span className="text-cursor-terminal">
            {viewMode === "structured" ? "Layout" : "Markdown"}
            {hasLayout && viewMode !== "structured"
              ? ` (${layoutDetails.length} elements)`
              : ""}
          </span>
          <span className="text-cursor-muted">
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
              className="btn btn-secondary"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FormulaBlock({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(content.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `<code>${content}</code>`;
    }
  }, [content]);

  return (
    <div
      className="overflow-x-auto py-1"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderStructuredView(details: LayoutDetail[]) {
  // Group elements by label type
  const groups = new Map<string, LayoutDetail[]>();
  for (const el of details) {
    const list = groups.get(el.label) || [];
    list.push(el);
    groups.set(el.label, list);
  }

  const sortedLabels = ["text", "table", "formula", "image"].filter((l) =>
    groups.has(l)
  );
  // Append any unknown labels
  for (const label of Array.from(groups.keys())) {
    if (!sortedLabels.includes(label)) sortedLabels.push(label);
  }

  const total = details.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-cursor-muted">
          {total} layout element{total !== 1 ? "s" : ""}
        </span>
        {sortedLabels.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cursor-surface border border-cursor-border text-xs text-cursor-muted"
          >
            {LAYOUT_LABEL_ICONS[label]}
            <span>{LAYOUT_LABEL_NAMES[label] ?? label}</span>
            <span className="text-cursor-terminal">{groups.get(label)?.length}</span>
          </span>
        ))}
      </div>

      {sortedLabels.map((label) => {
        const elements = groups.get(label)!;
        return (
          <section key={label}>
            <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-cursor-muted">
              {LAYOUT_LABEL_ICONS[label] ?? null}
              <span>{LAYOUT_LABEL_NAMES[label] ?? label}</span>
              <span className="text-cursor-terminal">
                ({elements.length})
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {elements.map((el) => (
                <div
                  key={el.index}
                  className="bg-cursor-bg/50 border border-cursor-border rounded-lg p-3 text-sm card-hover"
                >
                  {el.label === "table" ? (
                    <div
                      className="[&_table]:w-full [&_table]:text-xs [&_th]:border [&_th]:border-cursor-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-cursor-terminal [&_td]:border [&_td]:border-cursor-border [&_td]:px-2 [&_td]:py-1"
                      dangerouslySetInnerHTML={{ __html: el.content }}
                    />
                  ) : el.label === "formula" ? (
                    <FormulaBlock content={el.content} />
                  ) : el.label === "image" ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-cursor-muted text-xs">Image URL:</span>
                      <code className="text-cursor-terminal text-xs break-all bg-cursor-surface px-2 py-1 rounded">
                        {el.content}
                      </code>
                    </div>
                  ) : (
                    <p className="text-cursor-text whitespace-pre-wrap leading-relaxed">
                      {el.content}
                    </p>
                  )}
                  <div className="mt-1.5 flex gap-3 text-xs text-cursor-muted font-mono">
                    <span>#{el.index}</span>
                    {el.width > 0 && el.height > 0 && (
                      <span>
                        {el.width}×{el.height}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
