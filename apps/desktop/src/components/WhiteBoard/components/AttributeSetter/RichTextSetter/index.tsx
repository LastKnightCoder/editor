import { RichTextElement } from "@/components/WhiteBoard/plugins";
import { MdOutlineColorLens } from "react-icons/md";
import { CgArrowsShrinkH, CgArrowsShrinkV } from "react-icons/cg";
import { MdOutlinePadding } from "react-icons/md";
import { TbShadow } from "react-icons/tb";
import { produce } from "immer";

import styles from "./index.module.less";
import { Popover, Tooltip, Slider, ConfigProvider, theme } from "antd";
import { useMemoizedFn } from "ahooks";
import { useState } from "react";
import { CardUtil, RichTextUtil } from "@/components/WhiteBoard/utils";
import {
  EShadowSize,
  SHADOW_SIZE_OPTIONS,
  getShadowStyle,
} from "@/components/WhiteBoard/constants";
import { DOMSizeMeasurer } from "@/components/WhiteBoard/services/DOMSizeMeasurer";
import useTheme from "@/hooks/useTheme";
import classnames from "classnames";
interface RichTextSetterProps {
  element: RichTextElement;
  onChange: (element: RichTextElement) => void;
}

interface ColorConfig {
  background: string;
  topColor: string;
  color: string;
  theme?: "light" | "dark";
}

const noBackgroundColors: ColorConfig[] = [
  {
    background: "transparent",
    topColor: "transparent",
    color: "currentColor",
  },
];

const pureColors: ColorConfig[] = [
  {
    background: "#fff",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#000",
    topColor: "transparent",
    color: "#fff",
    theme: "dark",
  },
  // 红橙黄绿蓝靛紫
  {
    background: "#FF6A63",
    topColor: "transparent",
    color: "#fff",
    theme: "light",
  },
  {
    background: "#FFA02C",
    topColor: "transparent",
    color: "#fff",
    theme: "light",
  },
  {
    background: "#F4D63B",
    topColor: "transparent",
    color: "#fff",
    theme: "light",
  },
  {
    background: "#24B079",
    topColor: "transparent",
    color: "#fff",
    theme: "light",
  },
  {
    background: "#865CC2",
    topColor: "transparent",
    color: "#fff",
    theme: "light",
  },
  {
    background: "#3F71FB",
    topColor: "transparent",
    color: "#fff",
    theme: "light",
  },
];

const gradientColors: ColorConfig[] = [
  {
    background: "linear-gradient(314.36deg, #3E4347 7.01%, #848C9C 124.82%)",
    topColor: "transparent",
    color: "#fff",
    theme: "dark",
  },
  {
    background: "linear-gradient(311.65deg, #FFE0FC 6.89%, #FFF3F6 101.09%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "linear-gradient(310.93deg, #F3FFD0 6.86%, #FDFBE3 100%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "linear-gradient(312deg, #D9F9F3 6.91%, #EDFEF8 99.85%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background:
      "linear-gradient(310.93deg, #D6EBFF 6.86%, #E7FBF9 100%, #E4FFFF 100%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "linear-gradient(313.06deg, #EDDEFF 1.85%, #DDEAFF 101.12%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "linear-gradient(311.46deg, #CCCAE9 6.89%, #E2E9E8 100.79%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
];

const topColors: ColorConfig[] = [
  {
    background: "#fff",
    topColor: "#F7CE66",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#fff",
    topColor: "#F24A6E",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#fff",
    topColor: "#20CEAE",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#fff",
    topColor: "#9770F6",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#fff",
    topColor: "#5B5D70",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
];

const RichTextSetter = (props: RichTextSetterProps) => {
  const { element, onChange } = props;

  const [selectColorOpen, setSelectColorOpen] = useState(false);
  const [selectPaddingOpen, setSelectPaddingOpen] = useState(false);
  const [selectShadowOpen, setSelectShadowOpen] = useState(false);
  const { isDark } = useTheme();

  const handleOnSelectColor = useMemoizedFn((color: ColorConfig) => {
    const newElement = produce(element, (draft) => {
      draft.background = color.background;
      draft.topColor = color.topColor;
      draft.color = color.color;
      draft.theme = color.theme;
    });
    // @ts-ignore
    if (element.type === "card") {
      CardUtil.setLocalStorage("background", color.background);
      CardUtil.setLocalStorage("topColor", color.topColor);
      CardUtil.setLocalStorage("color", color.color);
      CardUtil.setLocalStorage("theme", color.theme);
    } else if (element.type === "richtext") {
      RichTextUtil.setLocalStorage("background", color.background);
      RichTextUtil.setLocalStorage("topColor", color.topColor);
      RichTextUtil.setLocalStorage("color", color.color);
      RichTextUtil.setLocalStorage("theme", color.theme);
    }
    onChange(newElement);
  });

  const handlePaddingWidthChange = useMemoizedFn((value: number) => {
    const newElement = produce(element, (draft) => {
      draft.paddingWidth = value;
    });
    onChange(newElement);
  });

  const handlePaddingHeightChange = useMemoizedFn((value: number) => {
    const newElement = produce(element, (draft) => {
      draft.paddingHeight = value;
    });
    onChange(newElement);
  });

  const handleShadowSizeChange = useMemoizedFn((size: EShadowSize) => {
    const newElement = produce(element, (draft) => {
      draft.shadowSize = size;
    });
    // @ts-ignore
    if (element.type === "card") {
      CardUtil.setLocalStorage("shadowSize", size);
    } else if (element.type === "richtext") {
      RichTextUtil.setLocalStorage("shadowSize", size);
    }
    onChange(newElement);
    setSelectShadowOpen(false);
  });

  const handleFitHeight = useMemoizedFn(() => {
    const richTextContainer = document.getElementById(
      `rich-text-container-${element.id}`,
    );
    if (!richTextContainer) return;
    const editor = richTextContainer.querySelector(
      ":scope > [data-slate-editor]",
    ) as HTMLDivElement;
    if (!editor) return;

    editor.style.height = "auto";

    // 获取滚动高度
    const scrollHeight = editor.scrollHeight;
    const newElement = produce(element, (draft) => {
      draft.height = Math.ceil(scrollHeight);
      draft.maxHeight = Math.max(Math.ceil(scrollHeight), 3000);
      // 如果宽度大于300，则不进行调整
      draft.resized =
        Math.round(element.width) !== richTextContainer.scrollWidth;
    });
    onChange(newElement);
  });

  const handleFitWidth = useMemoizedFn(async () => {
    // 离屏测量文字真实自然宽度，避免在屏测量被父容器/旧 maxWidth 封顶
    const naturalWidth = await DOMSizeMeasurer.measureRichTextWidth(
      element.id,
      element.content,
      element.paddingWidth || 16,
      element.paddingHeight || 16,
    );

    const newElement = produce(element, (draft) => {
      // 测量端已 Math.ceil，仅 +2 防亚像素/fit-content 收缩抖动，不设 300 下限以真正收缩；
      // width 与 maxWidth 取相同值，使聚焦/非聚焦 foreignObject 宽度一致，
      // 消除非聚焦时 fit-content 被父容器恰好封顶在文字自然宽度而导致的换行
      const targetWidth = naturalWidth + 2;
      draft.width = targetWidth;
      draft.maxWidth = targetWidth;
      // 回到自适应模式：编辑器用 fit-content + auto 高度自然展开，高度随宽度变化跟随
      draft.resized = false;
    });
    onChange(newElement);
  });

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
        open={selectColorOpen}
        onOpenChange={setSelectColorOpen}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
            marginLeft: 12,
          },
        }}
        trigger={"click"}
        content={
          <div
            className={classnames(styles.colorPickerPopover, {
              [styles.dark]: isDark,
            })}
          >
            <div className={styles.colorSection}>
              <div className={styles.sectionTitle}>透明背景</div>
              <div className={styles.colorGrid}>
                {noBackgroundColors.map((color) => (
                  <div
                    key={`${color.background}-${color.topColor}-${color.color}`}
                    className={styles.colorItem}
                    style={{ background: color.background }}
                    onClick={() => handleOnSelectColor(color)}
                  >
                    <div
                      className={styles.colorItemTopBar}
                      style={{ background: color.topColor }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.colorSection}>
              <div className={styles.sectionTitle}>纯色背景</div>
              <div className={styles.colorGrid}>
                {pureColors.map((color) => (
                  <div
                    key={`${color.background}-${color.topColor}-${color.color}`}
                    className={styles.colorItem}
                    style={{ background: color.background }}
                    onClick={() => handleOnSelectColor(color)}
                  >
                    <div
                      className={styles.colorItemTopBar}
                      style={{ background: color.topColor }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.colorSection}>
              <div className={styles.sectionTitle}>渐变背景</div>
              <div className={styles.colorGrid}>
                {gradientColors.map((color) => (
                  <div
                    key={`${color.background}-${color.topColor}-${color.color}`}
                    className={styles.colorItem}
                    style={{ background: color.background }}
                    onClick={() => handleOnSelectColor(color)}
                  >
                    <div
                      className={styles.colorItemTopBar}
                      style={{ background: color.topColor }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.colorSection}>
              <div className={styles.sectionTitle}>顶部背景</div>
              <div className={styles.colorGrid}>
                {topColors.map((color) => (
                  <div
                    key={`${color.background}-${color.topColor}-${color.color}`}
                    className={styles.colorItem}
                    style={{ background: color.background }}
                    onClick={() => handleOnSelectColor(color)}
                  >
                    <div
                      className={styles.colorItemTopBar}
                      style={{ background: color.topColor }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
        placement={"right"}
        arrow={false}
      >
        <Tooltip title={"背景颜色"} trigger={"hover"} placement={"left"}>
          <div className={styles.item}>
            <MdOutlineColorLens />
          </div>
        </Tooltip>
      </Popover>
      <Popover
        open={selectPaddingOpen}
        onOpenChange={setSelectPaddingOpen}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
            marginLeft: 12,
          },
        }}
        trigger={"click"}
        content={
          <div
            className={classnames(styles.paddingPopover, {
              [styles.dark]: isDark,
            })}
          >
            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabel}>水平内边距</div>
              <ConfigProvider
                theme={{
                  algorithm: isDark
                    ? theme.darkAlgorithm
                    : theme.defaultAlgorithm,
                }}
              >
                <Slider
                  min={0}
                  max={40}
                  step={1}
                  value={element.paddingWidth || 16}
                  onChange={handlePaddingWidthChange}
                  tooltip={{ formatter: (value) => `${value}px` }}
                />
              </ConfigProvider>
            </div>
            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabel}>垂直内边距</div>
              <ConfigProvider
                theme={{
                  algorithm: isDark
                    ? theme.darkAlgorithm
                    : theme.defaultAlgorithm,
                }}
              >
                <Slider
                  min={0}
                  max={40}
                  step={1}
                  value={element.paddingHeight || 16}
                  onChange={handlePaddingHeightChange}
                  tooltip={{ formatter: (value) => `${value}px` }}
                />
              </ConfigProvider>
            </div>
          </div>
        }
        placement={"right"}
        arrow={false}
      >
        <Tooltip title={"内边距"} placement={"left"}>
          <div className={styles.item}>
            <MdOutlinePadding />
          </div>
        </Tooltip>
      </Popover>
      <Popover
        open={selectShadowOpen}
        onOpenChange={setSelectShadowOpen}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
            marginLeft: 12,
          },
        }}
        trigger={"click"}
        content={
          <div
            className={classnames(styles.shadowPopover, {
              [styles.dark]: isDark,
            })}
          >
            {SHADOW_SIZE_OPTIONS.map((option) => (
              <div
                key={option.value}
                className={classnames(styles.shadowOptionItem, {
                  [styles.active]:
                    (element.shadowSize ?? EShadowSize.None) === option.value,
                })}
                onClick={() => handleShadowSizeChange(option.value)}
              >
                <div
                  className={styles.shadowPreview}
                  style={{ boxShadow: getShadowStyle(option.value, false) }}
                />
                <span>{option.label}</span>
              </div>
            ))}
          </div>
        }
        placement={"right"}
        arrow={false}
      >
        <Tooltip title={"阴影大小"} placement={"left"}>
          <div className={styles.item}>
            <TbShadow />
          </div>
        </Tooltip>
      </Popover>
      <Tooltip title={"适应高度"} placement={"left"}>
        <div className={styles.item} onClick={handleFitHeight}>
          <CgArrowsShrinkV />
        </div>
      </Tooltip>
      <Tooltip title={"适应宽度"} placement={"left"}>
        <div className={styles.item} onClick={handleFitWidth}>
          <CgArrowsShrinkH />
        </div>
      </Tooltip>
    </div>
  );
};

export default RichTextSetter;
