// 图片渲染外观（v2 模板）：圆角 / 阴影两组单选，点选即时写入并落盘。
// 作为 BottomSheet 内容使用（与主题选择一致的即时生效交互）。
// 设置写入 setting.json 的 appearance.image，编辑器经设置桥读取生效，
// 单图/图库元素级外观仍优先于该全局默认。

import { Image as ImageIcon } from "lucide-react";
import {
  IMAGE_BORDER_RADIUS_OPTIONS,
  IMAGE_SHADOW_OPTIONS,
  getImageBorderRadiusValue,
  getImageShadowValue,
  normalizeImageShadowPreset,
} from "@tau/editor/extensions/media/appearance";
import {
  type ImageBorderRadiusPreset,
  type ImageShadowPreset,
} from "@tau/editor/extensions/media/types";
import { useAppContext } from "../../../app/AppContext";
import { CheckBubble } from "../../../components/CheckBubble";
import { GroupRow } from "./ui";

// 选项预览：以图片 icon 卡片直接呈现圆角/阴影档位，preset → CSS 值与编辑器渲染同源
function PresetPreview(props: {
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset;
}) {
  return (
    <span
      className="bg-tag-1 text-ink-inverse grid h-[34px] w-[34px] shrink-0 place-items-center"
      style={{
        borderRadius: getImageBorderRadiusValue(props.borderRadius),
        boxShadow: getImageShadowValue(props.shadow),
      }}
    >
      <ImageIcon size={17} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

function PresetGroup(props: {
  title: string;
  options: Array<{ value: string; label: string }>;
  active: string;
  onSelect: (value: string) => void;
  renderPreview: (value: string) => React.ReactNode;
}) {
  return (
    <div>
      <p className="text-ink-2 mb-2 px-1 text-[13px] font-semibold">{props.title}</p>
      <div className="setting-group">
        {props.options.map(option => (
          <GroupRow key={option.value} onClick={() => props.onSelect(option.value)}>
            {props.renderPreview(option.value)}
            <span className="text-ink-1 flex-1 text-[14.5px] font-medium">{option.label}</span>
            {props.active === option.value && <CheckBubble />}
          </GroupRow>
        ))}
      </div>
    </div>
  );
}

export function ImageAppearanceSection() {
  const app = useAppContext();
  const image = app.syncSettings.safeSetting?.appearance?.image;
  const activeRadius = image?.borderRadius ?? "none";
  // 桌面端旧版 shadow 为布尔（true 视作中阴影），与编辑器内核同源归一
  const activeShadow = normalizeImageShadowPreset(image?.shadow);

  const updateImageAppearance = (patch: {
    borderRadius?: ImageBorderRadiusPreset;
    shadow?: ImageShadowPreset;
  }) => {
    app.syncSettings.updateSetting(
      prev => ({
        ...prev,
        appearance: {
          ...prev.appearance,
          image: { ...prev.appearance?.image, ...patch },
        },
      }),
      { persist: true }
    );
  };

  return (
    <div className="space-y-4">
      <PresetGroup
        title="圆角"
        options={IMAGE_BORDER_RADIUS_OPTIONS}
        active={activeRadius}
        onSelect={value =>
          updateImageAppearance({ borderRadius: value as ImageBorderRadiusPreset })
        }
        renderPreview={value => <PresetPreview borderRadius={value as ImageBorderRadiusPreset} />}
      />
      <PresetGroup
        title="阴影"
        options={IMAGE_SHADOW_OPTIONS}
        active={activeShadow}
        onSelect={value => updateImageAppearance({ shadow: value as ImageShadowPreset })}
        renderPreview={value => <PresetPreview shadow={value as ImageShadowPreset} />}
      />
    </div>
  );
}
