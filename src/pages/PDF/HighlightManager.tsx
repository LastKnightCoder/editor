import { PDFDocumentProxy } from "pdfjs-dist";
import { PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import ReactDOM from "react-dom/client";
import { HighlightLayer, Highlight } from './types.ts';

import HighlightNode from "./HighlightNode";
import For from "@/components/For";

class HighlightManager {
  pdfDocument: PDFDocumentProxy;
  viewer: PDFViewer;
  highlights: Map<number, Array<Highlight>>;
  highlightLayers: Map<number, HighlightLayer>;

  constructor(pdfDocument: PDFDocumentProxy, viewer: PDFViewer) {
    this.pdfDocument = pdfDocument;
    this.viewer = viewer;
    const numPages = this.pdfDocument.numPages;
    this.highlights = new Map();
    for (let i = 1; i <= numPages; i++) {
      this.highlights.set(i, []);
    }
    this.highlightLayers = new Map();
    this.mount();
  }

  private mount() {
    this.viewer.eventBus.on('textlayerrendered', this.handleTextLayerRendered.bind(this))
  }

  unmount() {
    this.viewer.eventBus.off('textlayerrendered', this.handleTextLayerRendered.bind(this))
  }

  getPageRect(pageNumber: number): DOMRect | null {
    const page = this.viewer.getPageView(pageNumber - 1);
    if (!page) return null;
    const { textLayer } = page;
    if (!textLayer) return null;
    const { div: textLayerEle } = textLayer;
    if (!textLayerEle) return null;
    const pageEle = (textLayerEle as HTMLElement).closest('.page') as HTMLElement | null;
    if (!pageEle) return null;
    return pageEle.getBoundingClientRect();
  }

  private handleTextLayerRendered() {
    const numPages = this.pdfDocument.numPages;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const highlightLayer = this.highlightLayers.get(pageNum);
      if (!highlightLayer) {
        const highlightLayerContainer = document.createElement('div');
        highlightLayerContainer.className = 'pdf-highlight-layer';
        const pageElement = document.querySelector(`.pdfViewer .page[data-page-number="${pageNum}"]`);
        if (!pageElement) {
          continue;
        }
        pageElement.appendChild(highlightLayerContainer);
        this.highlightLayers.set(pageNum, {
          pageNumber: pageNum,
          root: ReactDOM.createRoot(highlightLayerContainer),
          container: highlightLayerContainer,
        });
      }
    }
  }

  addHighlight(pageNumber: number, highlight: Highlight) {
    const highlights = this.highlights.get(pageNumber);
    if (highlights) {
      highlights.push(highlight);
    }
  }

  removeHighlight(pageNumber: number, highlightId: string) {
    const highlights = this.highlights.get(pageNumber);
    if (highlights) {
      const index = highlights.findIndex((highlight) => highlight.id === highlightId);
      if (index !== -1) {
        highlights.splice(index, 1);
      }
    }
  }

  updateHighlight(pageNumber: number, highlightId: string, highlight: Highlight) {
    const highlights = this.highlights.get(pageNumber);
    if (highlights) {
      const index = highlights.findIndex((highlight) => highlight.id === highlightId);
      if (index !== -1) {
        highlights[index] = highlight;
      }
    }
  }

  setTextLayerSelectable(selectable: boolean) {
    this.viewer.viewer?.classList.toggle('disable-selection', !selectable);
  }

  getHighlights(pageNumber: number): Array<Highlight> {
    return this.highlights.get(pageNumber) || [];
  }

  getHighLightById(pageNumber: number, highlightId: string): Highlight | undefined {
    const highlights = this.highlights.get(pageNumber);
    if (highlights) {
      return highlights.find((highlight) => highlight.id === highlightId);
    }
    return undefined;
  }

  renderHighlights(pageNumber: number) {
    const highlights = this.highlights.get(pageNumber);
    if (!highlights) return;
    const highlightLayer = this.highlightLayers.get(pageNumber);
    if (!highlightLayer) return;
    const { root } = highlightLayer;
    root.render((
      <For
        data={highlights}
        renderItem={highlight => (
          <HighlightNode
            highlight={highlight}
            key={highlight.id}
            onHighlightChange={(highlight) => {
              this.updateHighlight(pageNumber, highlight.id, highlight);
              this.renderHighlights(pageNumber);
            }}
            onRemoveHighlight={() => {
              this.removeHighlight(pageNumber, highlight.id);
              this.renderHighlights(pageNumber);
            }}
          />
        )}
      />
    ))
  }
}

export default HighlightManager;