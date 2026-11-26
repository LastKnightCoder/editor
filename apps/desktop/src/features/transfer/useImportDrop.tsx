import { useImportI18n } from "./i18n-import";
/**
 * 页面拖入导入：把文件夹或 .zip 拖到卡片 / 文章 / 项目页的纸面上，直接打开批量导入向导并锁定目标。
 * 返回挂在纸面容器上的拖拽处理器与遮罩（容器需 relative）；其它文件拖入只提示，不处理。
 */

import { useRef, useState, type DragEvent } from "react";
import { FolderInput } from "lucide-react";
import { toast } from "@tau/ui";
import { isDirectory } from "@/commands/file";
import { useTransferStore } from "@/app/transferStore";
import type { ImportTarget } from "@/utils/content-transfer/batch-import";
import { isZipPath } from "@/utils/content-transfer/source";

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

export function useImportDrop(target: ImportTarget) {
  const { t } = useImportI18n();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const openFrom = async (file: File | undefined) => {
    const path = file ? window.electron.getPathForFile?.(file) : undefined;
    if (!path) return;
    if (isZipPath(path) || (await isDirectory(path).catch(() => false))) {
      useTransferStore.getState().openImportWizard({ target, sourcePath: path });
    } else {
      toast.info(t("drop.unsupported"));
    }
  };

  const dropProps = {
    onDragEnter: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    },
    onDragLeave: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      void openFrom(event.dataTransfer.files[0]);
    },
  };

  const overlay = dragging ? (
    <div className="border-accent bg-accent-soft/90 text-accent-text rounded-tau-lg pointer-events-none absolute inset-2.5 z-10 grid place-items-center border-2 border-dashed text-center">
      <div className="flex flex-col items-center gap-1.5">
        <FolderInput className="size-7" strokeWidth={1.5} />
        <span className="text-[15px] font-semibold">{t("drop.release")}</span>
        <span className="text-tau-meta text-ink-2">{t(`drop.${target}`)}</span>
      </div>
    </div>
  ) : null;

  return { dropProps, overlay };
}
