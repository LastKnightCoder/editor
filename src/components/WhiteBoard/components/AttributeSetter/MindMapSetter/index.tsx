import { MindNodeElement } from "@/components/WhiteBoard/types";
import { MdOutlinePalette } from "react-icons/md";
import { produce } from "immer";
import styles from "./index.module.less";
import { Popover, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import { useState, useMemo } from "react";
import { MindUtil } from "@/components/WhiteBoard/utils";
import { useBoard } from "@/components/WhiteBoard/hooks";
import { MIND_MAP_THEMES } from "@/components/WhiteBoard/constants/mind-themes";
import useTheme from "@/hooks/useTheme";
import classnames from "classnames";

interface MindMapSetterProps {
  element: MindNodeElement;
  onChange: (element: MindNodeElement) => void;
}

const MindMapSetter = (props: MindMapSetterProps) => {
  const { element, onChange } = props;
  const board = useBoard();
  const { isDark } = useTheme();

  const [selectThemeOpen, setSelectThemeOpen] = useState(false);

  const root = useMemo(
    () => MindUtil.getRoot(board, element),
    [board, element],
  );

  const currentThemeId = root?.themeId || MindUtil.getDefaultThemeId();

  const handleSelectTheme = useMemoizedFn((themeId: string) => {
    if (!root) return;

    const newRoot = produce(root, (draft) => {
      draft.themeId = themeId;
    });

    onChange(newRoot as MindNodeElement);

    MindUtil.saveDefaultThemeId(themeId);

    setSelectThemeOpen(false);
  });

  const renderPreview = (theme: (typeof MIND_MAP_THEMES)[0]) => {
    if (theme.id === "rainbow") {
      const colors = theme.palette.map((p) => p.background);
      const step = 100 / colors.length;
      const stops = colors
        .map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`)
        .join(", ");

      return (
        <div
          className={styles.rainbowPreview}
          style={{
            background: `linear-gradient(115deg, ${stops})`,
          }}
        />
      );
    }

    return (
      <div className={styles.colorStrip}>
        {theme.palette.slice(0, 6).map((paletteItem, index) => (
          <div
            key={index}
            className={styles.colorBlock}
            style={{ background: paletteItem.background }}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
      className={classnames(styles.container, {
        [styles.dark]: isDark,
      })}
    >
      <Popover
        open={selectThemeOpen}
        onOpenChange={setSelectThemeOpen}
        styles={{
          body: {
            padding: 0,
          },
        }}
        trigger={"click"}
        content={
          <div className={styles.themeGrid}>
            {MIND_MAP_THEMES.map((theme) => (
              <div
                key={theme.id}
                className={styles.themeItem}
                onClick={() => handleSelectTheme(theme.id)}
              >
                <div className={styles.themeLabel}>{theme.label}</div>
                <div
                  className={classnames(styles.themePreview, {
                    [styles.selected]: theme.id === currentThemeId,
                  })}
                >
                  {renderPreview(theme)}
                </div>
              </div>
            ))}
          </div>
        }
        placement={"left"}
        arrow={false}
      >
        <Tooltip title={"主题设置"} trigger={"hover"} placement={"left"}>
          <div className={styles.item}>
            <MdOutlinePalette />
          </div>
        </Tooltip>
      </Popover>
    </div>
  );
};

export default MindMapSetter;
