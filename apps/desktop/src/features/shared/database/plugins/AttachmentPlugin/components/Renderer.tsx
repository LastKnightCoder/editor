import React, { memo, useState, useRef } from "react";
import { Popover as TauPopover, ConfirmDialog, toast } from "@tau/ui";
import { Cloud, FileText, Folder, Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import useUploadResource from "@/hooks/useUploadResource";
import { ColumnDef } from "@tau/database";
import { AttachmentPluginValue, AttachmentItem } from "../types";
import FileUpload from "./FileUpload";
import { v4 as uuid } from "uuid";
import { useMemoizedFn } from "ahooks";
import { selectFile, readBinaryFile, getFileBaseName, showInFolder } from "@/commands";
import { remoteResourceToLocal } from "@/utils";

interface AttachmentRendererProps {
  value: AttachmentPluginValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: AttachmentPluginValue) => void;
}

const AttachmentRenderer: React.FC<AttachmentRendererProps> = memo(
  ({ value, readonly, onCellValueChange }) => {
    // 确保 value 始终是数组
    const attachmentList = Array.isArray(value) ? value : [];
    const [uploadPopoverVisible, setUploadPopoverVisible] = useState(false);
    const [hoveredAttachmentId, setHoveredAttachmentId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const addTriggerRef = useRef<HTMLDivElement>(null);
    const uploadResource = useUploadResource();

    // 点击文件打开所在位置
    const handleFileClick = useMemoizedFn(async (attachment: AttachmentItem) => {
      try {
        if (attachment.isLocal) {
          await showInFolder(attachment.filePath);
        } else {
          // 下载远程文件并打开
          const loadingId = toast.loading(`正在下载 ${attachment.fileName}...`);
          try {
            const localPath = await remoteResourceToLocal(attachment.filePath, attachment.fileName);
            await showInFolder(localPath);
            toast.resolve(loadingId, `${attachment.fileName} 下载完成`);
          } catch (downloadError) {
            toast.dismiss(loadingId);
            toast.error(`下载 ${attachment.fileName} 失败`);
            console.error("下载文件失败:", downloadError);
          }
        }
      } catch (error) {
        toast.error("文件不存在或无法打开");
        console.error(error);
      }
    });

    // 删除文件
    const handleDeleteFile = useMemoizedFn((attachmentId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setConfirmDeleteId(attachmentId);
    });

    // 选择并上传文件
    const handleUploadFiles = useMemoizedFn(async (isUpload: boolean) => {
      try {
        const filePaths = await selectFile({
          properties: ["openFile", "multiSelections"],
        });
        if (!filePaths || filePaths.length === 0) return;

        const newAttachments: AttachmentItem[] = [];

        for (const filePath of filePaths) {
          try {
            const fileName = await getFileBaseName(filePath);

            if (isUpload) {
              const fileData = (await readBinaryFile(filePath)) as Uint8Array<ArrayBuffer>;
              const file = new File([fileData], fileName);
              const uploadedUrl = await uploadResource(file);

              if (uploadedUrl) {
                newAttachments.push({
                  id: uuid(),
                  fileName,
                  filePath: uploadedUrl,
                  isLocal: false,
                });
              }
            } else {
              newAttachments.push({
                id: uuid(),
                fileName,
                filePath,
                isLocal: true,
              });
            }
          } catch (error) {
            console.error(`处理文件 ${filePath} 失败:`, error);
            toast.error(`处理文件 ${filePath} 失败`);
          }
        }

        if (newAttachments.length > 0) {
          onCellValueChange([...attachmentList, ...newAttachments]);
        }

        setUploadPopoverVisible(false);
      } catch (error) {
        console.error("选择文件失败:", error);
      }
    });

    const handleWheel = useMemoizedFn((e: React.WheelEvent) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    });

    return (
      <div className="relative h-full w-full items-center" onWheel={handleWheel}>
        <div
          className="scrollbar-hide flex h-full w-full overflow-x-auto px-2 py-1"
          ref={scrollContainerRef}
        >
          <div
            className="flex flex-1 items-center gap-2"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {attachmentList.map(attachment => (
              <motion.div
                key={attachment.id}
                className="border-line-1 bg-surface hover:bg-hover rounded-tau-sm group relative flex min-w-0 flex-none cursor-pointer items-center gap-2 overflow-visible border px-2 py-1 transition-colors"
                onMouseEnter={() => setHoveredAttachmentId(attachment.id)}
                onMouseLeave={() => setHoveredAttachmentId(null)}
                onClick={() => handleFileClick(attachment)}
              >
                <div className="flex flex-none items-center">
                  <FileText className="text-accent h-4 w-4" strokeWidth={1.75} />
                  {attachment.isLocal ? (
                    <span title="本地文件">
                      <Folder className="text-ok -ml-1 h-2 w-2" strokeWidth={1.75} />
                    </span>
                  ) : (
                    <span title="远程文件（需下载）">
                      <Cloud className="text-warn -ml-1 h-2 w-2" strokeWidth={1.75} />
                    </span>
                  )}
                </div>

                <span
                  className="text-ink-1 text-tau-sm max-w-24 truncate"
                  title={attachment.fileName}
                >
                  {attachment.fileName}
                </span>

                <AnimatePresence>
                  {!readonly && hoveredAttachmentId === attachment.id && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="bg-danger text-ink-inverse absolute -right-1 -top-1 z-10 flex h-3 w-3 cursor-pointer items-center justify-center rounded-full shadow-lg"
                      onClick={e => handleDeleteFile(attachment.id, e)}
                    >
                      <X className="h-2 w-2" strokeWidth={2.5} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>

        {!readonly && (
          <TauPopover
            anchor={addTriggerRef.current}
            placement="bottom-end"
            open={uploadPopoverVisible}
            onOpenChange={setUploadPopoverVisible}
            arrow={false}
          >
            <FileUpload onUploadLocal={handleUploadFiles} />
          </TauPopover>
        )}
        {!readonly && (
          <div
            ref={addTriggerRef}
            className="bg-hover hover:bg-press text-ink-2 hover:text-ink-1 rounded-tau-sm absolute right-1 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 px-1.5 py-1 transition-colors"
            role="button"
            aria-label="添加附件"
            onClick={() => setUploadPopoverVisible(v => !v)}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}

        <ConfirmDialog
          open={confirmDeleteId !== null}
          onOpenChange={open => {
            if (!open) setConfirmDeleteId(null);
          }}
          title="确认删除"
          impact="确定要删除这个附件吗？"
          danger
          confirmText="确定"
          onConfirm={() => {
            const id = confirmDeleteId;
            if (!id) return;
            onCellValueChange(attachmentList.filter(item => item.id !== id));
          }}
        />
      </div>
    );
  }
);

AttachmentRenderer.displayName = "AttachmentRenderer";

export default AttachmentRenderer;
