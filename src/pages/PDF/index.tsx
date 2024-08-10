import { useEffect, useRef } from "react";
import * as pdfjs from 'pdfjs-dist';
import * as pdfjsViewer from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
import HighlightManager from "./HighlightManager.tsx";
import AreaSelect from "./AreaSelect";
import useMouseSelection from './useMouseSelection.ts';
import { optimizeClientRects, transformToRelativeRect, transformToPercentRect, transformToRelativePercentRect } from './utils';
import { v4 as getUUid } from 'uuid';
import './index.css';
import { EHighlightColor, EHighlightTextStyle, EHighlightType } from "./constants";
import { useMemoizedFn } from "ahooks";
import { Rect } from "./types.ts";

const PDFDemo = () => {
  const highlightManager = useRef<HighlightManager | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const onAreaSelectStart = useMemoizedFn(() => {
    highlightManager.current?.setTextLayerSelectable(false);
  });

  const onAreaSelectEnd = useMemoizedFn((rect: Rect, pageNum) => {
    highlightManager.current?.setTextLayerSelectable(true);

    if (highlightManager.current) {
      const pageRect = highlightManager.current.getPageRect(pageNum);
      if (!pageRect) return;
      highlightManager.current.addHighlight(pageNum, {
        boundingClientRect: {
          ...transformToRelativePercentRect(rect, pageRect),
          pageNum,
        },
        rects: [],
        color: EHighlightColor.Red,
        highlightTextStyle: EHighlightTextStyle.Highlight,
        id: getUUid(),
        type: EHighlightType.Area,
        pageNumber: pageNum,
        notes: [],
      });
      highlightManager.current.renderHighlights(pageNum);
    }
  });

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
        if (startPage && endPage && boundClientRect.width > 1 && boundClientRect.height > 1 && startPage.dataset.pageNumber === endPage.dataset.pageNumber) {
          const pageNum = Number(startPage.dataset.pageNumber);
          const rects = range.getClientRects();
          const boundClientRect = range.getBoundingClientRect()
          const pageRect = startPage.getBoundingClientRect();
          let relativeRects: any[] = Array.from(rects).map(rect => {
            return {
              ...transformToRelativeRect(rect, pageRect),
              pageNum,
            }
          }).filter(rect=> rect.width > 0);
          relativeRects = optimizeClientRects(relativeRects);
          relativeRects = relativeRects.map(rect => ({
            ...transformToPercentRect(rect, pageRect),
            pageNum,
          }));
          if (highlightManager.current) {
            highlightManager.current.addHighlight(pageNum, {
              boundingClientRect: {
                ...transformToRelativePercentRect(boundClientRect, pageRect),
                pageNum,
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
      <AreaSelect
        onSelectStart={onAreaSelectStart}
        onSelectFinish={onAreaSelectEnd}
      />
    </div>
  )
}

export default PDFDemo