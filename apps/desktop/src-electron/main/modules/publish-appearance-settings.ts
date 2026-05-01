import type {
  ImageBorderRadiusPreset,
  ImageShadowPreset,
} from "@tau/editor/src/types";
import type { IPublishInitData } from "@/types/publish";

type PublishImageAppearanceSettings = NonNullable<
  NonNullable<IPublishInitData["settings"]>["appearance"]
>["image"];

export interface PublishAppearanceSettingsInput {
  appearance?: {
    image?: {
      borderRadius?: ImageBorderRadiusPreset;
      shadow?: ImageShadowPreset | boolean;
    };
  };
}

const DEFAULT_PUBLISH_IMAGE_APPEARANCE: PublishImageAppearanceSettings = {
  borderRadius: "md",
  shadow: "none",
};

export function buildPublishAppearanceSettings(
  settings?: PublishAppearanceSettingsInput,
): IPublishInitData["settings"] {
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

export function attachPublishAppearanceSettings(
  initData: IPublishInitData,
  settings?: PublishAppearanceSettingsInput,
): IPublishInitData {
  return {
    ...initData,
    settings: buildPublishAppearanceSettings(settings),
  };
}
