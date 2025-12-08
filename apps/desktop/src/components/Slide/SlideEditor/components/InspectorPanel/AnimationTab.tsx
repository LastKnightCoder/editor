import { useMemo, useState, useEffect, useCallback } from "react";
import { App } from "antd";
import classNames from "classnames";
import useSlideStore from "@/stores/useSlideStore";
import { SlideAnimation, AnimationEffect } from "@/types/slide";
import { useElementSelection } from "@/components/Slide/context/ElementSelectionContext";

const cls = {
  section: "p-4 border-b border-gray-100 dark:border-gray-800",
  sectionTitle: "text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3",
  emptyState: "text-sm text-gray-400 text-center py-4",
  animationList: "space-y-3",
  animationItem:
    "border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2",
  animationHeader: "flex items-center justify-between",
  animationIndex:
    "w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center",
  input:
    "w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:text-gray-100",
  select:
    "w-full rounded-lg border border-gray-200 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 dark:border-gray-700 dark:text-gray-100 dark:bg-[#0f1118]",
  textarea:
    "w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:text-gray-100 resize-none",
  row: "flex items-center gap-2",
  label: "text-xs text-gray-500 dark:text-gray-400",
  actionButton:
    "px-2 py-1 text-xs rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700",
  dangerButton:
    "px-2 py-1 text-xs rounded-md bg-rose-100 text-rose-600 hover:bg-rose-200",
  addButton:
    "w-full px-3 py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-500 hover:border-indigo-500 hover:text-indigo-500 transition",
  saveButton:
    "w-full px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg shadow-indigo-200/40 hover:opacity-90 disabled:opacity-50",
  targetBadge:
    "inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs mr-1 mb-1",
  selectTargetButton:
    "px-2 py-1 text-xs rounded-md border border-indigo-500 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30",
};

const animationEffects: { value: AnimationEffect["type"]; label: string }[] = [
  { value: "fade", label: "淡入淡出" },
  { value: "slide", label: "滑动" },
  { value: "zoom", label: "缩放" },
  { value: "bounce", label: "弹跳" },
  { value: "none", label: "无动画" },
];

const animationDirections: {
  value: NonNullable<AnimationEffect["direction"]>;
  label: string;
}[] = [
  { value: "up", label: "向上" },
  { value: "down", label: "向下" },
  { value: "left", label: "向左" },
  { value: "right", label: "向右" },
];

const easingOptions: {
  value: NonNullable<AnimationEffect["easing"]>;
  label: string;
}[] = [
  { value: "linear", label: "线性" },
  { value: "ease", label: "缓动" },
  { value: "ease-in", label: "渐入" },
  { value: "ease-out", label: "渐出" },
  { value: "ease-in-out", label: "渐入渐出" },
];

const AnimationTab = () => {
  const { message } = App.useApp();
  const { startSelection, isSelecting, selectingAnimationId } = useElementSelection();
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

  const [animations, setAnimations] = useState<SlideAnimation[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // 同步页面动画到本地状态
  useEffect(() => {
    setAnimations(currentPage?.animations ?? []);
  }, [currentPage?.id]);

  const syncAnimationOrder = useCallback((list: SlideAnimation[]) => {
    return list.map((step, idx) => ({
      ...step,
      trigger: { type: "click" as const, at: idx + 1 },
    }));
  }, []);

  const handleAddAnimation = useCallback(() => {
    setAnimations((prev) =>
      syncAnimationOrder([
        ...prev,
        {
          id: crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${prev.length}`,
          label: `动画步骤 ${prev.length + 1}`,
          description: "",
          targets: [],
          trigger: { type: "click" as const, at: prev.length + 1 },
          effect: { type: "fade", duration: 400, easing: "ease-out" },
        },
      ]),
    );
  }, [syncAnimationOrder]);

  const handleUpdateAnimation = useCallback(
    (id: string, updates: Partial<SlideAnimation>) => {
      setAnimations((prev) =>
        prev.map((step) => (step.id === id ? { ...step, ...updates } : step)),
      );
    },
    [],
  );

  const handleUpdateEffect = useCallback(
    (id: string, effectUpdates: Partial<AnimationEffect>) => {
      setAnimations((prev) =>
        prev.map((step) =>
          step.id === id
            ? {
                ...step,
                effect: { ...step.effect, ...effectUpdates },
              }
            : step,
        ),
      );
    },
    [],
  );

  const handleMoveAnimation = useCallback(
    (id: string, offset: number) => {
      setAnimations((prev) => {
        const index = prev.findIndex((step) => step.id === id);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= prev.length) return prev;
        const newList = [...prev];
        const [item] = newList.splice(index, 1);
        newList.splice(target, 0, item);
        return syncAnimationOrder(newList);
      });
    },
    [syncAnimationOrder],
  );

  const handleDeleteAnimation = useCallback(
    (id: string) => {
      setAnimations((prev) =>
        syncAnimationOrder(prev.filter((step) => step.id !== id)),
      );
    },
    [syncAnimationOrder],
  );

  const handleRemoveTarget = useCallback((animationId: string, targetPath: string) => {
    setAnimations((prev) =>
      prev.map((step) =>
        step.id === animationId
          ? { ...step, targets: step.targets.filter((t) => t !== targetPath) }
          : step,
      ),
    );
  }, []);

  const handleSave = async () => {
    if (!currentPage) return;
    setIsSaving(true);
    try {
      await updatePage({
        id: currentPage.id,
        animations: syncAnimationOrder(animations),
      });
      message.success("动画配置已保存");
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

  return (
    <div>
      {/* 动画列表 */}
      <div className={cls.section}>
        <div className="flex items-center justify-between mb-3">
          <span className={cls.sectionTitle}>动画序列</span>
          <span className="text-xs text-gray-400">
            {animations.length} 个步骤
          </span>
        </div>

        {animations.length === 0 ? (
          <div className={cls.emptyState}>暂无动画，点击下方按钮添加</div>
        ) : (
          <div className={cls.animationList}>
            {animations.map((animation, index) => (
              <div key={animation.id} className={cls.animationItem}>
                {/* 头部 */}
                <div className={cls.animationHeader}>
                  <div className="flex items-center gap-2">
                    <span className={cls.animationIndex}>{index + 1}</span>
                    <input
                      className={classNames(cls.input, "!py-1")}
                      value={animation.label ?? ""}
                      placeholder={`动画步骤 ${index + 1}`}
                      onChange={(e) =>
                        handleUpdateAnimation(animation.id, {
                          label: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className={cls.actionButton}
                      disabled={index === 0}
                      onClick={() => handleMoveAnimation(animation.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className={cls.actionButton}
                      disabled={index === animations.length - 1}
                      onClick={() => handleMoveAnimation(animation.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className={cls.dangerButton}
                      onClick={() => handleDeleteAnimation(animation.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>

                {/* 目标元素 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cls.label}>目标元素</span>
                    <button
                      className={classNames(
                        cls.selectTargetButton,
                        isSelecting && selectingAnimationId === animation.id &&
                          "bg-indigo-500 text-white border-indigo-500"
                      )}
                      onClick={() => {
                        if (isSelecting && selectingAnimationId === animation.id) {
                          message.info("正在选择中，请在编辑区点击元素或按 Esc 取消");
                          return;
                        }
                        startSelection(animation.id, animation.targets);
                        message.info("请在编辑区点击要添加动画的元素");
                      }}
                    >
                      {isSelecting && selectingAnimationId === animation.id
                        ? "选择中..."
                        : "选择元素"}
                    </button>
                  </div>
                  <div className="min-h-[28px]">
                    {animation.targets.length === 0 ? (
                      <span className="text-xs text-gray-400">
                        未选择元素
                      </span>
                    ) : (
                      <div className="flex flex-wrap">
                        {animation.targets.map((target) => (
                          <span key={target} className={cls.targetBadge}>
                            {target}
                            <button
                              className="ml-1 hover:text-rose-500"
                              onClick={() =>
                                handleRemoveTarget(animation.id, target)
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 效果设置 */}
                <div className={cls.row}>
                  <div className="flex-1">
                    <span className={cls.label}>效果</span>
                    <select
                      className={cls.select}
                      value={animation.effect?.type ?? "fade"}
                      onChange={(e) =>
                        handleUpdateEffect(animation.id, {
                          type: e.target.value as AnimationEffect["type"],
                        })
                      }
                    >
                      {animationEffects.map((effect) => (
                        <option key={effect.value} value={effect.value}>
                          {effect.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(animation.effect?.type === "slide" ||
                    animation.effect?.type === "zoom") && (
                    <div className="flex-1">
                      <span className={cls.label}>方向</span>
                      <select
                        className={cls.select}
                        value={animation.effect?.direction ?? "up"}
                        onChange={(e) =>
                          handleUpdateEffect(animation.id, {
                            direction: e.target
                              .value as AnimationEffect["direction"],
                          })
                        }
                      >
                        {animationDirections.map((dir) => (
                          <option key={dir.value} value={dir.value}>
                            {dir.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className={cls.row}>
                  <div className="flex-1">
                    <span className={cls.label}>时长 (ms)</span>
                    <input
                      type="number"
                      className={cls.input}
                      value={animation.effect?.duration ?? 400}
                      min={0}
                      step={100}
                      onChange={(e) =>
                        handleUpdateEffect(animation.id, {
                          duration: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <span className={cls.label}>缓动</span>
                    <select
                      className={cls.select}
                      value={animation.effect?.easing ?? "ease-out"}
                      onChange={(e) =>
                        handleUpdateEffect(animation.id, {
                          easing: e.target.value as AnimationEffect["easing"],
                        })
                      }
                    >
                      {easingOptions.map((easing) => (
                        <option key={easing.value} value={easing.value}>
                          {easing.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 描述 */}
                <div>
                  <span className={cls.label}>描述（可选）</span>
                  <textarea
                    className={classNames(cls.textarea, "h-16")}
                    value={animation.description ?? ""}
                    placeholder="动画描述，会在演示时显示"
                    onChange={(e) =>
                      handleUpdateAnimation(animation.id, {
                        description: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <button className={cls.addButton} onClick={handleAddAnimation}>
          + 添加动画步骤
        </button>
      </div>

      {/* 保存按钮 */}
      <div className="p-4">
        <button
          className={cls.saveButton}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "保存动画配置"}
        </button>
      </div>
    </div>
  );
};

export default AnimationTab;
