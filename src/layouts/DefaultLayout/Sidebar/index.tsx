import React, {useEffect, useState} from 'react';
import classnames from "classnames";

import { message } from 'antd';
import { SettingOutlined, SyncOutlined } from '@ant-design/icons';
import { MdOutlineDarkMode, MdOutlineLightMode } from 'react-icons/md';
import IconText from "@/components/IconText";
import useSettingStore from "@/stores/useSettingStore.ts";

import styles from './index.module.less';
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'


interface ISidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = (props: ISidebarProps) => {
  const { className, style } = props;

  const [checking, setChecking] = useState(false);

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

  const check = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const { shouldUpdate, manifest } = await checkUpdate()

      if (shouldUpdate) {
        console.log(
          `Installing update ${manifest?.version}, ${manifest?.date}, ${manifest?.body}`
        )

        await installUpdate()
        await relaunch()
      } else {
        message.info('已是最新版本')
      }
    } catch (error) {
      // @ts-ignore
      message.error(error);
      console.error(error)
    } finally {
      setChecking(false)
    }
  }

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
          icon={<SyncOutlined className={checking ? styles.checking : ''} />}
          text={'更新'}
          onClick={check}
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