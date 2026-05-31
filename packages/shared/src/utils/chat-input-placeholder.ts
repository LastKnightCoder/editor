const DEFAULT_PLATFORM_MODIFIER = "Ctrl";
const MAC_PLATFORM_MODIFIER = "Command";

export const DEFAULT_CHAT_INPUT_PLACEHOLDER =
  "输入消息，Ctrl/Command + Enter 进行发送";

const resolvePlatform = (platform?: string) => {
  if (typeof platform === "string") {
    return platform;
  }

  if (typeof navigator !== "undefined") {
    return navigator.platform;
  }

  return "";
};

export const resolveChatInputModifierLabel = (platform?: string) => {
  const currentPlatform = resolvePlatform(platform);
  return /mac/i.test(currentPlatform)
    ? MAC_PLATFORM_MODIFIER
    : DEFAULT_PLATFORM_MODIFIER;
};

export const resolveChatInputPlaceholder = (
  placeholder: string = DEFAULT_CHAT_INPUT_PLACEHOLDER,
  platform?: string,
) => {
  const modifierLabel = resolveChatInputModifierLabel(platform);

  return placeholder
    .split("Ctrl/Command")
    .join(modifierLabel)
    .split("Command/Ctrl")
    .join(modifierLabel);
};
