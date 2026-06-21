import { Zap } from "lucide-react";

/** Top bar: logo, title, model badge, and attribution link. */
export function AppHeader() {
  return (
    <header className="flex-shrink-0 border-b border-cursor-border bg-cursor-surface/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="https://z.ai/model-api"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
  );
}
