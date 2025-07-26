import React, { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import * as pdfjsViewer from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import "pdfjs-dist/build/pdf.worker.min.mjs";
import { addPdfHighlight, getPdfHighlights, readBinaryFile } from "@/commands";
import HighlightManager from "./HighlightManager.tsx";
import useMouseSelection from "./useMouseSelection.ts";
import {
  transformToRelativePercentRect,
  getTextSelectionRangeFromSelection,
} from "./utils";
import { uploadResource } from "@/hooks/useUploadResource";
import "./index.css";
import {
  EHighlightColor,
  EHighlightTextStyle,
  EHighlightType,
  Pdf,
  PdfHighlight,
  Rect,
} from "@/types";
import { remoteResourceToLocal } from "@/utils";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Button, Flex, message, Result, Spin } from "antd";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import If from "@/components/If";
import classNames from "classnames";
import { AreaSelect, Sidebar as PDFSidebar } from "./components";
import html2canvas from "html2canvas";

interface PDFViewerProps {
  pdf: Pdf;
  autoFitWidth?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

enum PAGE_STATUS {
  LOADING = "loading",
  SUCCESS = "success",
  ERROR = "error",
}

const PDFViewer = (props: PDFViewerProps) => {
  const { pdf, className, style = {}, autoFitWidth = true } = props;

  const [pdfLoadingStatus, setPdfLoadingStatus] = useState(PAGE_STATUS.LOADING);
  const highlightManager = useRef<HighlightManager | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const flexContainerRef = useRef<HTMLDivElement>(null); // 获取外层flex容器的引用
  const [currentScale, setCurrentScale] = useState(1);
  const [showSidebar, setShowSidebar] = useLocalStorageState<boolean>(
    `pdf-sidebar-show`,
    { defaultValue: true },
  );
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [originalPageWidth, setOriginalPageWidth] = useState<number>(0); // 缓存原始页面宽度
  // 简单的scale计算函数：容器宽度 / PDF页面宽度
  const calculateAutoFitScale = useMemoizedFn(() => {
    if (
      !autoFitWidth ||
      !originalPageWidth ||
      !flexContainerRef.current ||
      !highlightManager.current?.viewer
    ) {
      return;
    }

    const fitPadding = 20;
    const containerWidth = flexContainerRef.current.clientWidth;
    const availableWidth = containerWidth - 2 * fitPadding;
    const scale = availableWidth / originalPageWidth;

    highlightManager.current.viewer.currentScaleValue = String(scale);
    setCurrentScale(highlightManager.current.viewer.currentScale);
  });

  const onAreaSelectStart = useMemoizedFn(() => {
    highlightManager.current?.setTextLayerSelectable(false);
  });

  const onAreaSelectEnd = useMemoizedFn(async (rect: Rect, pageNum) => {
    if (!highlightManager.current) return;

    highlightManager.current.setTextLayerSelectable(true);
    const pageRect = highlightManager.current.getPageRect(pageNum);
    if (!pageRect) return;

    // 获取区域截图
    let imageUrl = "";
    try {
      const pageElement = document.querySelector(
        `.pdfViewer .page[data-page-number="${pageNum}"]`,
      ) as HTMLElement;

      if (pageElement) {
        // 创建截图
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (ctx) {
          // 设置画布大小为选择区域大小
          canvas.width = rect.width;
          canvas.height = rect.height;

          // 使用 html2canvas 或类似库来截图选择区域
          // 这里先用一个临时的实现
          const imageBlob = await captureAreaAsBlob(pageElement, rect);
          if (imageBlob) {
            const file = new File([imageBlob], `area-${Date.now()}.png`, {
              type: "image/png",
            });
            imageUrl = (await uploadResource(file)) || "";
          }
        }
      }
    } catch (error) {
      console.error("Failed to capture area screenshot:", error);
    }

    addPdfHighlight({
      pdfId: pdf.id,
      boundingClientRect: {
        ...transformToRelativePercentRect(rect, pageRect),
        pageNum,
      },
      color: EHighlightColor.Red,
      highlightTextStyle: EHighlightTextStyle.Highlight,
      highlightType: EHighlightType.Area,
      pageNum,
      notes: [],
      content: "",
      image: imageUrl,
    }).then((highlight) => {
      if (!highlightManager.current) return;
      const layer = highlightManager.current.getOrCreateHighlightLayer(pageNum);
      if (!layer) {
        message.error("高亮层初始化失败，添加高亮失败");
      }
      highlightManager.current.addHighlight(pageNum, highlight);
      highlightManager.current.renderHighlights(pageNum);
    });
  });

  // 使用 html2canvas 实现真正的区域截图
  const captureAreaAsBlob = async (
    pageElement: HTMLElement,
    rect: Rect,
  ): Promise<Blob | null> => {
    try {
      const devicePixelRatio = window.devicePixelRatio || 1;

      // 使用 html2canvas 截图整个页面
      const canvas = await html2canvas(pageElement, {
        useCORS: true,
        allowTaint: false,
        scale: devicePixelRatio, // 考虑设备像素比，避免模糊
        backgroundColor: "#ffffff", // 设置白色背景，避免透明或红色背景
        logging: false, // 禁用日志
        removeContainer: false,
        foreignObjectRendering: false,
      });

      // 创建一个新的 canvas 来裁剪选择区域
      const croppedCanvas = document.createElement("canvas");
      const ctx = croppedCanvas.getContext("2d");

      if (!ctx) return null;

      // 设置裁剪后的 canvas 大小，考虑设备像素比
      const scaledWidth = rect.width * devicePixelRatio;
      const scaledHeight = rect.height * devicePixelRatio;
      croppedCanvas.width = scaledWidth;
      croppedCanvas.height = scaledHeight;

      // 获取页面元素的位置信息
      const pageRect = pageElement.getBoundingClientRect();

      // 计算在页面内的相对位置，考虑设备像素比
      const relativeX = (rect.left - pageRect.left) * devicePixelRatio;
      const relativeY = (rect.top - pageRect.top) * devicePixelRatio;

      // 设置高质量的图像渲染
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // 裁剪并绘制选择区域
      ctx.drawImage(
        canvas,
        relativeX,
        relativeY,
        scaledWidth,
        scaledHeight, // 源区域
        0,
        0,
        scaledWidth,
        scaledHeight, // 目标区域
      );

      // 转换为 Blob，使用高质量设置
      return new Promise((resolve) => {
        croppedCanvas.toBlob(
          (blob) => {
            resolve(blob);
          },
          "image/png",
          1.0,
        ); // 使用最高质量的 PNG
      });
    } catch (error) {
      console.error("Error capturing area with html2canvas:", error);
      return null;
    }
  };

  const [currentPageNum, setCurrentPageNum] = useLocalStorageState<number>(
    `pdf-${pdf.id}:current-page-num`,
    {
      defaultValue: 1,
    },
  );

  useMouseSelection({
    onSelectEnd: () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const start = range.startContainer.parentElement;
        const end = range.endContainer.parentElement;
        const boundClientRect = range.getBoundingClientRect();
        const startPage = start?.closest(".page") as HTMLElement | null;
        const endPage = end?.closest(".page") as HTMLElement | null;
        if (
          startPage &&
          endPage &&
          boundClientRect.width > 1 &&
          boundClientRect.height > 1 &&
          startPage.dataset.pageNumber === endPage.dataset.pageNumber
        ) {
          const pageNum = Number(startPage.dataset.pageNumber);
          const selectedText = selection
            .toString()
            .trim()
            .replaceAll("\n", " ");

          // 使用新的基于文本索引的选择方式
          const textSelection = getTextSelectionRangeFromSelection(
            startPage,
            range,
          );

          if (textSelection && selectedText) {
            // 使用文本索引方式创建标注
            addPdfHighlight({
              boundingClientRect: {
                ...transformToRelativePercentRect(
                  boundClientRect,
                  startPage.getBoundingClientRect(),
                ),
                pageNum,
              },
              pdfId: pdf.id,
              textSelection: textSelection, // 使用新的文本选择数据
              color: EHighlightColor.Pink,
              highlightTextStyle: EHighlightTextStyle.Highlight,
              highlightType: EHighlightType.Text,
              pageNum,
              notes: [],
              content: selectedText,
              image: "",
            }).then((highlight) => {
              if (!highlightManager.current) return;
              const layer =
                highlightManager.current.getOrCreateHighlightLayer(pageNum);
              if (!layer) {
                message.error("高亮层初始化失败，添加高亮失败");
              }
              highlightManager.current.addHighlight(pageNum, highlight);
              highlightManager.current.renderHighlights(pageNum);
              setTimeout(() => {
                if (highlightManager.current) {
                  highlightManager.current.clickHighlight(highlight.id);
                }
              }, 50);
            });
          }
        }
      }
    },
  });

  const getLoadUrl = useMemoizedFn(
    async (isLocal: boolean, filePath: string, remoteUrl) => {
      if (isLocal) {
        return readBinaryFile(filePath);
      } else {
        const remoteToLocal = await remoteResourceToLocal(remoteUrl);
        return readBinaryFile(remoteToLocal);
      }
    },
  );

  const handleLoadPdf = useMemoizedFn((pdf: Pdf) => {
    const { id, isLocal, filePath, remoteUrl } = pdf;
    Promise.all([
      getLoadUrl(isLocal, filePath, remoteUrl),
      getPdfHighlights(id),
    ])
      .then(([arrayBuffer, highlightsData]) => {
        pdfjs
          .getDocument(arrayBuffer)
          .promise.then((pdfDoc) => {
            if (!pdfContainerRef.current) return;
            if (highlightManager.current) {
              highlightManager.current.unmount();
            }

            // 设置PDF文档和高亮数据
            setPdfDocument(pdfDoc);
            setHighlights(highlightsData);

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
            linkService.setDocument(pdfDoc);
            linkService.setViewer(viewer);
            viewer.setDocument(pdfDoc);

            const handlePageRendered = () => {
              viewer.currentPageNumber = currentPageNum || 1;

              // 缓存原始页面宽度（在任何缩放之前）
              const viewport = viewer.getPageView(0);
              if (viewport && !originalPageWidth) {
                // 获取 scale=1 时的原始页面宽度
                const originalWidth = viewport.viewport.width;
                setOriginalPageWidth(originalWidth);
              }

              if (autoFitWidth) {
                // 等待DOM布局完成后计算scale
                setTimeout(() => {
                  calculateAutoFitScale();
                }, 100);
              }

              viewer.eventBus.off("pagerendered", handlePageRendered);
            };

            viewer.eventBus.on("pagerendered", handlePageRendered);

            viewer.eventBus.on(
              "pagechanging",
              ({ pageNumber }: { pageNumber: number }) => {
                setCurrentPageNum(pageNumber);
              },
            );

            highlightManager.current = new HighlightManager(
              pdfDoc,
              viewer,
              highlightsData,
              (updatedHighlights) => {
                setHighlights(updatedHighlights);
              },
            );
            setPdfLoadingStatus(PAGE_STATUS.SUCCESS);
            setCurrentScale(viewer.currentScale);
          })
          .catch((e) => {
            console.error(e);
            setPdfLoadingStatus(PAGE_STATUS.ERROR);
          });
      })
      .catch((e) => {
        console.error(e);
        setPdfLoadingStatus(PAGE_STATUS.ERROR);
      });
  });

  // 处理页面跳转
  const handlePageChange = useMemoizedFn((pageNum: number) => {
    if (highlightManager.current?.viewer) {
      highlightManager.current.viewer.currentPageNumber = pageNum;
      setCurrentPageNum(pageNum);
    }
  });

  // 处理高亮点击
  const handleHighlightClick = useMemoizedFn((highlight: PdfHighlight) => {
    if (highlightManager.current?.viewer) {
      // 滚动到高亮位置
      highlightManager.current.scrollIntoHighlight(highlight.id);
    }
  });

  const handleHighlightDelete = useMemoizedFn((highlightId: number) => {
    if (highlightManager.current) {
      for (const [
        pageNum,
        pageHighlights,
      ] of highlightManager.current.highlights.entries()) {
        const highlightIndex = pageHighlights.findIndex(
          (h) => h.id === highlightId,
        );
        if (highlightIndex !== -1) {
          highlightManager.current.removeHighlight(pageNum, highlightId);
          break;
        }
      }
    }
  });

  const handleHighlightUpdate = useMemoizedFn(
    (updatedHighlight: PdfHighlight) => {
      if (highlightManager.current) {
        highlightManager.current.updateHighlight(
          updatedHighlight.pageNum,
          updatedHighlight.id,
          updatedHighlight,
        );
      }
    },
  );

  // 当侧边栏显示状态改变时，重新计算 autoFitWidth 的 scale
  useEffect(() => {
    if (pdfLoadingStatus === PAGE_STATUS.SUCCESS) {
      // 等待DOM布局完成后重新计算scale
      setTimeout(() => {
        calculateAutoFitScale();
      }, 100);
    }
  }, [showSidebar, calculateAutoFitScale, pdfLoadingStatus]);

  useEffect(() => {
    setPdfLoadingStatus(PAGE_STATUS.LOADING);
    setOriginalPageWidth(0); // 重置缓存的原始页面宽度
    handleLoadPdf(pdf);

    return () => {
      if (highlightManager.current) {
        highlightManager.current.unmount();
      }
      setOriginalPageWidth(0); // 清理时重置
    };
  }, [handleLoadPdf, pdf]);

  return (
    <div
      className={classNames("w-full h-full overflow-hidden flex", className)}
      style={style}
    >
      {/* 侧边栏 */}
      <If condition={!!showSidebar && pdfLoadingStatus === PAGE_STATUS.SUCCESS}>
        <PDFSidebar
          pdf={pdf}
          pdfDocument={pdfDocument}
          highlights={highlights}
          currentPageNum={currentPageNum ?? 1}
          onPageChange={handlePageChange}
          onHighlightClick={handleHighlightClick}
          onHighlightDelete={handleHighlightDelete}
          onHighlightUpdate={handleHighlightUpdate}
        />
      </If>

      <div className="flex-1 min-w-0 relative" ref={flexContainerRef}>
        <div
          className={classNames(
            "absolute top-0 left-0 right-0 bottom-0 overflow-y-auto",
          )}
          ref={pdfContainerRef}
        >
          <div className={"pdfViewer"}></div>
          <AreaSelect
            onSelectStart={onAreaSelectStart}
            onSelectFinish={onAreaSelectEnd}
          />
          <If condition={pdfLoadingStatus === PAGE_STATUS.LOADING}>
            <Spin
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
              }}
              spinning={PAGE_STATUS.LOADING === pdfLoadingStatus}
            />
          </If>
        </div>
        <If condition={pdfLoadingStatus === PAGE_STATUS.SUCCESS}>
          <Flex
            className="h-12 absolute left-1/2 -translate-x-1/2 bottom-16 z-3 bg-black/80 text-white rounded-lg px-4! py-6 z-100"
            gap={"middle"}
            align={"center"}
          >
            <MenuOutlined
              className="cursor-pointer"
              onClick={() => setShowSidebar(!showSidebar)}
            />
            <ZoomInOutlined
              className="cursor-pointer"
              onClick={() => {
                if (!highlightManager.current) return;
                const currentScale =
                  highlightManager.current.viewer.currentScale;
                highlightManager.current.viewer.currentScaleValue = String(
                  (currentScale * 1.1).toFixed(2),
                );
                setCurrentScale(highlightManager.current.viewer.currentScale);
              }}
            />
            <div className="leading-10 text-lg select-none">
              {currentScale.toFixed(2)}
            </div>
            <ZoomOutOutlined
              onClick={() => {
                if (!highlightManager.current) return;
                const currentScale =
                  highlightManager.current.viewer.currentScale;
                highlightManager.current.viewer.currentScaleValue = String(
                  (currentScale / 1.1).toFixed(2),
                );
                setCurrentScale(highlightManager.current.viewer.currentScale);
              }}
            />
          </Flex>
        </If>
      </div>
      {/* 错误状态 */}
      <If condition={pdfLoadingStatus === PAGE_STATUS.ERROR}>
        <Result
          status={"error"}
          title={"PDF 加载失败"}
          subTitle={"请检查网络连接，或者尝试重新加载"}
          extra={
            <Button
              type="primary"
              onClick={() => {
                setPdfLoadingStatus(PAGE_STATUS.LOADING);
                handleLoadPdf(pdf);
              }}
            >
              重新加载
            </Button>
          }
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      </If>
    </div>
  );
};

export default PDFViewer;
