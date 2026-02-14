import { memo } from "react";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";
import { ConfigProvider, Popover, Slider, Switch, Tooltip, theme } from "antd";
import {
  Blend,
  Gauge,
  Palette,
  PenLine,
  SlidersHorizontal,
} from "lucide-react";
import {
  getDefaultHandwriteStyle,
  rebuildHandwriteGeometry,
  saveHandwriteStyle,
} from "../../../utils";
import {
  THEME_COLORS,
  getDefaultThemeColorId,
} from "../../../constants/theme-colors";
import useTheme from "@/hooks/useTheme";
import type { HandwriteElement } from "../../../plugins/HandwritePlugin";
import styles from "./index.module.less";

interface HandwriteSetterProps {
  element: HandwriteElement;
  onChange: (element: HandwriteElement) => void;
}

const HandwriteSetter = memo((props: HandwriteSetterProps) => {
  const { element, onChange } = props;
  const { isDark } = useTheme();

  const currentStyle = {
    ...getDefaultHandwriteStyle(),
    ...element.style,
  };

  const updateStyle = useMemoizedFn((patch: Partial<typeof currentStyle>) => {
    const nextStyle = {
      ...currentStyle,
      ...patch,
    };
    const rebuilt = rebuildHandwriteGeometry(
      element.points,
      {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      },
      nextStyle,
    );
    if (!rebuilt) return;

    const nextElement: HandwriteElement = {
      ...element,
      ...rebuilt,
      style: nextStyle,
    };
    saveHandwriteStyle(nextStyle);
    onChange(nextElement);
  });

  return (
    <div
      className={classnames(styles.container, {
        [styles.dark]: isDark,
      })}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
            marginLeft: 12,
          },
        }}
        content={
          <div
            className={classnames(styles.popoverPanel, {
              [styles.dark]: isDark,
            })}
          >
            <div className={styles.panelLabel}>颜色</div>
            <div className={styles.colorGrid}>
              {THEME_COLORS.map((color) => {
                const colorValue = isDark ? color.dark : color.light;
                return (
                  <button
                    key={color.id}
                    type="button"
                    className={classnames(styles.colorButton, {
                      [styles.active]:
                        (currentStyle.themeColorId ||
                          getDefaultThemeColorId()) === color.id,
                    })}
                    style={{ backgroundColor: colorValue }}
                    onClick={() => updateStyle({ themeColorId: color.id })}
                    title={color.label}
                  />
                );
              })}
            </div>
          </div>
        }
      >
        <Tooltip title={"颜色"} placement={"left"}>
          <div className={styles.item}>
            <Palette size={16} />
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
            marginLeft: 12,
          },
        }}
        content={
          <div
            className={classnames(styles.popoverPanel, {
              [styles.dark]: isDark,
            })}
          >
            <div className={styles.panelLabel}>线宽</div>
            <ConfigProvider
              theme={{
                algorithm: isDark
                  ? theme.darkAlgorithm
                  : theme.defaultAlgorithm,
              }}
            >
              <Slider
                min={1}
                max={64}
                step={1}
                value={currentStyle.size}
                onChange={(value) =>
                  updateStyle({
                    size: Array.isArray(value) ? value[0] : value,
                  })
                }
              />
            </ConfigProvider>
          </div>
        }
      >
        <Tooltip title={"线宽"} placement={"left"}>
          <div className={styles.item}>
            <PenLine size={16} />
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
            marginLeft: 12,
          },
        }}
        content={
          <div
            className={classnames(styles.popoverPanel, {
              [styles.dark]: isDark,
            })}
          >
            <div className={styles.panelLabel}>透明度</div>
            <ConfigProvider
              theme={{
                algorithm: isDark
                  ? theme.darkAlgorithm
                  : theme.defaultAlgorithm,
              }}
            >
              <Slider
                min={0.1}
                max={1}
                step={0.05}
                value={currentStyle.opacity}
                onChange={(value) =>
                  updateStyle({
                    opacity: Array.isArray(value) ? value[0] : value,
                  })
                }
              />
            </ConfigProvider>
          </div>
        }
      >
        <Tooltip title={"透明度"} placement={"left"}>
          <div className={styles.item}>
            <Blend size={16} />
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
            marginLeft: 12,
          },
        }}
        content={
          <div
            className={classnames(styles.popoverPanel, {
              [styles.dark]: isDark,
            })}
          >
            <div className={styles.panelLabel}>笔刷参数</div>
            <ConfigProvider
              theme={{
                algorithm: isDark
                  ? theme.darkAlgorithm
                  : theme.defaultAlgorithm,
              }}
            >
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={currentStyle.thinning}
                onChange={(value) =>
                  updateStyle({
                    thinning: Array.isArray(value) ? value[0] : value,
                  })
                }
              />
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={currentStyle.smoothing}
                onChange={(value) =>
                  updateStyle({
                    smoothing: Array.isArray(value) ? value[0] : value,
                  })
                }
              />
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={currentStyle.streamline}
                onChange={(value) =>
                  updateStyle({
                    streamline: Array.isArray(value) ? value[0] : value,
                  })
                }
              />
            </ConfigProvider>
          </div>
        }
      >
        <Tooltip title={"笔刷参数"} placement={"left"}>
          <div className={styles.item}>
            <SlidersHorizontal size={16} />
          </div>
        </Tooltip>
      </Popover>

      <Popover
        arrow={false}
        trigger={"click"}
        placement={"right"}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
            marginLeft: 12,
          },
        }}
        content={
          <div
            className={classnames(styles.popoverPanel, {
              [styles.dark]: isDark,
            })}
          >
            <div className={styles.switchRow}>
              <div className={styles.panelLabel}>压感模拟</div>
              <Switch
                checked={currentStyle.simulatePressure}
                onChange={(checked) =>
                  updateStyle({
                    simulatePressure: checked,
                  })
                }
              />
            </div>
          </div>
        }
      >
        <Tooltip title={"压感"} placement={"left"}>
          <div
            className={styles.item}
            style={
              currentStyle.simulatePressure
                ? {
                    color: isDark ? "#60a5fa" : "#3b82f6",
                    background: isDark
                      ? "rgba(96, 165, 250, 0.2)"
                      : "rgba(59, 130, 246, 0.15)",
                  }
                : undefined
            }
          >
            <Gauge size={16} />
          </div>
        </Tooltip>
      </Popover>
    </div>
  );
});

HandwriteSetter.displayName = "HandwriteSetter";

export default HandwriteSetter;
