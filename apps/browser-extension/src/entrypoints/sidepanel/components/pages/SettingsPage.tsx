import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { getTheme, listThemes, type Appearance } from "@tau/themes";
import { Radio, Switch, cn } from "@tau/ui";
import { useExtensionThemeStore, useThemeFollowStore } from "../../../../stores/useExtensionTheme";
import { useSettingsStore } from "../../../../stores/useSettingsStore";
import { SubpageHeader } from "../SubpageHeader";

const APPEARANCE_OPTIONS: { value: Appearance; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

/**
 * 设置：主题默认跟随桌面（只同步主题，不同步深浅），关掉后可单独选；深浅只在这里设置。
 */
export default function SettingsPage({ onBack }: { onBack: () => void }) {
  const { theme, appearance, mode, setTheme, setAppearance } = useExtensionThemeStore();
  const { follow, setFollow } = useThemeFollowStore();
  const { autoSummaryEnabled, setAutoSummaryEnabled } = useSettingsStore();
  const themes = [...listThemes()].sort((a, b) => a.order - b.order);

  return (
    <div className="flex h-full flex-col">
      <SubpageHeader title="设置" onBack={onBack} />
      <div className="tau-scrollbar min-h-0 flex-1 overflow-y-auto pb-6">
        <Group title="外观">
          <Row
            label="主题跟随桌面"
            description={`当前：${getTheme(theme)?.name ?? theme}${follow ? "（在桌面端更换）" : ""}`}
            control={
              <Switch checked={follow} onCheckedChange={setFollow} aria-label="主题跟随桌面" />
            }
          />
          <div
            className={cn(
              "border-line-2 grid grid-cols-3 gap-2 border-t px-3.5 pb-3.5 pt-3",
              follow && "pointer-events-none opacity-45"
            )}
            aria-disabled={follow}
          >
            {themes.map(item => {
              const active = item.key === theme;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={follow}
                  onClick={() => setTheme(item.key)}
                  className={cn(
                    "text-tau-meta text-ink-1 flex h-9 items-center gap-2 rounded-[9px] border px-2.5 transition-colors",
                    active
                      ? "border-accent shadow-[var(--tau-focus-ring)]"
                      : "border-line-1 hover:bg-hover"
                  )}
                >
                  {/* 色点带自己的 data-theme：取的是那个主题的 accent */}
                  <span
                    data-theme={item.key}
                    data-mode={mode}
                    className="bg-accent size-3.5 shrink-0 rounded-full"
                  />
                  <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
                  {active && (
                    <Check size={13} strokeWidth={2} className="text-accent-text shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </Group>

        <Group title="深浅" hint="只影响插件，与桌面各自设置">
          <div className="flex flex-col gap-1 px-3.5 py-2.5">
            {APPEARANCE_OPTIONS.map(option => (
              <Radio
                key={option.value}
                name="ext-appearance"
                value={option.value}
                checked={appearance === option.value}
                onChange={() => setAppearance(option.value)}
                label={option.label}
              />
            ))}
          </div>
        </Group>

        <Group title="总结">
          <Row
            label="打开网页时自动总结"
            description="关掉后在本页顶部手动生成"
            control={
              <Switch
                checked={autoSummaryEnabled}
                onCheckedChange={setAutoSummaryEnabled}
                aria-label="打开网页时自动总结"
              />
            }
          />
        </Group>
      </div>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="px-3 pt-4">
      <div className="text-tau-sm text-ink-3 flex items-baseline gap-2 px-1.5 pb-1.5 font-semibold">
        {title}
        {hint && <span className="text-tau-tiny font-normal">{hint}</span>}
      </div>
      <div className="border-line-1 bg-surface rounded-tau-md overflow-hidden border">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-tau-body text-ink-1">{label}</div>
        {description && <div className="text-tau-micro text-ink-3 mt-0.5">{description}</div>}
      </div>
      {control}
    </div>
  );
}
