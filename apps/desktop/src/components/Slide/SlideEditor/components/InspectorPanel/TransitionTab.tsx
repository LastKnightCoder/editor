import { useMemo, useState, useEffect } from "react";
import { App } from "antd";
import useSlideStore from "@/stores/useSlideStore";
import { TransitionConfig } from "@/types/slide";

const cls = {
  section: "p-4 border-b border-gray-100 dark:border-gray-800",
  sectionTitle: "text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3",
  formItem: "mb-3",
  label: "text-xs text-gray-600 dark:text-gray-400 mb-1.5 block",
  select:
    "w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 dark:border-gray-700 dark:text-gray-100 dark:bg-[#0f1118]",
  input:
    "w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:text-gray-100",
  row: "flex items-center gap-3",
  saveButton:
    "w-full px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg shadow-indigo-200/40 hover:opacity-90 disabled:opacity-50",
  previewBox:
    "w-full h-24 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0f1118] flex items-center justify-center overflow-hidden",
  previewSlide:
    "w-16 h-10 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs text-indigo-600 dark:text-indigo-400",
};

const transitionTypes: { value: TransitionConfig["type"]; label: string }[] = [
  { value: "none", label: "无" },
  { value: "fade", label: "淡入淡出" },
  { value: "slide", label: "滑动" },
  { value: "zoom", label: "缩放" },
  { value: "flip", label: "翻转" },
];

const transitionDirections: {
  value: NonNullable<TransitionConfig["direction"]>;
  label: string;
}[] = [
  { value: "left", label: "向左" },
  { value: "right", label: "向右" },
  { value: "up", label: "向上" },
  { value: "down", label: "向下" },
];

const TransitionTab = () => {
  const { message } = App.useApp();
  const { currentDeckId, currentPageId, pagesByDeck, updatePage } =
    useSlideStore((state) => ({
      currentDeckId: state.currentDeckId,
      currentPageId: state.currentPageId,
      pagesByDeck: state.pagesByDeck,
      updatePage: state.updatePage,
    }));

  const currentPage = useMemo(() => {
    if (!currentDeckId || !currentPageId) return null;
    const pages = pagesByDeck[currentDeckId] ?? [];
    return pages.find((p) => p.id === currentPageId) ?? null;
  }, [currentDeckId, currentPageId, pagesByDeck]);

  const [transitionType, setTransitionType] = useState<TransitionConfig["type"]>(
    currentPage?.transitionConfig?.type ?? "fade",
  );
  const [transitionDirection, setTransitionDirection] = useState<
    TransitionConfig["direction"]
  >(currentPage?.transitionConfig?.direction ?? "right");
  const [transitionDuration, setTransitionDuration] = useState(
    currentPage?.transitionConfig?.duration ?? 400,
  );
  const [isSaving, setIsSaving] = useState(false);

  // 同步页面设置
  useEffect(() => {
    if (currentPage?.transitionConfig) {
      setTransitionType(currentPage.transitionConfig.type);
      setTransitionDirection(currentPage.transitionConfig.direction ?? "right");
      setTransitionDuration(currentPage.transitionConfig.duration);
    } else {
      setTransitionType("fade");
      setTransitionDirection("right");
      setTransitionDuration(400);
    }
  }, [currentPage?.id]);

  const handleSave = async () => {
    if (!currentPage) return;
    setIsSaving(true);
    try {
      await updatePage({
        id: currentPage.id,
        transitionConfig: {
          type: transitionType,
          direction: transitionDirection,
          duration: transitionDuration,
        },
      });
      message.success("过渡效果已保存");
    } catch (error) {
      console.error(error);
      message.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentPage) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center">
        请先选择一个页面
      </div>
    );
  }

  const showDirectionOption =
    transitionType === "slide" || transitionType === "flip";

  return (
    <div>
      {/* 过渡设置 */}
      <div className={cls.section}>
        <div className={cls.sectionTitle}>页面过渡效果</div>
        <p className="text-xs text-gray-400 mb-4">
          设置进入此页面时的过渡动画
        </p>

        <div className={cls.formItem}>
          <label className={cls.label}>过渡类型</label>
          <select
            className={cls.select}
            value={transitionType}
            onChange={(e) =>
              setTransitionType(e.target.value as TransitionConfig["type"])
            }
          >
            {transitionTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {showDirectionOption && (
          <div className={cls.formItem}>
            <label className={cls.label}>方向</label>
            <select
              className={cls.select}
              value={transitionDirection}
              onChange={(e) =>
                setTransitionDirection(
                  e.target.value as TransitionConfig["direction"],
                )
              }
            >
              {transitionDirections.map((dir) => (
                <option key={dir.value} value={dir.value}>
                  {dir.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={cls.formItem}>
          <label className={cls.label}>时长 (毫秒)</label>
          <input
            type="number"
            className={cls.input}
            value={transitionDuration}
            min={0}
            max={3000}
            step={100}
            onChange={(e) =>
              setTransitionDuration(parseInt(e.target.value) || 0)
            }
          />
        </div>

        <button
          className={cls.saveButton}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "保存过渡效果"}
        </button>
      </div>

      {/* 预览说明 */}
      <div className={cls.section}>
        <div className={cls.sectionTitle}>效果说明</div>
        <div className="space-y-2 text-xs text-gray-500">
          <p>
            <strong>淡入淡出</strong>：页面透明度渐变切换
          </p>
          <p>
            <strong>滑动</strong>：页面从指定方向滑入
          </p>
          <p>
            <strong>缩放</strong>：页面从小到大渐变显示
          </p>
          <p>
            <strong>翻转</strong>：页面 3D 翻转效果
          </p>
        </div>
      </div>

      {/* 当前配置预览 */}
      <div className={cls.section}>
        <div className={cls.sectionTitle}>当前配置</div>
        <div className="text-xs text-gray-500 space-y-1">
          <div>类型：{transitionTypes.find((t) => t.value === transitionType)?.label}</div>
          {showDirectionOption && (
            <div>
              方向：
              {transitionDirections.find((d) => d.value === transitionDirection)?.label}
            </div>
          )}
          <div>时长：{transitionDuration}ms</div>
        </div>
      </div>
    </div>
  );
};

export default TransitionTab;
