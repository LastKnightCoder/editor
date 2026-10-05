/**
 * 内容导出为图片：左侧按真实宽度预览，右侧设置栏选样式 / 版式 / 显示项，复制或保存为 PNG。
 * 样式 = 应用主题族 × 明暗：导出节点自带 data-theme / data-mode，纸、墨、强调色和编辑器
 * 正文都取该主题的 --tau-*，新增应用主题即自动多一种导出样式。
 */

import { memo, useRef, useState, type ReactNode } from "react";
import type { Descendant } from "slate";
import { Copy, Download, X } from "lucide-react";
import { useLocalStorageState, useSize } from "ahooks";
import { Button, Dialog, IconButton, Select, Switch, cn, toast } from "@tau/ui";
import { listThemes } from "@tau/themes";
import { useThemeStore, type ThemeMode } from "@tau/themes/react";
import { Editor, EditorThemeOverride } from "@tau/editor";

import logo from "@/assets/logo.png";
import { getContentKit } from "@/services/editorKit";
import { downloadBlob } from "@/utils/download";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";
import {
  BACKDROP_OPTIONS,
  DEFAULT_EXPORT_PREFERENCE,
  PADDING_OPTIONS,
  WIDTH_OPTIONS,
  createExportFileName,
  formatExportDate,
  resolveExportBackground,
  resolveExportLayout,
  type ExportBackdrop,
  type ExportPreference,
} from "./exportStyle";

const PREFERENCE_KEY = "content-export-image";

interface ContentExportModalProps {
  open: boolean;
  onClose: () => void;
  content: Descendant[];
  title?: string;
}

const exportDpr = () => Math.max(2, window.devicePixelRatio || 1);

const ContentExportModal = memo((props: ContentExportModalProps) => {
  const { open, onClose } = props;
  // 关闭时调用方常把内容清空，退场动画期间沿用上一次的内容，预览不闪成空白
  const lastDoc = useRef({ content: props.content, title: props.title });
  if (open) lastDoc.current = { content: props.content, title: props.title };
  const { content, title } = lastDoc.current;

  const imageRef = useRef<HTMLDivElement>(null);
  const imageSize = useSize(imageRef);
  const [busy, setBusy] = useState<"copy" | "save" | null>(null);

  const appTheme = useThemeStore(s => s.theme);
  const appMode = useThemeStore(s => s.mode);
  const [stored, setStored] = useLocalStorageState<ExportPreference>(PREFERENCE_KEY, {
    defaultValue: DEFAULT_EXPORT_PREFERENCE,
  });
  const preference = { ...DEFAULT_EXPORT_PREFERENCE, ...stored };
  const update = (patch: Partial<ExportPreference>) =>
    setStored(prev => ({ ...DEFAULT_EXPORT_PREFERENCE, ...prev, ...patch }));

  const themes = listThemes();
  // 存的主题族被移除时回落应用当前主题
  const themeKey = themes.find(theme => theme.key === preference.themeKey)?.key ?? appTheme;
  const mode: ThemeMode = preference.mode ?? appMode;
  const { backdrop, width, padding, showDate, showSignature } = preference;
  const showTitle = preference.showTitle && !!title;
  const layout = resolveExportLayout(backdrop, width, padding);

  const capture = () => {
    if (!imageRef.current) throw new Error("预览尚未就绪");
    return captureBlobWithSnapdom(imageRef.current, {
      dpr: exportDpr(),
      type: "png",
      quality: 0.95,
    });
  };

  const run = async (kind: "copy" | "save") => {
    if (busy) return;
    setBusy(kind);
    try {
      const blob = await capture();
      if (kind === "copy") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("已复制到剪贴板");
      } else {
        downloadBlob(blob, createExportFileName(title));
        toast.success("图片已保存");
      }
    } catch (error) {
      console.error("Export image failed:", error);
      toast.error(kind === "copy" ? "复制失败，请重试" : "导出失败，请重试");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title="导出图片"
      // 标题与关闭钉在右侧设置栏内，预览区占满整个左侧高度
      header={<></>}
      width={1180}
      height={780}
      className="overflow-hidden"
    >
      <div className="flex min-h-0 flex-1">
        <div className="bg-page min-w-0 flex-1 overflow-auto">
          <div className="items-center-safe justify-center-safe flex min-h-full w-max min-w-full px-6 py-7">
            <div className="shadow-card ring-line-1 shrink-0 ring-1">
              <div
                ref={imageRef}
                data-theme={themeKey}
                data-mode={mode}
                className="text-ink-1"
                style={{
                  width,
                  padding: layout.outer,
                  background: resolveExportBackground(backdrop, themeKey, mode),
                  colorScheme: mode,
                }}
              >
                <div
                  className={cn("bg-surface", backdrop === "glow" && "rounded-tau-lg shadow-float")}
                  style={{
                    padding: `${layout.inner}px ${layout.inner + 4}px ${layout.inner - 6}px`,
                  }}
                >
                  {backdrop === "paper" && (
                    <div className="bg-accent mb-[18px] h-[3px] w-7 rounded-full" />
                  )}
                  {showTitle && (
                    <h1
                      className={cn(
                        "text-ink-1 font-[650] leading-[1.35] tracking-[0.01em]",
                        width <= 375 ? "text-[20px]" : "text-[22px]"
                      )}
                    >
                      {title}
                    </h1>
                  )}
                  {showDate && (
                    <div className="text-ink-3 text-tau-meta mt-1.5">
                      {formatExportDate(new Date())}
                    </div>
                  )}
                  <div className={cn((showTitle || showDate) && "mt-3.5")}>
                    <EditorThemeOverride mode={mode} themeKey={themeKey}>
                      <Editor kit={getContentKit()} initValue={content} readonly />
                    </EditorThemeOverride>
                  </div>
                  {showSignature && (
                    <div className="text-ink-3 mt-6 flex items-center gap-[7px] text-[11.5px]">
                      <img src={logo} alt="" className="size-3.5 rounded-[4px]" />
                      Tau
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-[300px] shrink-0 flex-col">
          <div className="flex items-center gap-2.5 pb-1.5 pl-5 pr-3.5 pt-4">
            <h2 className="text-ink-1 flex-1 text-[15px] font-[650]">导出图片</h2>
            <IconButton aria-label="关闭" onClick={onClose} className="size-7">
              <X className="size-4" strokeWidth={1.75} />
            </IconButton>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-3 pt-2">
            <section>
              <div className="flex items-center">
                <SectionLabel>样式</SectionLabel>
                <label className="text-ink-3 text-tau-meta ml-auto flex cursor-pointer items-center gap-2">
                  深色
                  <Switch
                    size="sm"
                    checked={mode === "dark"}
                    onCheckedChange={dark => update({ mode: dark ? "dark" : "light" })}
                  />
                </label>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-x-2.5 gap-y-3">
                {themes.map(theme => (
                  <ThemeSwatch
                    key={theme.key}
                    themeKey={theme.key}
                    name={theme.name}
                    mode={mode}
                    backdrop={backdrop}
                    active={theme.key === themeKey}
                    onSelect={() => update({ themeKey: theme.key })}
                  />
                ))}
              </div>
            </section>

            <section>
              <SectionLabel>版式</SectionLabel>
              <div className="mt-1">
                <SettingRow label="背景">
                  <Select
                    aria-label="背景"
                    size="sm"
                    className="w-[124px]"
                    value={backdrop}
                    options={BACKDROP_OPTIONS}
                    onValueChange={value => update({ backdrop: value })}
                  />
                </SettingRow>
                <SettingRow label="宽度">
                  <Select
                    aria-label="宽度"
                    size="sm"
                    className="w-[124px]"
                    value={width}
                    options={WIDTH_OPTIONS.map(option => ({
                      value: option.value,
                      label: (
                        <span className="flex w-full items-center justify-between gap-2">
                          {option.label}
                          <span className="text-ink-3 font-tau-mono text-[11.5px]">
                            {option.value}
                          </span>
                        </span>
                      ),
                    }))}
                    onValueChange={value => update({ width: value })}
                  />
                </SettingRow>
                <SettingRow label="边距">
                  <Select
                    aria-label="边距"
                    size="sm"
                    className="w-[124px]"
                    value={padding}
                    options={PADDING_OPTIONS}
                    onValueChange={value => update({ padding: value })}
                  />
                </SettingRow>
              </div>
            </section>

            <section>
              <SectionLabel>显示</SectionLabel>
              <div className="mt-1">
                {title && (
                  <SwitchRow
                    label="标题"
                    checked={preference.showTitle}
                    onChange={value => update({ showTitle: value })}
                  />
                )}
                <SwitchRow
                  label="日期"
                  checked={showDate}
                  onChange={value => update({ showDate: value })}
                />
                <SwitchRow
                  label="署名"
                  hint="Tau"
                  checked={showSignature}
                  onChange={value => update({ showSignature: value })}
                />
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-2.5 px-5 pb-[18px] pt-3">
            <div className="grid grid-cols-[1fr_1.4fr] gap-2">
              <Button
                icon={Copy}
                onClick={() => void run("copy")}
                loading={busy === "copy"}
                loadingText="生成中…"
                disabled={busy !== null}
                className="h-9"
              >
                复制
              </Button>
              <Button
                variant="primary"
                icon={Download}
                onClick={() => void run("save")}
                loading={busy === "save"}
                loadingText="生成中…"
                disabled={busy !== null}
                className="h-9"
              >
                保存图片
              </Button>
            </div>
            <div className="text-ink-3 font-tau-mono text-center text-[11.5px]">
              {width} × {Math.round(imageSize?.height ?? 0)} · PNG @{exportDpr()}x
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
});

ContentExportModal.displayName = "ContentExportModal";

export default ContentExportModal;

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-ink-2 text-tau-meta font-semibold">{children}</div>;
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-ink-1 text-tau-body flex h-[38px] items-center justify-between">
      <span>{label}</span>
      {children}
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="text-ink-1 text-tau-body flex h-[34px] cursor-pointer items-center justify-between">
      <span>
        {label}
        {hint && <span className="text-ink-3 text-tau-meta ml-1.5">{hint}</span>}
      </span>
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** 样式色块：缩小的纸 + 背景，取该主题族的 token 渲染，所见即所得 */
function ThemeSwatch({
  themeKey,
  name,
  mode,
  backdrop,
  active,
  onSelect,
}: {
  themeKey: string;
  name: string;
  mode: ThemeMode;
  backdrop: ExportBackdrop;
  active: boolean;
  onSelect: () => void;
}) {
  const paper = backdrop === "paper";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className="group flex cursor-pointer flex-col items-center gap-[5px]"
    >
      {/* 外层取应用主题画选中环，内层切到色块自己的主题 */}
      <span
        className={cn(
          "rounded-tau-md relative block aspect-[1.25] w-full overflow-hidden transition-shadow",
          active
            ? "shadow-[0_0_0_2px_var(--tau-bg-surface),0_0_0_4px_var(--tau-accent)]"
            : "ring-line-1 ring-1 group-hover:shadow-[0_0_0_2px_var(--tau-bg-surface),0_0_0_3.5px_var(--tau-ink-3)]"
        )}
      >
        <span
          data-theme={themeKey}
          data-mode={mode}
          className="absolute inset-0"
          style={{ background: resolveExportBackground(backdrop, themeKey, mode) }}
        >
          <span
            className={cn(
              "bg-surface absolute flex flex-col gap-[5px]",
              paper
                ? "inset-0 px-3.5 py-3"
                : "shadow-card inset-x-[18%] -bottom-[10%] top-[22%] rounded-[5px] p-[9px]"
            )}
          >
            {paper && <i className="bg-accent mb-0.5 h-0.5 w-3.5 rounded-full" />}
            <i className="bg-ink-1/85 h-1 w-3/5 rounded-full" />
            <i className="bg-ink-3/55 h-[3px] w-full rounded-full" />
            <i className="bg-ink-3/55 h-[3px] w-4/5 rounded-full" />
            <i className="bg-accent h-[3px] w-2/5 rounded-full" />
          </span>
        </span>
      </span>
      <span className={cn("text-tau-sm", active ? "text-ink-1 font-semibold" : "text-ink-2")}>
        {name}
      </span>
    </button>
  );
}
