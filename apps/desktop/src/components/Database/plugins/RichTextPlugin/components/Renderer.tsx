import React, { memo, useState, useRef, useEffect } from "react";
import { Button, Popover as TauPopover, ConfirmDialog, toast } from "@tau/ui";
import { FileText, Folder, Plus, StickyNote, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn } from "ahooks";
import { v4 as uuid } from "uuid";
import { ColumnDef } from "../../../types";
import { RichTextPluginValue, RichTextItem } from "../types";
import { DropdownMenu } from "./index";
import { ContentEditDialog } from "@/components/ContentEditDialog";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { createContent, deleteContent, incrementContentRefCount } from "@/commands/content";
import { buildCardFromContent, isContentIsCard } from "@/commands/card";
import { defaultCardEventBus } from "@/utils";
import { SearchResult } from "@/types";
import { Descendant } from "slate";

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

    const [addPopoverVisible, setAddPopoverVisible] = useState(false);
    const [selectorModalVisible, setSelectorModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [currentEditingContentId, setCurrentEditingContentId] = useState<number | null>(null);
    const [currentEditingTitle, setCurrentEditingTitle] = useState("");
    const [confirmDeleteItem, setConfirmDeleteItem] = useState<RichTextItem | null>(null);
    // 正在编辑的文档是否已是卡片（决定是否提供「转为卡片」）
    const [editingIsCard, setEditingIsCard] = useState(true);
    const [buildingCard, setBuildingCard] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const addTriggerRef = useRef<HTMLDivElement>(null);

    const getTypeIcon = (type: RichTextItem["type"]) => {
      const iconProps = "w-4 h-4";
      switch (type) {
        case "card":
          return <StickyNote className={`${iconProps} text-accent`} strokeWidth={1.75} />;
        case "article":
          return <FileText className={`${iconProps} text-ok`} strokeWidth={1.75} />;
        case "project-item":
        case "document": // 历史知识库单元格值：contentId 迁移中不变，仅显示类型过期，按项目条目归并
          return <Folder className={`${iconProps} text-warn`} strokeWidth={1.75} />;
        case "custom":
        default:
          return <FileText className={`${iconProps} text-ink-3`} strokeWidth={1.75} />;
      }
    };

    const handleItemClick = useMemoizedFn((item: RichTextItem) => {
      setCurrentEditingContentId(item.contentId);
      setCurrentEditingTitle(item.title);
      setEditModalVisible(true);
    });

    const handleDeleteItem = useMemoizedFn((itemId: string, e: React.MouseEvent) => {
      e.stopPropagation();

      // 找到要删除的项目
      const itemToDelete = richTextList.find(item => item.id === itemId);
      if (!itemToDelete) return;
      setConfirmDeleteItem(itemToDelete);
    });

    const handleConfirmDelete = useMemoizedFn(async () => {
      const itemToDelete = confirmDeleteItem;
      if (!itemToDelete) return;
      try {
        // 删除 content 记录（会自动减少引用计数）
        await deleteContent(itemToDelete.contentId);

        const newValue = richTextList.filter(item => item.id !== itemToDelete.id);
        onCellValueChange(newValue);
        toast.success("文档删除成功");
      } catch (error) {
        console.error("删除文档失败:", error);
        toast.error("删除文档失败");
      }
    });

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
            children: [{ type: "formatted", text: "" }],
          },
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

          toast.success("文档创建成功");
        }
      } catch (error) {
        console.error("创建文档失败:", error);
        toast.error("创建文档失败");
      }
    });

    // 选择搜索到的文档
    const handleSelectDocument = useMemoizedFn(async (items: SearchResult | SearchResult[]) => {
      // 处理单选情况
      const item = Array.isArray(items) ? items[0] : items;
      if (!item) return;

      // 检查是否已经关联
      const exists = richTextList.some(doc => doc.contentId === item.contentId);
      if (exists) {
        toast.warning("该文档已经关联");
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
        toast.success("文档关联成功");
      } catch (error) {
        console.error("关联文档失败:", error);
        toast.error("关联文档失败");
      }
    });

    // 编辑保存回调
    const handleEditSave = useMemoizedFn((title: string) => {
      // 更新列表中的标题
      const newValue = richTextList.map(item =>
        item.contentId === currentEditingContentId ? { ...item, title: title || item.title } : item
      );
      onCellValueChange(newValue);
    });

    // 横向滚动处理
    const handleWheel = useMemoizedFn((e: React.WheelEvent) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    });

    useEffect(() => {
      if (!editModalVisible || !currentEditingContentId) return;
      let cancelled = false;
      setEditingIsCard(true);
      isContentIsCard(currentEditingContentId).then(res => {
        if (!cancelled) setEditingIsCard(res);
      });
      return () => {
        cancelled = true;
      };
    }, [editModalVisible, currentEditingContentId]);

    const handleBuildCard = useMemoizedFn(async () => {
      if (!currentEditingContentId) return;
      setBuildingCard(true);
      try {
        const card = await buildCardFromContent(currentEditingContentId);
        handleTypeChange("card");
        setEditingIsCard(true);
        defaultCardEventBus.createEditor().publishCardEvent("card:created", card);
        toast.success("已转为卡片");
      } catch (error) {
        console.error("转为卡片失败:", error);
        toast.error("转为卡片失败");
      } finally {
        setBuildingCard(false);
      }
    });

    const handleTypeChange = useMemoizedFn((type: string) => {
      const newValue = richTextList.map(item =>
        item.contentId === currentEditingContentId
          ? { ...item, type: type as RichTextItem["type"] }
          : item
      );
      onCellValueChange(newValue);
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
            {richTextList.map(item => (
              <motion.div
                key={item.id}
                className="border-line-1 bg-surface hover:bg-hover rounded-tau-sm group relative flex min-w-0 flex-none cursor-pointer items-center gap-2 overflow-visible border px-2 py-1 transition-colors"
                onMouseEnter={() => setHoveredItemId(item.id)}
                onMouseLeave={() => setHoveredItemId(null)}
                onClick={() => handleItemClick(item)}
              >
                <div className="flex flex-none items-center">{getTypeIcon(item.type)}</div>

                <span className="text-ink-1 text-tau-sm max-w-24 truncate" title={item.title}>
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
                      className="bg-danger text-ink-inverse absolute -right-1 -top-1 z-10 flex h-3 w-3 cursor-pointer items-center justify-center rounded-full shadow-lg"
                      onClick={e => handleDeleteItem(item.id, e)}
                    >
                      <X className="h-2 w-2" strokeWidth={2.5} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 添加按钮 */}
        {!readonly && (
          <TauPopover
            anchor={addTriggerRef.current}
            placement="bottom-end"
            open={addPopoverVisible}
            onOpenChange={setAddPopoverVisible}
            arrow={false}
          >
            <DropdownMenu
              theme={theme}
              onLinkDocument={handleLinkDocument}
              onCreateDocument={handleCreateDocument}
            />
          </TauPopover>
        )}
        {!readonly && (
          <div
            ref={addTriggerRef}
            className="bg-hover hover:bg-press text-ink-2 hover:text-ink-1 rounded-tau-sm absolute right-1 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 px-1.5 py-1 transition-colors"
            role="button"
            aria-label="添加富文本"
            onClick={() => setAddPopoverVisible(v => !v)}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}

        <ConfirmDialog
          open={confirmDeleteItem !== null}
          onOpenChange={open => {
            if (!open) setConfirmDeleteItem(null);
          }}
          title="确认删除"
          context={confirmDeleteItem?.title}
          impact="确定要删除这个富文本文档吗？"
          danger
          confirmText="确定"
          onConfirm={() => handleConfirmDelete()}
        />

        {/* 文档选择模态框 */}
        <ContentSelectorModal
          open={selectorModalVisible}
          onCancel={() => setSelectorModalVisible(false)}
          onSelect={handleSelectDocument}
          contentType={["card", "article", "project-item", "diary-daily"]}
          title="选择要关联的文档"
          emptyDescription="未找到相关文档"
          multiple={false}
          excludeContentIds={richTextList.map(item => item.contentId)}
        />

        <ContentEditDialog
          open={editModalVisible && currentEditingContentId !== null}
          contentId={currentEditingContentId}
          heading="编辑文档"
          title={currentEditingTitle}
          titlePlaceholder="未命名文档"
          onTitleChange={title => {
            setCurrentEditingTitle(title);
            handleEditSave(title);
          }}
          footerActions={
            !editingIsCard && (
              <Button
                variant="secondary"
                size="sm"
                loading={buildingCard}
                loadingText="正在转换…"
                onClick={() => void handleBuildCard()}
              >
                转为卡片
              </Button>
            )
          }
          onClose={() => setEditModalVisible(false)}
        />
      </div>
    );
  }
);

RichTextRenderer.displayName = "RichTextRenderer";

export default RichTextRenderer;
