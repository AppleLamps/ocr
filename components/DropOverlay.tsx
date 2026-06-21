import { Upload } from "lucide-react";

/** Full-page overlay shown while a file is dragged over the window. */
export function DropOverlay() {
  return (
    <div className="fixed inset-0 z-50 bg-lime-500/10 border-4 border-dashed border-lime-500/70 flex items-center justify-center pointer-events-none">
      <div className="bg-cursor-surface/95 border border-lime-500/40 rounded-2xl px-10 py-8 flex flex-col items-center gap-4 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-lime-500/10 border border-lime-500/40 flex items-center justify-center">
          <Upload className="w-8 h-8 text-lime-400" />
        </div>
        <p className="text-xl font-semibold text-lime-300">Drop to extract text</p>
        <p className="text-sm text-cursor-muted">PNG, JPG, WebP, or PDF</p>
      </div>
    </div>
  );
}
