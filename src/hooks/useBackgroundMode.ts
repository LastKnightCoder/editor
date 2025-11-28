import useSettingStore from "@/stores/useSettingStore";

/**
 * Hook to get the current background mode
 * @returns {Object} Background mode information
 * @property {string} backgroundType - Current background type ("solid" | "gradient1" | ...)
 * @property {boolean} isGradient - Whether current mode is gradient (not solid)
 * @property {boolean} isSolid - Whether current mode is solid
 */
const useBackgroundMode = () => {
  const backgroundType = useSettingStore(
    (state) => state.setting.appearance?.backgroundType || "solid",
  );

  const isSolid = backgroundType === "solid";
  const isGradient = !isSolid;

  return {
    backgroundType,
    isSolid,
    isGradient,
  };
};

export default useBackgroundMode;
