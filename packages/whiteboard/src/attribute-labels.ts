import type { AttributeTranslate } from "./attributes-i18n";

type Key = Parameters<AttributeTranslate>[0];
const colorKeys: Record<string, Key> = {
  blue: "attributes.color.blue",
  green: "attributes.color.green",
  yellow: "attributes.color.yellow",
  orange: "attributes.color.orange",
  red: "attributes.color.red",
  purple: "attributes.color.purple",
  pink: "attributes.color.pink",
  gray: "attributes.color.gray",
  cyan: "attributes.color.cyan",
  indigo: "attributes.color.indigo",
  primary: "attributes.color.blue",
  success: "attributes.color.green",
  warning: "attributes.color.amber",
  error: "attributes.color.red",
  lime: "attributes.color.lime",
  neutral: "attributes.color.neutral",
};
export function attributeColor(id: string, original: string, t: AttributeTranslate): string {
  return Object.hasOwn(colorKeys, id) ? t(colorKeys[id]) : original;
}
const optionKeys: Record<string, Record<string, Key>> = {
  mode: { sketch: "attributes.sketch.mode.sketch", normal: "attributes.sketch.mode.normal" },
  level: {
    neat: "attributes.sketch.level.neat",
    natural: "attributes.sketch.level.natural",
    loose: "attributes.sketch.level.loose",
  },
  fill: {
    solid: "attributes.sketch.fill.solid",
    hatch: "attributes.sketch.fill.hatch",
    cross: "attributes.sketch.fill.cross",
    scribble: "attributes.sketch.fill.scribble",
  },
  shadow: {
    none: "attributes.none",
    small: "attributes.small",
    medium: "attributes.medium",
    large: "attributes.large",
  },
  mindStyle: { solid: "attributes.solid", soft: "attributes.soft", outline: "attributes.outline" },
  mindPalette: {
    ink: "attributes.mind.palette.ink",
    classic: "attributes.mind.palette.classic",
    mist: "attributes.mind.palette.mist",
    ocean: "attributes.mind.palette.ocean",
    autumn: "attributes.mind.palette.autumn",
    forest: "attributes.mind.palette.forest",
    berry: "attributes.mind.palette.berry",
    neon: "attributes.mind.palette.neon",
  },
};
export function attributeOption(
  group: keyof typeof optionKeys,
  id: string,
  original: string,
  t: AttributeTranslate
): string {
  const options = optionKeys[group];
  const key = options && Object.hasOwn(options, id) ? options[id] : undefined;
  return key ? t(key) : original;
}
