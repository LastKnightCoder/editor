import { useSearchI18n } from "./i18n";
import scopePrefixes from "./scope-prefixes.json";
import capturePrefixes from "./capture-prefixes.json";
/**
 * SearchPalette —— 全局命令面板。
 *
 * 一个入口搜索正文、实体名称、文档待办和命令/页面，输入防抖 250ms。
 * 命令组置顶，名称和任务在正文前，正文保持检索管线的相关性顺序。
 * 空态「最近访问 + 常用」只收无参可重放的 single 页（isReplayableVisit）：二级页
 * （card-detail/article-detail）缺 id 不可回跳，既不记录也不展示。
 * 类型筛选（chips 单选/Ctrl+点击多选/Shift+←→、前缀「卡片:」追加、全角冒号、
 * 空输入退格删筛选、Esc 分层退场）与 IME 让位行为。
 *
 * 输入即记录：任何查询都附带「添加待办：…」一行（识别出日期 / 时刻时再加「添加日程：…」），
 * 放在末尾（↑ 从首项回绕即达），不抢搜索的回车；回车落库。日期时刻词表与日程 / 待办快速添加同源
 * （utils/quickDateTime），#名称 分别匹配待办项目 / 日历。
 * 插件注册的 text 对象动作排在记录组末尾，不按输入内容调整位置；回车把输入的文字交给插件。
 * 前缀「待办:」「日程:」筛选已有条目；「添加待办:」「添加日程:」或对应命令进入收集模式。
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  Search,
  CornerDownLeft,
  CircleDashed,
  CalendarPlus,
  ListPlus,
  Plug,
  X,
} from "lucide-react";
import clsx from "clsx";
import { openEntity } from "@/services/open-content";
import { usePluginEntityMetaResolver } from "@/components/EntityKind";
import { normalizeEntityRefKind } from "@/entity/ref";
import { locatesSection } from "@/entity/section-location";
import { usePage, useOverlayDismiss } from "@/page/PageProvider";
import { useSearchStore, type VisitRecord } from "./searchStore";
import {
  CONTENT_TYPES,
  SCOPE_ORDER,
  paletteCommands,
  pluginPaletteCommands,
  matchCommands,
  scopeLabel,
  scopeIcon,
  scopeOfType,
  scopeTypes,
  isReplayableVisit,
  type PaletteCommand,
  type PaletteScope,
} from "./searchMeta";
import {
  useSearchContent,
  resultDisplay,
  relativeTime,
  searchErrorText,
  type PaletteSearchResult,
} from "./queries";
import { openSearchResult } from "./openResult";
import { useSettingsStore } from "@/app/settingsStore";
import { useFeatures } from "@/app/featureQueries";
import { useDesktopPlugins } from "@/app/plugins/context";
import { usePluginActions } from "@/app/plugins/action-menu";
import type { RegisteredPluginAction } from "@/app/plugins/runtime";
import { useTransferStore } from "@/app/transferStore";
import { useShellStore } from "@/app/shellStore";
import { toggleAssistFor } from "@/app/assistOwner";
import { useThemeStore } from "@tau/themes/react";
import { Spinner, toast } from "@tau/ui";
import { openMarkdownInNewWindow } from "@/commands/file";
import { exportPerfSnapshot } from "@/commands/perf";
import { openFeedbackWindow } from "@/commands/feedback";
import { openMaterialTarget } from "@/services/open-material";
import { parseQuickAdd as parseTodoQuickAdd } from "@/features/todos/quickAdd";
import { createTodoFromQuickAdd, useTodoGroups } from "@/features/todos/queries";
import { useQuickAddI18n } from "@/features/shared/quick-add/i18n";
import { describeTodoQuickAdd, describeEventQuickAdd } from "@/features/shared/quick-add/format";
import { parseQuickAdd as parseEventQuickAdd } from "@/features/schedule/quickAdd";
import { useCalendarCatalog, useScheduleMutations } from "@/features/schedule/queries";
import { extractDateTime } from "@/utils/quickDateTime";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/* ---------- 前缀语法：追加语义，冒号兼容全角 ---------- */

// 面板退场动画时长之后再截图
const CAPTURE_DELAY_MS = 260;
const WORD_TO_SCOPE: Record<string, PaletteScope> = scopePrefixes as Record<string, PaletteScope>;
const TYPE_WORDS = Object.keys(WORD_TO_SCOPE);
const PREFIX_RE = new RegExp(
  `^(${TYPE_WORDS.join("|")})((?:[,、]\\s*(?:${TYPE_WORDS.join("|")}))*)[:：]\\s*(.*)$`,
  "i"
);
/** 添加动作与搜索类型前缀分开，避免把查找误当成新建。 */
const CAPTURE_RE = new RegExp(`^(${Object.keys(capturePrefixes).join("|")})[:：]\\s*(.*)$`, "i");

type CaptureKind = "todo" | "event";
const captureKindOf = (word: string): CaptureKind =>
  (capturePrefixes as Record<string, CaptureKind>)[word.toLowerCase()];

/* ---------- 面板行模型（分组渲染 + 扁平导航共用） ---------- */

interface Row {
  key: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  sub?: string;
  tag?: { label: string; cls: string };
  meta?: string;
  hint?: boolean;
  run: () => void;
}

interface Group {
  label: string;
  count?: number;
  rows: Row[];
}

/** 命中词首现高亮（与模板 mark 行为一致：透明底 + accent 文字） */
function Highlighted({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="text-accent-text bg-transparent font-semibold">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function SearchPalette() {
  const { t, locale } = useSearchI18n();
  const quickAddLanguage = useQuickAddI18n();
  const open = useSearchStore(s => s.open);
  const closePalette = useSearchStore(s => s.closePalette);
  const togglePalette = useSearchStore(s => s.togglePalette);
  const visits = useSearchStore(s => s.visits);
  const { navigator, state: pageState } = usePage();
  const currentPageKey = pageState.back[pageState.back.length - 1]?.key;

  const [query, setQuery] = useState("");
  const [scopes, setScopes] = useState<Set<PaletteScope>>(() => new Set());
  const [capture, setCapture] = useState<CaptureKind | null>(null);
  const [sel, setSel] = useState(0);
  const selectionSource = useRef<"pointer" | "keyboard" | "results">("results");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pluginEntityMeta = usePluginEntityMetaResolver();

  const trimmedQ = query.trim();
  const lowerQ = trimmedQ.toLowerCase();
  const debouncedQ = useDebouncedValue(trimmedQ, 250);

  const activeTypes = useMemo(() => {
    const t = SCOPE_ORDER.filter(s => scopes.has(s)).flatMap(scopeTypes);
    return scopes.size ? t : undefined;
  }, [scopes]);

  const contentQuery = useSearchContent(debouncedQ, activeTypes, open && !capture);
  const plugins = useDesktopPlugins();
  // 插件的 text 动作：输入任何文字都在「记录」组末尾列出，回车把文字交给插件
  const textActions = usePluginActions(trimmedQ ? { kind: "text", text: trimmedQ } : null);
  const pluginNames = new Map(
    textActions.actions.length
      ? (plugins?.host.listPlugins() ?? []).map(plugin => [plugin.id, plugin.name])
      : []
  );
  const pluginRevision = plugins?.getRevision() ?? 0;
  const pluginCommands = useMemo(
    () => (plugins ? pluginPaletteCommands(plugins.host) : []),
    // 宿主实例不变时仍须按修订号更新命令快照。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plugins, pluginRevision, t]
  );
  // 关掉的功能不出现在页面跳转里；页面本身仍可经内容结果打开
  const { isEnabled } = useFeatures();
  const commands = matchCommands(
    [
      ...paletteCommands().filter(c => !c.pageKey || isEnabled(c.pageKey)),
      ...(pluginCommands ?? []),
    ],
    lowerQ
  );

  // 快速添加用：面板打开才拉（待办项目与待办页共享缓存；日历排除系统日历与归档）
  const todoGroups = useTodoGroups(open);
  const calendarsQuery = useCalendarCatalog(open);
  const { createEvent } = useScheduleMutations();
  const calendars = useMemo(
    () => calendarsQuery.calendars.filter(c => !c.isInSystemGroup && !c.archived),
    [calendarsQuery.calendars]
  );

  const setAppearance = useThemeStore(s => s.setAppearance);
  const mode = useThemeStore(s => s.mode);

  const closeAnd = (fn: () => void) => {
    closePalette();
    fn();
  };

  const runCommand = ({ pageKey, action, run }: PaletteCommand) => {
    if (run) {
      closeAnd(() => {
        void Promise.resolve()
          .then(run)
          .catch(error =>
            toast.error(error instanceof Error ? error.message : t("plugin.commandFailed"))
          );
      });
    } else if (pageKey) {
      closeAnd(() => navigator.push(pageKey));
    } else if (action === "cycle-theme") {
      // 深浅直切（不经过 system）：循环切到 system 时若系统深浅与当前一致，视觉无变化
      const next = mode === "dark" ? "light" : "dark";
      closeAnd(() => {
        setAppearance(next);
        toast.success(t(next === "dark" ? "theme.dark" : "theme.light"));
      });
    } else if (action === "open-settings") {
      closeAnd(() => useSettingsStore.getState().openSettings());
    } else if (action === "toggle-assist") {
      closeAnd(() => toggleAssistFor(currentPageKey, useShellStore.getState().toggleAssist));
    } else if (action === "capture-todo") {
      enterCapture("todo");
    } else if (action === "capture-event") {
      enterCapture("event");
    } else if (action === "open-markdown") {
      closeAnd(() => void openMarkdownInNewWindow());
    } else if (action === "import-batch") {
      closeAnd(() => useTransferStore.getState().openImportWizard());
    } else if (action === "export-markdown") {
      // 在项目详情页唤起时直接导出当前项目，否则先选项目
      const current = pageState.back[pageState.back.length - 1];
      const projectId =
        current?.key === "project-detail" ? Number(current.params?.id) || undefined : undefined;
      closeAnd(() => useTransferStore.getState().openMarkdownExport({ projectId }));
    } else if (action === "send-feedback") {
      closeAnd(() => void openFeedbackWindow({ page: currentPageKey ?? null }));
    } else if (action === "capture-feedback") {
      // 等面板退场动画结束再截图，截图里不带命令面板
      closeAnd(() =>
        setTimeout(() => {
          openFeedbackWindow({ page: currentPageKey ?? null, capture: true }).catch(error =>
            toast.error(error instanceof Error ? error.message : t("capture.failed"))
          );
        }, CAPTURE_DELAY_MS)
      );
    } else if (action === "export-perf-snapshot") {
      // 快照路径由主进程统一发系统通知（与托盘入口同一提示通道）
      closeAnd(() => {
        exportPerfSnapshot().catch(error =>
          toast.error(error instanceof Error ? error.message : t("perf.failed"))
        );
      });
    }
  };

  const enterCapture = (kind: CaptureKind) => {
    setCapture(kind);
    setScopes(new Set());
    setQuery("");
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  };

  const pluginTextRow = (action: RegisteredPluginAction, text: string): Row => {
    const Icon = action.definition.icon ?? Plug;
    return {
      key: `capture:plugin:${action.id}`,
      icon: props => <Icon {...props} aria-hidden="true" />,
      title: `${action.definition.title}：${text}`,
      sub: t("plugin.from", {
        name: pluginNames.get(action.context.pluginId) ?? action.context.pluginId,
      }),
      tag: { label: t("section.plugin"), cls: "bg-hover text-ink-2" },
      run: () => closeAnd(() => textActions.run(action)),
    };
  };

  const todoRow = (text: string): Row => {
    const now = Date.now();
    const parsed = text ? parseTodoQuickAdd(text, { now, groups: todoGroups }) : null;
    const title = parsed?.title ?? "";
    const groupId = parsed?.groupId ?? todoGroups[0]?.id;
    const group = todoGroups.find(g => g.id === groupId);
    return {
      key: "capture:todo",
      icon: ListPlus,
      title: title ? t("capture.todo", { title }) : t("capture.todoEmpty"),
      sub: parsed
        ? `${describeTodoQuickAdd(parsed, now, quickAddLanguage)} · ${group ? `#${group.title}` : t("capture.groupMissing")}`
        : t("capture.todoExample"),
      tag: { label: t("type.todo"), cls: "bg-warn-soft text-warn" },
      hint: !title,
      run: () => {
        if (!parsed || !title) return;
        if (!group) {
          toast.warning(t("capture.createGroup"));
          return;
        }
        closeAnd(() => {
          createTodoFromQuickAdd(parsed, group.id)
            .then(item =>
              toast.success(t("capture.todoAdded", { title: item.title, group: group.title }), {
                action: {
                  label: t("view"),
                  onClick: () => navigator.push("todos", { id: String(group.id) }),
                },
              })
            )
            .catch(() => toast.error(t("capture.todoFailed")));
        });
      },
    };
  };

  const eventRow = (text: string): Row => {
    const now = Date.now();
    const parsed = text ? parseEventQuickAdd(text, { baseDate: now, calendars }) : null;
    const title = parsed?.title ?? "";
    const calendar = parsed?.calendarId
      ? calendars.find(c => c.id === parsed.calendarId)
      : calendars[0];
    const when = parsed ? describeEventQuickAdd(parsed, now, quickAddLanguage) : "";
    return {
      key: "capture:event",
      icon: CalendarPlus,
      title: title ? t("capture.event", { title }) : t("capture.eventEmpty"),
      sub: parsed
        ? `${when} · ${calendar ? calendar.title : t("capture.calendarMissing")}`
        : t("capture.eventExample"),
      tag: { label: t("type.calendar-event"), cls: "bg-info-soft text-info" },
      hint: !title,
      run: () => {
        if (!parsed || !title) return;
        if (!calendar) {
          toast.warning(t("capture.createCalendar"));
          return;
        }
        const timed = parsed.startTime !== null;
        closeAnd(() => {
          createEvent({
            title,
            calendarId: calendar.id,
            detailContentId: 0,
            startDate: parsed.date,
            endDate: timed ? parsed.date : null,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            color: null,
            allDay: !timed,
          })
            .then(() => {
              const d = new Date(parsed.date);
              toast.success(
                t("capture.eventAdded", {
                  date: new Intl.DateTimeFormat(locale, {
                    month: "numeric",
                    day: "numeric",
                  }).format(d),
                  calendar: calendar.title,
                }),
                {
                  action: { label: t("view"), onClick: () => navigator.push("schedule") },
                }
              );
            })
            .catch(() => toast.error(t("capture.eventFailed")));
        });
      },
    };
  };

  const captureRowOf = (kind: CaptureKind, text: string) =>
    kind === "todo" ? todoRow(text) : eventRow(text);

  // 检索失败反馈（isError 翻真时触发一次；重试成功自动复位）
  useEffect(() => {
    if (!contentQuery.isError) return;
    const reason = searchErrorText(contentQuery.error);
    toast.error(t(reason ? "error.reason" : "error.retry", { reason }), {
      action: { label: t("retry"), onClick: () => void contentQuery.refetch() },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentQuery.isError, contentQuery.error]);

  const searchWarning = contentQuery.warnings?.join("；") ?? "";
  const refetchSearch = contentQuery.refetch;
  useEffect(() => {
    if (searchWarning)
      toast.warning(searchWarning, {
        action: { label: t("retry"), onClick: () => void refetchSearch() },
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentQuery.warningKey, refetchSearch]);

  /* ---------- 行构造 ---------- */

  const pageByKey = new Map<string, PaletteCommand>();
  paletteCommands().forEach(command => {
    if (command.pageKey) pageByKey.set(command.pageKey, command);
  });

  const recentRow = (v: VisitRecord): Row => {
    const page = pageByKey.get(v.key);
    return {
      key: `recent:${v.key}`,
      icon: page?.icon ?? CircleDashed,
      title: page?.label ?? v.key,
      sub: t("visit.last"),
      run: () => closeAnd(() => navigator.push(v.key)),
    };
  };

  const contentRow = (r: PaletteSearchResult): Row => {
    const meta = CONTENT_TYPES[r.type];
    if (!("content" in r)) {
      return {
        key: `entity:${r.type}:${"sessionId" in r ? (r.sessionId ?? r.id) : r.id}`,
        icon: meta.icon,
        title: r.title,
        sub: [
          r.type === "document-task"
            ? r.completed
              ? t("status.completed")
              : ""
            : r.type === "chat-session"
              ? t(
                  r.chatScope === "pdf-chat"
                    ? "chat.pdf"
                    : r.chatScope === "vibe-learning-chat"
                      ? "chat.notebook"
                      : "chat.main"
                )
              : r.meta,
          r.snippet,
        ]
          .filter(Boolean)
          .join(" · "),
        tag: { label: meta.label, cls: meta.tag },
        meta: "updateTime" in r ? relativeTime(r.updateTime, locale) : undefined,
        run: () =>
          closeAnd(() => {
            void Promise.resolve()
              .then(() => openSearchResult(r, navigator))
              .catch(error =>
                toast.error(error instanceof Error ? error.message : t("open.failed"))
              );
          }),
      };
    }
    if (r.material) {
      // 外部材料：标题是引文，次行是来源，点击打开到原处（单书页划线 / PDF 标注 / 网页 / 网页条目）
      const { material } = r;
      return {
        key: `material:${r.type}:${r.id}`,
        icon: meta.icon,
        title: material.title,
        sub: r.section ? `${material.meta} · ${resultDisplay(r).snippet}` : material.meta,
        tag: { label: meta.label, cls: meta.tag },
        meta: relativeTime(r.updateTime, locale),
        run: () =>
          closeAnd(() => {
            if (!material.open) {
              if (meta.navKey) navigator.push(meta.navKey);
              else toast.error(material.deleted ? t("material.deleted") : t("material.openFailed"));
              return;
            }
            openMaterialTarget(
              material.open,
              r.section && locatesSection(r.type) ? { block: r.section.blockStart } : undefined
            ).catch(error =>
              toast.error(error instanceof Error ? error.message : t("open.failed"))
            );
          }),
      };
    }
    const { title, snippet } = resultDisplay(r);
    // 插件内容按插件声明的类型名与图标显示
    const { label, icon } = pluginEntityMeta(r.pluginEntity, meta);
    return {
      key: `content:${r.type}:${r.contentId}`,
      icon,
      title,
      sub: snippet,
      tag: { label, cls: meta.tag },
      meta: relativeTime(r.updateTime, locale),
      run: () =>
        closeAnd(() => {
          const kind = normalizeEntityRefKind(r.type);
          if (!kind) return meta.navKey && navigator.push(meta.navKey);
          void openEntity(
            { kind, id: r.id },
            r.section && locatesSection(r.type) ? { at: { block: r.section.blockStart } } : {}
          ).catch(error => toast.error(error instanceof Error ? error.message : t("open.failed")));
        }),
    };
  };

  const commandRow = (c: PaletteCommand): Row => ({
    key: c.id,
    icon: c.icon,
    title: c.label,
    sub: c.sub ?? c.section,
    // 分组标签走 bg-hover 淡墨（随父底色，不带色相），sunken 专供进度轨道/凹陷画布
    tag: { label: c.section, cls: "bg-hover text-ink-2" },
    run: () => runCommand(c),
  });

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];

    if (capture) {
      return [
        {
          label: t(capture === "todo" ? "command.capture-todo" : "command.capture-event"),
          rows: [captureRowOf(capture, trimmedQ)],
        },
      ];
    }

    if (!trimmedQ && scopes.size === 0) {
      // 二级页（card-detail/article-detail 等）只存 key 无法回跳，存量持久化记录同此过滤
      const replayable = visits.filter(v => isReplayableVisit(v.key) && isEnabled(v.key));
      const recent = replayable.slice(0, 5).map(recentRow);
      if (recent.length) out.push({ label: t("group.recent"), rows: recent });
      const recentKeys = new Set(recent.map(r => r.key));
      // replayable 为局部新数组，就地排序不影响上面的 recent
      const frequent = replayable
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .filter(v => !recentKeys.has(`recent:${v.key}`))
        .map(recentRow);
      if (frequent.length) out.push({ label: t("group.frequent"), rows: frequent });
      if (!out.length) {
        out.push({
          label: "",
          rows: [
            {
              key: "hint:empty",
              icon: Search,
              title: t("hint.empty"),
              hint: true,
              run: () => undefined,
            },
          ],
        });
      }
      return out;
    }

    if (!trimmedQ) {
      // 有筛选无查询：命令筛选展示全部命令；内容筛选给出输入引导
      if (scopes.has("cmd")) {
        out.push({
          label: t("group.commands"),
          count: commands.length,
          rows: commands.map(commandRow),
        });
      }
      const contentScopes = SCOPE_ORDER.filter(s => s !== "cmd" && scopes.has(s));
      if (contentScopes.length) {
        out.push({
          label: "",
          rows: [
            {
              key: "hint:type",
              icon: Search,
              title: t("hint.scopes", { scopes: contentScopes.map(scopeLabel).join(" + ") }),
              hint: true,
              run: () => inputRef.current?.focus(),
            },
          ],
        });
      }
      return out;
    }

    // 有查询：命令组置顶 + 内容按相关性平铺（不分组、不收起，管线返回即相关性序）
    const wantCmd = scopes.size === 0 || scopes.has("cmd");
    const wantContent = scopes.size === 0 || SCOPE_ORDER.some(s => s !== "cmd" && scopes.has(s));

    if (wantCmd && commands.length) {
      out.push({
        label: t("group.commands"),
        count: commands.length,
        rows: commands.map(commandRow),
      });
    }

    if (wantContent) {
      const results = contentQuery.data ?? [];
      const filtered = results.filter(result => {
        const scope = scopeOfType(result.type);
        return scopes.size === 0 || (scope != null && scopes.has(scope));
      });
      if (filtered.length) {
        out.push({
          label: t("group.results"),
          count: filtered.length,
          rows: filtered.map(contentRow),
        });
      }
    }

    // 输入即记录：垫底（不抢搜索结果的回车）；识别出日期 / 时刻才给日程行
    if (scopes.size === 0) {
      const rows = [todoRow(trimmedQ)];
      const { date, startTime } = extractDateTime(trimmedQ);
      if (date !== null || startTime !== null) rows.push(eventRow(trimmedQ));
      out.push({
        label: t("group.capture"),
        rows: [...rows, ...textActions.actions.map(action => pluginTextRow(action, trimmedQ))],
      });
    }

    if (contentQuery.isFetching && !contentQuery.data?.length && wantContent) {
      out.push({
        label: "",
        rows: [
          {
            key: "hint:loading",
            icon: () => <Spinner className="text-ink-3" />,
            title: t("hint.searching"),
            hint: true,
            run: () => undefined,
          },
        ],
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    trimmedQ,
    scopes,
    capture,
    commands,
    todoGroups,
    calendars,
    createEvent,
    contentQuery.data,
    contentQuery.isFetching,
    visits,
    isEnabled,
    mode,
    pluginEntityMeta,
    textActions.actions,
    quickAddLanguage,
    t,
    locale,
  ]);

  const flat = useMemo(() => groups.flatMap(g => g.rows), [groups]);

  /* ---------- 选中态 / 滚动联动 ---------- */

  // 只有查询、筛选或结果身份变化才重置；新数组和鼠标悬停不代表新结果。
  const selectionKey = JSON.stringify([
    open,
    trimmedQ,
    [...scopes],
    capture,
    flat.map(row => row.key),
  ]);
  useEffect(() => {
    selectionSource.current = "results";
    setSel(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [selectionKey]);
  useEffect(() => {
    if (selectionSource.current === "pointer") return;
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const activate = (row: Row | undefined) => row?.run();

  /* ---------- 开关 / 焦点 / 全局快捷键 / Esc 仲裁 ---------- */

  useOverlayDismiss(closePalette, open);

  // 打开时记录触发元素，关闭时把焦点还回去（面板关态 inert，浏览器只会丢到 body）
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    triggerRef.current?.focus();
    inputRef.current?.blur();
    setCapture(null);
  }, [open]);

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === "k" || key === "p")) {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [togglePalette]);

  /* ---------- 输入：前缀解析（IME 让位） ---------- */

  const processInputValue = () => {
    const el = inputRef.current;
    if (!el) return;
    const captureMatch = el.value.match(CAPTURE_RE);
    if (captureMatch) {
      setCapture(captureKindOf(captureMatch[1]));
      setScopes(new Set());
      setQuery(captureMatch[2]);
      el.value = captureMatch[2];
      return;
    }
    const m = el.value.match(PREFIX_RE);
    if (m) {
      setCapture(null);
      const words = [m[1], ...m[2].split(/[,、]\s*/).filter(Boolean)];
      setScopes(prev => {
        const next = new Set(prev);
        words.forEach(w => next.add(WORD_TO_SCOPE[w.toLowerCase()]));
        return next;
      });
      setQuery(m[3]);
      el.value = m[3];
    } else {
      setQuery(el.value);
    }
  };

  const toggleScope = (scope: PaletteScope, additive: boolean) => {
    setCapture(null);
    setScopes(prev => {
      if (!additive) return new Set([scope]);
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
    inputRef.current?.focus();
  };

  const cycleScope = (dir: 1 | -1) => {
    setCapture(null);
    const order: (PaletteScope | "all")[] = ["all", ...SCOPE_ORDER];
    const cur = scopes.size === 1 ? ([...scopes][0] as PaletteScope | "all") : "all";
    const next = order[(order.indexOf(cur) + dir + order.length) % order.length];
    setScopes(next === "all" ? new Set() : new Set([next]));
  };

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // 输入法组合期间让位（确认候选等）
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectionSource.current = "keyboard";
      if (flat.length) setSel(s => (s + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectionSource.current = "keyboard";
      if (flat.length) setSel(s => (s - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(flat[sel]);
    } else if (e.key === "Tab") {
      e.preventDefault();
    } else if (e.key === "Escape") {
      // 分层退场：清词 → 清筛选 → 冒泡给 PageProvider 浮层注册表关面板
      if (query) {
        e.stopPropagation();
        setQuery("");
        if (inputRef.current) inputRef.current.value = "";
      } else if (capture) {
        e.stopPropagation();
        setCapture(null);
      } else if (scopes.size) {
        e.stopPropagation();
        setScopes(new Set());
      }
    } else if (e.key === "ArrowLeft" && e.shiftKey) {
      e.preventDefault();
      cycleScope(-1);
    } else if (e.key === "ArrowRight" && e.shiftKey) {
      e.preventDefault();
      cycleScope(1);
    } else if (e.key === "Backspace" && !query && capture) {
      setCapture(null);
    } else if (e.key === "Backspace" && !query && scopes.size) {
      // 空输入退格逐个删除筛选（Set 保序，删最近加入的）
      setScopes(prev => {
        const next = new Set(prev);
        next.delete([...next][next.size - 1]);
        return next;
      });
    }
  };

  /* ---------- 类型计数（chips 上实时命中数） ---------- */

  const typeCounts = useMemo(() => {
    const counts = new Map<PaletteScope, number>();
    if (!trimmedQ) return counts;
    counts.set("cmd", commands.length);
    (contentQuery.data ?? []).forEach(r => {
      const scope = scopeOfType(r.type);
      if (scope) counts.set(scope, (counts.get(scope) ?? 0) + 1);
    });
    return counts;
  }, [trimmedQ, commands.length, contentQuery.data]);

  /* ---------- 渲染 ---------- */

  let rowIdx = -1;

  return (
    <>
      <div
        className={clsx(
          "bg-overlay ease-tau-out fixed inset-0 z-[100] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closePalette}
        aria-hidden={!open}
      />
      <div
        className="pointer-events-none fixed inset-0 z-[101] flex items-start justify-center pt-[11vh]"
        aria-hidden={!open}
      >
        <div
          role="dialog"
          aria-label={t("title")}
          inert={!open}
          className={clsx(
            "bg-surface border-line-1 shadow-float rounded-tau-lg ease-tau-out pointer-events-auto flex max-h-[66vh] w-[680px] max-w-[calc(100vw-48px)] flex-col overflow-hidden border transition-[opacity,transform] duration-200",
            open
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-2.5 scale-[0.985] opacity-0"
          )}
        >
          {/* 输入行：scope 徽章 + 输入框 + 清空 */}
          <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
            <Search size={17} strokeWidth={1.75} className="text-ink-3 flex-none" />
            {capture && (
              <button
                type="button"
                title={t("capture.exit")}
                onClick={() => {
                  setCapture(null);
                  inputRef.current?.focus();
                }}
                className="bg-accent-soft text-accent-text hover:bg-press text-tau-sm flex h-6 flex-none items-center gap-1.5 rounded-lg px-2.5 font-medium"
              >
                {t(capture === "todo" ? "command.capture-todo" : "command.capture-event")}
                <X size={12} strokeWidth={2} />
              </button>
            )}
            {[...scopes].map(s => (
              <button
                key={s}
                type="button"
                title={t("filter.remove")}
                onClick={() =>
                  setScopes(prev => {
                    const next = new Set(prev);
                    next.delete(s);
                    return next;
                  })
                }
                className="bg-accent-soft text-accent-text hover:bg-press text-tau-sm flex h-6 flex-none items-center gap-1.5 rounded-lg px-2.5 font-medium"
              >
                {scopeLabel(s)}
                <X size={12} strokeWidth={2} />
              </button>
            ))}
            <input
              ref={inputRef}
              value={undefined}
              className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[15px] leading-relaxed outline-none"
              placeholder={
                capture
                  ? t(capture === "todo" ? "capture.todoPlaceholder" : "capture.eventPlaceholder")
                  : t("placeholder")
              }
              autoComplete="off"
              spellCheck={false}
              onInput={e => {
                if (!(e.nativeEvent as InputEvent).isComposing) processInputValue();
              }}
              onCompositionEnd={processInputValue}
              onKeyDown={onInputKeyDown}
            />
            {(query || scopes.size > 0 || capture) && (
              <button
                type="button"
                title={t("clear")}
                onClick={() => {
                  setQuery("");
                  setScopes(new Set());
                  setCapture(null);
                  if (inputRef.current) inputRef.current.value = "";
                  inputRef.current?.focus();
                }}
                className="text-ink-3 hover:bg-hover hover:text-ink-1 grid h-6 w-6 flex-none place-items-center rounded-lg"
              >
                <X size={13} strokeWidth={1.75} />
              </button>
            )}
          </div>

          {/* 类型筛选 chips：点击单选 / Ctrl+点击多选 / Shift+←→ 循环 */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5">
            <ScopeChip
              label={t("all")}
              active={scopes.size === 0}
              count={
                scopes.size === 0 && trimmedQ
                  ? [...typeCounts.values()].reduce((a, b) => a + b, 0)
                  : undefined
              }
              onClick={e => {
                setCapture(null);
                if (!e.ctrlKey && !e.metaKey) setScopes(new Set());
              }}
            />
            {SCOPE_ORDER.map(s => (
              <ScopeChip
                key={s}
                label={scopeLabel(s)}
                icon={scopeIcon(s)}
                active={scopes.has(s)}
                title={t("filter.multi")}
                count={trimmedQ ? typeCounts.get(s) : undefined}
                onClick={e => toggleScope(s, e.ctrlKey || e.metaKey)}
              />
            ))}
          </div>

          {/* 结果区 */}
          <div ref={listRef} className="bg-surface min-h-0 flex-1 overflow-y-auto px-2 pb-2.5">
            {groups.length === 0 ? (
              <div className="text-ink-3 py-9 text-center">
                <Search size={26} strokeWidth={1.5} className="mx-auto mb-2" />
                <div className="text-tau-sm">
                  {t("empty.title", { query: trimmedQ })}
                  {scopes.size > 0 &&
                    t("empty.scopes", { scopes: [...scopes].map(scopeLabel).join(" + ") })}
                </div>
                <div className="text-ink-3 text-tau-micro mt-1">{t("empty.hint")}</div>
              </div>
            ) : (
              groups.map((g, gi) => (
                <div key={gi}>
                  {g.label && (
                    <div className="text-ink-3 text-tau-tiny flex items-center gap-2 px-2.5 pt-2.5 pb-1 tracking-wide select-none">
                      {g.label}
                      {g.count !== undefined && (
                        <span className="ml-auto tabular-nums">
                          {g.count.toLocaleString(locale)}
                        </span>
                      )}
                    </div>
                  )}
                  {g.rows.map(row => {
                    rowIdx += 1;
                    const idx = rowIdx;
                    const Icon = row.icon;
                    return (
                      <div
                        key={row.key}
                        data-idx={idx}
                        role="option"
                        aria-selected={idx === sel}
                        onMouseMove={() => {
                          selectionSource.current = "pointer";
                          setSel(cur => (cur === idx ? cur : idx));
                        }}
                        onClick={() => activate(row)}
                        className={clsx(
                          "flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-2.5 text-left",
                          row.hint ? "py-2.5" : "py-2",
                          idx === sel && "bg-selected"
                        )}
                      >
                        <Icon
                          size={17}
                          strokeWidth={1.75}
                          className={clsx(
                            "flex-none",
                            idx === sel ? "text-accent-text" : "text-ink-3"
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={clsx(
                              "block truncate",
                              row.hint ? "text-tau-sm" : "text-tau-body",
                              idx === sel ? "text-accent-text" : "text-ink-1",
                              idx === sel && !row.hint && "font-medium"
                            )}
                          >
                            <Highlighted text={row.title} q={row.hint ? "" : lowerQ} />
                          </span>
                          {row.sub && (
                            <span className="text-ink-3 text-tau-micro mt-px block truncate">
                              <Highlighted text={row.sub} q={lowerQ} />
                            </span>
                          )}
                        </span>
                        {!row.hint && (
                          <span className="text-ink-3 text-tau-tiny flex flex-none items-center gap-2">
                            {row.tag && (
                              <span
                                className={clsx(
                                  "inline-flex h-[19px] items-center rounded-md px-1.5 font-medium",
                                  row.tag.cls
                                )}
                              >
                                {row.tag.label}
                              </span>
                            )}
                            {row.meta}
                            <CornerDownLeft
                              size={13}
                              strokeWidth={1.75}
                              className={clsx(
                                idx === sel ? "text-accent-text opacity-100" : "opacity-0"
                              )}
                            />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* 底栏快捷键提示 */}
          <div className="text-ink-2 text-tau-tiny flex flex-none flex-wrap items-center gap-3.5 px-3.5 py-2 select-none">
            <span>
              <Kbd>↑↓</Kbd> {t("key.select")}
            </span>
            <span>
              <Kbd>↵</Kbd> {t("key.open")}
            </span>
            <span>
              <Kbd>Shift ←→</Kbd> {t("key.filter")}
            </span>
            <span>
              <Kbd>{t("key.click")}</Kbd> {t("key.multi")}
            </span>
            <span className="ml-auto">
              <Kbd>Esc</Kbd> {t("key.close")}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function ScopeChip({
  label,
  icon: Icon,
  active,
  count,
  title,
  onClick,
}: {
  label: string;
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  active: boolean;
  count?: number;
  title?: string;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const { locale } = useSearchI18n();
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        "text-tau-micro inline-flex h-[25px] items-center gap-1.5 rounded-full border px-2.5",
        active
          ? "bg-accent-soft text-accent-text border-transparent font-medium"
          : "border-line-1 text-ink-2 hover:border-ink-3 hover:text-ink-1"
      )}
    >
      {Icon && <Icon size={12} strokeWidth={1.75} />}
      {label}
      {count !== undefined && (
        <span
          className={clsx(
            "text-tau-tiny tabular-nums",
            active ? "text-accent-text opacity-75" : "text-ink-3"
          )}
        >
          {count.toLocaleString(locale)}
        </span>
      )}
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="bg-surface border-line-1 text-ink-3 font-tau-mono mr-0.5 rounded-md border px-1.5 py-px text-[10px]">
      {children}
    </kbd>
  );
}
