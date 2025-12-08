import { useMemo, useState } from "react";
import { App } from "antd";
import useSlideStore from "@/stores/useSlideStore";
import { SlideBackground } from "@/types/slide";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

// 填充式设计 - 无边框
const cls = {
  section: "p-4",
  sectionTitle: "text-xs font-semibold text-text-2 mb-3",
  formItem: "mb-3",
  label: "text-xs text-text-2 mb-1.5 block",
  // 填充式输入框 - 无边框，使用背景色
  input:
    "w-full rounded-lg bg-bg-input px-3 py-2.5 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand/30 transition",
  select:
    "w-full rounded-lg bg-bg-input px-3 py-2.5 text-sm text-text-1 focus:outline-none focus:ring-2 focus:ring-brand/30 transition appearance-none cursor-pointer",
  colorInput:
    "w-full h-10 rounded-lg cursor-pointer border-0 bg-bg-input",
  row: "flex items-center gap-3",
};

const backgroundTypes = [
  { value: "color", label: "纯色" },
  { value: "gradient", label: "渐变" },
  { value: "image", label: "图片" },
];

const PageStyleTab = () => {
  const { message } = App.useApp();
  const themeColors = useThemeColors();
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

  const [backgroundType, setBackgroundType] = useState<SlideBackground["type"]>(
    currentPage?.background?.type ?? "color",
  );
  const [backgroundValue, setBackgroundValue] = useState(
    currentPage?.background?.value ?? "#ffffff",
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveBackground = async () => {
    if (!currentPage) return;
    setIsSaving(true);
    try {
      await updatePage({
        id: currentPage.id,
        background: {
          type: backgroundType,
          value: backgroundValue,
        },
      });
      message.success("背景已保存");
    } catch (error) {
      console.error(error);
      message.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

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

      {/* 背景设置 */}
      <div className={cls.section}>
        <div className={cls.sectionTitle}>页面背景</div>
        <div className={cls.formItem}>
          <label className={cls.label}>背景类型</label>
          <select
            className={cls.select}
            value={backgroundType}
            onChange={(e) =>
              setBackgroundType(e.target.value as SlideBackground["type"])
            }
          >
            {backgroundTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {backgroundType === "color" && (
          <div className={cls.formItem}>
            <label className={cls.label}>颜色</label>
            <input
              type="color"
              className={cls.colorInput}
              value={backgroundValue}
              onChange={(e) => setBackgroundValue(e.target.value)}
            />
          </div>
        )}

        {backgroundType === "gradient" && (
          <div className={cls.formItem}>
            <label className={cls.label}>渐变 CSS</label>
            <input
              className={cls.input}
              placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              value={backgroundValue}
              onChange={(e) => setBackgroundValue(e.target.value)}
            />
            <div className="text-xs text-text-3 mt-1">
              输入有效的 CSS 渐变值
            </div>
          </div>
        )}

        {backgroundType === "image" && (
          <div className={cls.formItem}>
            <label className={cls.label}>图片 URL</label>
            <input
              className={cls.input}
              placeholder="输入图片地址"
              value={backgroundValue}
              onChange={(e) => setBackgroundValue(e.target.value)}
            />
          </div>
        )}

        {/* 预览 */}
        <div className={cls.formItem}>
          <label className={cls.label}>预览</label>
          <div
            className="w-full h-20 rounded-lg bg-bg-canvas"
            style={{
              background:
                backgroundType === "color"
                  ? backgroundValue
                  : backgroundType === "gradient"
                    ? backgroundValue
                    : `url(${backgroundValue}) center/cover no-repeat`,
            }}
          />
        </div>

        {/* 次级按钮 - 透明背景，边框为主题色 */}
        <button
          className={classNames(
            "w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
            "border disabled:opacity-50 disabled:cursor-not-allowed",
            themeColors.borderClass,
            themeColors.activeTextClass,
            themeColors.hoverClass
          )}
          onClick={handleSaveBackground}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "保存背景"}
        </button>
      </div>

      {/* 页面信息 */}
      <div className={cls.section}>
        <div className={cls.sectionTitle}>页面信息</div>
        <div className="text-xs text-text-2 space-y-1">
          <div>页面索引：第 {currentPage.pageIndex + 1} 页</div>
          <div>
            创建时间：{new Date(currentPage.createTime).toLocaleString()}
          </div>
          <div>
            更新时间：{new Date(currentPage.updateTime).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageStyleTab;
