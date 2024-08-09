import { useEffect, useRef } from "react";
import * as pdfjs from 'pdfjs-dist';
import * as pdfjsViewer from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
import HighlightManager from "./HighlightManager.tsx";
import useMouseSelection from './useMouseSelection.ts';
import optimizeClientRects from './utils/optimizeClientRects.ts';
import './index.css';
import { EHighlightColor, EHighlightTextStyle, EHighlightType } from "@/pages/PDF/constants";
import { v4 as getUUid } from 'uuid';
import PortalToBody from "@/components/PortalToBody";
import HighlightTips from './HighlightTips';

const PDFDemo = () => {
  const highlightManager = useRef<HighlightManager | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  useMouseSelection({
    onSelectEnd: () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const start = range.startContainer.parentElement;
        const end = range.endContainer.parentElement;
        const boundClientRect = range.getBoundingClientRect();
        const startPage = start?.closest('.page') as HTMLElement | null;
        const endPage = end?.closest('.page') as HTMLElement | null;
        if (startPage && endPage && boundClientRect.width > 1) {
          const pageNum = Number(startPage.dataset.pageNumber);
          const rects = range.getClientRects();
          const boundClientRect = range.getBoundingClientRect()
          const pageRect = startPage.getBoundingClientRect();
          let relativeRects: any[] = Array.from(rects).map(rect => {
            return {
              top: rect.top - pageRect.top,
              left: rect.left - pageRect.left,
              width: rect.width,
              height: rect.height,
              pageNum,
            }
          }).filter(rect=> rect.width > 0);
          relativeRects = optimizeClientRects(relativeRects);
          relativeRects = relativeRects.map(rect => ({
            top: `${rect.top / pageRect.height * 100}%`,
            left: `${rect.left / pageRect.width * 100}%`,
            width: `${rect.width / pageRect.width * 100}%`,
            height: `${rect.height / pageRect.height * 100}%`,
            pageNum,
          }));
          if (highlightManager.current) {
            highlightManager.current.addHighlight(pageNum, {
              boundingClientRect: {
                top: `${boundClientRect.top / pageRect.height * 100}%`,
                left: `${boundClientRect.left / pageRect.width * 100}%`,
                width: `${boundClientRect.width / pageRect.width * 100}%`,
                height: `${boundClientRect.height / pageRect.height * 100}%`,
              },
              rects: relativeRects,
              color: EHighlightColor.Pink,
              highlightTextStyle: EHighlightTextStyle.Highlight,
              id: getUUid(),
              type: EHighlightType.Text,
              pageNumber: pageNum,
              notes: [],
            });
            highlightManager.current.renderHighlights(pageNum);
          }
        }
      }
    }
  });
  
  useEffect(() => {
    pdfjs.getDocument('https://arxiv.org/pdf/1708.08021').promise.then(pdf => {
      if (!pdfContainerRef.current) return;
      const eventBus = new pdfjsViewer.EventBus();
      const linkService = new pdfjsViewer.PDFLinkService({
        eventBus,
        externalLinkTarget: 2,
      });
      const viewer = new pdfjsViewer.PDFViewer({
        container: pdfContainerRef.current,
        eventBus,
        linkService,
        textLayerMode: 2,
        removePageBorders: true,
      });
      linkService.setDocument(pdf);
      linkService.setViewer(viewer);
      viewer.setDocument(pdf);
      highlightManager.current = new HighlightManager(pdf, viewer);
    })
    
    return () => {
      if (highlightManager.current) {
        highlightManager.current.unmount();
      }
    }
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'white',
        overflow: 'auto'
      }}
      ref={pdfContainerRef}
    >
      <div className={'pdfViewer'}></div>
      <PortalToBody>
        <HighlightTips
          open
          highlight={{
            boundingClientRect: {
              top: '10%',
              left: '10%',
              width: '80%',
              height: '80%',
            },
            color: EHighlightColor.Purple,
            highlightTextStyle: EHighlightTextStyle.Underline,
            id: '1',
            notes: [],
            pageNumber: 1,
            rects: [
              {
                top: '10%',
                left: '10%',
                width: '80%',
                height: '80%',
              }
            ],
            type: EHighlightType.Text,
          }}
          onHighlightChange={() => {}}
          onClose={() => {}}
          removeHighlight={() => {}}
          style={{
            position: 'fixed',
            left: 100,
            top: 100,
            zIndex: 3
          }}
        />
      </PortalToBody>
    </div>
  )
}

export default PDFDemo