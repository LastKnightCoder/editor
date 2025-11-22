import { memo, useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { Descendant } from "slate";
import { Popover, Button, Tabs } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useRafInterval, useUnmount } from "ahooks";
import classnames from "classnames";
import Editor, { EditorRef } from "@/components/Editor";
import useDiaryStore from "@/stores/useDiaryStore";
import useUploadResource from "@/hooks/useUploadResource";
import useTheme from "@/hooks/useTheme";
import { WeatherMood } from "@/types/diary";
import { WEATHER_ICONS, MOOD_ICONS } from "../../constants/icons";
import { getIconPath } from "../../utils/getIconPath";
import styles from "./index.module.less";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

const EMPTY_CONTENT_HASH = JSON.stringify(DEFAULT_CONTENT);
const hasContent = (content?: Descendant[] | null): content is Descendant[] =>
  Array.isArray(content) && content.length > 0;
import { FaAngleDown } from "react-icons/fa";

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
    const { isDark } = useTheme();
    const [open, setOpen] = useState(false);
    const [activeGroup, setActiveGroup] = useState<string>("常用");

    const icons = type === "weather" ? WEATHER_ICONS : MOOD_ICONS;

    const groupedIcons = useMemo(() => {
      if (type === "mood") return { 全部: icons as MoodIcon[] };

      // For weather icons, create properly typed groups
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
      <div
        className={classnames(styles.iconPicker, {
          [styles.dark]: isDark,
        })}
      >
        {type === "weather" && groupKeys.length > 1 && (
          <Tabs
            activeKey={activeGroup}
            onChange={setActiveGroup}
            size="small"
            items={groupKeys.map((group) => ({
              key: group,
              label: group,
            }))}
            className={styles.iconTabs}
          />
        )}
        <div className={styles.iconGrid}>
          {displayIcons.map((icon: IconType) => {
            const isSelected = value?.value === icon.id;
            const iconSrc = getIconSrc(icon.id);

            return (
              <div
                key={icon.id}
                className={classnames(styles.iconItem, {
                  [styles.selected]: isSelected,
                })}
                onClick={() => handleIconSelect(icon.id)}
                title={icon.name}
              >
                {iconSrc &&
                  (type === "weather" ? (
                    <div
                      className={styles.weatherIcon}
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
                      className={styles.moodIcon}
                    />
                  ))}
              </div>
            );
          })}
        </div>
        {value && (
          <div className={styles.pickerFooter}>
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
        overlayClassName={styles.iconPickerPopover}
      >
        <div
          className={classnames(styles.iconButton, {
            [styles.dark]: isDark,
          })}
        >
          {selectedIconSrc ? (
            type === "weather" ? (
              <div
                className={styles.selectedWeatherIcon}
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
                className={styles.selectedMoodIcon}
              />
            )
          ) : (
            <span className={styles.placeholder}>{placeholder}</span>
          )}
          <FaAngleDown className={styles.dropdownIcon} />
        </div>
      </Popover>
    );
  },
);

const DailyView = memo(() => {
  const {
    currentDate,
    getDailyEntry,
    onCreateDiaryEntry,
    onUpdateDiaryEntry,
    onDeleteDiaryEntry,
    navigateToPrevDay,
    navigateToNextDay,
  } = useDiaryStore();

  const editorRef = useRef<EditorRef | null>(null);
  const uploadResource = useUploadResource();
  const { isDark } = useTheme();

  const [localWeather, setLocalWeather] = useState<WeatherMood | null>(null);
  const [localMood, setLocalMood] = useState<WeatherMood | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const entry = getDailyEntry(currentDate);
  const lastLoadedEntryRef = useRef<{
    entryId: number | null;
    dateKey: string;
    contentHash: string;
  } | null>(null);

  useEffect(() => {
    const dateKey = currentDate;
    const entryId = entry?.id ?? null;
    const contentHash =
      entry && hasContent(entry.content)
        ? JSON.stringify(entry.content)
        : EMPTY_CONTENT_HASH;
    const nextSignature = { entryId, dateKey, contentHash };
    const isSameAsLast =
      lastLoadedEntryRef.current &&
      lastLoadedEntryRef.current.entryId === nextSignature.entryId &&
      lastLoadedEntryRef.current.dateKey === nextSignature.dateKey &&
      lastLoadedEntryRef.current.contentHash === nextSignature.contentHash;

    if (isSameAsLast) {
      return;
    }

    lastLoadedEntryRef.current = nextSignature;

    if (entry) {
      setLocalWeather(entry.weather);
      setLocalMood(entry.mood);
      setHasChanges(false);
      if (editorRef.current) {
        const nextContent = hasContent(entry.content)
          ? entry.content
          : DEFAULT_CONTENT;
        editorRef.current.setEditorValue(nextContent);
      }
    } else {
      setLocalWeather(null);
      setLocalMood(null);
      setHasChanges(false);
      if (editorRef.current) {
        editorRef.current.setEditorValue(DEFAULT_CONTENT);
      }
    }
  }, [entry, currentDate]);

  const handleContentChange = useCallback(() => {
    setHasChanges(true);
  }, []);

  const handleWeatherChange = useCallback((weather: WeatherMood | null) => {
    setLocalWeather(weather);
    setHasChanges(true);
  }, []);

  const handleMoodChange = useCallback((mood: WeatherMood | null) => {
    setLocalMood(mood);
    setHasChanges(true);
  }, []);

  const saveDiary = useCallback(async () => {
    if (!hasChanges) return;

    const content = editorRef.current?.getEditor().children || [];
    const isEmptyContent = JSON.stringify(content) === EMPTY_CONTENT_HASH;

    try {
      if (entry) {
        if (isEmptyContent && !entry.weather && !entry.mood) {
          await onDeleteDiaryEntry(entry.id);
        } else {
          await onUpdateDiaryEntry({
            id: entry.id,
            weather: localWeather,
            mood: localMood,
            content,
          });
        }
      } else {
        if (!isEmptyContent) {
          await onCreateDiaryEntry({
            type: "daily",
            date: currentDate,
            contentId: 0,
            weather: localWeather,
            mood: localMood,
            content,
          });
        }
      }

      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save diary:", error);
    }
  }, [
    hasChanges,
    entry,
    currentDate,
    localWeather,
    localMood,
    onCreateDiaryEntry,
    onUpdateDiaryEntry,
    onDeleteDiaryEntry,
  ]);

  useRafInterval(() => {
    saveDiary();
  }, 1000);

  useUnmount(() => {
    saveDiary();
  });

  const dateObj = dayjs(currentDate);
  const displayDate = dateObj.format("YYYY 年 MM 月 DD 日 dddd");

  return (
    <div
      className={classnames(styles.dailyView, {
        [styles.dark]: isDark,
      })}
    >
      <div className={styles.header}>
        <div className={styles.dateSection}>
          <Button
            type="text"
            icon={<LeftOutlined />}
            onClick={navigateToPrevDay}
            className={styles.navButton}
          />
          <h2 className={styles.dateTitle}>{displayDate}</h2>
          <Button
            type="text"
            icon={<RightOutlined />}
            onClick={navigateToNextDay}
            className={styles.navButton}
          />
        </div>

        <div className={styles.metaSection}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>天气：</span>
            <IconPicker
              type="weather"
              value={localWeather}
              onChange={handleWeatherChange}
              placeholder="选择天气"
            />
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>心情：</span>
            <IconPicker
              type="mood"
              value={localMood}
              onChange={handleMoodChange}
              placeholder="选择心情"
            />
          </div>
        </div>
      </div>

      <div className={styles.editorContainer}>
        <Editor
          ref={editorRef}
          initValue={
            entry && hasContent(entry.content) ? entry.content : DEFAULT_CONTENT
          }
          onChange={handleContentChange}
          readonly={false}
          uploadResource={uploadResource}
          placeHolder="记录今天的点滴..."
        />
      </div>
    </div>
  );
});

export default DailyView;
