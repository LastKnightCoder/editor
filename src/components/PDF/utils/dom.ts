import { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";

export const findOrCreateHighlightLayer = (pageNum: number, viewer: PDFViewer) => {
  const { textLayer } = viewer.getPageView(pageNum - 1);
  if (!textLayer) return null;
  const { div } = textLayer;
  let highlightLayer = div.querySelector('.pdf-highlight-layer');
  if (!highlightLayer) {
    highlightLayer = document.createElement('div');
    highlightLayer.className = 'pdf-highlight-layer';
    div.appendChild(highlightLayer);
  }
  return highlightLayer;
}
