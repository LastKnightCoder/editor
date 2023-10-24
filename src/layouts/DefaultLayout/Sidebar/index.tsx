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
    message.info('敬请期待');
    return;

    if (checking) return;
    setChecking(true);
    try {
      // const res = await fetch('https://tauri-editor.oss-cn-hangzhou.aliyuncs.com/latest.json');
      // const json = await res.json();
      // const latestVersion = json.version;
      // if (appVersion === latestVersion) {
      //   message('有新版本');
      //   const currentPlatform = await platform();
      //   if (currentPlatform === 'darwin') {
      //     const url = json.platforms['darwin-x86_64'].url;
      //     message('有新版本: ' + url);
      //   } else if (currentPlatform === 'linux') {
      //     const url = json.platforms['linux-x86_64'].url;
      //     message('有新版本: ' + url);
      //   } else if (currentPlatform === 'win32') {
      //     const url = json.platforms['windows-x86_64'].url;
      //     message('有新版本: ' + url);
      //   }
      // } else {
      //   message('已是最新版本');
      // }
      const { shouldUpdate, manifest } = await checkUpdate()

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