import { useState } from "react";
import { useMemoizedFn, useAsyncEffect } from "ahooks";
import { produce } from "immer";
import { App } from "antd";
import classNames from "classnames";

import AliOssSetting from "./AliOssSetting";
import S3Setting from "./S3Setting";
import WebDavSetting from "./WebDavSetting";
import GithubSetting from "./GithubSetting";

import useSettingStore, { ESync } from "@/stores/useSettingStore";
import { download, getOriginDatabaseInfo, upload } from "@/commands";
import {
  SettingContainer,
  SettingSection,
  SettingTabs,
  SettingButton,
} from "../components";
import useThemeColors from "@/hooks/useThemeColors";

const SyncSetting = () => {
  const { modal, message } = App.useApp();
  const [isSyncing, setIsSyncing] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState(0);
  const themeColors = useThemeColors();

  const { activeKey, sync, activeDatabaseName, activeDatabases, integration } =
    useSettingStore((state) => ({
      sync: state.setting.sync,
      activeKey: state.setting.sync.active,
      activeDatabaseName: state.setting.database.active,
      activeDatabases: state.setting.database.databases,
      integration: state.setting.integration,
    }));

  const activeDatabase = activeDatabases.find(
    (item) => item.name === activeDatabaseName,
  );
  const currentVersion = activeDatabase?.version || 0;

  const isConfigured = useMemoizedFn(() => {
    switch (activeKey) {
      case ESync.AliOSS:
        return (
          !!integration.aliOSS.accessKeyId &&
          !!integration.aliOSS.accessKeySecret &&
          !!sync.aliOSS.bucket &&
          !!sync.aliOSS.region
        );
      case ESync.S3:
        return (
          !!integration.s3.accessKeyId &&
          !!integration.s3.secretAccessKey &&
          !!sync.s3.bucket &&
          !!sync.s3.region
        );
      case ESync.WebDav:
        return (
          !!integration.webdav.url &&
          !!integration.webdav.username &&
          !!integration.webdav.password
        );
      case ESync.Github:
        return (
          !!integration.github.token &&
          !!sync.github.repo &&
          !!sync.github.branch
        );
      default:
        return false;
    }
  });

  useAsyncEffect(async () => {
    if (!isConfigured()) return;
    const originDatabaseInfo = await getOriginDatabaseInfo();
    if (!originDatabaseInfo) return;
    const { databaseInfo = {} } = originDatabaseInfo;
    // @ts-ignore
    const originVersion = Number(databaseInfo.version) || 0;
    setRemoteVersion(originVersion);
  }, [activeKey, sync, integration]);

  const onSync = useMemoizedFn(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await upload();
      if (res) {
        setRemoteVersion(currentVersion + 1);
        message.success("同步成功");
      }
    } catch (error) {
      message.error("同步失败" + error);
    } finally {
      setIsSyncing(false);
    }
  });

  const checkDownload = useMemoizedFn(async () => {
    if (!isConfigured()) {
      message.warning("请先完成同步配置");
      return;
    }
    const originDatabaseInfo = await getOriginDatabaseInfo();
    if (!originDatabaseInfo) return;
    const { databaseInfo = {} } = originDatabaseInfo;
    // @ts-ignore
    const originVersion = Number(databaseInfo.version || 0);
    setRemoteVersion(originVersion);
    if (currentVersion < originVersion) {
      modal.confirm({
        title: "同步远程数据库",
        content: "检测到有新的数据库版本，是否下载？",
        onOk: async () => {
          const isSuccess = await download();
          if (!isSuccess) {
            message.error("下载失败");
          } else {
            message.success(
              "下载成功，已为你刷新数据库，原文件已备份至 backup 文件夹！",
            );
          }
        },
      });
    } else {
      message.success("当前已是最新版本");
    }
  });

  const tabItems = [
    { key: ESync.AliOSS, label: "阿里云 OSS" },
    { key: ESync.S3, label: "S3" },
    { key: ESync.WebDav, label: "WebDAV" },
    { key: ESync.Github, label: "Github" },
  ];

  const renderContent = () => {
    switch (activeKey) {
      case ESync.AliOSS:
        return <AliOssSetting />;
      case ESync.S3:
        return <S3Setting />;
      case ESync.WebDav:
        return <WebDavSetting />;
      case ESync.Github:
        return <GithubSetting />;
      default:
        return <AliOssSetting />;
    }
  };

  return (
    <SettingContainer>
      <SettingSection
        title="数据检查"
        description="查看本地和远程数据库版本，同步或检查数据状态"
      >
        {/* 版本信息 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div
            className={classNames(
              "p-4 rounded-xl border",
              themeColors.cardBgClass,
              themeColors.cardBorderClass,
            )}
          >
            <div
              className={classNames(
                "text-xs mb-1",
                themeColors.secondaryTextClass,
              )}
            >
              本地版本
            </div>
            <div
              className={classNames(
                "text-2xl font-bold",
                themeColors.activeTextClass,
              )}
            >
              {currentVersion}
            </div>
          </div>
          <div
            className={classNames(
              "p-4 rounded-xl border",
              themeColors.cardBgClass,
              themeColors.cardBorderClass,
            )}
          >
            <div
              className={classNames(
                "text-xs mb-1",
                themeColors.secondaryTextClass,
              )}
            >
              远程版本
            </div>
            <div
              className={classNames(
                "text-2xl font-bold",
                themeColors.activeTextClass,
              )}
            >
              {remoteVersion}
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="space-y-3">
          <div
            className={classNames(
              "flex items-center justify-between p-4 rounded-xl border",
              themeColors.cardBgClass,
              themeColors.cardBorderClass,
            )}
          >
            <div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.activeTextClass,
                )}
              >
                同步数据至云端
              </div>
              <div
                className={classNames(
                  "text-xs",
                  themeColors.secondaryTextClass,
                )}
              >
                将本地数据库上传到云存储
              </div>
            </div>
            <SettingButton
              variant="primary"
              loading={isSyncing}
              onClick={onSync}
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              }
            >
              同步
            </SettingButton>
          </div>

          <div
            className={classNames(
              "flex items-center justify-between p-4 rounded-xl border",
              themeColors.cardBgClass,
              themeColors.cardBorderClass,
            )}
          >
            <div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.activeTextClass,
                )}
              >
                检查数据同步状态
              </div>
              <div
                className={classNames(
                  "text-xs",
                  themeColors.secondaryTextClass,
                )}
              >
                检查远程是否有新版本可下载
              </div>
            </div>
            <SettingButton
              variant="secondary"
              onClick={checkDownload}
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              }
            >
              检查
            </SettingButton>
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title="数据同步设置"
        description="配置云存储服务，支持阿里云 OSS、S3、WebDAV 和 Github"
      >
        <SettingTabs
          activeKey={activeKey}
          onChange={(key) => {
            useSettingStore.setState(
              produce((draft) => {
                draft.setting.sync.active = key as ESync;
              }),
            );
          }}
          items={tabItems}
        />

        <div className="mt-6">{renderContent()}</div>
      </SettingSection>
    </SettingContainer>
  );
};

export default SyncSetting;
