import { memo, useCallback, useRef, useState } from "react";
import { getContentKit } from "@/services/editorKit";
import { createPortal } from "react-dom";
import type { Descendant } from "slate";
import { X } from "lucide-react";
import { Button as TauButton, toast } from "@tau/ui";
import { useLocalStorageState } from "ahooks";

import { Editor, EditorThemeOverride } from "@tau/editor";

import { produce } from "immer";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";

interface ExportConfig {
  name: string;
  background: string;
  theme: "light" | "dark";
  width: number;
}

const DARK_THEME_CONFIGS: ExportConfig[] = [
  {
    name: "夜色静谧",
    background: "linear-gradient(135deg,rgb(27, 27, 31) 0%,rgb(33, 31, 32) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "晨光微澜",
    background: "linear-gradient(135deg,rgb(78, 77, 132) 0%,rgb(141, 107, 115) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "日落余晖",
    background: "linear-gradient(135deg,rgb(148, 109, 59) 0%,rgb(150, 148, 41) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "海洋之歌",
    background: "linear-gradient(135deg,rgb(50, 84, 124) 0%,rgb(33, 43, 133) 100%)",
    theme: "dark",
    width: 600,
  },

  {
    name: "星空幻境",
    background: "linear-gradient(135deg,rgb(44, 62, 80) 0%,rgb(76, 73, 141) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "暗夜森林",
    background: "linear-gradient(135deg,rgb(30, 60, 40) 0%,rgb(40, 80, 60) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "炽热熔岩",
    background: "linear-gradient(135deg,rgb(101, 31, 35) 0%,rgb(178, 53, 42) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "紫罗秘境",
    background: "linear-gradient(135deg,rgb(74, 47, 90) 0%,rgb(128, 72, 144) 100%)",
    theme: "dark",
    width: 600,
  },
];

const LIGHT_THEME_CONFIGS: ExportConfig[] = [
  {
    name: "云端漫步",
    background: "linear-gradient(135deg, #F5F7FA 0%, #E0E3E7 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "梦幻晨曦",
    background: "linear-gradient(135deg,rgb(190, 214, 253) 0%,rgb(203, 176, 246) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "晴空微澜",
    background: "linear-gradient(135deg,rgb(161, 218, 251) 0%,rgb(117, 149, 255) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "紫气东来",
    background: "linear-gradient(135deg,rgb(218, 205, 252) 0%,rgb(168, 143, 255) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "粉樱飞舞",
    background: "linear-gradient(135deg,rgb(255, 182, 193) 0%,rgb(255, 160, 200) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "柠檬清香",
    background: "linear-gradient(135deg,rgb(255, 253, 150) 0%,rgb(205, 255, 176) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "蜜桃甜心",
    background: "linear-gradient(135deg,rgb(255, 218, 185) 0%,rgb(255, 176, 176) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "薄荷清凉",
    background: "linear-gradient(135deg,rgb(152, 251, 152) 0%,rgb(135, 206, 235) 100%)",
    theme: "light",
    width: 600,
  },
];

interface ContentExportModalProps {
  open: boolean;
  onClose: () => void;
  content: Descendant[];
  title?: string;
}

const ContentExportModal = memo((props: ContentExportModalProps) => {
  const { open, onClose, content, title } = props;
  const previewRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const currentDarkTheme = useRef(DARK_THEME_CONFIGS[0]);
  const currentLightTheme = useRef(LIGHT_THEME_CONFIGS[0]);

  const [exportConfig, setExportConfig] = useLocalStorageState<ExportConfig>("export-config", {
    defaultValue: DARK_THEME_CONFIGS[0],
  });

  const { background, theme, width } = exportConfig as ExportConfig;

  const handleExport = useCallback(async () => {
    if (!previewRef.current) return;

    setExporting(true);
    try {
      const originalElement = previewRef.current;

      // 创建一个遮罩层，覆盖整个预览区域，防止用户看到变化
      const mask = document.createElement("div");
      mask.style.position = "absolute";
      mask.style.top = "0";
      mask.style.left = "0";
      mask.style.width = "100%";
      mask.style.height = "100%";
      mask.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
      mask.style.display = "flex";
      mask.style.alignItems = "center";
      mask.style.justifyContent = "center";
      mask.style.zIndex = "1000";
      mask.style.borderRadius = "8px";
      mask.innerHTML = '<div data-mask style="color: #666; font-size: 14px;">正在生成图片...</div>';

      // 找到预览区域的父容器
      const previewContainer = originalElement.parentElement;
      if (previewContainer) {
        previewContainer.style.position = "relative";
        previewContainer.appendChild(mask);
      }

      // 保存原始样式
      const originalMaxHeight = originalElement.style.maxHeight;
      const originalOverflow = originalElement.style.overflow;

      // 临时修改样式以展开内容
      originalElement.style.maxHeight = "none";
      originalElement.style.overflow = "visible";

      // 等待DOM更新和动态元素渲染
      await new Promise(resolve => setTimeout(resolve, 500));

      const blob = await captureBlobWithSnapdom(originalElement, {
        dpr: window.devicePixelRatio || 1,
        type: "png",
        quality: 0.95,
        filter: element => {
          // 返回 false 表示排除，true 表示保留
          const shouldIgnore =
            element === mask ||
            // element.classList?.contains("ant-") ||
            !!(element as HTMLElement)?.dataset?.mask;
          if (shouldIgnore) {
            console.log("shouldIgnore", element);
          }
          return !shouldIgnore;
        },
        filterMode: "hide", // 使用 hide 模式保留布局
      });

      // 恢复原始样式
      originalElement.style.maxHeight = originalMaxHeight;
      originalElement.style.overflow = originalOverflow;

      // 移除遮罩层
      if (previewContainer && mask.parentElement) {
        previewContainer.removeChild(mask);
      }

      // 创建下载链接
      const link = document.createElement("a");
      link.download = `${Date.now()}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);

      toast.success("图片导出成功");
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("导出失败，请重试");

      // 确保恢复状态
      if (previewRef.current) {
        previewRef.current.style.maxHeight = "70vh";
        previewRef.current.style.overflow = "auto";

        // 清理可能残留的遮罩层
        const masks = document.querySelectorAll("div[data-mask]");
        masks.forEach(mask => {
          if (mask.parentElement) {
            mask.parentElement.removeChild(mask);
          }
        });
      }
    } finally {
      setExporting(false);
    }
  }, [background]);

  const handleChangeTheme = useCallback(
    (theme: "light" | "dark") => {
      if (!exportConfig) return;
      const newConfig = produce(exportConfig, draft => {
        draft.theme = theme;
        draft.background =
          theme === "dark"
            ? currentDarkTheme.current.background
            : currentLightTheme.current.background;
        // 保留当前的 width 设置
      });
      setExportConfig(newConfig);
    },
    [currentDarkTheme, currentLightTheme, exportConfig, setExportConfig]
  );

  const handleChangeWidth = useCallback(
    (widthStr: string) => {
      if (!exportConfig) return;
      const width = parseInt(widthStr, 10);
      const newConfig = produce(exportConfig, draft => {
        draft.width = width;
      });
      setExportConfig(newConfig);
    },
    [exportConfig, setExportConfig]
  );

  const handleSelectConfig = useCallback(
    (config: ExportConfig) => {
      if (config.theme === "dark") {
        currentDarkTheme.current = config;
      } else {
        currentLightTheme.current = config;
      }
      // 保留当前的 width 设置
      const newConfig = produce(config, draft => {
        draft.width = exportConfig?.width ?? 600;
      });
      setExportConfig(newConfig);
    },
    [currentDarkTheme, currentLightTheme, exportConfig, setExportConfig]
  );

  const widthOptions = [
    { key: "375", label: "移动端" },
    { key: "600", label: "桌面端" },
  ];

  const themeOptions = [
    { key: "dark", label: "深色主题" },
    { key: "light", label: "浅色主题" },
  ];

  if (!open) return null;

  const presetConfigs = theme === "dark" ? DARK_THEME_CONFIGS : LIGHT_THEME_CONFIGS;

  return createPortal(
    <div
      className="bg-overlay fixed inset-0 z-[340] grid place-items-center p-8 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className="border-line-1 bg-surface shadow-float rounded-tau-lg flex h-[80vh] max-h-full w-[1200px] max-w-full overflow-hidden border"
        onClick={e => e.stopPropagation()}
      >
        {/* 预览区 */}
        <div className="bg-page flex flex-1 items-center justify-center p-6">
          <div className="max-h-full overflow-auto">
            <div
              ref={previewRef}
              className="rounded-tau-md shadow-card p-8"
              style={{
                background: background,
                width: `${width}px`,
                // 编辑器正文色继承容器；预览底色由导出主题决定，不跟随应用明暗
                color: theme === "dark" ? "#fff" : "#000",
              }}
            >
              {title && <div className="mb-4 text-center text-xl font-semibold">{title}</div>}
              <EditorThemeOverride mode={theme}>
                <Editor kit={getContentKit()} initValue={content} readonly={true} />
              </EditorThemeOverride>
            </div>
          </div>
        </div>

        {/* 配置面板 */}
        <div className="border-line-1 bg-surface flex w-80 shrink-0 flex-col border-l">
          <div className="border-line-1 flex items-center justify-between border-b px-4 py-3.5">
            <h3 className="text-ink-1 text-tau-body font-[600]">导出设置</h3>
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="text-ink-3 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid size-7 place-items-center transition-colors"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
            <div>
              <div className="text-ink-1 text-tau-meta mb-2 font-medium">宽度</div>
              <div className="flex gap-1.5">
                {widthOptions.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={String(width) === item.key}
                    onClick={() => handleChangeWidth(item.key)}
                    className={`text-tau-sm ease-tau-out rounded-full px-3 py-1 font-medium transition-colors ${
                      String(width) === item.key
                        ? "bg-accent-soft text-accent-text"
                        : "text-ink-3 hover:bg-hover hover:text-ink-2"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-ink-1 text-tau-meta mb-2 font-medium">主题</div>
              <div className="flex gap-1.5">
                {themeOptions.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={theme === item.key}
                    onClick={() => handleChangeTheme(item.key as "light" | "dark")}
                    className={`text-tau-sm ease-tau-out rounded-full px-3 py-1 font-medium transition-colors ${
                      theme === item.key
                        ? "bg-accent-soft text-accent-text"
                        : "text-ink-3 hover:bg-hover hover:text-ink-2"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {presetConfigs.map(preset => {
                  const active = background === preset.background;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleSelectConfig(preset)}
                      className={`rounded-tau-md text-tau-sm flex h-14 cursor-pointer items-center justify-center transition-shadow ${
                        theme === "dark" ? "text-white" : "text-black"
                      } ${
                        active
                          ? "shadow-[0_0_0_2px_var(--tau-bg-surface),0_0_0_4px_var(--tau-accent)]"
                          : "hover:shadow-[0_0_0_2px_var(--tau-bg-surface),0_0_0_3.5px_var(--tau-ink-3)]"
                      }`}
                      style={{ background: preset.background }}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-line-1 border-t p-4">
            <TauButton
              variant="primary"
              onClick={handleExport}
              loading={exporting}
              loadingText="导出中..."
              block
              className="h-11 rounded-full"
              style={{
                background,
                color: theme === "dark" ? "#fff" : "#000",
              }}
            >
              导出图片
            </TauButton>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});

ContentExportModal.displayName = "ContentExportModal";

export default ContentExportModal;
