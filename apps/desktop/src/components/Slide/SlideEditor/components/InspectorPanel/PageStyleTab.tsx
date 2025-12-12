import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { App } from "antd";
import useSlideStore from "@/stores/useSlideStore";
import useThemeColors from "@/hooks/useThemeColors";
import useUploadResource from "@/hooks/useUploadResource";
import ModernTabs from "@/components/ModernTabs";
import { SelectDropDown } from "@tau/shared";
import classNames from "classnames";
import { SlidePageTheme } from "@/types/slide";

interface ThemeOption {
  value: SlidePageTheme;
  label: string;
}

// 填充式设计 - 带边框增强识别度
const cls = {
  section: "p-4",
  sectionTitle: "text-xs font-semibold text-text-2 mb-3",
  formItem: "mb-3",
  label: "text-xs text-text-2 mb-1.5 block",
  // 输入框 - 添加边框增强识别度
  input:
    "w-full rounded-lg bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 px-3 py-2.5 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition",
  row: "flex items-center gap-3",
};

// 主题选项
const themeOptions: ThemeOption[] = [
  { value: "auto", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const PageStyleTab = () => {
  const { message } = App.useApp();
  const themeColors = useThemeColors();
  const uploadResource = useUploadResource();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentDeckId, currentPageId, pagesByDeck, decks, updatePage } =
    useSlideStore((state) => ({
      currentDeckId: state.currentDeckId,
      currentPageId: state.currentPageId,
      pagesByDeck: state.pagesByDeck,
      decks: state.decks,
      updatePage: state.updatePage,
    }));

  const currentDeck = useMemo(
    () => decks.find((d) => d.id === currentDeckId),
    [decks, currentDeckId],
  );

  const currentPage = useMemo(() => {
    if (!currentDeckId || !currentPageId) return null;
    const pages = pagesByDeck[currentDeckId] ?? [];
    return pages.find((p) => p.id === currentPageId) ?? null;
  }, [currentDeckId, currentPageId, pagesByDeck]);

  const [backgroundImage, setBackgroundImage] = useState(
    currentPage?.background?.type === "image" ? currentPage.background.value : "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const themeTriggerRef = useRef<HTMLDivElement>(null);

  // 当页面切换时更新背景图片
  useEffect(() => {
    if (currentPage?.background?.type === "image") {
      setBackgroundImage(currentPage.background.value);
    } else {
      setBackgroundImage("");
    }
  }, [currentPage?.id, currentPage?.background]);

  // 上传文件处理
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      message.error("请选择图片文件");
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadResource(file);
      if (url) {
        setBackgroundImage(url);
        // 实时保存
        if (currentPage) {
          await updatePage({
            id: currentPage.id,
            background: {
              type: "image",
              value: url,
            },
          });
          message.success("背景图片已保存");
        }
      } else {
        message.error("上传失败");
      }
    } catch (error) {
      console.error(error);
      message.error("上传失败");
    } finally {
      setIsUploading(false);
    }
  }, [uploadResource, currentPage, updatePage, message]);

  // 文件选择处理
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // 清空 input 以便再次选择同一文件
    e.target.value = "";
  };

  // 拖拽处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleSaveBackground = async () => {
    if (!currentPage) return;
    setIsSaving(true);
    try {
      if (backgroundImage.trim()) {
        await updatePage({
          id: currentPage.id,
          background: {
            type: "image",
            value: backgroundImage.trim(),
          },
        });
        message.success("背景图片已保存");
      } else {
        // 清除背景
        await updatePage({
          id: currentPage.id,
          background: null,
        });
        message.success("背景已清除");
      }
    } catch (error) {
      console.error(error);
      message.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearBackground = async () => {
    if (!currentPage) return;
    setIsSaving(true);
    try {
      await updatePage({
        id: currentPage.id,
        background: null,
      });
      setBackgroundImage("");
      message.success("背景已清除");
    } catch (error) {
      console.error(error);
      message.error("清除失败");
    } finally {
      setIsSaving(false);
    }
  };

  // 主题切换处理
  const handleThemeChange = async (item: ThemeOption) => {
    if (!currentPage) return;
    try {
      await updatePage({
        id: currentPage.id,
        theme: item.value,
      });
    } catch (error) {
      console.error(error);
      message.error("保存失败");
    }
  };

  const selectedTheme = themeOptions.find((t) => t.value === (currentPage?.theme ?? "auto"));

  if (!currentPage) {
    return (
      <div className="p-4 text-sm text-text-3 text-center">
        请先选择一个页面
      </div>
    );
  }

  return (
    <div>
      {/* 尺寸信息 */}
      <div className={cls.section}>
        <div className={cls.sectionTitle}>画布尺寸</div>
        <div className={cls.row}>
          <div className="flex-1">
            <label className={cls.label}>宽度</label>
            <input
              className={classNames(cls.input, "disabled:opacity-60")}
              type="number"
              value={currentDeck?.width ?? 1920}
              disabled
            />
          </div>
          <div className="flex-1">
            <label className={cls.label}>高度</label>
            <input
              className={classNames(cls.input, "disabled:opacity-60")}
              type="number"
              value={currentDeck?.height ?? 1080}
              disabled
            />
          </div>
        </div>
        <div className="text-xs text-text-3 mt-2">
          尺寸设置适用于整个文档
        </div>
      </div>

      {/* 背景设置 - 使用 Tab 切换上传和 URL */}
      <div className={cls.section}>
        <div className={cls.sectionTitle}>页面背景图片</div>

        <ModernTabs
          variant="flat"
          items={[
            {
              key: "upload",
              label: "本地上传",
              children: (
                <div className="pt-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <div
                    className={classNames(
                      "w-full h-24 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all",
                      isDragging
                        ? "border-brand bg-brand/10"
                        : "border-gray-200 dark:border-slate-700 hover:border-brand/50 hover:bg-gray-50 dark:hover:bg-slate-900",
                      isUploading && "opacity-50 pointer-events-none"
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? (
                      <span className="text-xs text-text-2">上传中...</span>
                    ) : (
                      <>
                        <svg className="w-6 h-6 text-text-3 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs text-text-3">点击或拖拽图片上传</span>
                      </>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: "url",
              label: "网络图片",
              children: (
                <div className="pt-3 space-y-3">
                  <div className="flex gap-1.5">
                    <input
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]"
                      placeholder="输入背景图片地址"
                      value={backgroundImage}
                      onChange={(e) => setBackgroundImage(e.target.value)}
                    />
                    <button
                      className={classNames(
                        "px-3 py-2.5 rounded-xl text-sm font-medium transition-all shrink-0",
                        "border disabled:opacity-50 disabled:cursor-not-allowed",
                        themeColors.borderClass,
                        themeColors.activeTextClass,
                        themeColors.hoverClass
                      )}
                      onClick={handleSaveBackground}
                      disabled={isSaving}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ),
            },
          ]}
        />

        {/* 预览 */}
        {backgroundImage && (
          <div className="mt-3">
            <label className={cls.label}>预览</label>
            <div
              className="w-full h-20 rounded-lg bg-bg-canvas relative group"
              style={{
                backgroundImage: `url(${backgroundImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {/* 清除按钮 */}
              <button
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleClearBackground}
                disabled={isSaving}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 主题设置 */}
      <div className={cls.section}>
        <div className={cls.sectionTitle}>页面主题</div>
        <div className={cls.formItem}>
          <label className={cls.label}>编辑器主题</label>
          <div
            ref={themeTriggerRef}
            className="w-full rounded-lg bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 px-3 py-2.5 text-sm text-text-1 flex items-center justify-between cursor-pointer hover:border-brand/50 transition"
            onClick={() => setShowThemeDropdown(true)}
          >
            <span>{selectedTheme?.label ?? "选择主题"}</span>
            <svg
              className={classNames(
                "w-4 h-4 text-text-3 transition-transform",
                showThemeDropdown && "rotate-180",
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
          <SelectDropDown
            items={themeOptions}
            selectedKey={currentPage.theme ?? "auto"}
            show={showThemeDropdown}
            onClose={() => setShowThemeDropdown(false)}
            onSelect={handleThemeChange}
            triggerElement={themeTriggerRef.current}
            getKey={(item) => item.value}
            renderItem={(item) => (
              <span className="text-sm">{item.label}</span>
            )}
            width={200}
          />
        </div>
      </div>
    </div>
  );
};

export default PageStyleTab;
