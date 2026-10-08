import { RichTextElement } from "../../../plugins";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import { FoldHorizontal, FoldVertical } from "lucide-react";

import { RichTextUtil } from "../../../utils";
import {
  LEGACY_TEXT_STYLE_KEYS,
  TEXT_COLORS,
  TEXT_TONES,
  TextStyle,
  TextTone,
  TextVariant,
  getTextBoxPadding,
  resolveTextStyle,
} from "../../../constants";

import {
  AttrAction,
  AttrPopover,
  Field,
  SwatchRow,
  type SwatchLook,
  type SwatchOption,
} from "../../../chrome";
import { useSketch, useBoard } from "../../../hooks";
import { handTextClass } from "../../../utils/sketch";
import SketchPopover from "../SketchPopover";

interface RichTextSetterProps {
  element: RichTextElement;
  onChange: (element: RichTextElement) => void;
}

const keyOf = (style: TextStyle) => `${style.variant}|${style.tone ?? ""}`;
const parseKey = (key: string): TextStyle => {
  const [variant, tone] = key.split("|");
  return tone
    ? { variant: variant as TextVariant, tone: tone as TextTone }
    : { variant: variant as TextVariant };
};

/** 样式在色块上的缩略：色带 = 上 30% 标签色 + 下方白卡；柔色 = soft 底 */
function lookOf(style: TextStyle): SwatchLook {
  const tone = TEXT_TONES.find(t => t.value === style.tone);
  if (style.variant === "none") return { fill: "", kind: "none" };
  if (style.variant === "band" && tone)
    return {
      fill: `linear-gradient(${tone.solid} 0 30%, ${TEXT_COLORS.surface} 30%)`,
      stroke: "var(--tau-line-1)",
    };
  if (style.variant === "tinted" && tone)
    return { fill: tone.soft, stroke: `color-mix(in srgb, ${tone.solid} 45%, transparent)` };
  return { fill: TEXT_COLORS.surface, stroke: "var(--tau-line-1)" };
}

const option = (style: TextStyle, label: string): SwatchOption => ({
  key: keyOf(style),
  label,
  ...lookOf(style),
});

const STYLE_GROUPS = [
  {
    label: "基础",
    options: [option({ variant: "none" }, "透明"), option({ variant: "plain" }, "白卡")],
  },
  {
    label: "色带",
    options: TEXT_TONES.map(t => option({ variant: "band", tone: t.value }, `${t.label}色带`)),
  },
  {
    label: "柔色",
    options: TEXT_TONES.map(t => option({ variant: "tinted", tone: t.value }, `柔${t.label}`)),
  },
];

const RichTextSetter = (props: RichTextSetterProps) => {
  const board = useBoard();
  const { element, onChange } = props;
  const current = resolveTextStyle(element);
  const textClassName = handTextClass(useSketch(element));

  const handleStyleChange = useMemoizedFn((key: string) => {
    const next = parseKey(key);
    const newElement = produce(element, draft => {
      draft.variant = next.variant;
      if (next.tone) draft.tone = next.tone;
      else delete draft.tone;
      // 旧版外观字段一并清掉，之后只认 variant/tone
      for (const legacyKey of LEGACY_TEXT_STYLE_KEYS) {
        delete (draft as Record<string, unknown>)[legacyKey];
      }
    });
    if (element.type === "richtext") RichTextUtil.save(next);
    onChange(newElement);
  });

  const handleFitHeight = useMemoizedFn(async () => {
    // 离屏按当前宽度测量内容高度：在屏编辑器受 maxHeight 与 overflow 约束，长高时量不出真实高度
    const contentHeight = Math.ceil(
      await board.measurer.measureRichTextHeight(
        element.id,
        element.content,
        element.width,
        getTextBoxPadding(current),
        element.contentId,
        textClassName
      )
    );
    const newElement = produce(element, draft => {
      draft.height = contentHeight;
      // resized 时编辑器按 maxHeight 定高，需与新高度一致
      draft.maxHeight = contentHeight;
    });
    onChange(newElement);
  });

  const handleFitWidth = useMemoizedFn(async () => {
    const padding = getTextBoxPadding(current);
    // 离屏测量文字真实自然宽度，避免在屏测量被父容器/旧 maxWidth 封顶
    const naturalWidth = await board.measurer.measureRichTextWidth(
      element.id,
      element.content,
      padding,
      element.contentId,
      textClassName
    );
    // 测量端已 Math.ceil，仅 +2 防亚像素/fit-content 收缩抖动，不设 300 下限以真正收缩
    const targetWidth = naturalWidth + 2;
    // 非编辑态编辑器尺寸变化不回写元素，宽度变了高度需在这里一并重算
    const contentHeight = Math.ceil(
      await board.measurer.measureRichTextHeight(
        element.id,
        element.content,
        targetWidth,
        padding,
        element.contentId,
        textClassName
      )
    );

    const newElement = produce(element, draft => {
      // width 与 maxWidth 取相同值，使聚焦/非聚焦 foreignObject 宽度一致，
      // 消除非聚焦时 fit-content 被父容器恰好封顶在文字自然宽度而导致的换行
      draft.width = targetWidth;
      draft.height = contentHeight;
      draft.maxHeight = Math.max(draft.maxHeight, contentHeight);
      draft.maxWidth = targetWidth;
      // 回到自适应模式：编辑器用 fit-content + auto 高度自然展开，高度随宽度变化跟随
      draft.resized = false;
    });
    onChange(newElement);
  });

  return (
    <>
      <AttrPopover label="样式" swatch={lookOf(current)} width={220}>
        {STYLE_GROUPS.map(g => (
          <Field key={g.label} label={g.label}>
            <SwatchRow options={g.options} value={keyOf(current)} onChange={handleStyleChange} />
          </Field>
        ))}
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
      <SketchPopover target={element} onChange={onChange} />
    </>
  );
};

export default RichTextSetter;
