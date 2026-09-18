import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import './index.css';
import App from './App.tsx';

// Browser-only. The parser stays environment-neutral so the same code runs under Node
// in the tests, where pdfjs needs no worker.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
