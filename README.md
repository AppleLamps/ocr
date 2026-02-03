# OCR Studio

A beautiful, Cursor-inspired OCR web application powered by Z.AI's GLM-OCR.

## Features

- Upload images (PNG, JPG) or PDFs
- Extract text using state-of-the-art OCR
- Edit extracted text in a code editor-style interface
- Download results as Markdown
- Copy to clipboard

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file with your Z.AI API key:
   ```
   ZAI_API_KEY=your-api-key-here
   ```
4. Run the development server:
   ```bash
   npm run dev
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
