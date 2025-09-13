import React, { memo, useState, useRef } from "react";
import { Popover, App } from "antd";
import {
  MdAdd,
  MdClose,
  MdDescription,
  MdArticle,
  MdNote,
  MdFolder,
} from "react-icons/md";
import { motion, AnimatePresence } from "framer-motion";
import { useMemoizedFn } from "ahooks";
import { v4 as uuid } from "uuid";
import { ColumnDef } from "../../../types";
import { RichTextPluginValue, RichTextItem } from "../types";
import { DropdownMenu } from "./index";
import RichTextEditModal from "@/components/RichTextEditModal";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import {
  createContent,
  deleteContent,
  incrementContentRefCount,
} from "@/commands/content";
import { SearchResult } from "@/types";
import { Descendant } from "slate";
import classNames from "classnames";

interface RichTextRendererProps {
  value: RichTextPluginValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: RichTextPluginValue) => void;
}

const RichTextRenderer: React.FC<RichTextRendererProps> = memo(
  ({ value, readonly, theme, onCellValueChange }) => {
    const richTextList = Array.isArray(value) ? value : [];
    const isDark = theme === "dark";

    const [addPopoverVisible, setAddPopoverVisible] = useState(false);
    const [selectorModalVisible, setSelectorModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [currentEditingContentId, setCurrentEditingContentId] = useState<
      number | null
    >(null);
    const [currentEditingTitle, setCurrentEditingTitle] = useState("");

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const { message, modal } = App.useApp();

    const getTypeIcon = (type: RichTextItem["type"]) => {
      const iconProps = "w-4 h-4";
      switch (type) {
        case "card":
          return <MdNote className={`${iconProps} text-blue-500`} />;
        case "article":
          return <MdArticle className={`${iconProps} text-green-500`} />;
        case "project-item":
          return <MdFolder className={`${iconProps} text-orange-500`} />;
        case "document":
          return <MdDescription className={`${iconProps} text-purple-500`} />;
        case "custom":
        default:
          return <MdDescription className={`${iconProps} text-gray-500`} />;
      }
    };

    const handleItemClick = useMemoizedFn((item: RichTextItem) => {
      setCurrentEditingContentId(item.contentId);
      setCurrentEditingTitle(item.title);
      setEditModalVisible(true);
    });

    const handleDeleteItem = useMemoizedFn(
      (itemId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        // 找到要删除的项目
        const itemToDelete = richTextList.find((item) => item.id === itemId);
        if (!itemToDelete) return;

        modal.confirm({
          title: "确认删除",
          content: "确定要删除这个富文本文档吗？",
          okText: "确定",
          cancelText: "取消",
          okButtonProps: {
            danger: true,
          },
          async onOk() {
            try {
              // 删除 content 记录（会自动减少引用计数）
              await deleteContent(itemToDelete.contentId);

              const newValue = richTextList.filter(
                (item) => item.id !== itemId,
              );
              onCellValueChange(newValue);
              message.success("文档删除成功");
            } catch (error) {
              console.error("删除文档失败:", error);
              message.error("删除文档失败");
            }
          },
        });
      },
    );

    // 关联文档
    const handleLinkDocument = useMemoizedFn(() => {
      setAddPopoverVisible(false);
      setSelectorModalVisible(true);
    });

    // 新建文档
    const handleCreateDocument = useMemoizedFn(async () => {
      setAddPopoverVisible(false);

      try {
        // 创建新的内容记录
        const emptyContent: Descendant[] = [
          {
            type: "paragraph",
            children: [{ text: "" }],
          } as any,
        ];
        const contentId = await createContent(emptyContent, 0);

        if (contentId) {
          const newRichTextItem: RichTextItem = {
            id: uuid(),
            contentId,
            title: "未命名文档",
            type: "custom",
          };

          const newValue = [...richTextList, newRichTextItem];
          onCellValueChange(newValue);

          // 立即打开编辑
          setCurrentEditingContentId(contentId);
          setCurrentEditingTitle("未命名文档");
          setEditModalVisible(true);

          message.success("文档创建成功");
        }
      } catch (error) {
        console.error("创建文档失败:", error);
        message.error("创建文档失败");
      }
    });

    // 选择搜索到的文档
    const handleSelectDocument = useMemoizedFn(
      async (items: SearchResult | SearchResult[]) => {
        // 处理单选情况
        const item = Array.isArray(items) ? items[0] : items;
        if (!item) return;

        // 检查是否已经关联
        const exists = richTextList.some(
          (doc) => doc.contentId === item.contentId,
        );
        if (exists) {
          message.warning("该文档已经关联");
          return;
        }

        try {
          // 增加 content 的引用计数
          await incrementContentRefCount(item.contentId);

          const newRichTextItem: RichTextItem = {
            id: uuid(),
            contentId: item.contentId,
            title: item.title || "未命名文档",
            type: item.type as RichTextItem["type"],
          };

          const newValue = [...richTextList, newRichTextItem];
          onCellValueChange(newValue);
          message.success("文档关联成功");
        } catch (error) {
          console.error("关联文档失败:", error);
          message.error("关联文档失败");
        }
      },
    );

    // 编辑保存回调
    const handleEditSave = useMemoizedFn((title: string) => {
      // 更新列表中的标题
      const newValue = richTextList.map((item) =>
        item.contentId === currentEditingContentId
          ? { ...item, title: title || item.title }
          : item,
      );
      onCellValueChange(newValue);
    });

    // 横向滚动处理
    const handleWheel = useMemoizedFn((e: React.WheelEvent) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    });

    const dropdownContent = (
      <DropdownMenu
        theme={theme}
        onLinkDocument={handleLinkDocument}
        onCreateDocument={handleCreateDocument}
      />
    );

    return (
      <div
        className="relative items-center h-full w-full"
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
            {richTextList.map((item) => (
              <motion.div
                key={item.id}
                className={classNames(
                  "relative group overflow-visible cursor-pointer flex-none flex items-center gap-2 px-2 py-1 rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all min-w-0",
                  {
                    "border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-700":
                      isDark,
                  },
                )}
                onMouseEnter={() => setHoveredItemId(item.id)}
                onMouseLeave={() => setHoveredItemId(null)}
                onClick={() => handleItemClick(item)}
              >
                <div className="flex items-center flex-none">
                  {getTypeIcon(item.type)}
                </div>

                <span
                  className="text-[12px] truncate max-w-24"
                  title={item.title}
                >
                  {item.title}
                </span>

                <AnimatePresence>
                  {!readonly && hoveredItemId === item.id && (
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
                      onClick={(e) => handleDeleteItem(item.id, e)}
                    >
                      <MdClose className="w-2 h-2 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 添加按钮 */}
        {!readonly && (
          <Popover
            content={dropdownContent}
            trigger="click"
            placement="bottomRight"
            open={addPopoverVisible}
            onOpenChange={setAddPopoverVisible}
            showArrow={false}
            styles={{
              body: {
                padding: 0,
                background: "transparent",
              },
            }}
          >
            <div
              className={classNames(
                "absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors",
                {
                  "bg-gray-200/80 text-gray-700 hover:bg-gray-300/80": !isDark,
                  "bg-gray-700/80 text-gray-200 hover:bg-gray-600/80": isDark,
                },
              )}
              role="button"
              aria-label="添加富文本"
            >
              <MdAdd className="w-4 h-4" />
            </div>
          </Popover>
        )}

        {/* 文档选择模态框 */}
        <ContentSelectorModal
          open={selectorModalVisible}
          onCancel={() => setSelectorModalVisible(false)}
          onSelect={handleSelectDocument}
          contentType={["card", "article", "project-item", "document-item"]}
          extensions={[]}
          title="选择要关联的文档"
          emptyDescription="未找到相关文档"
          multiple={false}
          excludeContentIds={richTextList.map((item) => item.contentId)}
        />

        {currentEditingContentId && (
          <RichTextEditModal
            visible={editModalVisible}
            contentId={currentEditingContentId}
            title={currentEditingTitle}
            onClose={() => {
              setEditModalVisible(false);
              setCurrentEditingContentId(null);
              setCurrentEditingTitle("");
            }}
            onTitleChange={handleEditSave}
          />
        )}
      </div>
    );
  },
);

RichTextRenderer.displayName = "RichTextRenderer";

export default RichTextRenderer;
