"use client";

import { useCallback, useRef, useState } from "react";
import {
  inferMimeType,
  isImageMime,
  isPdfMime,
  isSupportedOcrMime,
  OCR_PDF_LIMIT_BYTES,
  OCR_PDF_PAGE_LIMIT,
} from "@/lib/ocr";
import {
  cropImageRegion,
  loadPdfPageCount,
  prepareImageForOcr,
  splitPdfForOcr,
} from "@/lib/ocr-client";
import {
  findUncoveredMarginZones,
  flattenLayoutDetails,
  hasMainBodyContent,
  mergeGapRecoveryText,
  stripOcrImagePlaceholders,
} from "@/lib/gap-detection";
import { submitFileToOcr, type LayoutDetail } from "@/lib/ocr-fetch";
import { mapWithConcurrency } from "@/lib/concurrency";

export type OcrProgress = { current: number; total: number };

// How many chunk requests run at once. Kept modest so a multi-chunk PDF does
// not burst past the API/rate-limit budget while still cutting wall-clock time.
const OCR_CHUNK_CONCURRENCY = 4;

async function recoverImageMarginGaps(
  preparedImage: File,
  primaryText: string,
  layoutDetails: LayoutDetail[] | null,
  options: { signal?: AbortSignal; onStatus?: (message: string) => void }
): Promise<string> {
  const flatDetails = flattenLayoutDetails(layoutDetails);
  if (!flatDetails.length || !hasMainBodyContent(flatDetails)) {
    return primaryText;
  }

  const gaps = findUncoveredMarginZones(flatDetails);
  if (!gaps.length) {
    return primaryText;
  }

  options.onStatus?.("Recovering missed text...");

  const recoveredTexts: string[] = [];
  for (const gap of gaps) {
    if (options.signal?.aborted) {
      throw new Error("OCR cancelled");
    }

    const crop = await cropImageRegion(preparedImage, gap);
    const gapResult = await submitFileToOcr(crop, { signal: options.signal });
    const cleaned = stripOcrImagePlaceholders(gapResult.text);
    if (cleaned) {
      recoveredTexts.push(cleaned);
    }
  }

  if (!recoveredTexts.length) {
    return primaryText;
  }

  return mergeGapRecoveryText(primaryText, recoveredTexts);
}

/**
 * Owns the OCR pipeline: file preparation, single vs. chunked requests,
 * progress, cancellation, and error/result state. Keeping this out of the
 * view component makes the orchestration logic testable and the UI thin.
 */
export function useOcr() {
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [layoutDetails, setLayoutDetails] = useState<LayoutDetail[] | null>(null);
  const [layoutVisualization, setLayoutVisualization] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const process = useCallback(
    async (
      fileToProcess: File | null,
      pageRange?: { start: number; end: number }
    ) => {
    if (!fileToProcess) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setIsProcessing(true);
    setStatusMessage("Preparing file...");
    setProgress(null);
    setError(null);
    setLayoutDetails(null);
    setLayoutVisualization(null);

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
        const result = await submitFileToOcr(preparedImage, {
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;

        const textWithGaps = await recoverImageMarginGaps(
          preparedImage,
          result.text,
          result.layoutDetails,
          {
            signal: abortController.signal,
            onStatus: setStatusMessage,
          }
        );
        if (abortController.signal.aborted) return;

        setText(textWithGaps);
        setLayoutDetails(result.layoutDetails);
        setLayoutVisualization(result.layoutVisualization);
        return;
      }

      if (isPdfMime(mimeType)) {
        const pageCount = await loadPdfPageCount(fileToProcess);
        if (abortController.signal.aborted) return;

        const effectivePageCount = pageRange
          ? pageRange.end - pageRange.start + 1
          : pageCount;

        const fitsSingleRequest =
          fileToProcess.size <= OCR_PDF_LIMIT_BYTES &&
          effectivePageCount <= OCR_PDF_PAGE_LIMIT;

        if (fitsSingleRequest) {
          const rangeDesc = pageRange
            ? ` (pages ${pageRange.start}–${pageRange.end} of ${pageCount})`
            : "";
          setStatusMessage(`Processing PDF${rangeDesc}...`);
          const result = await submitFileToOcr(fileToProcess, {
            signal: abortController.signal,
            pageRange,
          });
          if (abortController.signal.aborted) return;
          setText(result.text);
          setLayoutDetails(result.layoutDetails);
          setLayoutVisualization(result.layoutVisualization);
          return;
        }

        setStatusMessage("Splitting PDF into chunks...");
        const { chunks, pageCount: totalPages } = await splitPdfForOcr(
          fileToProcess,
          pageRange
        );
        if (abortController.signal.aborted) return;

        setStatusMessage(
          `Processing ${chunks.length} chunks${
            totalPages > OCR_PDF_PAGE_LIMIT ? ` (${totalPages} pages)` : ""
          }...`
        );
        setProgress({ current: 0, total: chunks.length });

        let completed = 0;
        const chunkResults = await mapWithConcurrency(
          chunks,
          OCR_CHUNK_CONCURRENCY,
          (chunk) => submitFileToOcr(chunk, { signal: abortController.signal }),
          () => {
            completed += 1;
            setProgress({ current: completed, total: chunks.length });
          }
        );

        if (abortController.signal.aborted) return;

        setText(
          chunkResults
            .map((r) => r.text)
            .filter(Boolean)
            .map((part, index) =>
              chunks.length > 1 ? `<!-- Part ${index + 1} -->\n\n${part}` : part
            )
            .join("\n\n")
        );
        setLayoutDetails(chunkResults[0]?.layoutDetails ?? null);
        setLayoutVisualization(chunkResults[0]?.layoutVisualization ?? null);
        return;
      }

      throw new Error("Unsupported file type. Please upload an image or PDF.");
    } catch (err) {
      if (abortController.signal.aborted) return;
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null;
        setIsProcessing(false);
        setStatusMessage(null);
        setProgress(null);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsProcessing(false);
    setStatusMessage(null);
    setProgress(null);
    setError("Processing cancelled.");
  }, []);

  /** Abort any in-flight work and clear all pipeline state. */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setText("");
    setStatusMessage(null);
    setError(null);
    setProgress(null);
    setLayoutDetails(null);
    setLayoutVisualization(null);
  }, []);

  return {
    text,
    setText,
    isProcessing,
    statusMessage,
    error,
    setError,
    progress,
    layoutDetails,
    layoutVisualization,
    process,
    cancel,
    reset,
  };
}
