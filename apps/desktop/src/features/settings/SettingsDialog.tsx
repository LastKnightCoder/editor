/**
 * SettingsDialog —— 设置弹窗（D-028 方案 A 双栏；2026-09-24 第三版重排：mockups/settings/index.html）。
 *
 * 壳层浮层（D-003 命令面板同族）：fixed 遮罩 + 居中 min(92vw,1160)×min(88vh,880) 纸色容器（弹窗是唯一
 * shadow-float 的浮起物）。左栏 = 标题 + 分区搜索 + 分区导航（与应用侧栏同语言：中性图标 +
 * bg-selected 轻染）；右栏 = 页头（分区 label + description，sections.tsx 单源）+ 子页，子页由
 * SettingsGroup 面板组织（surface + shadow-card），独立滚动 + edge fade。
 * 开闭态在 app/settingsStore（Sidebar / 命令面板 / Ctrl+, 多入口共享）。
 * Esc 经 useOverlayDismiss 注册表仲裁；关闭时焦点归还触发元素。
 * 即时保存模型：无应答区，改了就生效。
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import clsx from "clsx";
import { useOverlayDismiss } from "@/page/PageProvider";
import { useEdgeFade, IconButton, Input } from "@tau/ui";
import { useSettingsStore } from "@/app/settingsStore";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsSectionDef } from "./sections";

/** 分区搜索：标题 / 分组名 / 设置项关键词，大小写不敏感 */
function matchSection(group: string, def: SettingsSectionDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [def.label, group, ...(def.keywords ?? [])].some(text => text.toLowerCase().includes(q));
}

export function SettingsDialog() {
  const open = useSettingsStore(s => s.open);
  const closeSettings = useSettingsStore(s => s.closeSettings);
  const section = useSettingsStore(s => s.section);
  const setSection = useSettingsStore(s => s.setSection);

  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useOverlayDismiss(closeSettings, open);

  // 打开时记录触发元素，关闭时把焦点还回去（关态 inert，浏览器只会丢到 body）
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      setQuery("");
      trigger?.focus();
    };
  }, [open]);

  // Ctrl+/Cmd+, 全局开关；打开态下 Ctrl+/Cmd+F 聚焦分区搜索（输入法组合让位）
  useEffect(() => {
    const onKeydown = (e: globalThis.KeyboardEvent) => {
      if (e.isComposing || !(e.ctrlKey || e.metaKey)) return;
      if (e.key === ",") {
        e.preventDefault();
        const s = useSettingsStore.getState();
        if (s.open) s.closeSettings();
        else s.openSettings();
      } else if (e.key.toLowerCase() === "f" && useSettingsStore.getState().open) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  const activeDef = useMemo(
    () => SETTINGS_SECTIONS.find(s => s.key === section) ?? SETTINGS_SECTIONS[0],
    [section]
  );
  const ActiveSection = activeDef.component;

  const filteredGroups = useMemo(
    () =>
      SETTINGS_GROUPS.map(group => ({
        ...group,
        sections: group.sections.filter(def => matchSection(group.label, def, query)),
      })).filter(group => group.sections.length > 0),
    [query]
  );

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      const first = filteredGroups[0]?.sections[0];
      if (first) setSection(first.key);
    }
  };

  // 两栏滚动区三件套（§5 滚动区标准接法）；滚动条 -mr/pr 借位画进右留白，不贴栏缘
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);
  const [navEl, setNavEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(navEl);

  // 切换分区回到页顶
  useEffect(() => {
    if (scrollEl) scrollEl.scrollTop = 0;
  }, [activeDef.key, scrollEl]);

  return (
    <>
      <div
        className={clsx(
          "bg-overlay ease-tau-out fixed inset-0 z-[100] backdrop-blur-[4px] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeSettings}
        aria-hidden={!open}
      />
      <div
        className="pointer-events-none fixed inset-0 z-[101] grid place-items-center"
        aria-hidden={!open}
      >
        <div
          role="dialog"
          aria-label="设置"
          inert={!open}
          className={clsx(
            "bg-page shadow-float rounded-tau-lg pointer-events-auto relative grid overflow-hidden",
            // 视口单位自适应：随窗口增长、封顶 1160×880（内容列最宽约 850，再宽读起来散）；
            // 窗口下限 1080×600 时为 994×528，四周仍留白不溢出
            "h-[min(88vh,880px)] w-[min(92vw,1160px)] grid-cols-[228px_minmax(0,1fr)]",
            "ease-tau-out transition-[opacity,transform] duration-200",
            open ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0"
          )}
        >
          <IconButton
            className="absolute right-3.5 top-3.5 z-10 size-[30px]"
            onClick={closeSettings}
            aria-label="关闭设置"
          >
            <X size={15} strokeWidth={1.75} />
          </IconButton>

          {/* 左栏：标题 + 搜索 + 分区导航（数据来自 sections.tsx）。外层承担留白，滚动收口在内层 */}
          <nav className="flex min-h-0 flex-col pb-3.5 pl-3.5 pr-3 pt-[18px]" aria-label="设置分区">
            <h2 className="text-tau-title text-ink-1 px-2.5 pb-3 font-semibold">设置</h2>
            <Input
              ref={searchRef}
              size="sm"
              lead={Search}
              clearable
              placeholder="搜索设置"
              aria-label="搜索设置"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
            <div
              ref={setNavEl}
              className="edge-fade-scroll -mr-[6px] mt-1 min-h-0 flex-1 overflow-y-auto pr-[6px]"
            >
              {filteredGroups.length === 0 ? (
                <div className="text-tau-meta text-ink-2 px-2.5 pt-4">没有匹配的设置</div>
              ) : (
                filteredGroups.map(group => (
                  <div key={group.label}>
                    <div className="text-tau-tiny text-ink-3 px-2.5 pb-1 pt-3.5">{group.label}</div>
                    <div className="flex flex-col gap-0.5">
                      {group.sections.map(def => (
                        <SectionNavButton
                          key={def.key}
                          def={def}
                          active={def.key === activeDef.key}
                          onSelect={() => setSection(def.key)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </nav>

          {/* 右栏：页头 + 当前子页（内容列撑满右栏，宽度上限由弹窗封顶控制；独立滚动 + edge fade） */}
          <div
            ref={setScrollEl}
            className="edge-fade-scroll -mr-[5px] min-h-0 overflow-y-auto pb-14 pl-8 pr-[37px] pt-7"
          >
            <div>
              <header className="mb-6 mt-0.5">
                <h2 className="text-tau-title-lg text-ink-1 font-semibold">{activeDef.label}</h2>
                <p className="text-tau-meta text-ink-2 mt-0.5">{activeDef.description}</p>
              </header>
              <ActiveSection key={activeDef.key} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SectionNavButton({
  def,
  active,
  onSelect,
}: {
  def: SettingsSectionDef;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = def.icon;
  return (
    <button
      type="button"
      className={clsx(
        "text-tau-body rounded-tau-sm flex h-8 w-full items-center gap-2.5 px-2.5 text-left",
        "ease-tau-out transition-[background,color] duration-[160ms]",
        active
          ? "bg-selected text-accent-text font-medium"
          : "text-ink-2 hover:bg-hover hover:text-ink-1"
      )}
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
    >
      <Icon size={15} strokeWidth={1.75} className="shrink-0" />
      <span className="min-w-0 truncate">{def.label}</span>
    </button>
  );
}
