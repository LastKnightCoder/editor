import { RichTextElement } from "@/components/WhiteBoard/plugins";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import { FoldHorizontal, FoldVertical } from "lucide-react";

import { CardUtil, RichTextUtil } from "@/components/WhiteBoard/utils";
import {
  LEGACY_TEXT_STYLE_KEYS,
  TEXT_COLORS,
  TEXT_TONES,
  TextStyle,
  TextTone,
  TextVariant,
  getTextBoxPadding,
  resolveTextStyle,
} from "@/components/WhiteBoard/constants";
import { DOMSizeMeasurer } from "@/components/WhiteBoard/services/DOMSizeMeasurer";
import {
  AttrAction,
  AttrPopover,
  Field,
  SwatchRow,
  type SwatchLook,
  type SwatchOption,
} from "@/components/WhiteBoard/chrome";

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
  const { element, onChange } = props;
  const current = resolveTextStyle(element);

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
    // @ts-ignore
    if (element.type === "card") CardUtil.save(next);
    else if (element.type === "richtext") RichTextUtil.save(next);
    onChange(newElement);
  });

  const handleFitHeight = useMemoizedFn(async () => {
    // 离屏按当前宽度测量内容高度：在屏编辑器受 maxHeight 与 overflow 约束，长高时量不出真实高度
    const contentHeight = Math.ceil(
      await DOMSizeMeasurer.measureRichTextHeight(
        element.id,
        element.content,
        element.width,
        getTextBoxPadding(current)
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
    // 离屏测量文字真实自然宽度，避免在屏测量被父容器/旧 maxWidth 封顶
    const naturalWidth = await DOMSizeMeasurer.measureRichTextWidth(
      element.id,
      element.content,
      getTextBoxPadding(current),
      element.contentId
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
    </>
  );
};

export default RichTextSetter;
