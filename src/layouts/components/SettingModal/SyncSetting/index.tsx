import { useState } from "react";
import { useMemoizedFn, useAsyncEffect } from "ahooks";
import { produce } from "immer";
import { Button, message, Modal, Tabs, TabsProps } from "antd";

import AliOssSetting from "./AliOssSetting";

import useSettingStore, { ESync } from "@/stores/useSettingStore.ts";

import { download, getOriginDatabaseInfo, upload } from "@/commands";

import styles from './index.module.less';

const SyncSetting = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState(0);

  const {
    activeKey,
    sync,
    activeDatabaseName,
    activeDatabases,
  } = useSettingStore(state => ({
    sync: state.setting.sync,
    activeKey: state.setting.sync.active,
    activeDatabaseName: state.setting.database.active,
    activeDatabases: state.setting.database.databases,
  }));

  const activeDatabase = activeDatabases.find(item => item.name === activeDatabaseName);
  const currentVersion = activeDatabase?.version || 0;

  const { accessKeyId, accessKeySecret, bucket, region } = sync.aliOSS;

  useAsyncEffect(async () => {
    if (!accessKeyId || !accessKeySecret || !bucket || !region) return;
    const originDatabaseInfo = await getOriginDatabaseInfo();
    if (!originDatabaseInfo) return;
    const { databaseInfo = {} } = originDatabaseInfo;
    // @ts-ignore
    const originVersion = Number(databaseInfo.version) || 0;
    setRemoteVersion(originVersion);
  }, [accessKeyId, accessKeySecret, bucket, region])

  const onSync = useMemoizedFn(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await upload();
      if (res) {
        setRemoteVersion(currentVersion + 1);
        message.success('同步成功');
      }
    } catch (error) {
      message.error('同步失败' + error);
    } finally {
      setIsSyncing(false);
    }
  })

  const checkDownload = useMemoizedFn(async () => {
    if (!accessKeyId || !accessKeySecret || !bucket || !region) return;
    const originDatabaseInfo = await getOriginDatabaseInfo();
    if (!originDatabaseInfo) return;
    const { databaseInfo = {} } = originDatabaseInfo;
    // @ts-ignore
    const originVersion = Number(databaseInfo.version || 0);
    setRemoteVersion(originVersion);
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


  const items: TabsProps['items'] = [{
    key: ESync.AliOSS,
    label: '阿里云 OSS',
    children: <AliOssSetting />,
  }]

  return (
    <div className={styles.syncSetting}>
      <h2>数据检查</h2>
      <div className={styles.version}>
        <div>本地版本：{currentVersion}</div>
        <div>远程版本：{remoteVersion}</div>
      </div>
      <div className={styles.upload}>
        <div>同步数据至云端</div>
        <Button size={'small'} loading={isSyncing} onClick={onSync}>同步</Button>
      </div>
      <div className={styles.download}>
        <div>检查数据同步状态</div>
        <Button size={'small'} onClick={checkDownload}>检查</Button>
      </div>
      <h2>数据同步设置</h2>
      <Tabs
        className={styles.settings}
        activeKey={activeKey}
        onChange={(key) => {
          useSettingStore.setState(produce((draft) => {
            draft.setting.imageBed.active = key;
          }))
        }}
        items={items}
      />
    </div>
  )
}

export default SyncSetting;
