import {
  memo,
  useMemo,
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useMemoizedFn } from "ahooks";
import Database, {
  DatabaseRef,
  ColumnDef,
  RowData,
  DatabaseData,
} from "@/components/Database";
import useCardDatabaseViewStore from "@/stores/useCardDatabaseViewStore";
import {
  ICard,
  ECardCategory,
  DataTableView,
  CreateDataTableView,
} from "@/types";
import { getEditorText } from "@/utils/editor";
import { cardCategoryName } from "@/constants";
import CardLinksPlugin from "./plugins/CardLinksPlugin";
import { updateCard } from "@/commands";
import { DateValue } from "@/components/Database/plugins/DatePlugin";
import useTheme from "@/hooks/useTheme";

interface CardDatabaseViewProps {
  cards: ICard[];
  allCards: ICard[];
  selectCategory: ECardCategory | "all";
  onCardClick: (card: ICard) => void;
  onOpenCreateCard: (defaultCategory: ECardCategory) => void;
}

export interface CardDatabaseViewRef {
  addCardRow: (card: ICard) => void;
}

const CardDatabaseView = forwardRef<CardDatabaseViewRef, CardDatabaseViewProps>(
  (props, ref) => {
    const { cards, allCards, selectCategory, onCardClick, onOpenCreateCard } =
      props;
    const { isDark } = useTheme();

    const databaseRef = useRef<DatabaseRef>(null);
    const prevRowIdsRef = useRef<Set<string>>(new Set());

    // 缓存提取的文本
    const [extractedTextCache] = useState<Map<number, string>>(() => new Map());

    const {
      views,
      activeViewId,
      columnWidths,
      setActiveViewId,
      addView,
      updateView,
      deleteView,
      reorderViews,
      setColumnWidth,
      initializeDefaultView,
    } = useCardDatabaseViewStore();

    // 初始化默认视图
    useEffect(() => {
      initializeDefaultView();
    }, [initializeDefaultView]);

    // 提取卡片文本（带缓存）
    const getCardText = useMemoizedFn((card: ICard) => {
      if (extractedTextCache.has(card.id)) {
        return extractedTextCache.get(card.id)!;
      }
      const text = getEditorText(card.content, 50);
      extractedTextCache.set(card.id, text);
      return text;
    });

    useImperativeHandle(ref, () => ({
      addCardRow: (card: ICard) => {
        const rowData: RowData = {
          id: String(card.id),
          title: getCardText(card),
          category: card.category,
          tags: card.tags,
          links: card.links,
          create_time: {
            start: card.create_time,
            end: card.create_time,
          } as DateValue,
          update_time: {
            start: card.update_time,
            end: card.update_time,
          } as DateValue,
        };
        databaseRef.current?.addRow(rowData);
      },
    }));

    // 收集所有标签
    const allTags = useMemo(() => {
      const tagsSet = new Set<string>();
      allCards.forEach((card) => {
        card.tags.forEach((tag) => tagsSet.add(tag));
      });
      return Array.from(tagsSet).sort();
    }, [allCards]);

    // 构建列定义
    const columns = useMemo((): ColumnDef[] => {
      const categoryOptions = Object.entries(cardCategoryName).map(
        ([key, name]) => ({
          id: key,
          name,
          color: "blue" as const,
        }),
      );

      const tagOptions = allTags.map((tag) => ({
        id: tag,
        name: tag,
        color: "blue" as const,
      }));

      return [
        {
          id: "title",
          title: "标题",
          type: "text",
          width: columnWidths["title"] || 300,
          isPrimary: true,
        },
        {
          id: "category",
          title: "分类",
          type: "select",
          width: columnWidths["category"] || 150,
          config: {
            options: categoryOptions,
          },
        },
        {
          id: "tags",
          title: "标签",
          type: "multiSelect",
          width: columnWidths["tags"] || 200,
          config: {
            options: tagOptions,
          },
        },
        {
          id: "links",
          title: "链接",
          type: "card-links",
          width: columnWidths["links"] || 250,
          config: {
            allCards,
            currentCardId: 0, // 会在行数据中动态设置
            onClickLink: (cardId: number) => {
              const card = allCards.find((c) => c.id === cardId);
              if (card) {
                onCardClick(card);
              }
            },
          },
        },
        {
          id: "create_time",
          title: "创建时间",
          type: "date",
          width: columnWidths["create_time"] || 180,
          readonly: true,
        },
        {
          id: "update_time",
          title: "更新时间",
          type: "date",
          width: columnWidths["update_time"] || 180,
          readonly: true,
        },
      ];
    }, [allTags, allCards, onCardClick, columnWidths]);

    // 构建行数据
    const rows = useMemo((): RowData[] => {
      return cards.map((card) => {
        const row: RowData = {
          id: String(card.id),
          title: getCardText(card),
          category: card.category,
          tags: card.tags,
          links: card.links,
          create_time: {
            start: card.create_time,
            end: card.create_time,
          } as DateValue,
          update_time: {
            start: card.update_time,
            end: card.update_time,
          } as DateValue,
        };
        return row;
      });
    }, [cards, getCardText]);

    // 获取当前激活的视图
    const currentView = useMemo(() => {
      return views.find((v) => v.id === activeViewId);
    }, [views, activeViewId]);

    // 视图配置
    const viewConfig = useMemo(() => {
      const currentColumnIds = columns.map((c) => c.id);
      const currentRowIds = rows.map((r) => r.id);

      if (!currentView) {
        return {
          columnOrder: currentColumnIds,
          rowOrder: currentRowIds,
          sorts: [],
          filters: null,
          groupBy: null,
        };
      }

      // 确保 columnOrder 和 rowOrder 与当前数据同步
      const config = { ...currentView.config };

      // 如果 columnOrder 为空或与当前列不匹配，使用当前列顺序
      if (!config.columnOrder || config.columnOrder.length === 0) {
        config.columnOrder = currentColumnIds;
      } else {
        // 移除不存在的列，添加新列
        const validColumnOrder = config.columnOrder.filter((id) =>
          currentColumnIds.includes(id),
        );
        currentColumnIds.forEach((id) => {
          if (!validColumnOrder.includes(id)) {
            validColumnOrder.push(id);
          }
        });
        config.columnOrder = validColumnOrder;
      }

      // 同步 rowOrder
      if (!config.rowOrder || config.rowOrder.length === 0) {
        config.rowOrder = currentRowIds;
      } else {
        // 移除不存在的行，添加新行
        const validRowOrder = config.rowOrder.filter((id) =>
          currentRowIds.includes(id),
        );
        currentRowIds.forEach((id) => {
          if (!validRowOrder.includes(id)) {
            validRowOrder.push(id);
          }
        });
        config.rowOrder = validRowOrder;
      }

      return config;
    }, [currentView, columns, rows]);

    // 处理新增行
    const handleRowAdd = useMemoizedFn((defaultData?: Partial<RowData>) => {
      // 提取默认分类
      let defaultCategory: ECardCategory = ECardCategory.Temporary;
      if (defaultData && defaultData.category) {
        defaultCategory = defaultData.category as ECardCategory;
      } else if (selectCategory !== "all") {
        defaultCategory = selectCategory as ECardCategory;
      }

      // 打开 CreateCard
      onOpenCreateCard(defaultCategory);
    });

    // 处理数据变化
    const handleDataChange = useMemoizedFn(async (data: DatabaseData) => {
      // 检测列宽变化并保存
      data.columns.forEach((col) => {
        if (col.width !== undefined && columnWidths[col.id] !== col.width) {
          setColumnWidth(col.id, col.width);
        }
      });

      prevRowIdsRef.current = new Set(data.rows.map((r) => r.id));

      // 检测数据变更并同步到后端
      // 比对 rows，找出被修改的卡片
      for (const row of data.rows) {
        const cardId = Number(row.id);
        const card = cards.find((c) => c.id === cardId);
        if (!card) continue;

        let hasChanges = false;
        const updates: Partial<ICard> = {};

        // 检查分类变化
        if (row.category !== card.category) {
          updates.category = row.category as ECardCategory;
          hasChanges = true;
        }

        // 检查标签变化
        const newTags = Array.isArray(row.tags) ? row.tags : [];
        const sortedNewTags = [...newTags].sort();
        const sortedCardTags = [...card.tags].sort();
        if (JSON.stringify(sortedNewTags) !== JSON.stringify(sortedCardTags)) {
          updates.tags = newTags;
          hasChanges = true;
        }

        // 检查链接变化
        const newLinks = Array.isArray(row.links)
          ? (row.links as number[])
          : [];
        const sortedNewLinks = [...newLinks].sort();
        const sortedCardLinks = [...card.links].sort();
        if (
          JSON.stringify(sortedNewLinks) !== JSON.stringify(sortedCardLinks)
        ) {
          updates.links = newLinks;
          hasChanges = true;
        }

        // 如果有变化，更新卡片
        if (hasChanges) {
          try {
            await updateCard({
              ...card,
              ...updates,
            });
          } catch (error) {
            console.error("Failed to update card:", error);
          }
        }
      }
    });

    // 处理视图配置变化
    const handleViewConfigChange = useMemoizedFn((config) => {
      console.log("[CardDatabaseView] handleViewConfigChange:", {
        activeViewId,
        columnOrder: JSON.stringify(config.columnOrder, null, 2),
        currentViewColumnOrder: currentView?.config.columnOrder?.length || 0,
      });
      if (activeViewId) {
        updateView(activeViewId, { config });
      }
    });

    // 处理创建视图
    const handleCreateView = useMemoizedFn(
      async (viewData: CreateDataTableView): Promise<DataTableView | null> => {
        const newView: DataTableView = {
          id: Date.now(),
          tableId: 0,
          name: viewData.name,
          type: viewData.type,
          order: viewData.order,
          config: {
            columnOrder: columns.map((c) => c.id),
            rowOrder: rows.map((r) => r.id),
            sorts: [],
            filters: null,
            groupBy: null,
            ...(viewData.config || {}),
          },
          createTime: Date.now(),
          updateTime: Date.now(),
        };
        addView(newView);
        return newView;
      },
    );

    // 处理删除视图
    const handleDeleteView = useMemoizedFn(
      async (viewId: number): Promise<number | null> => {
        deleteView(viewId);
        return viewId;
      },
    );

    // 处理重命名视图
    const handleRenameView = useMemoizedFn(
      async (viewId: number, name: string): Promise<DataTableView | null> => {
        updateView(viewId, { name });
        const view = views.find((v) => v.id === viewId);
        return view || null;
      },
    );

    // 处理更新视图
    const handleUpdateView = useMemoizedFn(
      async (
        viewId: number,
        updates: Parameters<typeof updateView>[1],
      ): Promise<DataTableView | null> => {
        updateView(viewId, updates);
        const view = views.find((v) => v.id === viewId);
        return view || null;
      },
    );

    // 处理重排视图
    const handleReorderViews = useMemoizedFn(async (orderedIds: number[]) => {
      reorderViews(orderedIds);
    });

    // 处理激活视图变化
    const handleActiveViewIdChange = useMemoizedFn(
      async (viewId: number | null) => {
        setActiveViewId(viewId);
      },
    );

    // 确保有有效的 activeViewId
    const validActiveViewId = useMemo(() => {
      const id = activeViewId || views[0]?.id || 0;
      return id;
    }, [activeViewId, views]);

    if (!currentView) {
      return null;
    }

    return (
      <div className="w-full h-full border border-x-[40px] py-5 border-transparent">
        <Database
          ref={databaseRef}
          columns={columns}
          data={rows}
          views={views}
          activeViewId={validActiveViewId}
          viewConfig={viewConfig}
          config={{
            allowAddColumn: false,
            allowDeleteColumn: false,
          }}
          plugins={[CardLinksPlugin as any]}
          onDataChange={handleDataChange}
          onViewConfigChange={handleViewConfigChange}
          onRowAdd={handleRowAdd}
          onCreateView={handleCreateView}
          onDeleteView={handleDeleteView}
          onRenameView={handleRenameView}
          onUpdateView={handleUpdateView}
          onReorderViews={handleReorderViews}
          onActiveViewIdChange={handleActiveViewIdChange}
          onRowDetailOpen={(row) => {
            const cardId = parseInt(row.id, 10);
            const card = cards.find((c) => c.id === cardId);
            if (card) {
              onCardClick(card);
            }
          }}
          theme={isDark ? "dark" : "light"}
          readonly={false}
        />
      </div>
    );
  },
);

CardDatabaseView.displayName = "CardDatabaseView";

export default memo(CardDatabaseView);
