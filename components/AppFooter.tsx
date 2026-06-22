/** Bottom bar with Z.AI attribution and supported formats. */
export function AppFooter() {
  return (
    <footer className="flex-shrink-0 border-t border-cursor-border py-3">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <p className="text-xs text-cursor-muted">
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
        <p className="hidden sm:block text-xs text-cursor-muted">
          PNG · JPG · WebP · PDF
        </p>
      </div>
    </footer>
  );
}
