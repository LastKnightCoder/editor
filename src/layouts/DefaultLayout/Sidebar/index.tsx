import React, { useEffect, useState } from 'react';
import classnames from "classnames";
import isHotkey from "is-hotkey";
import {
  checkUpdate,
  installUpdate,
} from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'

import { SettingOutlined, SyncOutlined } from '@ant-design/icons';
import { MdOutlineDarkMode, MdOutlineLightMode } from 'react-icons/md';
import IconText from "@/components/IconText";
import useSettingStore from "@/stores/useSettingStore.ts";

import styles from './index.module.less';
import {message} from "antd";


interface ISidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = (props: ISidebarProps) => {
  const { className, style } = props;

  const [isChecking, setIsChecking] = useState(false);

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

  const onCheckUpdate = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const { shouldUpdate, manifest } = await checkUpdate()
      console.log('shouldUpdate', shouldUpdate, manifest);
      if (shouldUpdate) {
        // You could show a dialog asking the user if they want to install the update here.
        console.log(
          `Installing update ${manifest?.version}, ${manifest?.date}, ${manifest?.body}`
        )

        // Install the update. This will also restart the app on Windows!
        await installUpdate()

        // On macOS and Linux you will need to restart the app manually.
        // You could use this step to display another confirmation dialog.
        await relaunch()
      } else {
        message.info('当前已是最新版本');
      }
    } catch (error) {
      message.error('检查更新失败');
      console.error(error)
    } finally {
      setIsChecking(false);
    }
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
          icon={<SyncOutlined className={classnames({
            [styles.checking]: isChecking,
          })} />}
          text={'更新'}
          onClick={onCheckUpdate}
        />
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