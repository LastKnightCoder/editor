import React, { useState, useEffect } from "react";
import {
  FileTextOutlined,
  BookOutlined,
  HighlightOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { PdfHighlight } from "@/types";
import classNames from "classnames";
import TabsIndicator from "@/components/TabsIndicator";
import ThumbnailsList from "./components/ThumbnailsList";
import OutlineList from "./components/OutlineList";
import HighlightsList from "./components/HighlightsList";
import {
  loadThumbnailsFromCache,
  saveThumbnailsToCache,
  loadOutlineFromCache,
  saveOutlineToCache,
} from "@/utils/pdf-cache";

interface PDFSidebarProps {
  pdf: { id: number };
  pdfDocument: any; // PDFDocumentProxy
  highlights: PdfHighlight[];
  currentPageNum: number;
  onPageChange: (pageNum: number) => void;
  onHighlightClick: (highlight: PdfHighlight) => void;
  className?: string;
}

interface ThumbnailItem {
  pageNum: number;
  canvas?: HTMLCanvasElement | null;
  dataURL?: string;
}

interface OutlineItem {
  title: string;
  dest: any;
  pageNum?: number;
  children?: OutlineItem[];
}

const PDFSidebar: React.FC<PDFSidebarProps> = ({
  pdf,
  pdfDocument,
  highlights,
  currentPageNum,
  onPageChange,
  onHighlightClick,
  className,
}) => {
  const [activeTab, setActiveTab] = useState("thumbnails");
  const [thumbnails, setThumbnails] = useState<ThumbnailItem[]>([]);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [loadingOutline, setLoadingOutline] = useState(false);

  // 缓存状态：记录是否已经加载过
  const [thumbnailsLoaded, setThumbnailsLoaded] = useState(false);
  const [outlineLoaded, setOutlineLoaded] = useState(false);

  // 生成缩略图
  const generateThumbnails = async () => {
    if (!pdfDocument || loadingThumbnails || thumbnailsLoaded) return;

    // 首先尝试从缓存加载
    const cachedThumbnails = await loadThumbnailsFromCache(pdf.id);
    if (cachedThumbnails) {
      setThumbnails(cachedThumbnails);
      setThumbnailsLoaded(true);
      return;
    }

    setLoadingThumbnails(true);
    const numPages = pdfDocument.numPages;
    const newThumbnails: ThumbnailItem[] = [];

    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdfDocument.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };
        await page.render(renderContext).promise;
        newThumbnails.push({ pageNum: i, canvas });
      } catch (error) {
        console.error(`生成第${i}页缩略图失败:`, error);
        newThumbnails.push({ pageNum: i, canvas: null });
      }
    }

    setThumbnails(newThumbnails);
    setThumbnailsLoaded(true);
    setLoadingThumbnails(false);

    // 保存到缓存
    const thumbnailsForCache = newThumbnails.map((item) => ({
      pageNum: item.pageNum,
      canvas: item.canvas || null,
    }));
    await saveThumbnailsToCache(pdf.id, thumbnailsForCache);
  };

  // 获取PDF目录
  const getOutline = async () => {
    if (!pdfDocument || loadingOutline || outlineLoaded) return;

    // 首先尝试从缓存加载
    const cachedOutline = await loadOutlineFromCache(pdf.id);
    if (cachedOutline) {
      setOutline(cachedOutline);
      setOutlineLoaded(true);
      return;
    }

    setLoadingOutline(true);
    try {
      const outline = await pdfDocument.getOutline();
      if (outline) {
        const processOutline = async (items: any[]): Promise<OutlineItem[]> => {
          const result: OutlineItem[] = [];
          for (const item of items) {
            try {
              let pageNum: number | undefined;
              if (item.dest) {
                if (typeof item.dest === "string") {
                  const destObj = await pdfDocument.getDestination(item.dest);
                  if (destObj && destObj[0]) {
                    pageNum = (await pdfDocument.getPageIndex(destObj[0])) + 1;
                  }
                } else if (Array.isArray(item.dest) && item.dest[0]) {
                  pageNum = (await pdfDocument.getPageIndex(item.dest[0])) + 1;
                }
              }
              const outlineItem: OutlineItem = {
                title: item.title,
                dest: item.dest,
                pageNum,
                children: item.items
                  ? await processOutline(item.items)
                  : undefined,
              };
              result.push(outlineItem);
            } catch (error) {
              console.error("处理目录项失败:", error);
            }
          }
          return result;
        };
        const processedOutline = await processOutline(outline);
        setOutline(processedOutline);

        // 保存到缓存
        await saveOutlineToCache(pdf.id, processedOutline);
      }
      setOutlineLoaded(true);
    } catch (error) {
      console.error("获取PDF目录失败:", error);
      setOutlineLoaded(true); // 即使失败也标记为已加载，避免重复请求
    }
    setLoadingOutline(false);
  };

  // 当PDF文档变化时重置缓存状态
  useEffect(() => {
    if (pdfDocument) {
      setThumbnailsLoaded(false);
      setOutlineLoaded(false);
      setThumbnails([]);
      setOutline([]);
    }
  }, [pdfDocument]);

  // 当切换tab时按需加载数据
  useEffect(() => {
    if (pdfDocument) {
      if (activeTab === "thumbnails" && !thumbnailsLoaded) {
        generateThumbnails();
      } else if (activeTab === "outline" && !outlineLoaded) {
        getOutline();
      }
    }
    // eslint-disable-next-line
  }, [pdfDocument, activeTab, thumbnailsLoaded, outlineLoaded]);

  // 渲染tab内容
  const renderTabContent = () => {
    if (activeTab === "thumbnails") {
      if (loadingThumbnails) {
        return (
          <div className="h-full flex items-center justify-center">
            <LoadingOutlined />
          </div>
        );
      }
      return (
        <ThumbnailsList
          thumbnails={thumbnails}
          currentPageNum={currentPageNum}
          onPageChange={onPageChange}
        />
      );
    }

    if (activeTab === "outline") {
      if (loadingOutline) {
        return (
          <div className="h-full flex items-center justify-center">
            <LoadingOutlined />
          </div>
        );
      }
      return <OutlineList outline={outline} onPageChange={onPageChange} />;
    }

    if (activeTab === "highlights") {
      return (
        <HighlightsList
          highlights={highlights}
          onHighlightClick={onHighlightClick}
        />
      );
    }

    return null;
  };

  const tabItems = [
    {
      key: "thumbnails",
      label: (
        <span>
          <FileTextOutlined className="mr-1" />
          缩略图
        </span>
      ),
    },
    {
      key: "outline",
      label: (
        <span>
          <BookOutlined className="mr-1" />
          目录
        </span>
      ),
    },
    {
      key: "highlights",
      label: (
        <span>
          <HighlightOutlined className="mr-1" />
          标注
        </span>
      ),
    },
  ];

  return (
    <div className={classNames("w-[280px] h-full flex flex-col", className)}>
      <TabsIndicator
        tabs={tabItems}
        activeTab={activeTab}
        onChange={setActiveTab}
      />
      <div className="flex-1 min-h-0 overflow-y-auto border-r-[10px] border-r-transparent">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default PDFSidebar;
