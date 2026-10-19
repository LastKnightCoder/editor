import {
  type ImageBorderRadiusPreset,
  type ImageShadowPreset,
} from "@tau/editor/extensions/media/types";
import type { PublishSettings } from "@tau/plugins/publish-data";

type PublishImageAppearanceSettings = NonNullable<PublishSettings["appearance"]>["image"];

export interface PublishAppearanceSettingsInput {
  appearance?: {
    image?: {
      borderRadius?: ImageBorderRadiusPreset;
      shadow?: ImageShadowPreset;
    };
  };
}

const DEFAULT_PUBLISH_IMAGE_APPEARANCE: PublishImageAppearanceSettings = {
  borderRadius: "md",
  shadow: "none",
};

export function buildPublishAppearanceSettings(
  settings?: PublishAppearanceSettingsInput
): PublishSettings {
  const imageSettings = settings?.appearance?.image;
  const defaultBorderRadius = DEFAULT_PUBLISH_IMAGE_APPEARANCE?.borderRadius;
  const defaultShadow = DEFAULT_PUBLISH_IMAGE_APPEARANCE?.shadow;

  return {
    appearance: {
      image: {
        borderRadius: imageSettings?.borderRadius ?? defaultBorderRadius,
        shadow: imageSettings?.shadow ?? defaultShadow,
      },
    },
  };
}
