import { memo, useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { Descendant } from "slate";
import { Popover, Button, Tabs } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useRafInterval, useUnmount } from "ahooks";
import classnames from "classnames";
import { FaAngleDown } from "react-icons/fa";
import useDiaryStore from "@/stores/useDiaryStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { WeatherMood } from "@/types/diary";
import { WEATHER_ICONS, MOOD_ICONS } from "../../constants/icons";
import { getIconPath } from "../../utils/getIconPath";
import DiaryContentEditor from "../../components/DiaryContentEditor";
import {
  createEmptyDiaryContent,
  hasDiaryContent,
} from "../../constants/content";

type WeatherIcon = {
  id: string;
  name: string;
  group: string;
  color: string;
};

type MoodIcon = {
  id: string;
  name: string;
  icon: string;
  disabledIcon: string;
};

type IconType = WeatherIcon | MoodIcon;

interface IconPickerProps {
  type: "weather" | "mood";
  value: WeatherMood | null;
  onChange: (value: WeatherMood | null) => void;
  placeholder: string;
}

const IconPicker = memo(
  ({ type, value, onChange, placeholder }: IconPickerProps) => {
    const [open, setOpen] = useState(false);
    const [activeGroup, setActiveGroup] = useState<string>("常用");

    const icons = type === "weather" ? WEATHER_ICONS : MOOD_ICONS;

    const groupedIcons = useMemo(() => {
      if (type === "mood") return { 全部: icons as MoodIcon[] };

      const groups: Record<string, WeatherIcon[]> = {};
      (icons as WeatherIcon[]).forEach((icon) => {
        const group = icon.group || "其他";
        if (!groups[group]) {
          groups[group] = [];
        }
        groups[group].push(icon);
      });
      return groups;
    }, [icons, type]);

    const groupKeys = Object.keys(groupedIcons);
    const displayIcons =
      type === "weather"
        ? (groupedIcons as Record<string, WeatherIcon[]>)[activeGroup] || icons
        : (groupedIcons as { 全部: MoodIcon[] }).全部;

    const handleIconSelect = (iconId: string) => {
      onChange({ type: "image", value: iconId });
      setOpen(false);
    };

    const handleClear = () => {
      onChange(null);
      setOpen(false);
    };

    const getIconSrc = (iconId: string | null) => {
      if (!iconId) return null;

      const fakeValue = JSON.stringify({ type: "image", value: iconId });
      return getIconPath(fakeValue, type);
    };

    const content = (
      <div className="w-[520px] max-w-[90vw] rounded-2xl">
        {type === "weather" && groupKeys.length > 1 && (
          <div className="border-b border-[#f0f0f0] px-3 pt-2 dark:border-[#2a2a2a]">
            <Tabs
              activeKey={activeGroup}
              onChange={setActiveGroup}
              size="small"
              items={groupKeys.map((group) => ({
                key: group,
                label: (
                  <span className="text-[13px] text-gray-600 dark:text-gray-300">
                    {group}
                  </span>
                ),
              }))}
            />
          </div>
        )}
        <div className="grid max-h-[380px] grid-cols-8 gap-2 overflow-y-auto p-4">
          {displayIcons.map((icon: IconType) => {
            const isSelected = value?.value === icon.id;
            const iconSrc = getIconSrc(icon.id);

            return (
              <div
                key={icon.id}
                className={classnames(
                  "flex aspect-square w-full cursor-pointer items-center justify-center rounded-2xl border border-transparent bg-gray-50 p-2.5 transition duration-200 ease-in-out hover:scale-105 hover:bg-gray-100 hover:shadow-md dark:border-gray-700 dark:bg-zinc-800 dark:hover:bg-zinc-700",
                  {
                    "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500 ring-offset-2 ring-offset-indigo-100 dark:bg-indigo-500/20 dark:ring-offset-gray-900":
                      isSelected,
                  },
                )}
                onClick={() => handleIconSelect(icon.id)}
                title={icon.name}
              >
                {iconSrc &&
                  (type === "weather" ? (
                    <div
                      className="h-5 w-5"
                      style={{
                        maskImage: `url(${iconSrc})`,
                        WebkitMaskImage: `url(${iconSrc})`,
                        maskSize: "contain",
                        WebkitMaskSize: "contain",
                        maskRepeat: "no-repeat",
                        WebkitMaskRepeat: "no-repeat",
                        maskPosition: "center",
                        WebkitMaskPosition: "center",
                        backgroundColor:
                          "color" in icon ? icon.color : "#000000",
                      }}
                    />
                  ) : (
                    <img
                      src={iconSrc}
                      alt={icon.name}
                      className="h-7 w-7 object-contain"
                    />
                  ))}
              </div>
            );
          })}
        </div>
        {value && (
          <div className="border-t border-[#f0f0f0] px-3 py-2 text-right dark:border-[#2a2a2a]">
            <Button size="small" type="text" onClick={handleClear}>
              清除
            </Button>
          </div>
        )}
      </div>
    );

    const selectedIconSrc = value ? getIconSrc(value.value) : null;
    const selectedIcon = value ? icons.find((i) => i.id === value.value) : null;

    return (
      <Popover
        content={content}
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="bottomLeft"
        styles={{
          content: {
            padding: 0,
          },
        }}
      >
        <div className="flex h-8 min-w-15 cursor-pointer items-center justify-center gap-3 rounded-lg border border-transparent px-2.5 py-1 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800">
          {selectedIconSrc ? (
            type === "weather" ? (
              <div
                className="h-5 w-5"
                style={{
                  maskImage: `url(${selectedIconSrc})`,
                  WebkitMaskImage: `url(${selectedIconSrc})`,
                  maskSize: "contain",
                  WebkitMaskSize: "contain",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                  backgroundColor:
                    selectedIcon && "color" in selectedIcon
                      ? selectedIcon.color
                      : "#000000",
                }}
              />
            ) : (
              <img
                src={selectedIconSrc}
                alt="mood"
                className="h-[18px] w-[18px] object-contain"
              />
            )
          ) : (
            <span className="text-[13px] text-gray-400 dark:text-gray-500">
              {placeholder}
            </span>
          )}
          <FaAngleDown className="text-xs text-gray-400 dark:text-gray-500" />
        </div>
      </Popover>
    );
  },
);

const DailyView = memo(() => {
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const {
    currentDate,
    getDailyEntry,
    onCreateDiaryEntry,
    onUpdateDiaryEntry,
    navigateToPrevDay,
    navigateToNextDay,
    initLoading,
  } = useDiaryStore();

  const entry = getDailyEntry(currentDate);
  const initialWeather = entry?.weather ?? null;
  const initialMood = entry?.mood ?? null;
  const initialContent =
    entry && hasDiaryContent(entry.content)
      ? entry.content
      : createEmptyDiaryContent();

  const [localWeather, setLocalWeather] = useState<WeatherMood | null>(
    initialWeather,
  );
  const [localMood, setLocalMood] = useState<WeatherMood | null>(initialMood);
  const [hasChanges, setHasChanges] = useState(false);

  const latestContentRef = useRef<Descendant[]>(initialContent);
  const latestWeatherRef = useRef<WeatherMood | null>(initialWeather);
  const latestMoodRef = useRef<WeatherMood | null>(initialMood);
  const creationTrackerRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (initLoading) return;
    if (entry) return;
    const creationKey = `daily-${currentDate}`;
    if (creationTrackerRef.current.has(creationKey)) return;

    creationTrackerRef.current.add(creationKey);
    onCreateDiaryEntry({
      type: "daily",
      date: currentDate,
      weather: null,
      mood: null,
      content: createEmptyDiaryContent(),
    })
      .catch((error) => {
        console.error("Failed to auto create daily diary:", error);
      })
      .finally(() => {
        creationTrackerRef.current.delete(creationKey);
      });
  }, [entry, currentDate, initLoading, onCreateDiaryEntry]);

  // 初始化：从 entry 加载数据
  useEffect(() => {
    if (entry) {
      setLocalWeather(entry.weather);
      setLocalMood(entry.mood);
    } else {
      setLocalWeather(null);
      setLocalMood(null);
    }
    latestWeatherRef.current = entry?.weather ?? null;
    latestMoodRef.current = entry?.mood ?? null;
  }, [entry]);

  useEffect(() => {
    if (hasChanges) return;
    latestContentRef.current =
      entry && hasDiaryContent(entry.content)
        ? entry.content
        : createEmptyDiaryContent();
  }, [entry, hasChanges]);

  const handleContentChange = useCallback((value: Descendant[]) => {
    latestContentRef.current = value;
    setHasChanges(true);
  }, []);

  const handleWeatherChange = useCallback((weather: WeatherMood | null) => {
    setLocalWeather(weather);
    latestWeatherRef.current = weather;
    setHasChanges(true);
  }, []);

  const handleMoodChange = useCallback((mood: WeatherMood | null) => {
    setLocalMood(mood);
    latestMoodRef.current = mood;
    setHasChanges(true);
  }, []);

  const saveDiary = useCallback(async () => {
    if (!hasChanges || !entry) return;

    const weatherAtSave = localWeather;
    const moodAtSave = localMood;
    const rawContent = latestContentRef.current ?? createEmptyDiaryContent();
    const serializedContent = JSON.stringify(rawContent);
    const contentSnapshot = JSON.parse(serializedContent) as Descendant[];

    try {
      await onUpdateDiaryEntry({
        id: entry.id,
        weather: weatherAtSave,
        mood: moodAtSave,
        content: contentSnapshot,
      });

      const latestContentString = JSON.stringify(
        latestContentRef.current ?? createEmptyDiaryContent(),
      );
      const hasNewerContent = latestContentString !== serializedContent;
      const hasWeatherChanged = latestWeatherRef.current !== weatherAtSave;
      const hasMoodChanged = latestMoodRef.current !== moodAtSave;

      if (!hasNewerContent && !hasWeatherChanged && !hasMoodChanged) {
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Failed to save diary:", error);
    }
  }, [hasChanges, entry, localWeather, localMood, onUpdateDiaryEntry]);

  useRafInterval(() => {
    saveDiary();
  }, 1000);

  useUnmount(() => {
    saveDiary();
  });

  const dateObj = dayjs(currentDate);
  const displayDate = dateObj.format("YYYY 年 MM 月 DD 日 dddd");

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border border-transparent">
      <div className="border-b border-[#f0f0f0] px-8 py-7 dark:border-[#2a2a2a]">
        <div className="mb-5 flex items-center gap-4">
          <Button
            type="text"
            icon={<LeftOutlined />}
            onClick={navigateToPrevDay}
            className="text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
          />
          <h2 className="m-0 flex-1 text-[26px] font-semibold text-gray-900 dark:text-gray-100">
            {displayDate}
          </h2>
          <Button
            type="text"
            icon={<RightOutlined />}
            onClick={navigateToNextDay}
            className="text-gray-400 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              天气：
            </span>
            <IconPicker
              type="weather"
              value={localWeather}
              onChange={handleWeatherChange}
              placeholder="选择天气"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              心情：
            </span>
            <IconPicker
              type="mood"
              value={localMood}
              onChange={handleMoodChange}
              placeholder="选择心情"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 justify-center overflow-hidden px-8 py-8 pb-20">
        <div className="w-full h-full overflow-auto max-w-[800px] px-5">
          <DiaryContentEditor
            contentId={entry?.contentId}
            initialValue={initialContent}
            extensions={dynamicExtensions}
            placeholder="记录今天的点滴..."
            className="editor-content text-[16px] leading-[1.7] text-gray-600 dark:text-gray-300"
            onContentChange={handleContentChange}
          />
        </div>
      </div>
    </div>
  );
});

export default DailyView;
