import React, { useEffect } from 'react';
import classnames from "classnames";
import isHotkey from "is-hotkey";

import { SettingOutlined } from '@ant-design/icons';
import { MdOutlineDarkMode, MdOutlineLightMode } from 'react-icons/md';
import IconText from "@/components/IconText";
import useSettingStore from "@/stores/useSettingStore.ts";

import styles from './index.module.less';

interface ISidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = (props: ISidebarProps) => {
  const { className, style } = props;


  const {
    darkMode,
    onDarkModeChange,
  } = useSettingStore(state => ({
    darkMode: state.setting.darkMode,
    onDarkModeChange: state.onDarkModeChange,
  }));

  const toggleDarkMode = () => {
    onDarkModeChange(!darkMode);
  }

  const openSettingModal = () => {
    useSettingStore.setState({ settingModalOpen: true });
  }

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  useEffect(() => {
    // 按下 mod + l 时切换浅色，mod + d 时切换深色
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+l', e)) {
        onDarkModeChange(false);
      } else if (isHotkey('mod+d', e)) {
        onDarkModeChange(true);
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [onDarkModeChange]);

  return (
    <div className={classnames(styles.sidebar, className)} style={style}>
      <div>

      </div>
      <div className={styles.settingList}>
        <IconText
          icon={darkMode ? <MdOutlineLightMode /> : <MdOutlineDarkMode />}
          text={darkMode ? '浅色' : '深色'}
          onClick={toggleDarkMode}
        />
        <IconText
          icon={<SettingOutlined />}
          text={'设置'}
          onClick={openSettingModal} />
      </div>
    </div>
  )
}

export default Sidebar;