import { useImageExportI18n, type ImageExportTranslate } from "../../export-i18n";
import { missingExportElements } from "../../utils/visualExport";
/**
 * 导出为图片：预览 + 背景 / 放大倍数 / 边距。
 * 预览是按元素数据生成的结构示意（与白板列表缩略图同源），不做真实截图；
 * 真正的导出仍走 useBoardCapture 离屏截图。
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Download } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { Button, Dialog, DialogBody, cn, toast } from "@tau/ui";
import useTheme from "../../hooks/useTheme";
import { PageSchematic } from "../../schematic/PageSchematic";
import Board from "../../Board";
import { useBoardCapture } from "../../hooks/useBoardCapture";
import type { BoardElement } from "../../types";
import { Field, Seg, Slider } from "../../chrome";
import {
  ExportImageAction,
  ExportImageBackgroundMode,
  cloneSelection,
  createExportFilename,
  downloadBlobAsFile,
  resolveExportBackgroundColor,
  resolveExportElements,
} from "../../utils";

interface ExportImageModalProps {
  captureBlob: import("../../hooks/useBoardCapture").CaptureBlob;
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: string;
  selectedElementIds?: string[];
}

const backgroundOptions = (
  t: ImageExportTranslate
): { value: ExportImageBackgroundMode; label: string }[] => [
  { value: "light", label: t("imageExport.background.light") },
  { value: "dark", label: t("imageExport.background.dark") },
  { value: "transparent", label: t("imageExport.background.transparent") },
];

const PREVIEW_W = 216;
const PREVIEW_H = 132;
/** 边距滑杆上限（原数字输入允许到 500；滑杆取常用区间） */
const PADDING_MAX = 200;

/** 透明背景的棋盘格（取主题细线色，深浅主题自动适配） */
const CHECKER_STYLE: CSSProperties = {
  backgroundImage:
    "conic-gradient(var(--tau-line-1) 25%, transparent 0 50%, var(--tau-line-1) 0 75%, transparent 0)",
  backgroundSize: "14px 14px",
};

const ExportImageModal = (props: ExportImageModalProps) => {
  const { t } = useImageExportI18n();
  const { open, onClose, board, action, selectedElementIds } = props;
  const { isDark } = useTheme();
  const { capture, layer } = useBoardCapture(board, props.captureBlob);

  const [background, setBackground] = useState<ExportImageBackgroundMode>(
    isDark ? "dark" : "light"
  );
  const [scale, setScale] = useState<number>(window.devicePixelRatio || 1);
  const [padding, setPadding] = useState<number>(30);
  const [exporting, setExporting] = useState(false);
  const [allowPlaceholders, setAllowPlaceholders] = useState(false);

  const exportAction: ExportImageAction = action === "selection" ? "selection" : "board";

  useEffect(() => {
    if (!open) return;
    setBackground(isDark ? "dark" : "light");
    setScale(window.devicePixelRatio || 1);
    setPadding(30);
    setAllowPlaceholders(false);
  }, [open, isDark]);

  // 预览用的元素快照：打开时取一次（导出时仍重新解析，保持原有逻辑）
  // 关闭后沿用上一次快照，退场动画期间预览不闪成空态
  const lastPreviewRef = useRef<BoardElement[]>([]);
  const previewElements = useMemo(() => {
    if (!open) return lastPreviewRef.current;
    lastPreviewRef.current = resolveExportElements({
      board,
      action: exportAction,
      selectedElementIds,
    });
    return lastPreviewRef.current;
  }, [open, board, exportAction, selectedElementIds]);

  const modalTitle = useMemo(() => {
    return exportAction === "selection"
      ? t("imageExport.selectionTitle")
      : t("imageExport.boardTitle");
  }, [exportAction, t]);

  const handleExport = useMemoizedFn(async () => {
    if (exporting) return;

    const sourceElements = resolveExportElements({
      board,
      action: exportAction,
      selectedElementIds,
    });
    const elements = sourceElements;

    if (elements.length === 0) {
      const key =
        exportAction === "selection" ? "imageExport.emptySelection" : "imageExport.emptyBoard";
      toast.warning(() => t(key));
      return;
    }

    const previousSelection = cloneSelection(board.selection);

    setExporting(true);
    try {
      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectedElements: [],
            selectArea: null,
          },
        },
        false
      );

      const blob = await capture({
        allowPlaceholders,
        elements,
        padding,
        backgroundColor: resolveExportBackgroundColor(background),
        dpr: scale,
        type: "png",
        quality: 0.95,
      });
      if (!blob) {
        toast.error(() => t("imageExport.rangeFailed"));
        return;
      }

      downloadBlobAsFile(blob, createExportFilename(exportAction));
      toast.success(() => t("imageExport.success"));
      onClose();
    } catch (error) {
      console.error("Export whiteboard image failed:", error);
      toast.error(() => t("imageExport.failed"));
    } finally {
      board.apply(
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: previousSelection,
        },
        false
      );

      setExporting(false);
    }
  });

  const previewBackground = resolveExportBackgroundColor(background);
  // 预览框 216×132：边距按 1/4 缩进示意，示意图按剩余区域的宽高比生成（不裁切）
  const previewInset = Math.min(padding / 4, 24);
  const previewAspect = (PREVIEW_W - previewInset * 2) / (PREVIEW_H - previewInset * 2);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={next => !next && onClose()}
        title={modalTitle}
        subtitle={
          exportAction === "selection"
            ? t("imageExport.selected", { count: previewElements.length })
            : t("imageExport.all")
        }
        width={440}
        locked={exporting}
        footer={
          <>
            {missingExportElements(board, previewElements).length > 0 && (
              <label className="text-tau-caption text-ink-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowPlaceholders}
                  onChange={event => setAllowPlaceholders(event.target.checked)}
                />
                {t("imageExport.placeholders")}
              </label>
            )}
            <Button variant="secondary" size="sm" disabled={exporting} onClick={onClose}>
              {t("imageExport.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Download}
              loading={exporting}
              loadingText={t("imageExport.loading")}
              onClick={handleExport}
            >
              {t("imageExport.export")}
            </Button>
          </>
        }
      >
        <DialogBody>
          <div className="flex flex-col gap-4">
            {/* 预览：透明背景用棋盘格示意 */}
            <div
              className="bg-page ring-line-1 rounded-tau-md grid h-[170px] place-items-center overflow-hidden ring-1 ring-inset"
              style={previewBackground ? undefined : CHECKER_STYLE}
            >
              <div
                className={cn(
                  "relative rounded-[6px] transition-[padding] duration-150",
                  previewBackground && "shadow-lift"
                )}
                style={{
                  width: PREVIEW_W,
                  height: PREVIEW_H,
                  padding: previewInset,
                  background: previewBackground ?? "transparent",
                }}
              >
                {previewElements.length > 0 ? (
                  <PageSchematic
                    definitions={board.extensions?.getElementDefinitions()}
                    isBuiltin={element =>
                      board.extensions?.isHostElement(element.type) === true &&
                      !board.extensions.unknownElementReason(element)
                    }
                    resolveDefinition={element => {
                      const entry = board.document?.resolveElementDefinition?.(element.contractId);
                      return entry?.access !== "none" ? entry?.element : undefined;
                    }}
                    elements={previewElements}
                    aspect={previewAspect}
                    className="size-full"
                  />
                ) : (
                  <span className="text-ink-3 grid size-full place-items-center text-[12px]">
                    {t("imageExport.emptySelection")}
                  </span>
                )}
              </div>
            </div>

            <div>
              <Field label={t("imageExport.background")}>
                <Seg
                  label={t("imageExport.background")}
                  options={backgroundOptions(t)}
                  value={background}
                  onChange={value => setBackground(value)}
                />
              </Field>
              <Field label={t("imageExport.scale")}>
                <Slider
                  label={t("imageExport.scale")}
                  value={scale}
                  min={0.5}
                  max={4}
                  step={0.25}
                  format={v => `${Number(v.toFixed(2))}×`}
                  onChange={value => setScale(Number(value) || 1)}
                />
              </Field>
              <Field label={t("imageExport.padding")}>
                <Slider
                  label={t("imageExport.padding")}
                  value={padding}
                  min={0}
                  max={PADDING_MAX}
                  unit="px"
                  onChange={value => setPadding(Math.max(0, Number(value) || 0))}
                />
              </Field>
            </div>
          </div>
        </DialogBody>
      </Dialog>

      {layer}
    </>
  );
};

export default ExportImageModal;
