import { getVersion } from '@tauri-apps/api/app';
import { useState } from "react";
import { useAsyncEffect } from "ahooks";

import styles from './index.module.less';
import { Button, App } from "antd";
import { checkUpdate, installUpdate } from "@tauri-apps/api/updater";
import { relaunch } from "@tauri-apps/api/process";

const AppAbout = () => {
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState('0.0');
  const [isChecking, setIsChecking] = useState(false);

  const {
    message,
    modal
  } = App.useApp();

  useAsyncEffect(async () => {
    setLoading(true);
    const version = await getVersion();
    setVersion(version);
    setLoading(false);
  })

  const onCheckUpdate = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const { shouldUpdate, manifest } = await checkUpdate()
      if (shouldUpdate) {
        modal.confirm({
          title: '发现新版本',
          content: `发现新版本 ${manifest?.version}, 是否立即更新？`,
          onOk: async () => {
            // Install the update. This will also restart the app on Windows!
            await installUpdate()

            // On macOS and Linux you will need to restart the app manually.
            // You could use this step to display another confirmation dialog.
            await relaunch()
          },
        })
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

  if (loading) {
    return (
      <div className={styles.loadContainer}>
        <div className={styles.loader}/>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.version}>软件版本：{version}</div>
      <div className={styles.checkUpdate}>
        <div>检查最新版本</div>
        <Button loading={isChecking} onClick={onCheckUpdate} size={'small'}>检查更新</Button>
      </div>
    </div>
  )
}

export default AppAbout;
