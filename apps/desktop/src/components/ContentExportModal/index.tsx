import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Descendant } from "slate";
import { Button, message } from "antd";
import { IoClose } from "react-icons/io5";
import classNames from "classnames";
import { useLocalStorageState } from "ahooks";

import { Editor } from "@tau/editor/src";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

import styles from "./index.module.less";
import TabsIndicator, { TabItem } from "../TabsIndicator";
import { produce } from "immer";
import CustomModal from "@/components/CustomModal";
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
    background:
      "linear-gradient(135deg,rgb(27, 27, 31) 0%,rgb(33, 31, 32) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "晨光微澜",
    background:
      "linear-gradient(135deg,rgb(78, 77, 132) 0%,rgb(141, 107, 115) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "日落余晖",
    background:
      "linear-gradient(135deg,rgb(148, 109, 59) 0%,rgb(150, 148, 41) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "海洋之歌",
    background:
      "linear-gradient(135deg,rgb(50, 84, 124) 0%,rgb(33, 43, 133) 100%)",
    theme: "dark",
    width: 600,
  },

  {
    name: "星空幻境",
    background:
      "linear-gradient(135deg,rgb(44, 62, 80) 0%,rgb(76, 73, 141) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "暗夜森林",
    background:
      "linear-gradient(135deg,rgb(30, 60, 40) 0%,rgb(40, 80, 60) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "炽热熔岩",
    background:
      "linear-gradient(135deg,rgb(101, 31, 35) 0%,rgb(178, 53, 42) 100%)",
    theme: "dark",
    width: 600,
  },
  {
    name: "紫罗秘境",
    background:
      "linear-gradient(135deg,rgb(74, 47, 90) 0%,rgb(128, 72, 144) 100%)",
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
    background:
      "linear-gradient(135deg,rgb(190, 214, 253) 0%,rgb(203, 176, 246) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "晴空微澜",
    background:
      "linear-gradient(135deg,rgb(161, 218, 251) 0%,rgb(117, 149, 255) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "紫气东来",
    background:
      "linear-gradient(135deg,rgb(218, 205, 252) 0%,rgb(168, 143, 255) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "粉樱飞舞",
    background:
      "linear-gradient(135deg,rgb(255, 182, 193) 0%,rgb(255, 160, 200) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "柠檬清香",
    background:
      "linear-gradient(135deg,rgb(255, 253, 150) 0%,rgb(205, 255, 176) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "蜜桃甜心",
    background:
      "linear-gradient(135deg,rgb(255, 218, 185) 0%,rgb(255, 176, 176) 100%)",
    theme: "light",
    width: 600,
  },
  {
    name: "薄荷清凉",
    background:
      "linear-gradient(135deg,rgb(152, 251, 152) 0%,rgb(135, 206, 235) 100%)",
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
  const extensions = useDynamicExtensionsStore((state) => state.extensions);

  const currentDarkTheme = useRef(DARK_THEME_CONFIGS[0]);
  const currentLightTheme = useRef(LIGHT_THEME_CONFIGS[0]);

  const [exportConfig, setExportConfig] = useLocalStorageState<ExportConfig>(
    "export-config",
    {
      defaultValue: DARK_THEME_CONFIGS[0],
    },
  );

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
      mask.innerHTML =
        '<div data-mask style="color: #666; font-size: 14px;">正在生成图片...</div>';

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
      await new Promise((resolve) => setTimeout(resolve, 500));

      const blob = await captureBlobWithSnapdom(originalElement, {
        dpr: window.devicePixelRatio || 1,
        type: "png",
        quality: 0.95,
        filter: (element) => {
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

      message.success("图片导出成功");
    } catch (error) {
      console.error("Export failed:", error);
      message.error("导出失败，请重试");

      // 确保恢复状态
      if (previewRef.current) {
        previewRef.current.style.maxHeight = "70vh";
        previewRef.current.style.overflow = "auto";

        // 清理可能残留的遮罩层
        const masks = document.querySelectorAll("div[data-mask]");
        masks.forEach((mask) => {
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
      const newConfig = produce(exportConfig, (draft) => {
        draft.theme = theme;
        draft.background =
          theme === "dark"
            ? currentDarkTheme.current.background
            : currentLightTheme.current.background;
        // 保留当前的 width 设置
      });
      setExportConfig(newConfig);
    },
    [currentDarkTheme, currentLightTheme, exportConfig, setExportConfig],
  );

  const handleChangeWidth = useCallback(
    (widthStr: string) => {
      if (!exportConfig) return;
      const width = parseInt(widthStr, 10);
      const newConfig = produce(exportConfig, (draft) => {
        draft.width = width;
      });
      setExportConfig(newConfig);
    },
    [exportConfig, setExportConfig],
  );

  const handleSelectConfig = useCallback(
    (config: ExportConfig) => {
      if (config.theme === "dark") {
        currentDarkTheme.current = config;
      } else {
        currentLightTheme.current = config;
      }
      // 保留当前的 width 设置
      const newConfig = produce(config, (draft) => {
        draft.width = exportConfig?.width ?? 600;
      });
      setExportConfig(newConfig);
    },
    [currentDarkTheme, currentLightTheme, exportConfig, setExportConfig],
  );

  const tabs = useMemo(() => {
    return [
      {
        key: "dark",
        label: "深色主题",
      },
      {
        key: "light",
        label: "浅色主题",
      },
    ] as TabItem<"light" | "dark">[];
  }, []);

  const widthTabs = useMemo(() => {
    return [
      {
        key: "375",
        label: "移动端",
      },
      {
        key: "600",
        label: "桌面端",
      },
    ] as TabItem<string>[];
  }, []);

  return (
    <CustomModal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1200}
      className={styles.cardExportModal}
      destroyOnClose
      closeIcon={null}
      bodyClassName="p-0"
      contentClassName="p-0 bg-transparent shadow-none border-none !max-h-[80vh] h-[80vh]"
      overlayClassName="bg-black/60"
    >
      <div className="flex h-full bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div
          className={classNames(
            "flex-1 p-6 flex items-center justify-center bg-gray-100 dark:bg-gray-800",
            styles.previewArea,
          )}
        >
          <div className="relative max-h-full overflow-auto">
            <div
              ref={previewRef}
              className={classNames(
                "p-8 rounded-lg shadow-lg",
                styles.previewContent,
              )}
              style={{
                background: background,
                width: `${width}px`,
              }}
            >
              {title && (
                <div
                  className={classNames(
                    "mb-4 text-xl font-semibold text-center",
                    theme === "dark" ? "text-white" : "text-black",
                  )}
                >
                  {title}
                </div>
              )}
              <Editor
                initValue={content}
                readonly={true}
                extensions={extensions}
                theme={theme as "light" | "dark"}
              />
            </div>
          </div>
        </div>

        <div
          className={classNames(
            "w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden",
            styles.configPanel,
          )}
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              导出设置
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-all duration-200 hover:scale-110"
            >
              <IoClose size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-0 p-4 space-y-6">
            <div>
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                宽度
              </div>
              <TabsIndicator
                tabs={widthTabs}
                activeTab={String(width)}
                onChange={handleChangeWidth}
              />
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                主题
              </div>
              <TabsIndicator
                tabs={tabs}
                activeTab={theme}
                onChange={handleChangeTheme}
              />
              <div className="grid grid-cols-2 gap-2 mt-3">
                {theme === "dark"
                  ? DARK_THEME_CONFIGS.map((preset) => (
                      <div
                        key={preset.name}
                        className="h-15 flex items-center justify-center rounded-lg cursor-pointer text-white"
                        style={{
                          background: preset.background,
                        }}
                        onClick={() => {
                          handleSelectConfig(preset);
                        }}
                      >
                        {preset.name}
                      </div>
                    ))
                  : LIGHT_THEME_CONFIGS.map((preset) => (
                      <div
                        key={preset.name}
                        className="h-15 flex items-center justify-center rounded-lg cursor-pointer text-black"
                        style={{
                          background: preset.background,
                        }}
                        onClick={() => {
                          handleSelectConfig(preset);
                        }}
                      >
                        {preset.name}
                      </div>
                    ))}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              onClick={handleExport}
              loading={exporting}
              className="w-full rounded-full! h-12! border-none!"
              style={{
                background,
                color: theme === "dark" ? "#fff" : "#000",
              }}
            >
              {exporting ? "导出中..." : "导出图片"}
            </Button>
          </div>
        </div>
      </div>
    </CustomModal>
  );
});

ContentExportModal.displayName = "ContentExportModal";

export default ContentExportModal;
