import { useMemo, useState, useEffect, useRef } from "react";
import useSlideStore from "@/stores/useSlideStore";
import { TransitionConfig } from "@/types/slide";
import SelectDropDown from "@/components/SelectDropDown";
import classNames from "classnames";

const cls = {
  section: "p-4",
  sectionTitle: "text-xs font-semibold text-text-2 mb-3",
  formItem: "mb-3",
  label: "text-xs text-text-2 mb-1.5 block",
  input:
    "w-full rounded-lg bg-bg-input px-3 py-2.5 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand/30 transition",
  trigger:
    "w-full rounded-lg bg-bg-input px-3 py-2.5 text-sm text-text-1 flex items-center justify-between cursor-pointer hover:bg-hover transition",
};

interface TransitionOption {
  value: TransitionConfig["type"];
  label: string;
}

interface DirectionOption {
  value: NonNullable<TransitionConfig["direction"]>;
  label: string;
}

const transitionTypes: TransitionOption[] = [
  { value: "none", label: "无" },
  { value: "fade", label: "淡入淡出" },
  { value: "slide", label: "滑动" },
  { value: "zoom", label: "缩放" },
  { value: "flip", label: "翻转" },
];

const transitionDirections: DirectionOption[] = [
  { value: "left", label: "向左" },
  { value: "right", label: "向右" },
  { value: "up", label: "向上" },
  { value: "down", label: "向下" },
];

const TransitionTab = () => {
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

  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showDirectionDropdown, setShowDirectionDropdown] = useState(false);
  const typeTriggerRef = useRef<HTMLDivElement>(null);
  const directionTriggerRef = useRef<HTMLDivElement>(null);

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

  // 实时保存
  const saveTransition = async (
    type: TransitionConfig["type"],
    direction: TransitionConfig["direction"],
    duration: number,
  ) => {
    if (!currentPage) return;
    try {
      await updatePage({
        id: currentPage.id,
        transitionConfig: {
          type,
          direction,
          duration,
        },
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleTypeChange = (item: TransitionOption) => {
    setTransitionType(item.value);
    saveTransition(item.value, transitionDirection, transitionDuration);
  };

  const handleDirectionChange = (item: DirectionOption) => {
    setTransitionDirection(item.value);
    saveTransition(transitionType, item.value, transitionDuration);
  };

  const handleDurationChange = (value: number) => {
    setTransitionDuration(value);
    saveTransition(transitionType, transitionDirection, value);
  };

  if (!currentPage) {
    return (
      <div className="p-4 text-sm text-text-3 text-center">
        请先选择一个页面
      </div>
    );
  }

  const showDirectionOption =
    transitionType === "slide" || transitionType === "flip";

  const selectedType = transitionTypes.find((t) => t.value === transitionType);
  const selectedDirection = transitionDirections.find(
    (d) => d.value === transitionDirection,
  );

  return (
    <div>
      <div className={cls.section}>
        <div className={cls.sectionTitle}>页面过渡效果</div>

        <div className={cls.formItem}>
          <label className={cls.label}>过渡类型</label>
          <div
            ref={typeTriggerRef}
            className={cls.trigger}
            onClick={() => setShowTypeDropdown(true)}
          >
            <span>{selectedType?.label ?? "选择类型"}</span>
            <svg
              className={classNames(
                "w-4 h-4 text-text-3 transition-transform",
                showTypeDropdown && "rotate-180",
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
            items={transitionTypes}
            selectedKey={transitionType}
            show={showTypeDropdown}
            onClose={() => setShowTypeDropdown(false)}
            onSelect={handleTypeChange}
            triggerElement={typeTriggerRef.current}
            getKey={(item) => item.value}
            renderItem={(item) => (
              <span className="text-sm">{item.label}</span>
            )}
            width={200}
          />
        </div>

        {showDirectionOption && (
          <div className={cls.formItem}>
            <label className={cls.label}>方向</label>
            <div
              ref={directionTriggerRef}
              className={cls.trigger}
              onClick={() => setShowDirectionDropdown(true)}
            >
              <span>{selectedDirection?.label ?? "选择方向"}</span>
              <svg
                className={classNames(
                  "w-4 h-4 text-text-3 transition-transform",
                  showDirectionDropdown && "rotate-180",
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
              items={transitionDirections}
              selectedKey={transitionDirection ?? "right"}
              show={showDirectionDropdown}
              onClose={() => setShowDirectionDropdown(false)}
              onSelect={handleDirectionChange}
              triggerElement={directionTriggerRef.current}
              getKey={(item) => item.value}
              renderItem={(item) => (
                <span className="text-sm">{item.label}</span>
              )}
              width={200}
            />
          </div>
        )}

        <div className={cls.formItem}>
          <label className={cls.label}>时长 (毫秒)</label>
          <input
            type="number"
            className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
            value={transitionDuration}
            min={0}
            max={3000}
            step={100}
            onChange={(e) => handleDurationChange(parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* 效果说明 */}
      <div className={cls.section}>
        <div className={cls.sectionTitle}>效果说明</div>
        <div className="space-y-2 text-xs text-text-3">
          <p>
            <strong className="text-text-2">淡入淡出</strong>：页面透明度渐变切换
          </p>
          <p>
            <strong className="text-text-2">滑动</strong>：页面从指定方向滑入
          </p>
          <p>
            <strong className="text-text-2">缩放</strong>：页面从小到大渐变显示
          </p>
          <p>
            <strong className="text-text-2">翻转</strong>：页面 3D 翻转效果
          </p>
        </div>
      </div>
    </div>
  );
};

export default TransitionTab;
