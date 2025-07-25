import { PDFDocumentProxy } from "pdfjs-dist";
import { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import ReactDOM from "react-dom/client";
import { HighlightLayer } from "./types.ts";

import HighlightNode from "./HighlightNode";
import For from "@/components/For";
import { PdfHighlight } from "@/types";
import { updatePdfHighlight, removePdfHighlight } from "@/commands";

class HighlightManager {
  pdfDocument: PDFDocumentProxy;
  viewer: PDFViewer;
  highlights: Map<number, Array<PdfHighlight>>;
  highlightLayers: Map<number, HighlightLayer>;
  handleTextLayerRendered: (event: any) => void;
  handlePageChanging: (event: any) => void;
  onHighlightUpdate?: (highlights: PdfHighlight[]) => void;

  constructor(
    pdfDocument: PDFDocumentProxy,
    viewer: PDFViewer,
    highlights: PdfHighlight[],
    onHighlightUpdate?: (highlights: PdfHighlight[]) => void,
  ) {
    this.pdfDocument = pdfDocument;
    this.viewer = viewer;
    this.onHighlightUpdate = onHighlightUpdate;
    const numPages = this.pdfDocument.numPages;
    this.highlights = new Map();
    for (let i = 1; i <= numPages; i++) {
      this.highlights.set(i, []);
    }
    highlights.forEach((highlight) => {
      // 初始化时直接添加，不触发回调
      const pageHighlights = this.highlights.get(highlight.pageNum);
      if (pageHighlights) {
        pageHighlights.push(highlight);
      }
    });
    this.handleTextLayerRendered = this._handleTextLayerRendered.bind(this);
    this.handlePageChanging = this._handlePageChanging.bind(this);
    this.highlightLayers = new Map();
    this.mount();
  }

  private mount() {
    this.viewer.eventBus.on("textlayerrendered", this.handleTextLayerRendered);
    this.viewer.eventBus.on("pagechanging", this.handlePageChanging);
  }

  unmount() {
    this.viewer.eventBus.off("textlayerrendered", this.handleTextLayerRendered);
    this.viewer.eventBus.off("pagechanging", this.handlePageChanging);
  }

  getPageRect(pageNumber: number): DOMRect | null {
    const page = this.viewer.getPageView(pageNumber - 1);
    if (!page) return null;
    const { textLayer } = page;
    if (!textLayer) return null;
    const { div: textLayerEle } = textLayer;
    if (!textLayerEle) return null;
    const pageEle = (textLayerEle as HTMLElement).closest(
      ".page",
    ) as HTMLElement | null;
    if (!pageEle) return null;
    return pageEle.getBoundingClientRect();
  }

  getOrCreateHighlightLayer(pageNumber: number): HighlightLayer | undefined {
    const highlightLayer = this.highlightLayers.get(pageNumber);
    if (!highlightLayer || !highlightLayer.container.isConnected) {
      const highlightLayerContainer = document.createElement("div");
      highlightLayerContainer.className = "pdf-highlight-layer";
      const pageElement = document.querySelector(
        `.pdfViewer .page[data-page-number="${pageNumber}"]`,
      );
      if (!pageElement) {
        console.error(`Page ${pageNumber} not found`);
        return;
      }
      pageElement.appendChild(highlightLayerContainer);
      const newHighlightLayer = {
        container: highlightLayerContainer,
        pageNumber,
        root: ReactDOM.createRoot(highlightLayerContainer),
      };
      this.highlightLayers.set(pageNumber, newHighlightLayer);
      return newHighlightLayer;
    } else {
      return highlightLayer;
    }
  }

  private _handleTextLayerRendered() {
    const numPages = this.pdfDocument.numPages;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const highlightLayer = this.highlightLayers.get(pageNum);
      if (!highlightLayer || !highlightLayer.container.isConnected) {
        const layer = this.getOrCreateHighlightLayer(pageNum);
        if (layer) {
          this.renderHighlights(pageNum);
        }
      }
    }
  }

  private _handlePageChanging(event: any) {
    const { pageNumber } = event;
    const highlightLayer = this.highlightLayers.get(pageNumber);
    if (!highlightLayer || !highlightLayer.container.isConnected) {
      const layer = this.getOrCreateHighlightLayer(pageNumber);
      if (layer) {
        this.renderHighlights(pageNumber);
      }
    }
  }

  addHighlight(pageNumber: number, highlight: PdfHighlight) {
    const highlights = this.highlights.get(pageNumber);
    if (highlights) {
      highlights.push(highlight);
      this.notifyHighlightUpdate();
    }
  }

  removeHighlight(pageNumber: number, highlightId: number) {
    const highlights = this.highlights.get(pageNumber);
    if (highlights) {
      const index = highlights.findIndex(
        (highlight) => highlight.id === highlightId,
      );
      if (index !== -1) {
        highlights.splice(index, 1);
        removePdfHighlight(highlightId).then();
        this.notifyHighlightUpdate();
      }
    }
  }

  updateHighlight(
    pageNumber: number,
    highlightId: number,
    highlight: PdfHighlight,
  ) {
    const highlights = this.highlights.get(pageNumber);
    if (highlights) {
      const index = highlights.findIndex(
        (highlight) => highlight.id === highlightId,
      );
      if (index !== -1) {
        highlights[index] = highlight;
        updatePdfHighlight(highlight).then();
        this.notifyHighlightUpdate();
      }
    }
  }

  getAllHighlights(): PdfHighlight[] {
    const allHighlights: PdfHighlight[] = [];
    for (const highlights of this.highlights.values()) {
      allHighlights.push(...highlights);
    }
    return allHighlights;
  }

  private notifyHighlightUpdate() {
    if (this.onHighlightUpdate) {
      const allHighlights = this.getAllHighlights();
      this.onHighlightUpdate(allHighlights);
    }
  }

  setTextLayerSelectable(selectable: boolean) {
    this.viewer.viewer?.classList.toggle("disable-selection", !selectable);
  }

  getHighlights(pageNumber: number): Array<PdfHighlight> {
    return this.highlights.get(pageNumber) || [];
  }

  getHighLightById(
    pageNumber: number,
    highlightId: number,
  ): PdfHighlight | undefined {
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
    root.render(
      <For
        data={highlights}
        renderItem={(highlight) => (
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
      />,
    );
  }
}

export default HighlightManager;
