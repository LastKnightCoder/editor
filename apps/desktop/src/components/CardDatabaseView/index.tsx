import { memo, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { useMemoizedFn } from "ahooks";
import Database, {
  DatabaseRef,
  ColumnDef,
  RowData,
  DatabaseData,
  DatabaseProps,
  DatabaseChange,
  FilterGroup,
} from "@/components/Database";
import useCardDatabaseViewStore from "@/stores/useCardDatabaseViewStore";
import { ICard, ECardCategory, DataTableView, CreateDataTableView } from "@/types";
import { getEditorText } from "@/utils/editor";
import { cardCategoryName } from "@/constants";
import CardLinksPlugin from "./plugins/CardLinksPlugin";
import { updateCard } from "@/commands";
import { DateValue } from "@/components/Database/plugins/DatePlugin";
import useTheme from "@/hooks/useTheme";
import type { CardMetadataPatch } from "@/types/card";

interface CardDatabaseViewProps {
  cards: ICard[];
  tag?: string;
  searchResults?: ReadonlySet<number> | null;
  selectCategory: ECardCategory | "all";
  onCardClick: (card: ICard) => void;
  onOpenCreateCard: (defaultCategory: ECardCategory) => void;
  onDeleteCard: (cardId: number) => Promise<void>;
  onUpdateCard?: (cardId: number, patch: CardMetadataPatch) => Promise<ICard>;
}

export interface CardDatabaseViewRef {
  addCardRow: (card: ICard) => void;
  deleteCardRow: (cardId: number) => void;
}

const CardDatabaseView = forwardRef<CardDatabaseViewRef, CardDatabaseViewProps>((props, ref) => {
  const {
    cards,
    tag = "",
    searchResults = null,
    selectCategory,
    onCardClick,
    onOpenCreateCard,
    onDeleteCard,
    onUpdateCard,
  } = props;
  const { isDark } = useTheme();

  const databaseRef = useRef<DatabaseRef>(null);

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

  const getCardText = useMemoizedFn((card: ICard) => getEditorText(card.content, 50));

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
      databaseRef.current?.dispatch(
        { type: "rows.apply", changes: { upsert: [rowData], remove: [] } },
        "external"
      );
    },
    deleteCardRow: (cardId: number) => {
      databaseRef.current?.dispatch(
        { type: "rows.apply", changes: { upsert: [], remove: [String(cardId)] } },
        "external"
      );
    },
  }));

  // 收集所有标签
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    cards.forEach(card => {
      card.tags.forEach(tag => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }, [cards]);

  // 构建列定义
  const columns = useMemo((): ColumnDef[] => {
    const categoryOptions = Object.entries(cardCategoryName).map(([key, name]) => ({
      id: key,
      name,
      color: "blue" as const,
    }));

    const tagOptions = allTags.map(tag => ({
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
          allCards: cards,
          currentCardId: 0, // 会在行数据中动态设置
          onClickLink: (cardId: number) => {
            const card = cards.find(c => c.id === cardId);
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
  }, [allTags, cards, onCardClick, columnWidths]);

  const rows = useMemo((): RowData[] => {
    return cards.map(card => {
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

  const currentView = useMemo(() => {
    return views.find(v => v.id === activeViewId);
  }, [views, activeViewId]);

  useEffect(() => {
    databaseRef.current?.dispatch({ type: "rows.receive", rows }, "external");
  }, [rows, currentView?.id]);

  useEffect(() => {
    const filters: FilterGroup = { id: "card-query", type: "group", logic: "and", children: [] };
    if (selectCategory !== "all")
      filters.children.push({
        id: "category",
        type: "condition",
        fieldId: "category",
        operator: "是",
        value: selectCategory,
      });
    if (tag)
      filters.children.push({
        id: "tag",
        type: "condition",
        fieldId: "tags",
        operator: "包含任一",
        value: allTags.filter(value => value === tag || value.startsWith(tag + "/")),
      });
    databaseRef.current?.setQuery({
      filters,
      searchResults: searchResults === null ? null : Array.from(searchResults, String),
      grouping: searchResults === null ? "view" : "none",
    });
  }, [selectCategory, tag, searchResults, allTags, currentView?.id]);

  useEffect(() => {
    for (const column of columns) {
      if (column.config)
        databaseRef.current?.dispatch(
          { type: "column.configure", id: column.id, config: column.config },
          "external"
        );
    }
  }, [columns, currentView?.id]);

  // 视图配置
  const viewConfig = useMemo(() => {
    const currentColumnIds = columns.map(c => c.id);
    const currentRowIds = rows.map(r => r.id);

    if (!currentView) {
      const fallbackConfig = {
        columnOrder: currentColumnIds,
        rowOrder: currentRowIds,
        sorts: [],
        filters: null,
        groupBy: null,
        galleryConfig: undefined,
        calendarConfig: undefined,
        kanbanConfig: undefined,
      };
      return fallbackConfig;
    }

    // 确保 columnOrder 和 rowOrder 与当前数据同步
    const config = { ...currentView.config };

    // 如果 columnOrder 为空或与当前列不匹配，使用当前列顺序
    if (!config.columnOrder || config.columnOrder.length === 0) {
      config.columnOrder = currentColumnIds;
    } else {
      // 移除不存在的列，添加新列
      const validColumnOrder = config.columnOrder.filter(id => currentColumnIds.includes(id));
      currentColumnIds.forEach(id => {
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
      const validRowOrder = config.rowOrder.filter(id => currentRowIds.includes(id));
      currentRowIds.forEach(id => {
        if (!validRowOrder.includes(id)) {
          validRowOrder.push(id);
        }
      });
      config.rowOrder = validRowOrder;
    }

    const normalizedConfig = {
      ...config,
      sorts: config.sorts || [],
      filters: config.filters || null,
      groupBy: config.groupBy || null,
      galleryConfig: config.galleryConfig,
      calendarConfig: config.calendarConfig,
      kanbanConfig: config.kanbanConfig,
    };
    return normalizedConfig;
  }, [currentView, columns, rows]);

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

  const handleDataChange = useMemoizedFn(async (data: DatabaseData, change: DatabaseChange) => {
    for (const column of data.columns) {
      if (column.width !== undefined && columnWidths[column.id] !== column.width)
        setColumnWidth(column.id, column.width);
    }
    for (const row of change.rows.upsert) {
      const id = Number(row.id);
      const card = cards.find(card => card.id === id);
      if (!card) continue;
      const patch: CardMetadataPatch = {};
      if ("category" in row) patch.category = row.category as ECardCategory;
      if ("tags" in row) patch.tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
      if ("links" in row) patch.links = Array.isArray(row.links) ? (row.links as number[]) : [];
      if (!Object.keys(patch).length) continue;
      try {
        if (onUpdateCard) await onUpdateCard(id, patch);
        else await updateCard({ ...card, ...patch });
      } catch (error) {
        console.error("Failed to update card:", error);
      }
    }
  });

  const handleViewConfigChange = useMemoizedFn(config => {
    if (activeViewId) {
      updateView(activeViewId, { config });
    }
  });

  const handleCreateView = useMemoizedFn(
    async (viewData: CreateDataTableView): Promise<DataTableView | null> => {
      const newView: DataTableView = {
        id: Date.now(),
        tableId: 0,
        name: viewData.name,
        type: viewData.type,
        order: viewData.order,
        config: {
          columnOrder: columns.map(c => c.id),
          rowOrder: rows.map(r => r.id),
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
    }
  );

  const handleDeleteView = useMemoizedFn(async (viewId: number): Promise<number | null> => {
    deleteView(viewId);
    return viewId;
  });

  const handleRenameView = useMemoizedFn(
    async (viewId: number, name: string): Promise<DataTableView | null> => {
      const currentView = views.find(v => v.id === viewId);
      if (!currentView) {
        return null;
      }
      const nextView: DataTableView = {
        ...currentView,
        name,
      };
      updateView(viewId, { name });
      return nextView;
    }
  );

  const handleUpdateView = useMemoizedFn(
    async (
      viewId: number,
      updates: Parameters<NonNullable<DatabaseProps["onUpdateView"]>>[1]
    ): Promise<DataTableView | null> => {
      const currentView = views.find(v => v.id === viewId);
      if (!currentView) {
        return null;
      }

      const nextConfig = { ...currentView.config };
      let shouldUpdateConfig = false;

      if ("galleryConfig" in updates) {
        nextConfig.galleryConfig = updates.galleryConfig;
        shouldUpdateConfig = true;
      }
      if ("calendarConfig" in updates) {
        nextConfig.calendarConfig = updates.calendarConfig;
        shouldUpdateConfig = true;
      }
      if ("kanbanConfig" in updates) {
        nextConfig.kanbanConfig = updates.kanbanConfig;
        shouldUpdateConfig = true;
      }

      const payload: Partial<DataTableView> = {};

      if (typeof updates.name === "string") {
        payload.name = updates.name;
      }

      if (updates.type) {
        payload.type = updates.type;
      }

      if (shouldUpdateConfig) {
        payload.config = nextConfig;
      }

      if (!payload.name && !payload.type && !payload.config) {
        return currentView;
      }

      updateView(viewId, payload);
      const nextView = {
        ...currentView,
        ...payload,
      } as DataTableView;
      return nextView;
    }
  );

  const handleReorderViews = useMemoizedFn(async (orderedIds: number[]) => {
    reorderViews(orderedIds);
  });

  const handleActiveViewIdChange = useMemoizedFn(async (viewId: number | null) => {
    setActiveViewId(viewId);
  });

  const handleRowDelete = useMemoizedFn(async (rowId: string) => {
    const cardId = Number(rowId);
    onDeleteCard(cardId)
      .then(() => {
        databaseRef.current?.dispatch(
          { type: "rows.apply", changes: { upsert: [], remove: [rowId] } },
          "external"
        );
      })
      .catch(error => {
        console.error("Failed to delete card:", error);
      });
  });

  // 确保有有效的 activeViewId
  const validActiveViewId = useMemo(() => {
    const id = activeViewId || views[0]?.id || 0;
    return id;
  }, [activeViewId, views]);

  if (!currentView) {
    return null;
  }

  return (
    <div className="border-x-40 h-full w-full border border-transparent py-5">
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
        onRowDelete={handleRowDelete}
        onCreateView={handleCreateView}
        onDeleteView={handleDeleteView}
        onRenameView={handleRenameView}
        onUpdateView={handleUpdateView}
        onReorderViews={handleReorderViews}
        onActiveViewIdChange={handleActiveViewIdChange}
        onRowDetailOpen={row => {
          const cardId = parseInt(row.id, 10);
          const card = cards.find(c => c.id === cardId);
          if (card) {
            onCardClick(card);
          }
        }}
        theme={isDark ? "dark" : "light"}
        readonly={false}
      />
    </div>
  );
});

CardDatabaseView.displayName = "CardDatabaseView";

export default memo(CardDatabaseView);
