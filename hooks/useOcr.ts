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
  loadPdfPageCount,
  prepareImageForOcr,
  splitPdfForOcr,
} from "@/lib/ocr-client";
import { submitFileToOcr } from "@/lib/ocr-fetch";

export type OcrProgress = { current: number; total: number };

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
  const abortRef = useRef<AbortController | null>(null);

  const process = useCallback(async (fileToProcess: File | null) => {
    if (!fileToProcess) return;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setIsProcessing(true);
    setStatusMessage("Preparing file...");
    setProgress(null);
    setError(null);

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
        const imageText = await submitFileToOcr(preparedImage, {
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;
        setText(imageText);
        return;
      }

      if (isPdfMime(mimeType)) {
        const pageCount = await loadPdfPageCount(fileToProcess);
        if (abortController.signal.aborted) return;

        const fitsSingleRequest =
          fileToProcess.size <= OCR_PDF_LIMIT_BYTES &&
          pageCount <= OCR_PDF_PAGE_LIMIT;

        if (fitsSingleRequest) {
          setStatusMessage("Processing PDF...");
          const pdfText = await submitFileToOcr(fileToProcess, {
            signal: abortController.signal,
          });
          if (abortController.signal.aborted) return;
          setText(pdfText);
          return;
        }

        setStatusMessage("Splitting PDF into chunks...");
        const { chunks, pageCount: totalPages } =
          await splitPdfForOcr(fileToProcess);
        if (abortController.signal.aborted) return;

        if (totalPages > OCR_PDF_PAGE_LIMIT) {
          setStatusMessage(
            `Processing ${chunks.length} chunks (${totalPages} pages)...`
          );
        }

        setProgress({ current: 0, total: chunks.length });

        const chunkTexts: string[] = [];
        for (let i = 0; i < chunks.length; i += 1) {
          if (abortController.signal.aborted) return;
          setProgress({ current: i + 1, total: chunks.length });
          setStatusMessage(`Processing chunk ${i + 1} of ${chunks.length}...`);
          const chunkText = await submitFileToOcr(chunks[i], {
            signal: abortController.signal,
          });
          chunkTexts.push(chunkText);
        }

        if (abortController.signal.aborted) return;
        setText(
          chunkTexts
            .filter(Boolean)
            .map((part, index) =>
              chunks.length > 1 ? `<!-- Part ${index + 1} -->\n\n${part}` : part
            )
            .join("\n\n")
        );
        return;
      }

      throw new Error("Unsupported file type. Please upload an image or PDF.");
    } catch (err) {
      if (abortController.signal.aborted) return;
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null;
      }
      setIsProcessing(false);
      setStatusMessage(null);
      setProgress(null);
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
  }, []);

  return {
    text,
    setText,
    isProcessing,
    statusMessage,
    error,
    setError,
    progress,
    process,
    cancel,
    reset,
  };
}
