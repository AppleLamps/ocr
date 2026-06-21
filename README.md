# OCR Studio

A beautiful, Cursor-inspired OCR web application powered by Z.AI's GLM-OCR.

## Features

- Upload images (PNG, JPG, WebP) or PDFs
- Extract text using state-of-the-art OCR
- Edit extracted text in a code editor-style interface
- Download results as Markdown
- Copy to clipboard

## File Limits and Edge Cases

GLM-OCR accepts single image files up to 10MB and PDF files up to 50MB (max 100 pages per API request).

This app handles common edge cases automatically:

- **Oversized images** — compressed to JPEG under 10MB before upload.
- **WebP** — converted to JPEG (GLM-OCR expects PNG/JPEG).
- **Large PDFs** — split into size-safe chunks (≤50MB, ≤40 pages per chunk) and processed sequentially with part markers in the output.
- **Long PDFs (>100 pages)** — chunked so each API call stays within the per-request page limit.
- **Password-protected or corrupt PDFs** — clear error messages instead of generic failures.
- **Empty OCR results** — reported explicitly when no text is detected.
- **Rate limits / transient API errors** — automatic retries with backoff (429, 5xx).
- **In-flight cancellation** — clearing the file aborts the current OCR request.
- **API timeouts** — 120s server-side timeout with a helpful error message.

Note: if a single PDF page exceeds 50MB on its own, reduce scan resolution manually.

## Security

The OCR endpoint forwards every request to Z.AI's paid API, so it is protected against casual abuse:

- **Rate limiting** — a per-IP fixed-window limiter on `/api/ocr` (defaults: 10 requests / 60s). State is in-memory, so on multi-instance / serverless deployments back it with a shared store (e.g. Vercel KV) for strict quotas.
- **Same-origin guard** — cross-origin `POST`s are rejected with `403` so other sites cannot spend your quota.
- **Security headers** — CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` are applied to every route in `next.config.js`.

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file with your Z.AI API key (see `.env.example`):
   ```
   ZAI_API_KEY=your-api-key-here
   ```
   Optional rate-limit overrides:
   ```
   OCR_RATE_LIMIT_MAX=10
   OCR_RATE_LIMIT_WINDOW_MS=60000
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Testing

Unit tests (Vitest) cover the shared OCR helpers and the rate limiter:

```bash
npm test          # run once
npm run test:watch
```

## Deploy to Vercel

1. Push your code to GitHub
2. Import the project to Vercel
3. Add the `ZAI_API_KEY` environment variable in Vercel settings
4. Deploy

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- Z.AI GLM-OCR API
