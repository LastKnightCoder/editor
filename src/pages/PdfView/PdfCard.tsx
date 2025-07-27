import React, { useState } from "react";
import classnames from "classnames";
import { Popover, App, Tag } from "antd";
import { useNavigate } from "react-router-dom";

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
}

const PdfCard = (props: PdfCardProps) => {
  const { className, style, pdf, compact = false } = props;

  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const { isDark } = useTheme();
  const [settingOpen, setSettingOpen] = useState(false);
  const uploadResource = useUploadResource();

  const { removePdf, activePdf, updatePdf } = usePdfsStore((state) => ({
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
          const fileContent = await readBinaryFile(pdf.filePath);
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

  const onClick = () => {
    if (compact) {
      // 在详情页的紧凑模式下，直接设置 activePdf
      usePdfsStore.setState({
        activePdf: pdf.id === activePdf?.id ? null : pdf,
      });
    } else {
      // 在列表页，导航到详情页
      navigate(`/pdfs/detail/${pdf.id}`);
    }
  };

  return (
    <div
      className={classnames(
        "flex gap-4 flex-col p-8 shadow-md rounded-2xl transition-all duration-200 ease-in-out cursor-pointer relative box-border",
        {
          "bg-[#18151f] shadow-lg": isDark,
          "p-4 gap-2": compact,
        },
        className,
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
          "select-none font-bold text-3xl overflow-hidden text-ellipsis line-clamp-2",
          { "text-lg line-clamp-2": compact },
        )}
        onClick={onClick}
      >
        {pdf.fileName}
      </div>
      <div className="mt-auto">
        <Tag color={pdf.isLocal ? "blue" : "red"}>
          {pdf.isLocal ? "本地" : "远程"}
        </Tag>
      </div>
      <div
        className={classnames(
          "absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full hover:cursor-pointer hover:bg-white/20",
          { "w-5 h-5 top-2 right-2": compact },
        )}
      >
        <Popover
          open={settingOpen}
          onOpenChange={setSettingOpen}
          placement={"bottomRight"}
          trigger={"click"}
          styles={{
            body: {
              padding: 4,
            },
          }}
          content={
            <div className="flex gap-2.5 flex-col">
              {pdf.isLocal && (
                <div
                  className="px-4 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => {
                    setSettingOpen(false);
                    onUploadPdf();
                  }}
                >
                  上传资源
                </div>
              )}
              <div
                className="px-4 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
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
    </div>
  );
};

export default PdfCard;
