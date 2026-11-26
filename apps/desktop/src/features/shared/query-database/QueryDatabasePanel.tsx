import { queryUiErrorText, queryUiTranslator, useQueryUiI18n } from "./ui.i18n";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronUp, Eye, Lock, MoreHorizontal, Plus } from "lucide-react";
import Database, {
  defineDatabaseExtension,
  type DatabaseProps,
  type DatabaseRef,
  type CellPlugin,
  type FilterGroup,
} from "@tau/database";
import type { FilterNode } from "@tau/shared/database-types";
import { defineFieldModel } from "@tau/database/model";
import { Button, Checkbox, Menu, Popover, Tooltip, cn, toast } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import { ShikiOverlayEditor } from "@tau/editor-source-view/overlay";
import {
  type QueryDefinition,
  type QuerySource,
  type QueryValue,
} from "@tau/shared/query-database";
import { useQueryDatabase } from "./useQueryDatabase";
import { useQueryAssist } from "./useQueryAssist";
import {
  changePresentationConfig,
  initialQueryPresentation,
  toQueryDataset,
  queryViewReferences,
  type QueryPresentation,
} from "./presentation";
import { locateQueryError, starterQuery, summarizeQuery } from "./summary";
import { useQueryHeaderSlot } from "./headerSlot";
import {
  AssistRow,
  LanguageMenu,
  Notice,
  ParamChips,
  ProblemBar,
  QueryStatusPill,
  QueryToggleButton,
  type QueryStatusKind,
} from "./QueryParts";
import { openEntity } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import { parseTaskKey } from "@tau/shared/task-assistant";
import type { EditorTextField } from "@tau/editor/source-contracts";

const entityModel = defineFieldModel({
  type: "queryEntity",
  valueType: "text",
  toText: value =>
    value && typeof value === "object"
      ? String(
          (value as Record<string, unknown>).title ?? (value as Record<string, unknown>).id ?? ""
        )
      : "",
});
const entityPlugin: CellPlugin<unknown> = {
  type: "queryEntity",
  model: entityModel,
  get name() {
    return queryUiTranslator.t("entity.source");
  },
  editable: false,
  valueType: "text",
  Renderer: ({ value }) => {
    const { t } = useQueryUiI18n();
    if (!value || typeof value !== "object") return null;
    return (
      <button
        type="button"
        title={t("entity.open")}
        className="text-ink-1 decoration-line-1 w-full truncate px-2 text-left underline-offset-[3px] hover:underline"
        onClick={event => {
          event.stopPropagation();
          void openQueryEntity(value).catch(error => toast.error(queryUiErrorText(error)));
        }}
      >
        {String(value.title ?? value.id)}
      </button>
    );
  },
};
const queryExtension = defineDatabaseExtension({
  id: "tau.query-database",
  create: () => ({ fieldTypes: [entityPlugin] }),
});
const extensions = [queryExtension];
const readonlyConfig = {
  allowAddRow: false,
  allowDeleteRow: false,
  allowAddColumn: false,
  allowDeleteColumn: false,
  allowViewEditing: true,
};

async function openQueryEntity(value: { kind?: unknown; id?: unknown; title?: unknown }) {
  if (
    typeof value.kind !== "string" ||
    (typeof value.id !== "string" && typeof value.id !== "number")
  )
    return;
  const id = Number(value.id);
  if (value.kind === "card" || value.kind === "article")
    return openEntity({ kind: value.kind, id });
  if (value.kind === "document") return openEntity({ kind: "project-item", id });
  if (value.kind === "project") return openPage("project-detail", { id });
  if (value.kind === "whiteboard") return openPage("whiteboard-detail", { id });
  if (value.kind === "diary")
    return openPage(
      "diary",
      typeof value.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.title)
        ? { date: value.title }
        : {}
    );
  if (value.kind === "event" && id > 0) return openPage("schedule", { eventId: id });
  if (value.kind === "todo") {
    const target = parseTaskKey(String(value.id));
    if (target?.taskRef.kind === "todo")
      return openPage("todos", { selectedId: target.taskRef.todoId });
  }
  throw Object.assign(new Error("当前来源不支持直接打开"), {
    code: "QUERY_SOURCE_OPEN_UNSUPPORTED",
  });
}

export interface QueryDatabasePanelProps {
  definition: QueryDefinition;
  onDefinitionChange?(definition: QueryDefinition): void;
  presentation?: QueryPresentation;
  onPresentationChange?(presentation: QueryPresentation): void;
  databaseProps?: Partial<DatabaseProps>;
  /** 保存失败等宿主问题：「查询未保存」状态与标题下的提示条 */
  saveIssue?: { message: string; actions: ReactNode };
  codeBinding?: EditorTextField | null;
  /** 正文块：来源名作标题，工具与状态并入视图栏 */
  variant?: "page" | "block";
  /** 打开时就展开源码；带 assist 时立即让 AI 编写 */
  initialSourceOpen?: boolean;
  initialAssist?: string;
}

export function QueryDatabasePanel({
  definition,
  onDefinitionChange,
  presentation,
  onPresentationChange,
  databaseProps,
  saveIssue,
  codeBinding,
  variant = "page",
  initialSourceOpen,
  initialAssist,
}: QueryDatabasePanelProps) {
  const { t } = useQueryUiI18n();
  const block = variant === "block";
  const editable = Boolean(onDefinitionChange);
  const state = useQueryDatabase(definition);
  const instance = useRef<DatabaseRef>(null);
  const headerSlot = useQueryHeaderSlot();
  const [sourceOpen, setSourceOpen] = useState(initialSourceOpen ?? Boolean(initialAssist));
  const [addingParam, setAddingParam] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>();
  const [dismissedSchema, setDismissedSchema] = useState(false);
  const previousTypes = useRef(new Map<string, string>());
  const [localPresentation, setLocalPresentation] = useState(
    () => presentation ?? initialQueryPresentation()
  );
  const viewState =
    (databaseProps || onPresentationChange) && presentation ? presentation : localPresentation;
  const mode = useThemeStore(theme => theme.mode);
  const summary = useMemo(() => summarizeQuery(definition), [definition]);
  const sourceTitle = summary.source ? t(`source.${summary.source}`) : undefined;
  const assist = useQueryAssist({
    definition,
    error: state.error ?? summary.syntaxError,
    codeBinding,
    onDefinitionChange,
  });
  const data = useMemo(
    () => (state.result ? toQueryDataset(state.result) : { columns: [], rows: [] }),
    [state.result]
  );
  useLayoutEffect(() => {
    instance.current?.dispatch({ type: "dataset.receive", ...data }, "external");
  }, [data]);
  useEffect(() => {
    if (state.result && !state.error) setUpdatedAt(Date.now());
  }, [state.result, state.error]);
  const assistStarted = useRef(false);
  useEffect(() => {
    if (!initialAssist || assistStarted.current || !assist.available) return;
    assistStarted.current = true;
    void assist.generate(initialAssist);
  }, [initialAssist, assist]);
  const presentationKey = JSON.stringify(presentation);
  useEffect(() => {
    if (presentationKey) setLocalPresentation(JSON.parse(presentationKey));
  }, [presentationKey]);
  const updatePresentation = (next: QueryPresentation) => {
    setLocalPresentation(next);
    onPresentationChange?.(next);
  };
  const activeView =
    viewState.views.find(view => view.id === viewState.activeViewId) ?? viewState.views[0];
  const activeConfig = activeView?.config;
  const viewRefs = useMemo(
    () => queryViewReferences(activeConfig ?? initialQueryPresentation().views[0].config),
    [activeConfig]
  );
  const missingViewFields = state.result
    ? [...viewRefs].filter(id => !data.columns.some(column => column.id === id))
    : [];
  const [typeChanged, setTypeChanged] = useState(false);
  useLayoutEffect(() => {
    if (!state.result) return;
    if (
      data.columns.some(
        column =>
          viewRefs.has(column.id) &&
          previousTypes.current.has(column.id) &&
          previousTypes.current.get(column.id) !== column.type
      )
    ) {
      setTypeChanged(true);
      setDismissedSchema(false);
    }
    previousTypes.current = new Map(data.columns.map(column => [column.id, column.type]));
  }, [data.columns, state.result, viewRefs]);

  const blank = !definition.code.trim();
  const syntaxError = summary.syntaxError;
  const queryError = syntaxError || blank ? undefined : state.error;
  const hasProblem = Boolean(syntaxError || queryError);
  const running = state.loading || assist.state.status === "busy";
  const statusKind: QueryStatusKind = saveIssue
    ? "unsaved"
    : running
      ? "running"
      : hasProblem
        ? "error"
        : "live";
  const stale = Boolean(hasProblem && state.result);
  const errorLocation = syntaxError ? locateQueryError(definition.code, syntaxError) : undefined;

  const viewCallbacks: Partial<DatabaseProps> = databaseProps ?? {
    onViewConfigChange: config => updatePresentation(changePresentationConfig(viewState, config)),
    onActiveViewIdChange: async id => {
      if (id !== null) updatePresentation({ ...viewState, activeViewId: id });
    },
    onCreateView: async view => {
      const created = {
        ...view,
        config: {
          ...initialQueryPresentation().views[0].config,
          ...view.config,
        },
        id: Math.max(0, ...viewState.views.map(item => item.id)) + 1,
        order: viewState.views.length,
      };
      updatePresentation({
        views: [...viewState.views, created],
        activeViewId: created.id,
      });
      return created;
    },
    onDeleteView: async id => {
      const views = viewState.views.filter(view => view.id !== id);
      if (!views.length) return null;
      updatePresentation({
        views,
        activeViewId: viewState.activeViewId === id ? views[0].id : viewState.activeViewId,
      });
      return id;
    },
    onRenameView: async (id, name) => {
      const view = viewState.views.find(view => view.id === id);
      if (!view) return null;
      const next = { ...view, name };
      updatePresentation({
        ...viewState,
        views: viewState.views.map(view => (view.id === id ? next : view)),
      });
      return next;
    },
    onUpdateView: async (id, updates) => {
      const view = viewState.views.find(view => view.id === id);
      if (!view) return null;
      const next = {
        ...view,
        ...updates,
        config: updates.viewOptions
          ? {
              ...view.config,
              viewOptions: {
                ...view.config.viewOptions,
                [updates.type ?? view.type]: updates.viewOptions,
              },
            }
          : view.config,
      };
      updatePresentation({
        ...viewState,
        views: viewState.views.map(view => (view.id === id ? next : view)),
      });
      return next;
    },
    onReorderViews: async ids =>
      updatePresentation({
        ...viewState,
        views: ids.flatMap((id, order) => {
          const view = viewState.views.find(view => view.id === id);
          return view ? [{ ...view, order }] : [];
        }),
      }),
  };

  const applyViewConfig = (config: NonNullable<typeof activeView>["config"]) => {
    if (!activeView) return;
    void viewCallbacks.onViewConfigChange?.(config);
    instance.current?.dispatch(
      { type: "view.receive", view: { ...activeView, config } },
      "external"
    );
  };
  const removeMissingFields = () => {
    if (!activeView) return;
    const missing = new Set(missingViewFields);
    const config = activeView.config;
    const pruneFilters = (group: FilterGroup | null): FilterGroup | null => {
      if (!group) return group;
      const children: FilterNode[] = [];
      for (const child of group.children) {
        if (child.type === "group") {
          const pruned = pruneFilters(child);
          if (pruned) children.push(pruned);
        } else if (!child.fieldId || !missing.has(child.fieldId)) children.push(child);
      }
      return children.length ? { ...group, children } : null;
    };
    applyViewConfig({
      ...config,
      filters: pruneFilters(config.filters ?? null),
      sorts: config.sorts.filter(sort => !missing.has(sort.fieldId)),
      groupBy: config.groupBy && missing.has(config.groupBy.fieldId) ? null : config.groupBy,
    });
  };

  const changeParams = (params: Record<string, QueryValue>) =>
    onDefinitionChange?.({
      ...definition,
      ...(Object.keys(params).length ? { params } : { params: undefined }),
    });

  const statusPill = (
    <QueryStatusPill
      kind={statusKind}
      count={state.result?.rows.length}
      updatedAt={updatedAt}
      hasResult={Boolean(state.result)}
      onRefresh={state.refresh}
      compact={block}
      labelClassName={
        block ? "hidden @min-[480px]/db-toolbar:inline" : "hidden @min-[480px]/query-header:inline"
      }
    />
  );
  const toggle = (
    <QueryToggleButton
      open={sourceOpen}
      problem={hasProblem}
      small={block}
      onClick={() => setSourceOpen(open => !open)}
    />
  );

  const source = sourceOpen && (
    <div
      className={cn(
        "flex shrink-0 flex-col rounded-[11px] shadow-[inset_0_0_0_1px_var(--tau-line-1)]",
        block ? "mt-1 mb-2.5" : "mx-8 mb-3.5"
      )}
    >
      <div className="border-line-2 flex min-h-10 flex-wrap items-center gap-1.5 border-b py-1.5 pr-2 pl-2.5">
        <LanguageMenu
          value={definition.language}
          disabled={!editable}
          onChange={language => onDefinitionChange?.({ ...definition, language })}
        />
        <ParamChips
          params={definition.params ?? {}}
          names={summary.paramNames}
          readOnly={!editable}
          adding={addingParam}
          onAddingChange={setAddingParam}
          onChange={changeParams}
        />
        <span className="flex-1" />
        {editable && (
          <Menu
            align="end"
            trigger={
              <button
                type="button"
                aria-label={t("settings.more")}
                className="text-ink-3 hover:bg-hover hover:text-ink-1 grid size-7 place-items-center rounded-[8px]"
              >
                <MoreHorizontal className="size-[15px]" strokeWidth={1.75} />
              </button>
            }
          >
            <Menu.Item
              icon={<Plus />}
              // 菜单关闭会把焦点还给触发按钮，晚一帧再挂输入框，免得它刚出现就失焦
              onSelect={() => requestAnimationFrame(() => setAddingParam(true))}
            >
              {t("param.add")}
            </Menu.Item>
          </Menu>
        )}
        <Tooltip content={t("source.collapse")}>
          <button
            type="button"
            aria-label={t("source.collapse")}
            onClick={() => setSourceOpen(false)}
            className="text-ink-3 hover:bg-hover hover:text-ink-1 grid size-7 place-items-center rounded-[8px]"
          >
            <ChevronUp className="size-[13px]" strokeWidth={1.75} />
          </button>
        </Tooltip>
      </div>
      <div
        className="text-tau-body max-h-64 overflow-auto py-1.5"
        style={
          {
            "--ed-code-pad-top": "0.25em",
            "--ed-code-pad-right": "1em",
            "--ed-code-pad-bottom": "0.25em",
            "--ed-code-pad-left": "0.75em",
          } as CSSProperties
        }
      >
        <ShikiOverlayEditor
          className="ed-code-overlay"
          value={definition.code}
          textBinding={codeBinding}
          language={definition.language === "dsl" ? "sql" : "javascript"}
          isDark={mode === "dark"}
          readOnly={!editable}
          lineNumbers
          highlightLines={errorLocation ? String(errorLocation.line) : undefined}
          onChange={code => onDefinitionChange?.({ ...definition, code })}
        />
      </div>
      {syntaxError && (
        <ProblemBar
          tone="danger"
          position={
            errorLocation
              ? t("error.position", { line: errorLocation.line, column: errorLocation.column })
              : undefined
          }
          message={syntaxError.replace(/^第 \d+ 字符：/, "")}
        />
      )}
      {queryError && (
        <ProblemBar tone="danger" message={queryError}>
          <Button size="sm" variant="ghost" disabled={state.loading} onClick={state.refresh}>
            {t("retryQuery")}
          </Button>
        </ProblemBar>
      )}
      {blank && editable && (
        <SourceQuickPicks onPick={query => onDefinitionChange?.({ ...definition, ...query })} />
      )}
      {assist.available && (
        <AssistRow
          state={assist.state}
          hasError={hasProblem}
          onSubmit={request => void assist.generate(request)}
          onStop={assist.stop}
          onUndo={assist.undo}
          onAccept={assist.accept}
          onDismiss={assist.dismiss}
          autoFocus={block && !definition.code.trim()}
        />
      )}
    </div>
  );

  const showSchemaNotice =
    missingViewFields.length > 0 || (typeChanged && !dismissedSchema && !block);
  const notices = (
    <>
      {saveIssue && !block && (
        <Notice tone="warn" actions={saveIssue.actions}>
          {t("save.unsaved")}
          <span className="text-ink-3">{saveIssue.message}</span>
        </Notice>
      )}
      {queryError && !sourceOpen && (
        <Notice
          tone="danger"
          actions={
            <>
              <Button size="sm" variant="secondary" onClick={() => setSourceOpen(true)}>
                {t("source.open")}
              </Button>
              <Button size="sm" variant="ghost" disabled={state.loading} onClick={state.refresh}>
                {t("retryQuery")}
              </Button>
            </>
          }
        >
          {queryError}
          {state.result && <span className="text-ink-3">{t("result.previous")}</span>}
        </Notice>
      )}
      {showSchemaNotice && (
        <Notice
          tone="warn"
          actions={
            missingViewFields.length ? (
              <Button size="sm" variant="secondary" onClick={removeMissingFields}>
                {t("schema.remove")}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setDismissedSchema(true)}>
                {t("dismiss")}
              </Button>
            )
          }
        >
          {missingViewFields.length
            ? t("schema.missing", { count: missingViewFields.length })
            : t("schema.changed")}
        </Notice>
      )}
    </>
  );

  const columnsMenu = (
    <ColumnsMenu data={data.columns} view={activeView} onChange={applyViewConfig} />
  );

  const empty =
    state.result && !state.result.rows.length && !hasProblem ? (
      <div
        className={cn(
          "text-ink-3 flex flex-col items-center gap-1.5 text-center",
          block ? "py-6" : "py-12"
        )}
      >
        <b className="text-ink-1 text-[14px] font-semibold">
          {t("result.empty", { source: sourceTitle ?? t("data") })}
        </b>
        <span className="text-tau-meta">{t("result.emptyHint")}</span>
        {editable && (
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSourceOpen(true)}>
              {t("source.adjust")}
            </Button>
            {assist.available && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSourceOpen(true);
                  void assist.generate("放宽条件，让结果不为空");
                }}
              >
                {t("assist.relax")}
              </Button>
            )}
          </div>
        )}
      </div>
    ) : null;

  const table = activeView && (
    <div
      className={cn(
        "relative flex min-h-0 flex-col",
        // 表格按内容自适应高度；看板、日历、画廊靠撑满容器排版，块里给固定高度
        block
          ? activeView.type === "table"
            ? "max-h-[min(28rem,60vh)]"
            : "h-[min(28rem,60vh)]"
          : "flex-1",
        stale && "opacity-60"
      )}
    >
      {state.loading && state.result && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 z-20 h-0.5 overflow-hidden",
            block ? "top-[46px]" : "top-[46px] mx-8"
          )}
        >
          <i className="bg-accent animate-progress-flow absolute inset-y-0 block w-1/3 rounded-full" />
        </div>
      )}
      <Database
        ref={instance}
        {...viewCallbacks}
        bare
        className="min-h-0 flex-1"
        columns={data.columns}
        data={data.rows}
        views={viewState.views}
        activeViewId={activeView.id}
        viewConfig={activeView.config}
        extensions={extensions}
        readonly
        config={readonlyConfig}
        toolbar={
          block
            ? {
                flush: true,
                lead: (
                  <span className="text-ink-1 mr-3 shrink-0 pl-2 text-[15px] font-semibold whitespace-nowrap">
                    {sourceTitle ?? t("query")}
                  </span>
                ),
                extra: (
                  <>
                    {columnsMenu}
                    {statusPill}
                    {toggle}
                  </>
                ),
              }
            : { extra: columnsMenu }
        }
      />
      {!state.result && state.loading && (
        <div
          className={cn(
            "text-tau-meta text-ink-3 flex items-center justify-center gap-2",
            block ? "py-8" : "absolute inset-x-0 top-24"
          )}
        >
          <i className="border-line-1 border-t-accent size-[13px] animate-spin rounded-full border-[1.5px]" />
          {t("result.loading", { source: sourceTitle ?? t("data") })}
        </div>
      )}
      {empty && <div className={block ? undefined : "absolute inset-x-0 top-20"}>{empty}</div>}
      {!block && state.result && state.result.rows.length > 0 && (
        <div className="text-ink-3 flex h-8 shrink-0 items-center gap-1.5 px-8 text-[12px]">
          <Lock className="size-3" strokeWidth={2} />
          {t("result.readonly")}
        </div>
      )}
    </div>
  );

  if (block)
    return (
      <div data-query-panel className="flex flex-col">
        {source}
        {notices}
        {table}
      </div>
    );

  const headerControls = (
    <>
      {statusPill}
      {toggle}
    </>
  );
  return (
    <div data-query-panel className="flex min-h-0 flex-1 flex-col">
      {headerSlot === undefined ? (
        <div className="@container/query-header flex shrink-0 items-center justify-end gap-2 px-8 pb-2">
          {headerControls}
        </div>
      ) : (
        headerSlot && createPortal(headerControls, headerSlot)
      )}
      {source}
      {(saveIssue || (queryError && !sourceOpen) || showSchemaNotice) && (
        <div className="mx-8 mb-3 flex flex-col gap-2">{notices}</div>
      )}
      {table}
    </div>
  );
}

function ColumnsMenu({
  data,
  view,
  onChange,
}: {
  data: { id: string; title: string }[];
  view?: QueryPresentation["views"][number];
  onChange(config: QueryPresentation["views"][number]["config"]): void;
}) {
  const { t } = useQueryUiI18n();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  if (!view || !data.length) return null;
  const hidden = view.config.hiddenColumnIds ?? [];
  return (
    <>
      <Tooltip content={t("columns.show")}>
        <button
          ref={button}
          type="button"
          aria-label={t("columns.show")}
          aria-pressed={hidden.length > 0}
          onClick={() => setOpen(value => !value)}
          className={cn(
            "ease-tau-out flex h-7 shrink-0 items-center gap-1.5 rounded-[8px] px-2 whitespace-nowrap transition-[background-color,color] duration-[160ms] @min-[560px]/db-toolbar:px-2.5",
            hidden.length
              ? "bg-accent-soft text-accent-text"
              : "text-ink-3 hover:bg-hover hover:text-ink-1"
          )}
        >
          <Eye className="size-[13px]" strokeWidth={1.75} />
          <span className="text-tau-meta hidden @min-[560px]/db-toolbar:inline">
            {t("columns.show")}
          </span>
          {hidden.length > 0 && (
            <span className="text-[10.5px] font-bold tabular-nums">{hidden.length}</span>
          )}
        </button>
      </Tooltip>
      <Popover
        anchor={button.current}
        open={open}
        onOpenChange={setOpen}
        placement="bottom-end"
        arrow={false}
      >
        <div className="flex min-w-44 flex-col gap-2 p-3">
          {data.map(column => (
            <label key={column.id} className="text-tau-sm flex items-center gap-2">
              <Checkbox
                checked={!hidden.includes(column.id)}
                onChange={event => {
                  const next = new Set(hidden);
                  if (event.target.checked) next.delete(column.id);
                  else next.add(column.id);
                  onChange({ ...view.config, hiddenColumnIds: [...next] });
                }}
              />
              <span>{column.title}</span>
            </label>
          ))}
        </div>
      </Popover>
    </>
  );
}

const QUICK_SOURCES: QuerySource[] = [
  "cards",
  "articles",
  "documents",
  "todos",
  "calendar",
  "diary",
  "whiteboards",
];

function SourceQuickPicks({ onPick }: { onPick(query: QueryDefinition): void }) {
  const { t } = useQueryUiI18n();
  return (
    <div className="border-line-2 flex flex-wrap items-center gap-1.5 border-t px-3 py-2.5">
      <span className="text-ink-3 mr-1 text-[12px]">{t("source.start")}</span>
      {QUICK_SOURCES.map(source => (
        <button
          key={source}
          type="button"
          onClick={() => onPick(starterQuery(source))}
          className="text-ink-2 hover:bg-hover hover:text-ink-1 h-[26px] rounded-[7px] px-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
        >
          {t(`source.${source}`)}
        </button>
      ))}
    </div>
  );
}
