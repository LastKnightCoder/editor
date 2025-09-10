import React, { memo, useState, useRef, useCallback } from "react";
import { Popover, App } from "antd";
import {
  MdAdd,
  MdClose,
  MdInsertDriveFile,
  MdCloud,
  MdFolder,
} from "react-icons/md";
import { motion, AnimatePresence } from "framer-motion";
import useUploadResource from "@/hooks/useUploadResource";
import { ColumnDef } from "../../../types";
import { AttachmentPluginValue, AttachmentItem } from "../types";
import FileUpload from "./FileUpload";
import { v4 as uuid } from "uuid";
import { useMemoizedFn } from "ahooks";
import {
  selectFile,
  readBinaryFile,
  getFileBaseName,
  showInFolder,
} from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import classNames from "classnames";

interface AttachmentRendererProps {
  value: AttachmentPluginValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange?: (newValue: AttachmentPluginValue) => void;
}

const AttachmentRenderer: React.FC<AttachmentRendererProps> = memo(
  ({ value, readonly, theme, onCellValueChange }) => {
    // 确保 value 始终是数组
    const attachmentList = Array.isArray(value) ? value : [];
    const isDark = theme === "dark";
    const [uploadPopoverVisible, setUploadPopoverVisible] = useState(false);
    const [hoveredAttachmentId, setHoveredAttachmentId] = useState<
      string | null
    >(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const uploadResource = useUploadResource();
    const { message, modal } = App.useApp();

    // 点击文件打开所在位置
    const handleFileClick = useMemoizedFn(
      async (attachment: AttachmentItem) => {
        try {
          if (attachment.isLocal) {
            await showInFolder(attachment.filePath);
          } else {
            // 下载远程文件并打开
            const loadingKey = `attachment-downloading-${attachment.id}`;
            try {
              message.loading({
                key: loadingKey,
                content: `正在下载 ${attachment.fileName}...`,
                duration: 0,
              });

              const localPath = await remoteResourceToLocal(
                attachment.filePath,
                attachment.fileName,
              );
              await showInFolder(localPath);

              message.success({
                key: loadingKey,
                content: `${attachment.fileName} 下载完成`,
                duration: 2,
              });
            } catch (downloadError) {
              message.error({
                key: loadingKey,
                content: `下载 ${attachment.fileName} 失败`,
                duration: 3,
              });
              console.error("下载文件失败:", downloadError);
            }
          }
        } catch (error) {
          message.error("文件不存在或无法打开");
          console.error(error);
        }
      },
    );

    // 删除文件
    const handleDeleteFile = useMemoizedFn(
      (attachmentId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        modal.confirm({
          title: "确认删除",
          content: "确定要删除这个附件吗？",
          okText: "确定",
          cancelText: "取消",
          okButtonProps: {
            danger: true,
          },
          onOk() {
            const newValue = attachmentList.filter(
              (item) => item.id !== attachmentId,
            );
            onCellValueChange?.(newValue);
          },
        });
      },
    );

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
              const fileData = await readBinaryFile(filePath);
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
            message.error(`处理文件 ${filePath} 失败`);
          }
        }

        if (newAttachments.length > 0) {
          onCellValueChange?.([...attachmentList, ...newAttachments]);
        }

        setUploadPopoverVisible(false);
      } catch (error) {
        console.error("选择文件失败:", error);
      }
    });

    const handleWheel = useCallback((e: React.WheelEvent) => {
      if (scrollContainerRef.current) {
        e.preventDefault();
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    }, []);

    const uploadContent = <FileUpload onUploadLocal={handleUploadFiles} />;

    return (
      <div
        className="relative items-center h-full w-full "
        onWheel={handleWheel}
      >
        <div
          className="w-full h-full flex px-2 py-1 overflow-x-auto scrollbar-hide"
          ref={scrollContainerRef}
        >
          <div
            className="flex items-center gap-2 flex-1"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {attachmentList.map((attachment) => (
              <motion.div
                key={attachment.id}
                className={classNames(
                  "relative group overflow-visible cursor-pointer flex-none flex items-center gap-2 px-2 py-1 rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all min-w-0",
                  {
                    "border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-700":
                      isDark,
                  },
                )}
                onMouseEnter={() => setHoveredAttachmentId(attachment.id)}
                onMouseLeave={() => setHoveredAttachmentId(null)}
                onClick={() => handleFileClick(attachment)}
              >
                <div className="flex items-center flex-none">
                  <MdInsertDriveFile className="w-4 h-4 text-blue-500" />
                  {attachment.isLocal ? (
                    <MdFolder
                      className="w-2 h-2 text-green-500 -ml-1"
                      title="本地文件"
                    />
                  ) : (
                    <MdCloud
                      className="w-2 h-2 text-orange-500 -ml-1"
                      title="远程文件（需下载）"
                    />
                  )}
                </div>

                <span
                  className="text-[12px] truncate max-w-24"
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
                      className={classNames(
                        "absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center cursor-pointer shadow-lg z-10",
                        {
                          "bg-red-700": isDark,
                        },
                      )}
                      onClick={(e) => handleDeleteFile(attachment.id, e)}
                    >
                      <MdClose className="w-2 h-2 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>

        {!readonly && (
          <Popover
            content={uploadContent}
            trigger="click"
            placement="bottomRight"
            open={uploadPopoverVisible}
            onOpenChange={setUploadPopoverVisible}
          >
            <div
              className={
                "absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors" +
                (isDark
                  ? " bg-gray-700/80 text-gray-200 hover:bg-gray-600/80"
                  : " bg-gray-200/80 text-gray-700 hover:bg-gray-300/80")
              }
              role="button"
              aria-label="添加附件"
            >
              <MdAdd className="w-4 h-4" />
            </div>
          </Popover>
        )}
      </div>
    );
  },
);

AttachmentRenderer.displayName = "AttachmentRenderer";

export default AttachmentRenderer;
