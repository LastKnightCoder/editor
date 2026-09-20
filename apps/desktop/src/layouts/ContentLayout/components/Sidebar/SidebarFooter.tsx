import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import useSettingStore from "@/stores/useSettingStore.ts";
import SidebarItem from "./SidebarItem";
import { useMemoizedFn } from "ahooks";

// 导入图标
import setting from "@/assets/icons/setting.svg";
import sun from "@/assets/icons/sun.svg";
import moon from "@/assets/icons/moon.svg";
import SearchBox from "./SearchBox";

interface SidebarFooterProps {
  isShortWidth: boolean;
  itemClassName?: string;
  showTooltip?: boolean;
  disableDefaultHover?: boolean;
}

// 使用单独的ThemeToggle组件
const ThemeToggle = memo(
  ({
    darkMode,
    onToggle,
    isShortWidth,
    className,
    showTooltip = true,
    disableDefaultHover = false,
  }: {
    darkMode: boolean;
    onToggle: () => void;
    isShortWidth: boolean;
    className?: string;
    showTooltip?: boolean;
    disableDefaultHover?: boolean;
  }) => (
    <SidebarItem
      onClick={onToggle}
      label={darkMode ? "浅色" : "深色"}
      icon={darkMode ? sun : moon}
      active={false}
      isShortWidth={isShortWidth}
      className={className}
      showTooltip={showTooltip}
      disableDefaultHover={disableDefaultHover}
    />
  )
);

// 使用单独的SettingsButton组件
const SettingsButton = memo(
  ({
    onClick,
    isShortWidth,
    className,
    showTooltip = true,
    disableDefaultHover = false,
  }: {
    onClick: () => void;
    isShortWidth: boolean;
    className?: string;
    showTooltip?: boolean;
    disableDefaultHover?: boolean;
  }) => (
    <SidebarItem
      onClick={onClick}
      label={"设置"}
      icon={setting}
      active={false}
      isShortWidth={isShortWidth}
      className={className}
      showTooltip={showTooltip}
      disableDefaultHover={disableDefaultHover}
    />
  )
);

const SidebarFooter = memo((props: SidebarFooterProps) => {
  const { isShortWidth, itemClassName, showTooltip = true, disableDefaultHover = false } = props;

  const { darkMode, onDarkModeChange } = useSettingStore(
    useShallow(state => ({
      darkMode: state.setting.darkMode,
      onDarkModeChange: state.onDarkModeChange,
    }))
  );

  const navigateToSettings = useMemoizedFn(() => {
    useSettingStore.setState({
      settingModalOpen: true,
    });
  });

  const darkModeChange = useMemoizedFn(() => {
    onDarkModeChange(!darkMode);
  });

  return (
    <div className="flex flex-row items-center gap-2">
      <SearchBox
        className={itemClassName}
        showTooltip={showTooltip}
        disableDefaultHover={disableDefaultHover}
      />
      <ThemeToggle
        darkMode={darkMode}
        onToggle={darkModeChange}
        isShortWidth={isShortWidth}
        className={itemClassName}
        showTooltip={showTooltip}
        disableDefaultHover={disableDefaultHover}
      />
      <SettingsButton
        onClick={navigateToSettings}
        isShortWidth={isShortWidth}
        className={itemClassName}
        showTooltip={showTooltip}
        disableDefaultHover={disableDefaultHover}
      />
    </div>
  );
});

export default SidebarFooter;
