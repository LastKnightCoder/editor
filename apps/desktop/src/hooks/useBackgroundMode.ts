import useSettingStore from "@/stores/useSettingStore";

/**
 * Hook to get the current background mode
 * @returns {Object} Background mode information
 * @property {string} backgroundType - Current background type ("solid" | "gradient1" | ...)
 * @property {boolean} isGradient - Whether current mode is gradient (not solid)
 * @property {boolean} isSolid - Whether current mode is solid
 * @property {boolean} isAnimationEnabled - Whether background animation is enabled
 */
const useBackgroundMode = () => {
  const backgroundType = useSettingStore(
    (state) => state.setting.appearance?.backgroundType || "solid",
  );

  const isAnimationEnabled = useSettingStore(
    (state) => state.setting.appearance?.backgroundAnimation ?? false,
  );

  const isSolid = backgroundType === "solid";
  const isGradient = !isSolid;

  return {
    backgroundType,
    isSolid,
    isGradient,
    isAnimationEnabled,
  };
};

export default useBackgroundMode;
