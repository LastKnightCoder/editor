import React, { useEffect, useState } from 'react';
import { message, Modal } from "antd";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import classnames from "classnames";
import isHotkey from "is-hotkey";
import { SettingOutlined, SyncOutlined } from '@ant-design/icons';
import { MdOutlineDarkMode, MdOutlineLightMode, MdOutlineBrowserUpdated } from 'react-icons/md';
import { FiSidebar } from "react-icons/fi";

import {
  checkUpdate,
  installUpdate,
} from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'
import { upload, download, getOriginDatabaseInfo } from '@/commands';

import IconText from "@/components/IconText";
import useSettingStore from "@/stores/useSettingStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

import styles from './index.module.less';

interface ISidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = (props: ISidebarProps) => {
  const { className, style } = props;

  const [isChecking, setIsChecking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const {
    sidebarOpen,
  } = useGlobalStateStore(state => ({
    sidebarOpen: state.sidebarOpen,
  }));

  const {
    darkMode,
    onDarkModeChange,
    sync,
  } = useSettingStore(state => ({
    darkMode: state.setting.darkMode,
    onDarkModeChange: state.onDarkModeChange,
    sync: state.setting.sync,
  }));

  const currentVersion = sync.version;
  const { accessKeyId, accessKeySecret, bucket, region } = sync.aliOSS;

  const toggleDarkMode = () => {
    onDarkModeChange(!darkMode);
  }

  const onSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await upload();
      message.success('同步成功');
    } catch (error) {
      message.error('同步失败' + error);
    } finally {
      setIsSyncing(false);
    }
  }

  const openSettingModal = () => {
    useSettingStore.setState({ settingModalOpen: true });
  }

  const onCheckUpdate = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
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

  const checkDownload = useMemoizedFn(async () => {
    if (!accessKeyId || !accessKeySecret || !bucket || !region) return;
    const originDatabaseInfo = await getOriginDatabaseInfo();
    if (!originDatabaseInfo) return;
    const { databaseInfo = {} } = originDatabaseInfo;
    // @ts-ignore
    const originVersion = Number(databaseInfo.version || 0);
    if (currentVersion < originVersion) {
      Modal.confirm({
        title: '同步远程数据库',
        content: '检测到有新的数据库版本，是否下载？',
        onOk: async () => {
          const isSuccess = await download();
          if (!isSuccess) {
            message.error('下载失败');
          } else {
            message.success('下载成功，已为你刷新数据库，原文件已备份至 backup 文件夹！');
          }
        }
      })
    } else {
      message.success('当前已是最新版本');
    }
  });

  useAsyncEffect(async () => {
    await checkDownload()
  }, [checkDownload]);

  useEffect(() => {
    // mod + shift +  d -> check download
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+shift+d', e)) {
        checkDownload().then();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [checkDownload])

  return (
    <div className={classnames(styles.sidebar, className)} style={style}>
      <div>
        <IconText
          icon={<FiSidebar />}
          text={`${sidebarOpen ? '隐藏' : '显示'}侧边栏`}
          onlyShowIcon
          onClick={() => {
            useGlobalStateStore.setState({
              sidebarOpen: !sidebarOpen,
            })
          }}
        />
      </div>
      <div className={styles.settingList}>
        <IconText
          icon={<SyncOutlined className={classnames({
            [styles.syncing]: isSyncing,
          })} />}
          text={'同步'}
          onClick={onSync}
        />
        <IconText
          icon={<MdOutlineBrowserUpdated className={classnames({
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