import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNavigate } from "react-router-dom";
import useSettingStore from "@/stores/useSettingStore.ts";
import SidebarItem from "./SidebarItem";
import { useMemoizedFn } from "ahooks";
import styles from "./index.module.less";

// 导入图标
import setting from "@/assets/icons/setting.svg";
import sun from "@/assets/icons/sun.svg";
import moon from "@/assets/icons/moon.svg";

interface SidebarFooterProps {
  isShortWidth: boolean;
}

// 使用单独的ThemeToggle组件
const ThemeToggle = memo(
  ({
    darkMode,
    onToggle,
    isShortWidth,
  }: {
    darkMode: boolean;
    onToggle: () => void;
    isShortWidth: boolean;
  }) => (
    <SidebarItem
      onClick={onToggle}
      label={darkMode ? "浅色" : "深色"}
      icon={darkMode ? sun : moon}
      active={false}
      isShortWidth={isShortWidth}
    />
  ),
);

// 使用单独的SettingsButton组件
const SettingsButton = memo(
  ({
    onClick,
    isShortWidth,
  }: {
    onClick: () => void;
    isShortWidth: boolean;
  }) => (
    <SidebarItem
      onClick={onClick}
      label={"设置"}
      icon={setting}
      active={false}
      isShortWidth={isShortWidth}
    />
  ),
);

const SidebarFooter = memo((props: SidebarFooterProps) => {
  const { isShortWidth } = props;
  const navigate = useNavigate();

  const { darkMode, onDarkModeChange } = useSettingStore(
    useShallow((state) => ({
      darkMode: state.setting.darkMode,
      onDarkModeChange: state.onDarkModeChange,
    })),
  );

  const navigateToSettings = useMemoizedFn(() => {
    navigate("/settings");
  });

  const darkModeChange = useMemoizedFn(() => {
    onDarkModeChange(!darkMode);
  });

  return (
    <div className={styles.setting}>
      <ThemeToggle
        darkMode={darkMode}
        onToggle={darkModeChange}
        isShortWidth={isShortWidth}
      />
      <SettingsButton
        onClick={navigateToSettings}
        isShortWidth={isShortWidth}
      />
    </div>
  );
});

export default SidebarFooter;
