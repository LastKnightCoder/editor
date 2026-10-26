/**
 * 快捷键速查：按「全局 / 编辑器 / AI / 白板 / 阅读 / 日常」切换，按系统显示 ⌘ 或 Ctrl；
 * 在页面上按下一个组合键，表里对应的一行会亮起来。
 */
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@tau/ui";
import { detectOs } from "../../../lib/platform.ts";

interface Shortcut {
  keys: string;
  /** 同一操作的另一组按键 */
  alt?: string;
  action: string;
}

/** Mod 按系统显示为 ⌘ 或 Ctrl */
const GROUPS: { name: string; items: Shortcut[] }[] = [
  {
    name: "全局",
    items: [
      { keys: "Mod+K", alt: "Mod+P", action: "搜索或跳转（命令面板）" },
      { keys: "Mod+,", action: "打开或关闭设置" },
      { keys: "Mod+J", action: "打开或收起 AI 对话栏" },
      { keys: "Mod+F", action: "在当前页面查找" },
      { keys: "Mod+Shift+N", action: "弹出速记卡片窗口" },
      { keys: "Alt+←", action: "后退" },
      { keys: "Alt+→", action: "前进" },
      { keys: "Esc", action: "关闭弹窗、面板等浮层" },
    ],
  },
  {
    name: "编辑器",
    items: [
      { keys: "Mod+B", action: "粗体" },
      { keys: "Mod+I", action: "斜体" },
      { keys: "Mod+U", action: "下划线" },
      { keys: "Mod+Shift+S", action: "删除线" },
      { keys: "Mod+M", action: "高亮" },
      { keys: "Mod+E", action: "行内代码" },
      { keys: "Mod+L", action: "插入链接" },
      { keys: "Mod+Shift+E", action: "行内公式" },
      { keys: "Mod+Shift+M", action: "给选中文字加批注" },
      { keys: "Mod+`", action: "插入代码块" },
      { keys: "Alt+=", action: "标题升一级" },
      { keys: "Alt+-", action: "标题降一级" },
      { keys: "Tab", action: "列表缩进 / 表格下一格" },
      { keys: "Shift+Tab", action: "列表退回 / 表格上一格" },
      { keys: "Mod+↑", action: "上移列表项" },
      { keys: "Mod+↓", action: "下移列表项" },
      { keys: "Esc", action: "退出当前文字格式" },
      { keys: "Mod+Z", action: "撤销" },
      { keys: "Mod+Shift+Z", action: "重做" },
    ],
  },
  {
    name: "AI",
    items: [
      { keys: "Mod+Enter", action: "发送消息" },
      { keys: "Mod+Shift+Enter", action: "AI 回答时插话" },
      { keys: "@", action: "引用卡片、文章或项目文档" },
      { keys: "$", action: "点名一个 Skill" },
    ],
  },
  {
    name: "白板",
    items: [
      { keys: "Tab", action: "思维导图：添加子节点" },
      { keys: "Enter", action: "思维导图：在下方添加同级节点" },
      { keys: "Shift+Enter", action: "思维导图：在上方添加同级节点" },
      { keys: "空格", action: "思维导图：编辑节点文字" },
      { keys: "Mod+↑", action: "思维导图：上移节点" },
      { keys: "Mod+↓", action: "思维导图：下移节点" },
      { keys: "Z", action: "全览 / 回到原来的视角" },
      { keys: "Shift+1", action: "适应全部" },
      { keys: "Shift+2", action: "适应选中" },
      { keys: "Shift+0", action: "缩放到 100%" },
      { keys: "Delete", action: "删除选中的元素" },
    ],
  },
  {
    name: "阅读",
    items: [
      { keys: "←", action: "PDF：上一页" },
      { keys: "→", action: "PDF：下一页" },
      { keys: "B", action: "PDF：加书签" },
      { keys: "D", action: "PDF：双页显示" },
      { keys: "M", action: "PDF：显示或隐藏页边批注" },
      { keys: "R", action: "PDF：向右旋转" },
      { keys: "H", action: "PDF：抓手工具" },
    ],
  },
  {
    name: "日常",
    items: [
      { keys: "Mod+/", action: "待办：聚焦快速添加" },
      { keys: "/", action: "日记：聚焦搜索" },
      { keys: "1-9", action: "番茄：开始第几个预设" },
      { keys: "空格", action: "番茄：暂停或继续" },
      { keys: "I", action: "番茄：进入沉浸" },
      { keys: "N", action: "闪卡：新建闪卡" },
      { keys: "1-4", action: "闪卡：评分" },
      { keys: "E", action: "闪卡：编辑当前卡片" },
      { keys: "S", action: "闪卡：暂停当前卡片" },
    ],
  },
];

const NAMED: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  " ": "空格",
  Escape: "Esc",
  Backspace: "Delete",
};

/** 把按键事件写成表里的形式，用来匹配高亮；Shift+数字按物理键位取数字 */
function comboOf(event: KeyboardEvent, mac: boolean) {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  const digit = /^Digit(\d)$/.exec(event.code)?.[1];
  const key =
    NAMED[event.key] ??
    (digit && event.shiftKey
      ? digit
      : event.key.length === 1
        ? event.key.toUpperCase()
        : event.key);
  const parts: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  // 单个字符键上的 Shift 多半是在打字（如 @、$），只有组合键或功能键才记 Shift
  if (event.shiftKey && (parts.length || key.length > 1 || digit)) parts.push("Shift");
  return [...parts, key].join("+");
}

/** 「1-9」这类区间按单个数字匹配 */
function keyMatches(keys: string, combo: string) {
  const range = /^(\d)-(\d)$/.exec(keys);
  if (range) return /^\d$/.test(combo) && combo >= range[1] && combo <= range[2];
  return keys.toUpperCase() === combo.toUpperCase();
}

const matches = (shortcut: Shortcut, combo: string) =>
  [shortcut.keys, shortcut.alt].some(keys => keys !== undefined && keyMatches(keys, combo));

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function Keys({ combo, mac }: { combo: string; mac: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {combo.split("+").map((part, index) => (
        <kbd
          key={index}
          className="border-line-1 bg-surface font-tau-mono text-ink-2 inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border px-1.5 text-[12px]"
        >
          {part === "Mod"
            ? mac
              ? "⌘"
              : "Ctrl"
            : part === "Alt" && mac
              ? "⌥"
              : part === "Shift" && mac
                ? "⇧"
                : part}
        </kbd>
      ))}
    </span>
  );
}

export default function ShortcutsDemo() {
  const [mac, setMac] = useState(true);
  const [group, setGroup] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [pressed, setPressed] = useState<string | null>(null);

  useEffect(() => setMac(detectOs() !== "windows"), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const combo = comboOf(event, mac);
      // 在输入框或编辑器里打字时只认带修饰键的组合，免得字母键打断输入
      if (!combo || (isTyping(event.target) && !/^(Mod|Alt)\+/.test(combo))) return;
      const hit = GROUPS.findIndex(item => item.items.some(shortcut => matches(shortcut, combo)));
      if (hit < 0) return;
      setGroup(hit);
      setKeyword("");
      setPressed(combo);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [mac]);

  useEffect(() => {
    if (!pressed) return;
    const timer = setTimeout(() => setPressed(null), 1200);
    return () => clearTimeout(timer);
  }, [pressed]);

  const rows = useMemo(() => {
    const text = keyword.trim();
    if (!text) return GROUPS[group].items;
    return GROUPS.flatMap(item => item.items).filter(shortcut => shortcut.action.includes(text));
  }, [group, keyword]);

  return (
    <div className="border-line-1 bg-surface shadow-card rounded-[16px] border p-5 max-sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((item, index) => (
          <button
            key={item.name}
            type="button"
            onClick={() => {
              setGroup(index);
              setKeyword("");
            }}
            className={cn(
              "text-tau-sm h-7 rounded-full px-3 transition-colors",
              group === index && !keyword
                ? "bg-accent-soft text-accent-text font-medium"
                : "text-ink-2 hover:bg-hover"
            )}
          >
            {item.name}
          </button>
        ))}
        <span className="flex-1" />
        <label className="border-line-1 focus-within:border-accent flex h-7 w-[150px] items-center gap-1.5 rounded-full border px-2.5">
          <Search className="text-ink-3 size-3.5" strokeWidth={1.75} />
          <input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="搜索操作"
            aria-label="搜索快捷键"
            className="text-tau-sm min-w-0 flex-1 bg-transparent outline-none select-text"
          />
        </label>
        <button
          type="button"
          onClick={() => setMac(value => !value)}
          className="border-line-1 text-ink-2 hover:text-ink-1 text-tau-sm h-7 rounded-full border px-3"
        >
          {mac ? "macOS" : "Windows"}
        </button>
      </div>
      <ul className="mt-3 flex flex-col">
        {rows.map(shortcut => (
          <li
            key={shortcut.keys + shortcut.action}
            className={cn(
              "border-line-2 flex min-h-10 items-center justify-between gap-4 border-b px-2 transition-colors duration-300 last:border-b-0",
              pressed !== null && matches(shortcut, pressed) && "bg-accent-soft rounded-[8px]"
            )}
          >
            <span className="text-tau-body">{shortcut.action}</span>
            <span className="text-ink-3 text-tau-sm flex items-center gap-1.5">
              <Keys combo={shortcut.keys} mac={mac} />
              {shortcut.alt && (
                <>
                  或
                  <Keys combo={shortcut.alt} mac={mac} />
                </>
              )}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-ink-3 text-tau-sm py-6 text-center">没有找到相关的快捷键</li>
        )}
      </ul>
      <p className="text-ink-3 text-tau-tiny mt-3">
        试着按一下 {mac ? "⌘B" : "Ctrl+B"}，表里对应的一行会亮起来。
      </p>
    </div>
  );
}
