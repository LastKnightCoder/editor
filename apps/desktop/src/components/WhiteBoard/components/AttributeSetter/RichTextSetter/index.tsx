import { RichTextElement } from "@/components/WhiteBoard/plugins";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import { FoldHorizontal, FoldVertical } from "lucide-react";

import { CardUtil, RichTextUtil } from "@/components/WhiteBoard/utils";
import {
  EShadowSize,
  SHADOW_SIZE_OPTIONS,
  getShadowStyle,
} from "@/components/WhiteBoard/constants";
import { DOMSizeMeasurer } from "@/components/WhiteBoard/services/DOMSizeMeasurer";
import useTheme from "@/hooks/useTheme";
import {
  AttrAction,
  AttrPopover,
  Field,
  OptionGrid,
  Slider,
  SwatchRow,
  type SwatchOption,
} from "@/components/WhiteBoard/chrome";
import { PaddingIcon, ShadowIcon } from "@/components/WhiteBoard/chrome/icons";

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
    background: "linear-gradient(310.93deg, #D6EBFF 6.86%, #E7FBF9 100%, #E4FFFF 100%)",
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

const keyOf = (c: { background?: string; topColor?: string }) =>
  `${c.background ?? "transparent"}|${c.topColor ?? "transparent"}`;
/** 顶部色条的样例：上 38% 为色条 */
const swatchFill = (c: Pick<ColorConfig, "background" | "topColor">) =>
  c.topColor && c.topColor !== "transparent"
    ? `linear-gradient(${c.topColor} 0 38%, ${c.background} 38%)`
    : c.background;
const toSwatches = (colors: ColorConfig[], names: string[]): SwatchOption[] =>
  colors.map((c, i) => ({
    key: keyOf(c),
    label: names[i] ?? "",
    fill: swatchFill(c),
    stroke: "var(--tau-line-1)",
    kind: c.background === "transparent" ? "none" : undefined,
  }));
const ALL_COLORS = [...noBackgroundColors, ...pureColors, ...gradientColors, ...topColors];
/** 数据色：四组保留现状全部色值，外壳用主题语言 */
const COLOR_GROUPS = [
  { label: "透明", options: toSwatches(noBackgroundColors, ["透明"]) },
  {
    label: "纯色",
    options: toSwatches(pureColors, ["白", "黑", "红", "橙", "黄", "绿", "紫", "蓝"]),
  },
  {
    label: "渐变",
    options: toSwatches(gradientColors, ["石墨", "樱粉", "柠黄", "薄荷", "天青", "雾紫", "灰紫"]),
  },
  { label: "顶部色条", options: toSwatches(topColors, ["金", "玫红", "青绿", "紫", "墨"]) },
];

const RichTextSetter = (props: RichTextSetterProps) => {
  const { element, onChange } = props;
  const { isDark } = useTheme();

  const handleOnSelectColor = useMemoizedFn((color: ColorConfig) => {
    const newElement = produce(element, draft => {
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
    const newElement = produce(element, draft => {
      draft.paddingWidth = value;
    });
    onChange(newElement);
  });

  const handlePaddingHeightChange = useMemoizedFn((value: number) => {
    const newElement = produce(element, draft => {
      draft.paddingHeight = value;
    });
    onChange(newElement);
  });

  const handleShadowSizeChange = useMemoizedFn((size: EShadowSize) => {
    const newElement = produce(element, draft => {
      draft.shadowSize = size;
    });
    // @ts-ignore
    if (element.type === "card") {
      CardUtil.setLocalStorage("shadowSize", size);
    } else if (element.type === "richtext") {
      RichTextUtil.setLocalStorage("shadowSize", size);
    }
    onChange(newElement);
  });

  const handleFitHeight = useMemoizedFn(() => {
    const richTextContainer = document.getElementById(`rich-text-container-${element.id}`);
    if (!richTextContainer) return;
    const editor = richTextContainer.querySelector(
      ":scope > [data-slate-editor]"
    ) as HTMLDivElement;
    if (!editor) return;

    editor.style.height = "auto";

    // 获取滚动高度
    const scrollHeight = editor.scrollHeight;
    const newElement = produce(element, draft => {
      draft.height = Math.ceil(scrollHeight);
      draft.maxHeight = Math.max(Math.ceil(scrollHeight), 3000);
      // 如果宽度大于300，则不进行调整
      draft.resized = Math.round(element.width) !== richTextContainer.scrollWidth;
    });
    onChange(newElement);
  });

  const handleFitWidth = useMemoizedFn(async () => {
    // 离屏测量文字真实自然宽度，避免在屏测量被父容器/旧 maxWidth 封顶
    const naturalWidth = await DOMSizeMeasurer.measureRichTextWidth(
      element.id,
      element.content,
      element.paddingWidth || 16,
      element.paddingHeight || 16
    );

    const newElement = produce(element, draft => {
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

  const value = keyOf(element);
  const bgSwatch =
    !element.background || element.background === "transparent"
      ? ({ fill: "", kind: "none" } as const)
      : {
          fill: swatchFill({
            background: element.background,
            topColor: element.topColor ?? "transparent",
          }),
          stroke: "var(--tau-line-1)",
        };

  return (
    <>
      <AttrPopover label="背景" swatch={bgSwatch}>
        {COLOR_GROUPS.map(g => (
          <Field key={g.label} label={g.label}>
            <SwatchRow options={g.options} value={value} onChange={pick} />
          </Field>
        ))}
      </AttrPopover>
      <AttrPopover label="内边距" icon={<PaddingIcon />} width={248}>
        <Field label="水平">
          <Slider
            label="水平内边距"
            min={0}
            max={40}
            unit="px"
            value={element.paddingWidth || 16}
            onChange={handlePaddingWidthChange}
          />
        </Field>
        <Field label="垂直">
          <Slider
            label="垂直内边距"
            min={0}
            max={40}
            unit="px"
            value={element.paddingHeight || 16}
            onChange={handlePaddingHeightChange}
          />
        </Field>
      </AttrPopover>
      <AttrPopover label="阴影" icon={<ShadowIcon />} width={220}>
        <OptionGrid
          options={SHADOW_SIZE_OPTIONS.map(o => ({
            value: o.value,
            label: o.label,
            showLabel: true,
            glyph: (
              <span
                aria-hidden
                className="bg-surface ring-line-1 block size-[18px] flex-none rounded-[4px] ring-1"
                style={{ boxShadow: getShadowStyle(o.value, isDark) }}
              />
            ),
          }))}
          value={element.shadowSize ?? EShadowSize.None}
          onChange={handleShadowSizeChange}
        />
      </AttrPopover>
      <AttrAction
        label="适应高度"
        icon={<FoldVertical strokeWidth={1.75} />}
        onClick={handleFitHeight}
      />
      <AttrAction
        label="适应宽度"
        icon={<FoldHorizontal strokeWidth={1.75} />}
        onClick={handleFitWidth}
      />
    </>
  );

  function pick(key: string) {
    const c = ALL_COLORS.find(o => keyOf(o) === key);
    if (c) handleOnSelectColor(c);
  }
};

export default RichTextSetter;
