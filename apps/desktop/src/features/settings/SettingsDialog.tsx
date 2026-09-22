/**
 * SettingsDialog —— 设置弹窗（D-028，方案 A 经典双栏定稿：mockups/settings/plan-a-classic）。
 *
 * 壳层浮层（D-003 命令面板同族）：fixed 遮罩 + 居中 760×min(560,82vh) 容器，
 * 左栏分区导航（sections.ts 单源）、右栏当前子页（独立滚动 + edge fade）。
 * 开闭态在 app/settingsStore（Sidebar / 命令面板 / Ctrl+, 多入口共享）。
 * Esc 经 useOverlayDismiss 注册表仲裁；关闭时焦点归还触发元素。
 * 即时保存模型：无应答区，改了就生效（legacy 显式保存按钮随逐页设计移除）。
 */

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { useOverlayDismiss } from "@/page/PageProvider";
import { useEdgeFade } from "@tau/ui/hooks";
import { IconButton } from "@tau/ui/IconButton";
import { useSettingsStore } from "@/app/settingsStore";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from "./sections";

export function SettingsDialog() {
  const open = useSettingsStore(s => s.open);
  const closeSettings = useSettingsStore(s => s.closeSettings);
  const section = useSettingsStore(s => s.section);
  const setSection = useSettingsStore(s => s.setSection);

  useOverlayDismiss(closeSettings, open);

  // 打开时记录触发元素，关闭时把焦点还回去（关态 inert，浏览器只会丢到 body）
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => trigger?.focus();
  }, [open]);

  // Ctrl+/Cmd+, 全局开关（输入法组合让位）
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        const s = useSettingsStore.getState();
        if (s.open) s.closeSettings();
        else s.openSettings();
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

  // 两栏滚动区三件套（§5 滚动区标准接法）；滚动条 -mr/pr 借位画进右留白，不贴栏缘
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);
  const [navEl, setNavEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(navEl);

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
        className="pointer-events-none fixed inset-0 z-[101] grid place-items-center p-8"
        aria-hidden={!open}
      >
        <div
          role="dialog"
          aria-label="设置"
          inert={!open}
          className={clsx(
            "bg-surface border-line-1 shadow-float rounded-tau-lg pointer-events-auto flex",
            "h-[min(560px,82vh)] w-[860px] max-w-full flex-col overflow-hidden border",
            "ease-tau-out transition-[opacity,transform] duration-200",
            open ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0"
          )}
        >
          {/* 弹窗头：标题 + 关闭（对齐 mockup 方案 A：底部 hairline 划出导航区） */}
          <div className="border-line-1 flex h-12 shrink-0 items-center border-b pl-5 pr-2">
            <h2 className="text-tau-body-lg font-semibold">设置</h2>
            <IconButton
              className="ml-auto size-[27px]"
              onClick={closeSettings}
              aria-label="关闭设置"
            >
              <X size={14} strokeWidth={1.75} />
            </IconButton>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[198px_minmax(0,1fr)]">
            {/* 左栏：全部分区平铺（数据来自 sections.tsx；右缘 hairline 分隔，方案 A 定稿）。
                外层 nav 承担 border 与上下留白（不随内容滚动），滚动收口在内层 */}
            <nav
              className="border-line-1 flex min-h-0 flex-col border-r pb-4 pr-2 pt-2"
              aria-label="设置分区"
            >
              <div
                ref={setNavEl}
                className="edge-fade-scroll -mr-[5px] min-h-0 flex-1 overflow-y-auto pl-2 pr-[5px]"
              >
                {SETTINGS_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="text-tau-tiny text-ink-3 px-2.5 pb-1 pt-2.5 tracking-[0.05em]">
                      {group.label}
                    </div>
                    {/* 组内条目留 2px 呼吸（紧排显拥挤，2026-09-23 用户校准） */}
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
                ))}
              </div>
            </nav>
            {/* 右栏：当前子页（surface 亮底，对齐 mockup 方案 A；独立滚动 + edge fade） */}
            <div
              ref={setScrollEl}
              className="edge-fade-scroll -mr-[5px] min-h-0 overflow-y-auto pb-5 pl-6 pr-[29px] pt-5"
            >
              <ActiveSection />
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
  def: {
    key: string;
    label: string;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  };
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = def.icon;
  return (
    <button
      type="button"
      className={clsx(
        "text-tau-sm rounded-tau-sm flex h-[30px] w-full items-center gap-2 px-2.5 text-left",
        "ease-tau-out transition-[background,color] duration-[160ms]",
        active
          ? "bg-selected text-accent-text font-medium"
          : "text-ink-2 hover:bg-hover hover:text-ink-1"
      )}
      aria-current={active ? "true" : undefined}
      onClick={onSelect}
    >
      <Icon size={15} strokeWidth={1.75} className="shrink-0" />
      <span className="min-w-0 truncate">{def.label}</span>
    </button>
  );
}
