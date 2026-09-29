import React, { useState } from "react";
import classnames from "classnames";
import { Popover, App, Tag } from "antd";

import { MdMoreVert } from "react-icons/md";
import useTheme from "@/hooks/useTheme.ts";
import usePdfsStore from "@/stores/usePdfsStore.ts";
import useUploadResource from "@/hooks/useUploadResource.ts";
import { readBinaryFile } from "@/commands";
import { Pdf } from "@/types";

interface PdfCardProps {
  pdf: Pdf;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
  onCardClick?: (pdf: Pdf) => void;
  showActions?: boolean;
}

const PdfCard = (props: PdfCardProps) => {
  const { className, style, pdf, compact = false, onCardClick, showActions = true } = props;

  const { modal, message } = App.useApp();
  const { isDark } = useTheme();
  const [settingOpen, setSettingOpen] = useState(false);
  const uploadResource = useUploadResource();

  const { removePdf, activePdf, updatePdf } = usePdfsStore(state => ({
    removePdf: state.removePdf,
    activePdf: state.activePdf,
    updatePdf: state.updatePdf,
  }));

  const onRemovePdf = () => {
    modal.confirm({
      title: "删除PDF",
      content: "确定删除该PDF吗？",
      onOk: async () => {
        await removePdf(pdf.id);
        if (activePdf?.id === pdf.id) {
          usePdfsStore.setState({
            activePdf: null,
          });
        }
      },
      cancelText: "取消",
      okText: "确定",
      okButtonProps: {
        danger: true,
      },
    });
  };

  const onUploadPdf = () => {
    modal.confirm({
      title: "上传PDF",
      content: "确定要将此PDF文件上传到云端吗？上传成功后将变为远程资源。",
      onOk: async () => {
        try {
          message.loading({
            key: "uploading-pdf",
            content: "正在上传文件...",
            duration: 0,
          });

          // 读取本地文件内容
          const fileContent = (await readBinaryFile(pdf.filePath)) as Uint8Array<ArrayBuffer>;
          const file = new File([fileContent], pdf.fileName, {
            type: "application/pdf",
          });

          const uploadedUrl = await uploadResource(file);
          if (uploadedUrl) {
            // 上传成功，更新PDF记录
            await updatePdf({
              ...pdf,
              isLocal: false,
              remoteUrl: uploadedUrl,
              filePath: "", // 清空本地路径
            });
            message.success({ key: "uploading-pdf", content: "文件上传成功" });
          } else {
            message.error({ key: "uploading-pdf", content: "文件上传失败" });
          }
        } catch (error) {
          console.error("上传文件失败:", error);
          message.error({ key: "uploading-pdf", content: "文件上传失败" });
        }
      },
      cancelText: "取消",
      okText: "确定上传",
    });
  };

  const handleClick = () => {
    if (onCardClick) {
      onCardClick(pdf);
      return;
    }
    if (compact) {
      // 详情页紧凑模式：直接切换 activePdf（旧列表页的导航分支已随 /legacy 退役）
      usePdfsStore.setState({
        activePdf: pdf.id === activePdf?.id ? null : pdf,
      });
    }
  };

  return (
    <div
      className={classnames(
        "relative box-border flex cursor-pointer flex-col gap-4 rounded-2xl p-8 shadow-md transition-all duration-200 ease-in-out",
        {
          "bg-[#18151f] shadow-lg": isDark,
          "gap-2 p-4": compact,
        },
        className
      )}
      style={{
        backgroundImage: `linear-gradient(
          -30deg,
          rgba(125, 26, 189, 0.1),
          transparent 50%
        )`,
        ...style,
      }}
    >
      <div
        className={classnames(
          "line-clamp-2 select-none overflow-hidden text-ellipsis text-3xl font-bold",
          { "line-clamp-2 text-lg": compact }
        )}
        onClick={handleClick}
      >
        {pdf.fileName}
      </div>
      <div className="mt-auto">
        <Tag color={pdf.isLocal ? "blue" : "red"}>{pdf.isLocal ? "本地" : "远程"}</Tag>
      </div>
      {showActions && (
        <div
          className={classnames(
            "absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full hover:cursor-pointer hover:bg-white/20",
            { "right-2 top-2 h-5 w-5": compact }
          )}
        >
          <Popover
            open={settingOpen}
            onOpenChange={setSettingOpen}
            placement={"bottomRight"}
            trigger={"click"}
            styles={{
              content: {
                padding: 4,
              },
            }}
            content={
              <div className="flex flex-col gap-2.5">
                {pdf.isLocal && (
                  <div
                    className="cursor-pointer rounded px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-800"
                    onClick={() => {
                      setSettingOpen(false);
                      onUploadPdf();
                    }}
                  >
                    上传资源
                  </div>
                )}
                <div
                  className="cursor-pointer rounded px-4 py-2 hover:bg-gray-100 dark:hover:bg-zinc-800"
                  onClick={onRemovePdf}
                >
                  删除Pdf
                </div>
              </div>
            }
          >
            <MdMoreVert />
          </Popover>
        </div>
      )}
    </div>
  );
};

export default PdfCard;
