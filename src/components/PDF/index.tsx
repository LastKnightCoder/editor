import React, { useEffect, useRef, useState } from "react";
import * as pdfjs from 'pdfjs-dist';
import * as pdfjsViewer from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
import { addPdfHighlight, getPdfHighlights  } from '@/commands';
import HighlightManager from "./HighlightManager.tsx";
import AreaSelect from "./AreaSelect";
import useMouseSelection from './useMouseSelection.ts';
import { optimizeClientRects, transformToRelativeRect, transformToPercentRect, transformToRelativePercentRect } from './utils';
import './index.css';
import {
  EHighlightColor,
  EHighlightTextStyle,
  EHighlightType,
  Rect,
  Pdf,
  RectPercentWithPageNumber
} from "@/types";
import { remoteResourceToLocal } from '@/utils';
import { useMemoizedFn } from "ahooks";
import { Flex, message, Spin, Result, Button } from "antd";
import { ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import If from "@/components/If";
import { convertFileSrc } from "@tauri-apps/api/tauri";

interface PDFViewerProps {
  pdf: Pdf;
  className?: string;
  style?: React.CSSProperties;
}

enum PAGE_STATUS {
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error'
}

const PDFViewer = (props: PDFViewerProps) => {
  const { pdf, className, style = {} } = props;

  const [pdfLoadingStatus, setPdfLoadingStatus] = useState(PAGE_STATUS.LOADING);
  const highlightManager = useRef<HighlightManager | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [currentScale, setCurrentScale] = useState(1);

  const onAreaSelectStart = useMemoizedFn(() => {
    highlightManager.current?.setTextLayerSelectable(false);
  });

  const onAreaSelectEnd = useMemoizedFn((rect: Rect, pageNum) => {
    if (!highlightManager.current) return;

    highlightManager.current.setTextLayerSelectable(true);
    const pageRect = highlightManager.current.getPageRect(pageNum);
    if (!pageRect) return;

    addPdfHighlight({
      pdfId: pdf.id,
      boundingClientRect: {
        ...transformToRelativePercentRect(rect, pageRect),
        pageNum,
      },
      rects: [] as RectPercentWithPageNumber[],
      color: EHighlightColor.Red,
      highlightTextStyle: EHighlightTextStyle.Highlight,
      highlightType: EHighlightType.Area,
      pageNum,
      notes: [],
      content: '',
      image: ''
    }).then((highlight) => {
      if (!highlightManager.current) return;
      const layer = highlightManager.current.getOrCreateHighlightLayer(pageNum);
      if (!layer) {
        message.error('高亮层初始化失败，添加高亮失败');
      }
      highlightManager.current.addHighlight(pageNum, highlight);
      highlightManager.current.renderHighlights(pageNum);
    });
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
          addPdfHighlight({
            boundingClientRect: {
              ...transformToRelativePercentRect(boundClientRect, pageRect),
              pageNum,
            },
            pdfId: pdf.id,
            rects: relativeRects,
            color: EHighlightColor.Pink,
            highlightTextStyle: EHighlightTextStyle.Highlight,
            highlightType: EHighlightType.Text,
            pageNum,
            notes: [],
            content: '',
            image: ''
          }).then((highlight) => {
            if (!highlightManager.current) return;
            const layer = highlightManager.current.getOrCreateHighlightLayer(pageNum);
            if (!layer) {
              message.error('高亮层初始化失败，添加高亮失败');
            }
            highlightManager.current.addHighlight(pageNum, highlight);
            highlightManager.current.renderHighlights(pageNum);
          });
        }
      }
    }
  });
  
  const loadArrayBuffer = useMemoizedFn(async (isLocal: boolean, filePath: string, remoteUrl) => {
    if (isLocal) {
      return convertFileSrc(filePath);
    } else {
      // 先下载到本地，提升加载性能
      const remoteToLocal = await remoteResourceToLocal(remoteUrl);
      return convertFileSrc(remoteToLocal);
    }
  });
  
  const handleLoadPdf = useMemoizedFn((pdf: Pdf) => {
    const { id, isLocal, filePath, remoteUrl } = pdf;
    Promise.all([loadArrayBuffer(isLocal, filePath, remoteUrl), getPdfHighlights(id)]).then(([arrayBuffer, highlights]) => {
      pdfjs.getDocument(arrayBuffer).promise.then(pdf => {
        if (!pdfContainerRef.current) return;
        if (highlightManager.current) {
          highlightManager.current.unmount();
        }
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
          enableHWA: true,
        });
        linkService.setDocument(pdf);
        linkService.setViewer(viewer);
        viewer.setDocument(pdf);

        highlightManager.current = new HighlightManager(pdf, viewer, highlights);
        setPdfLoadingStatus(PAGE_STATUS.SUCCESS);
        setCurrentScale(viewer.currentScale);
      });
    }).catch(e => {
      console.error(e);
      message.error(e.message);
      setPdfLoadingStatus(PAGE_STATUS.ERROR)
    })
  })
  
  useEffect(() => {
    setPdfLoadingStatus(PAGE_STATUS.LOADING);
    handleLoadPdf(pdf);
    
    return () => {
      if (highlightManager.current) {
        highlightManager.current.unmount();
      }
    }
  }, [handleLoadPdf, pdf]);

  return (
    <>
      <div className={className} style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflowY: 'auto',
        ...style
      }} ref={pdfContainerRef}>
        <div className={'pdfViewer'}></div>
        <AreaSelect
          onSelectStart={onAreaSelectStart}
          onSelectFinish={onAreaSelectEnd}
        />
        <If condition={pdfLoadingStatus === PAGE_STATUS.LOADING}>
          <Spin
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
            spinning={PAGE_STATUS.LOADING === pdfLoadingStatus}
          />
        </If>
      </div>
      <If condition={pdfLoadingStatus === PAGE_STATUS.SUCCESS}>
        <Flex
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            height: 40,
            boxSizing: 'border-box',
            borderRadius: 8,
            bottom: 60,
            zIndex: 3,
            background: 'rgba(0, 0, 0, 0.5)',
            color: '#fff',
            padding: 8,
          }}
          gap={"middle"}
          align={"center"}
        >
          <ZoomInOutlined onClick={() => {
            if (!highlightManager.current) return;
            const currentScale = highlightManager.current.viewer.currentScale;
            highlightManager.current.viewer.currentScaleValue = String((currentScale * 1.1).toFixed(2));
            setCurrentScale(highlightManager.current.viewer.currentScale);
          }}/>
          <div style={{ height: 24, lineHeight: '24px', fontSize: 16, userSelect: 'none' }}>{currentScale.toFixed(2)}</div>
          <ZoomOutOutlined onClick={() => {
            if (!highlightManager.current) return;
            const currentScale = highlightManager.current.viewer.currentScale;
            highlightManager.current.viewer.currentScaleValue = String((currentScale / 1.1).toFixed(2));
            setCurrentScale(highlightManager.current.viewer.currentScale);
          }}/>
        </Flex>
      </If>
      <If condition={pdfLoadingStatus === PAGE_STATUS.ERROR}>
        <Result
          status={'error'}
          title={'PDF 加载失败'}
          subTitle={'请检查网络连接，或者尝试重新加载'}
          extra={(
            <Button type="primary" onClick={() => {
              setPdfLoadingStatus(PAGE_STATUS.LOADING);
              handleLoadPdf(pdf);
            }}>重新加载</Button>
          )}
        />
      </If>
    </>

  )
}

export default PDFViewer;