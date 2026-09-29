/**
 * PDF 阅读器入口。
 * - PdfReaderView：宿主已持有文件与索引状态（阅读页要和对话栏共用它们）；
 * - PdfReader：独立使用（项目里的 PDF 条目），自己读文件、准备索引，没有对话。
 * 以 id + updateTime 作重载键：阅读状态经 pdf:record-* 写入，不改 updateTime，翻页不会重挂载。
 */

import { useMemo } from "react";
import { createPluginRegistration, type PluginBatchRegistrations } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import type { PdfFile } from "@embedpdf/models";
import { LoaderPluginPackage } from "@embedpdf/plugin-loader/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage, ScrollStrategy } from "@embedpdf/plugin-scroll/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { TilingPluginPackage } from "@embedpdf/plugin-tiling/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import { HistoryPluginPackage } from "@embedpdf/plugin-history/react";
import { AnnotationPluginPackage } from "@embedpdf/plugin-annotation/react";
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import { ZoomMode } from "@embedpdf/plugin-zoom";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";
import { CapturePluginPackage } from "@embedpdf/plugin-capture/react";
import { RotatePluginPackage } from "@embedpdf/plugin-rotate/react";
import { SpreadPluginPackage } from "@embedpdf/plugin-spread/react";
import { SpreadMode } from "@embedpdf/plugin-spread";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail/react";
import { Loading } from "@tau/ui";
import { ErrorState } from "@/components/ErrorState";
import type { Pdf } from "@/types";
import { useDatabaseReady } from "../queries";
import { usePdfIndex } from "./data";
import { ReaderLayout, type ReaderLayoutProps } from "./ReaderLayout";
import { OVERLAY_ATTR } from "./readerContext";
import { usePdfFile, type PdfFileSource } from "./usePdfFile";

type LayoutPassThrough = Pick<
  ReaderLayoutProps,
  "jumpTarget" | "onPageChange" | "onAskAI" | "leftToggleInHud" | "onOpenChat"
>;

function buildPlugins(pdfFile: PdfFile): PluginBatchRegistrations {
  return [
    createPluginRegistration(LoaderPluginPackage, {
      loadingOptions: { type: "buffer", pdfFile },
    }),
    createPluginRegistration(ViewportPluginPackage, { viewportGap: 24 }),
    createPluginRegistration(ScrollPluginPackage, {
      strategy: ScrollStrategy.Vertical,
      pageGap: 18,
    }),
    createPluginRegistration(SpreadPluginPackage, { defaultSpreadMode: SpreadMode.None }),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(TilingPluginPackage, { tileSize: 768, overlapPx: 3, extraRings: 1 }),
    // 上下留白：选中页的 accent 框画在缩略图外侧，贴边会被滚动容器裁掉
    createPluginRegistration(ThumbnailPluginPackage, { width: 150, gap: 14, paddingY: 10 }),
    createPluginRegistration(InteractionManagerPluginPackage, {
      exclusionRules: { dataAttributes: [OVERLAY_ATTR] },
    }),
    createPluginRegistration(SelectionPluginPackage),
    createPluginRegistration(HistoryPluginPackage),
    createPluginRegistration(AnnotationPluginPackage, { annotationAuthor: "Tau User" }),
    createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.FitWidth }),
    // 抓手工具去掉：平移由按住空格临时打开
    createPluginRegistration(PanPluginPackage, { defaultMode: "never" }),
    createPluginRegistration(CapturePluginPackage, {
      scale: 2,
      imageType: "image/png",
      withAnnotations: true,
    }),
    createPluginRegistration(RotatePluginPackage),
  ];
}

interface PdfReaderViewProps extends LayoutPassThrough {
  pdf: Pdf;
  file: PdfFileSource;
  index: ReturnType<typeof usePdfIndex>;
}

export function PdfReaderView({ pdf, file, index, ...layout }: PdfReaderViewProps) {
  const { engine, error: engineError } = usePdfiumEngine({ worker: true });
  const { database } = useDatabaseReady();
  const plugins = useMemo(() => (file.pdfFile ? buildPlugins(file.pdfFile) : []), [file.pdfFile]);

  const error = engineError ?? file.error;
  // 宿主是左右排列（阅读器｜对话栏），加载 / 出错时也要撑满阅读器那一格
  if (error) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1">
        <ErrorState
          size="page"
          error={error}
          title="PDF 打开失败"
          description={
            pdf.isLocal
              ? "文件可能已被移动或删除，可以在 PDF 列表里重新定位。"
              : "远程文件下载失败，请检查网络或文件地址。"
          }
          className="flex-1"
        />
      </div>
    );
  }
  if (!engine || plugins.length === 0) {
    return <Loading minHeight={0} className="min-w-0 flex-1" />;
  }

  return (
    <EmbedPDF engine={engine} plugins={plugins} key={`embed-pdf-${pdf.id}-${pdf.updateTime}`}>
      {({ pluginsReady }) => (
        <ReaderLayout
          pdf={pdf}
          engine={engine}
          pluginsReady={pluginsReady}
          resolvedPath={file.resolvedPath}
          mainDbName={database}
          index={index}
          {...layout}
        />
      )}
    </EmbedPDF>
  );
}

/** 独立阅读器（无对话）：左面板开关放进 HUD */
export function PdfReader({ pdf, ...layout }: { pdf: Pdf } & LayoutPassThrough) {
  const file = usePdfFile(pdf);
  const index = usePdfIndex(pdf, file.resolvedPath);
  return <PdfReaderView pdf={pdf} file={file} index={index} leftToggleInHud {...layout} />;
}
