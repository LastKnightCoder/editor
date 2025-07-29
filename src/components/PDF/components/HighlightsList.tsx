import React, { useRef, useState, useCallback } from "react";
import {
  Typography,
  Empty,
  Image,
  Button,
  Dropdown,
  Modal,
  message,
} from "antd";
import {
  DeleteOutlined,
  MoreOutlined,
  CommentOutlined,
} from "@ant-design/icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PdfHighlight, EHighlightType, EHighlightColor } from "@/types";
import { removePdfHighlight } from "@/commands/pdf";
import { getEditorText } from "@/utils/editor";

const { Text } = Typography;

interface HighlightsListProps {
  highlights: PdfHighlight[];
  onHighlightClick: (highlight: PdfHighlight) => void;
  onHighlightDelete?: (highlightId: number) => void;
  onHighlightUpdate?: (highlight: PdfHighlight) => void;
}

const colors = {
  [EHighlightColor.Red]: "bg-red-500",
  [EHighlightColor.Blue]: "bg-blue-500",
  [EHighlightColor.Green]: "bg-green-500",
  [EHighlightColor.Yellow]: "bg-yellow-500",
  [EHighlightColor.Purple]: "bg-purple-500",
  [EHighlightColor.Pink]: "bg-pink-500",
};

const HighlightsList: React.FC<HighlightsListProps> = ({
  highlights,
  onHighlightClick,
  onHighlightDelete,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedHighlight, setSelectedHighlight] =
    useState<PdfHighlight | null>(null);

  const virtualizer = useVirtualizer({
    count: highlights.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // 增加预估高度以容纳笔记内容
    overscan: 3,
  });

  const handleDeleteHighlight = useCallback(
    async (highlight: PdfHighlight) => {
      try {
        await removePdfHighlight(highlight.id);
        message.success("删除高亮成功");
        onHighlightDelete?.(highlight.id);
      } catch (error) {
        console.error("删除高亮失败:", error);
        message.error("删除高亮失败");
      }
    },
    [onHighlightDelete],
  );

  // 右键菜单选项
  const getContextMenuItems = (highlight: PdfHighlight) => [
    {
      key: "delete",
      icon: <DeleteOutlined />,
      label: "删除高亮",
      danger: true,
      onClick: () => {
        setSelectedHighlight(highlight);
        setDeleteModalVisible(true);
      },
    },
  ];

  // 获取显示内容
  const getDisplayContent = (highlight: PdfHighlight) => {
    if (highlight.highlightType === EHighlightType.Comment) {
      // 评论类型，从notes中获取内容
      if (highlight.notes && highlight.notes.length > 0) {
        return getEditorText(highlight.notes[0].note, 100);
      }
      return "无评论内容";
    } else {
      // 文本和区域类型，使用content字段
      return highlight.content;
    }
  };

  // 获取类型显示文本
  const getTypeText = (type: EHighlightType) => {
    switch (type) {
      case EHighlightType.Text:
        return "文本";
      case EHighlightType.Area:
        return "区域";
      case EHighlightType.Comment:
        return "评论";
      default:
        return "未知";
    }
  };

  if (highlights.length === 0) {
    return (
      <div className="h-full flex justify-center items-center">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无标注" />
      </div>
    );
  }

  return (
    <>
      <div ref={parentRef} className="h-full overflow-auto py-2 px-4">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const highlight = highlights[virtualItem.index];
            const displayContent = getDisplayContent(highlight);

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="p-3 transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg">
                  <div
                    className={`w-full h-1 rounded ${colors[highlight.color]}`}
                  ></div>
                  <div
                    className="flex items-start gap-3 cursor-pointer p-2"
                    onClick={() => onHighlightClick(highlight)}
                  >
                    {/* 评论类型显示评论图标 */}
                    {highlight.highlightType === EHighlightType.Comment && (
                      <div className="flex-shrink-0 mt-1">
                        <CommentOutlined
                          style={{
                            color: "#1890ff",
                            fontSize: "14px",
                          }}
                        />
                      </div>
                    )}

                    <div className="flex-1 overflow-hidden">
                      {highlight.highlightType === EHighlightType.Area &&
                        highlight.image && (
                          <div
                            className="flex-shrink-0 mb-2"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <Image
                              src={highlight.image}
                              width={60}
                              height={40}
                              className="object-cover rounded border border-gray-200 dark:border-gray-600"
                              preview={{
                                src: highlight.image,
                              }}
                            />
                          </div>
                        )}
                      {displayContent && (
                        <div className="text-sm leading-6 mb-1 text-gray-800 dark:text-gray-200 line-clamp-3">
                          {displayContent}
                        </div>
                      )}
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        第 {highlight.pageNum} 页 •{" "}
                        {getTypeText(highlight.highlightType)}
                      </Text>
                    </div>

                    <Dropdown
                      menu={{ items: getContextMenuItems(highlight) }}
                      trigger={["click"]}
                      placement="bottomRight"
                    >
                      <Button
                        type="text"
                        icon={<MoreOutlined />}
                        size="small"
                        onClick={(e) => e.stopPropagation()}
                        className="opacity-60 hover:opacity-100 text-gray-600 dark:text-gray-300"
                      />
                    </Dropdown>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        title="确认删除"
        open={deleteModalVisible}
        onOk={() => {
          if (selectedHighlight) {
            handleDeleteHighlight(selectedHighlight);
          }
          setDeleteModalVisible(false);
          setSelectedHighlight(null);
        }}
        onCancel={() => {
          setDeleteModalVisible(false);
          setSelectedHighlight(null);
        }}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p>确定要删除这个高亮标注吗？此操作不可撤销。</p>
      </Modal>
    </>
  );
};

export default HighlightsList;
