/**
 * SearchPalette —— 全局命令面板（D-003）。
 *
 * 一个入口承载两种搜索：内容（FTS+向量混合，防抖 250ms）与命令/页面（navigation.ts
 * 同源）。结果区为相关性平铺：命令组置顶，内容不分组、不收起，按检索管线返回的
 * 相关性顺序全部展开（不做按类型分组与组尾深入条目）。
 * 空态「最近访问 + 常用」只收无参可重放的 single 页（isReplayableVisit）：二级页
 * （card-detail/article-detail）缺 id 不可回跳，既不记录也不展示。
 * 类型筛选（chips 单选/Ctrl+点击多选/Shift+←→、前缀「卡片:」追加、全角冒号、
 * 空输入退格删筛选、Esc 分层退场）与 IME 让位行为见 D-003。
 *
 * 输入即记录：任何查询都附带「添加待办：…」「记为问题：…」两行（识别出日期 / 时刻时再加
 * 「添加日程：…」），回车落库。日期时刻词表与日程 / 待办快速添加同源（utils/quickDateTime），
 * #名称 分别匹配待办项目 / 日历 / 问题分组。
 * 像问题的输入（以问号结尾或带 #分组）记录组置顶；否则放在末尾（↑ 从首项回绕即达），不抢搜索的回车。
 * 前缀「待办:」「日程:」「问题:」或对应命令进入收集模式，列表只剩该收集行。
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
  CircleHelp,
  CalendarPlus,
  ListPlus,
  X,
} from "lucide-react";
import clsx from "clsx";
import { usePage, useOverlayDismiss } from "@/page/PageProvider";
import { useSearchStore, type VisitRecord } from "./searchStore";
import {
  CONTENT_TYPES,
  SCOPE_ORDER,
  paletteCommands,
  matchCommands,
  scopeLabel,
  scopeIcon,
  scopeOfType,
  scopeTypes,
  isReplayableVisit,
  type PaletteCommand,
  type PaletteScope,
} from "./searchMeta";
import { useSearchContent, resultDisplay, relativeTime } from "./queries";
import { useSettingsStore } from "@/app/settingsStore";
import { useShellStore } from "@/app/shellStore";
import { toggleAssistFor } from "@/app/assistOwner";
import { useThemeStore } from "@tau/themes/react";
import { Spinner, toast } from "@tau/ui";
import { openMarkdownInNewWindow } from "@/commands/file";
import type { SearchResult } from "@/types";
import { openMaterialTarget } from "@/services/open-material";
import { captureQuestion } from "@/commands/question";
import { looksLikeQuestion, parseCapture } from "@/features/questions/capture";
import { describeQuickAdd, parseQuickAdd as parseTodoQuickAdd } from "@/features/todos/quickAdd";
import { createTodoFromQuickAdd, useTodoGroups } from "@/features/todos/queries";
import { dayWord } from "@/features/todos/model";
import { parseQuickAdd as parseEventQuickAdd } from "@/features/schedule/quickAdd";
import { useCalendarCatalog, useScheduleMutations } from "@/features/schedule/queries";
import { formatTime } from "@/utils/calendar";
import { extractDateTime } from "@/utils/quickDateTime";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/* ---------- 前缀语法：追加语义，冒号兼容全角 ---------- */

const TYPE_WORDS = ["卡片", "文章", "项目", "日记", "命令"];
const WORD_TO_SCOPE: Record<string, PaletteScope> = {
  卡片: "card",
  文章: "article",
  项目: "project-item",
  日记: "diary-daily",
  命令: "cmd",
};
const PREFIX_RE = new RegExp(
  `^(${TYPE_WORDS.join("|")})((?:[,、]\\s*(?:${TYPE_WORDS.join("|")}))*)[:：]\\s*(.*)$`
);
/** 收集模式前缀：「问题:」「记问题:」「待办:」「任务:」「日程:」 */
const CAPTURE_RE = /^(记?问题|待办|任务|日程)[:：]\s*(.*)$/;

type CaptureKind = "question" | "todo" | "event";
const CAPTURE_META: Record<CaptureKind, { chip: string; group: string; placeholder: string }> = {
  question: {
    chip: "记问题",
    group: "记为问题",
    placeholder: "学习时冒出的疑问… #分组 指定分组",
  },
  todo: {
    chip: "待办",
    group: "添加待办",
    placeholder: "明天 17:00 交周报 #项目、每周一、四 周会、周末 洗车…",
  },
  event: {
    chip: "日程",
    group: "添加日程",
    placeholder: "明天下午3点到5点 评审 #日历、下周六 爬山…",
  },
};
const captureKindOf = (word: string): CaptureKind =>
  word === "日程" ? "event" : word === "待办" || word === "任务" ? "todo" : "question";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const trimmedQ = query.trim();
  const lowerQ = trimmedQ.toLowerCase();
  const debouncedQ = useDebouncedValue(trimmedQ, 250);

  const activeTypes = useMemo(() => {
    const t = SCOPE_ORDER.filter(s => scopes.has(s)).flatMap(scopeTypes);
    return t.length ? t : undefined;
  }, [scopes]);

  const contentQuery = useSearchContent(debouncedQ, activeTypes);
  const commands = useMemo(() => matchCommands(paletteCommands(), lowerQ), [lowerQ]);

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

  const runCommand = ({ pageKey, action }: PaletteCommand) => {
    if (pageKey) {
      closeAnd(() => navigator.push(pageKey));
    } else if (action === "cycle-theme") {
      // 深浅直切（不经过 system）：循环切到 system 时若系统深浅与当前一致，视觉无变化
      const next = mode === "dark" ? "light" : "dark";
      closeAnd(() => {
        setAppearance(next);
        toast.success(`已切换到${next === "dark" ? "深色" : "浅色"}模式`);
      });
    } else if (action === "open-settings") {
      closeAnd(() => useSettingsStore.getState().openSettings());
    } else if (action === "toggle-assist") {
      closeAnd(() => toggleAssistFor(currentPageKey, useShellStore.getState().toggleAssist));
    } else if (action === "capture-question") {
      enterCapture("question");
    } else if (action === "capture-todo") {
      enterCapture("todo");
    } else if (action === "capture-event") {
      enterCapture("event");
    } else if (action === "open-markdown") {
      closeAnd(() => void openMarkdownInNewWindow());
    }
  };

  const enterCapture = (kind: CaptureKind) => {
    setCapture(kind);
    setScopes(new Set());
    setQuery("");
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  };

  const captureRow = (text: string): Row => {
    const { title, groupHint } = parseCapture(text);
    return {
      key: "capture:question",
      icon: CircleHelp,
      title: title ? `记为问题：${title}` : "输入问题，回车收集到问题页",
      sub: groupHint ? `#${groupHint}` : "#分组 可指定分组",
      tag: { label: "问题", cls: "bg-accent-soft text-accent-text" },
      hint: !title,
      run: () => {
        if (!title) return;
        closeAnd(() => {
          captureQuestion(title, groupHint)
            .then(({ question, groupTitle }) =>
              toast.success(`已收集到「${groupTitle}」`, {
                action: {
                  label: "查看",
                  onClick: () => navigator.push("questions", { selectedId: question.id }),
                },
              })
            )
            .catch(() => toast.error("收集问题失败"));
        });
      },
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
      title: title ? `添加待办：${title}` : "输入待办，回车添加到待办页",
      sub: parsed
        ? `${describeQuickAdd(parsed, now)} · ${group ? `#${group.title}` : "还没有待办项目"}`
        : "明天 17:00 / 下周三 / 每周一 / #项目",
      tag: { label: "待办", cls: "bg-warn-soft text-warn" },
      hint: !title,
      run: () => {
        if (!parsed || !title) return;
        if (!group) {
          toast.warning("先在待办页新建一个项目");
          return;
        }
        closeAnd(() => {
          createTodoFromQuickAdd(parsed, group.id)
            .then(item =>
              toast.success(`已添加「${item.title}」到 ${group.title}`, {
                action: {
                  label: "查看",
                  onClick: () => navigator.push("todos", { id: String(group.id) }),
                },
              })
            )
            .catch(() => toast.error("添加待办失败"));
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
    const when = parsed
      ? `${dayWord(parsed.date, now)} ${
          parsed.startTime !== null
            ? `${formatTime(parsed.startTime)}–${formatTime(parsed.endTime!)}`
            : "全天"
        }`
      : "";
    return {
      key: "capture:event",
      icon: CalendarPlus,
      title: title ? `添加日程：${title}` : "输入日程，回车添加到日历",
      sub: parsed
        ? `${when} · ${calendar ? calendar.title : "还没有日历"}`
        : "明天下午3点 / 周末 / 10月1日 / #日历",
      tag: { label: "日程", cls: "bg-info-soft text-info" },
      hint: !title,
      run: () => {
        if (!parsed || !title) return;
        if (!calendar) {
          toast.warning("先在日程页创建一个日历");
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
              toast.success(`已添加到 ${d.getMonth() + 1}月${d.getDate()}日 · ${calendar.title}`, {
                action: { label: "查看", onClick: () => navigator.push("schedule") },
              });
            })
            .catch(() => toast.error("添加日程失败"));
        });
      },
    };
  };

  const captureRowOf = (kind: CaptureKind, text: string) =>
    kind === "todo" ? todoRow(text) : kind === "event" ? eventRow(text) : captureRow(text);

  // 检索失败反馈（isError 翻真时触发一次；重试成功自动复位）
  useEffect(() => {
    if (!contentQuery.isError) return;
    const reason = contentQuery.error instanceof Error ? contentQuery.error.message : "";
    toast.error(`搜索失败${reason ? `：${reason}` : "，请稍后重试"}`, {
      action: { label: "重试", onClick: () => void contentQuery.refetch() },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentQuery.isError, contentQuery.error]);

  /* ---------- 行构造 ---------- */

  const pageByKey = useMemo(() => {
    const m = new Map<string, PaletteCommand>();
    paletteCommands().forEach(c => {
      if (c.pageKey) m.set(c.pageKey, c);
    });
    return m;
  }, []);

  const recentRow = (v: VisitRecord): Row => {
    const page = pageByKey.get(v.key);
    return {
      key: `recent:${v.key}`,
      icon: page?.icon ?? CircleDashed,
      title: page?.label ?? v.key,
      sub: "上次访问",
      run: () => closeAnd(() => navigator.push(v.key)),
    };
  };

  const contentRow = (r: SearchResult): Row => {
    const meta = CONTENT_TYPES[r.type];
    if (r.material) {
      // 外部材料：标题是引文，次行是来源，点击打开到原处（单书页划线 / PDF 标注 / 网页 / 网页条目）
      const { material } = r;
      return {
        key: `material:${r.type}:${r.id}`,
        icon: meta.icon,
        title: material.title,
        sub: material.meta,
        tag: { label: meta.label, cls: meta.tag },
        meta: relativeTime(r.updateTime),
        run: () =>
          closeAnd(() => {
            if (!material.open) return navigator.push(meta.navKey);
            openMaterialTarget(material.open).catch(error =>
              toast.error(error instanceof Error ? error.message : "打开失败")
            );
          }),
      };
    }
    const { title, snippet } = resultDisplay(r);
    return {
      key: `content:${r.type}:${r.contentId}`,
      icon: meta.icon,
      title,
      sub: snippet,
      tag: { label: meta.label, cls: meta.tag },
      meta: relativeTime(r.updateTime),
      // 详情页迁移前（D-003 注记）跳对应模块列表页
      run: () => closeAnd(() => navigator.push(meta.navKey)),
    };
  };

  const commandRow = (c: PaletteCommand): Row => ({
    key: c.id,
    icon: c.icon,
    title: c.label,
    sub: c.section,
    // 分组标签走 bg-hover 淡墨（随父底色，不带色相），sunken 专供进度轨道/凹陷画布
    tag: { label: c.section, cls: "bg-hover text-ink-2" },
    run: () => runCommand(c),
  });

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];

    if (capture) {
      return [{ label: CAPTURE_META[capture].group, rows: [captureRowOf(capture, trimmedQ)] }];
    }

    if (!trimmedQ && scopes.size === 0) {
      // 二级页（card-detail/article-detail 等）只存 key 无法回跳，存量持久化记录同此过滤
      const replayable = visits.filter(v => isReplayableVisit(v.key));
      const recent = replayable.slice(0, 5).map(recentRow);
      if (recent.length) out.push({ label: "最近访问", rows: recent });
      const recentKeys = new Set(recent.map(r => r.key));
      // replayable 为局部新数组，就地排序不影响上面的 recent
      const frequent = replayable
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .filter(v => !recentKeys.has(`recent:${v.key}`))
        .map(recentRow);
      if (frequent.length) out.push({ label: "常用", rows: frequent });
      if (!out.length) {
        out.push({
          label: "",
          rows: [
            {
              key: "hint:empty",
              icon: Search,
              title: "暂无访问记录——输入即搜全部内容与命令",
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
        out.push({ label: "页面与命令", count: commands.length, rows: commands.map(commandRow) });
      }
      const contentScopes = SCOPE_ORDER.filter(s => s !== "cmd" && scopes.has(s));
      if (contentScopes.length) {
        out.push({
          label: "",
          rows: [
            {
              key: "hint:type",
              icon: Search,
              title: `输入关键词，将在「${contentScopes.map(scopeLabel).join(" + ")}」中检索…`,
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
      out.push({ label: "页面与命令", count: commands.length, rows: commands.map(commandRow) });
    }

    if (wantContent) {
      const results = contentQuery.data ?? [];
      if (results.length) {
        out.push({ label: "内容", count: results.length, rows: results.map(contentRow) });
      }
    }

    // 输入即记录：像问题的输入置顶，否则垫底（不抢搜索结果的回车）；识别出日期 / 时刻才给日程行
    if (scopes.size === 0) {
      const question = looksLikeQuestion(trimmedQ);
      const questionRow = captureRow(trimmedQ);
      const rows = [todoRow(trimmedQ)];
      const { date, startTime } = extractDateTime(trimmedQ);
      if (date !== null || startTime !== null) rows.push(eventRow(trimmedQ));
      const record = {
        label: "记录",
        rows: question ? [questionRow, ...rows] : [...rows, questionRow],
      };
      if (question) out.unshift(record);
      else out.push(record);
    }

    if (contentQuery.isFetching && !contentQuery.data?.length && wantContent) {
      out.push({
        label: "",
        rows: [
          {
            key: "hint:loading",
            icon: () => <Spinner className="text-ink-3" />,
            title: "正在检索…",
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
    mode,
  ]);

  const flat = useMemo(() => groups.flatMap(g => g.rows), [groups]);

  /* ---------- 选中态 / 滚动联动 ---------- */

  useEffect(() => {
    setSel(0);
  }, [flat]);
  useEffect(() => {
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
      const words = [m[1], ...m[2].split(/[,、]\s*/).filter(Boolean)];
      setScopes(prev => {
        const next = new Set(prev);
        words.forEach(w => next.add(WORD_TO_SCOPE[w]));
        return next;
      });
      setQuery(m[3]);
      el.value = m[3];
    } else {
      setQuery(el.value);
    }
  };

  const toggleScope = (scope: PaletteScope, additive: boolean) => {
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
    const order: (PaletteScope | "all")[] = ["all", ...SCOPE_ORDER];
    const cur = scopes.size === 1 ? ([...scopes][0] as PaletteScope | "all") : "all";
    const next = order[(order.indexOf(cur) + dir + order.length) % order.length];
    setScopes(next === "all" ? new Set() : new Set([next]));
  };

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // 输入法组合期间让位（确认候选等）
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flat.length) setSel(s => (s + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
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
      counts.set(scope, (counts.get(scope) ?? 0) + 1);
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
          aria-label="搜索或跳转"
          inert={!open}
          className={clsx(
            "bg-surface border-line-1 shadow-float rounded-tau-lg ease-tau-out pointer-events-auto flex max-h-[66vh] w-[680px] max-w-[calc(100vw-48px)] flex-col overflow-hidden border transition-[opacity,transform] duration-200",
            open
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-2.5 scale-[0.985] opacity-0"
          )}
        >
          {/* 输入行：scope 徽章 + 输入框 + 清空 */}
          <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-3.5">
            <Search size={17} strokeWidth={1.75} className="text-ink-3 flex-none" />
            {capture && (
              <button
                type="button"
                title="退出收集"
                onClick={() => {
                  setCapture(null);
                  inputRef.current?.focus();
                }}
                className="bg-accent-soft text-accent-text hover:bg-press text-tau-sm flex h-6 flex-none items-center gap-1.5 rounded-lg px-2.5 font-medium"
              >
                {CAPTURE_META[capture].chip}
                <X size={12} strokeWidth={2} />
              </button>
            )}
            {[...scopes].map(s => (
              <button
                key={s}
                type="button"
                title="移除该筛选"
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
                  ? CAPTURE_META[capture].placeholder
                  : "搜索内容，或「卡片:」限定类型，「待办:」「日程:」「问题:」快速记录…"
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
                title="清空"
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
              label="全部"
              active={scopes.size === 0}
              count={
                scopes.size === 0 && trimmedQ
                  ? [...typeCounts.values()].reduce((a, b) => a + b, 0)
                  : undefined
              }
              onClick={e => {
                if (!e.ctrlKey && !e.metaKey) setScopes(new Set());
              }}
            />
            {SCOPE_ORDER.map(s => (
              <ScopeChip
                key={s}
                label={scopeLabel(s)}
                icon={scopeIcon(s)}
                active={scopes.has(s)}
                title="Ctrl+点击多选"
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
                  没有匹配「{trimmedQ}」的结果
                  {scopes.size > 0 && `（当前筛选：${[...scopes].map(scopeLabel).join(" + ")}）`}
                </div>
                <div className="text-ink-3 text-tau-micro mt-1">
                  试试其他关键词，Shift+←→ 换类型，或 Ctrl+点击 chips 多选几类
                </div>
              </div>
            ) : (
              groups.map((g, gi) => (
                <div key={gi}>
                  {g.label && (
                    <div className="text-ink-3 text-tau-tiny flex select-none items-center gap-2 px-2.5 pb-1 pt-2.5 tracking-wide">
                      {g.label}
                      {g.count !== undefined && (
                        <span className="ml-auto tabular-nums">{g.count}</span>
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
                        onMouseMove={() => setSel(cur => (cur === idx ? cur : idx))}
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
          <div className="text-ink-2 text-tau-tiny flex flex-none select-none flex-wrap items-center gap-3.5 px-3.5 py-2">
            <span>
              <Kbd>↑↓</Kbd> 选择
            </span>
            <span>
              <Kbd>↵</Kbd> 打开
            </span>
            <span>
              <Kbd>Shift ←→</Kbd> 筛类型
            </span>
            <span>
              <Kbd>Ctrl 点击</Kbd> 多选
            </span>
            <span className="ml-auto">
              <Kbd>Esc</Kbd> 关闭
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
          {count}
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
