import { useState, useEffect, useCallback } from "react";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { App } from "antd";
import classNames from "classnames";

import GithubPublishSetting from "./GithubPublishSetting";
import S3PublishSetting from "./S3PublishSetting";
import LocalPublishSetting from "./LocalPublishSetting";
import PublishSelector from "./PublishSelector";

import useSettingStore, { EPublishProvider } from "@/stores/useSettingStore";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import {
  SettingContainer,
  SettingSection,
  SettingTabs,
  SettingInput,
  SettingButton,
} from "../components";
import useThemeColors from "@/hooks/useThemeColors";
import {
  executePublish,
  checkPublishConnection,
  downloadPublishTemplate,
  selectFile,
} from "@/commands";
import { IPublishProgress } from "@/types/publish";
import { exportPublishOutput } from "@/commands/publish";

// 发布进度卡片组件
const PublishProgressCard = ({
  progress,
  onCancel,
}: {
  progress: IPublishProgress;
  onCancel: () => void;
}) => {
  const themeColors = useThemeColors();
  const total = progress.total > 0 ? progress.total : 1;
  const percent = Math.round((progress.current / total) * 100);

  const phaseLabels: Record<string, string> = {
    preparing: "准备中",
    uploading: "生成文件",
    pushing: "推送中",
    deleting: "删除旧文件",
    finishing: "完成中",
  };

  return (
    <div
      className={classNames(
        "rounded-xl p-4",
        themeColors.cardBgClass,
        themeColors.borderClass,
        "border",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span
            className={classNames("text-sm font-medium", themeColors.textClass)}
          >
            {phaseLabels[progress.phase] || progress.phase}
          </span>
        </div>
        <span className={classNames("text-sm", themeColors.secondaryTextClass)}>
          {progress.current}/{progress.total}
        </span>
      </div>

      {/* 进度条 */}
      <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-2">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      {progress.currentFile && (
        <p
          className={classNames(
            "text-xs truncate mb-3",
            themeColors.secondaryTextClass,
          )}
        >
          {progress.currentFile}
        </p>
      )}

      <SettingButton variant="secondary" onClick={onCancel}>
        取消发布
      </SettingButton>
    </div>
  );
};

const PublishSetting = () => {
  const { message } = App.useApp();
  const { client } = useBackendWebsocketStore();
  const themeColors = useThemeColors();

  const { publish, integration } = useSettingStore((state) => ({
    publish: state.setting.publish,
    integration: state.setting.integration,
  }));

  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState<IPublishProgress | null>(null);

  // 使用 WebSocket 监听发布进度
  useEffect(() => {
    if (!client) return;

    const handleProgress = (data: unknown) => {
      setProgress(data as IPublishProgress);
    };

    client.registerNotificationHandler("publish-progress", handleProgress);

    return () => {
      client.unregisterNotificationHandler("publish-progress", handleProgress);
    };
  }, [client]);

  const activeKey = publish.active;
  const isLocalProvider = activeKey === EPublishProvider.Local;

  const tabItems = [
    { key: EPublishProvider.Github, label: "GitHub Pages" },
    { key: EPublishProvider.S3, label: "S3 静态托管" },
    { key: EPublishProvider.Local, label: "本地导出" },
  ];

  const onTabChange = (key: string) => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.publish.active = key as EPublishProvider;
      }),
    );
  };

  const onSiteConfigChange = useMemoizedFn(
    (field: "title" | "description", value: string) => {
      useSettingStore.setState(
        produce((state) => {
          state.setting.publish.site[field] = value;
        }),
      );
    },
  );

  const renderProviderSetting = () => {
    switch (activeKey) {
      case EPublishProvider.Github:
        return <GithubPublishSetting />;
      case EPublishProvider.S3:
        return <S3PublishSetting />;
      case EPublishProvider.Local:
        return <LocalPublishSetting />;
      default:
        return <GithubPublishSetting />;
    }
  };

  const getProviderConfig = useCallback(() => {
    if (activeKey === EPublishProvider.Github) {
      return {
        token: integration.github.token,
        repo: publish.github.repo,
        branch: publish.github.branch,
        committerName: integration.github.user.name,
        committerEmail: integration.github.user.email,
        basePath: publish.github.basePath,
        useGitCli: publish.github.useGitCli,
        gitWorkingDir: publish.github.gitWorkingDir,
      };
    }
    if (activeKey === EPublishProvider.S3) {
      return {
        accessKeyId: integration.s3.accessKeyId,
        secretAccessKey: integration.s3.secretAccessKey,
        bucket: publish.s3.bucket,
        region: publish.s3.region,
        endpoint: integration.s3.endpoint,
        pathPrefix: publish.s3.path,
        urlStyle: integration.s3.urlStyle,
        basePath: publish.s3.basePath,
      };
    }
    return {
      basePath: publish.local.basePath,
    };
  }, [activeKey, publish, integration]);

  const handleCheckConnection = useMemoizedFn(async () => {
    if (isLocalProvider) {
      message.info("本地导出无需连接测试");
      return;
    }
    try {
      const connected = await checkPublishConnection({
        providerType: activeKey,
        providerConfig: getProviderConfig(),
      });

      if (connected) {
        message.success("连接成功");
      } else {
        message.error("连接失败，请检查配置");
      }
    } catch (error) {
      message.error(`连接测试失败: ${error}`);
    }
  });

  const handleLocalPublish = useMemoizedFn(async () => {
    try {
      const paths = await selectFile({
        properties: ["openDirectory", "createDirectory"],
      });
      if (!paths || paths.length === 0) {
        return;
      }
      const targetDir = paths[0];

      setIsPublishing(true);
      setProgress(null);

      const hide = message.loading("正在导出静态文件...", 0);
      try {
        await downloadPublishTemplate();
        await exportPublishOutput({
          targetDir,
          providerType: EPublishProvider.Local,
          providerConfig: { basePath: publish.local.basePath },
          siteConfig: publish.site,
        });
        message.success(`已导出到 ${targetDir}`);
      } catch (error) {
        message.error(`导出失败: ${error}`);
      } finally {
        hide();
        setIsPublishing(false);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "User canceled file selection"
      ) {
        return;
      }
      message.error(`选择目录失败: ${error}`);
    }
  });

  const handleCancelPublish = useMemoizedFn(() => {
    setIsPublishing(false);
    setProgress(null);
  });

  const handlePublish = useMemoizedFn(async () => {
    if (activeKey === EPublishProvider.Local) {
      await handleLocalPublish();
      return;
    }

    setIsPublishing(true);
    setProgress(null);

    try {
      message.loading("正在准备模板...");
      await downloadPublishTemplate();

      const result = await executePublish({
        providerType: activeKey,
        providerConfig: getProviderConfig(),
        siteConfig: publish.site,
      });

      if (result.success) {
        message.success("发布成功！");
      } else {
        message.warning(`发布完成，但有 ${result.failed.length} 个文件失败`);
      }
    } catch (error) {
      message.error(`发布失败: ${error}`);
    } finally {
      setIsPublishing(false);
      setProgress(null);
    }
  });

  return (
    <SettingContainer>
      <SettingSection title="发布目标" description="选择发布服务并配置相关参数">
        <SettingTabs
          activeKey={activeKey}
          onChange={onTabChange}
          items={tabItems}
        />
        <div className="mt-6">{renderProviderSetting()}</div>

        {!isLocalProvider && (
          <div className="mt-6 flex items-center justify-between">
            <div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.textClass,
                )}
              >
                测试连接
              </div>
              <div
                className={classNames(
                  "text-xs",
                  themeColors.secondaryTextClass,
                )}
              >
                验证配置是否正确
              </div>
            </div>
            <SettingButton
              variant="secondary"
              onClick={handleCheckConnection}
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              }
            >
              测试
            </SettingButton>
          </div>
        )}
      </SettingSection>

      <SettingSection title="站点配置" description="设置发布站点的基本信息">
        <div className="space-y-4">
          <SettingInput
            label="站点标题"
            value={publish.site.title}
            onChange={(e) => onSiteConfigChange("title", e.target.value)}
            placeholder="我的博客"
          />
          <SettingInput
            label="站点描述"
            value={publish.site.description}
            onChange={(e) => onSiteConfigChange("description", e.target.value)}
            placeholder="记录学习与思考"
          />
        </div>
      </SettingSection>

      <SettingSection
        title="发布内容"
        description="选择要发布的卡片、文章、项目和知识库"
      >
        <PublishSelector />
      </SettingSection>

      <SettingSection
        title="发布操作"
        description="根据当前发布目标生成站点静态文件"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.textClass,
                )}
              >
                {isLocalProvider ? "导出静态站点" : "开始发布"}
              </div>
              <div
                className={classNames(
                  "text-xs",
                  themeColors.secondaryTextClass,
                )}
              >
                {isLocalProvider
                  ? "生成静态文件至本地文件夹，便于自行部署"
                  : "将选中的内容发布到目标服务"}
              </div>
            </div>
            <SettingButton
              variant="primary"
              onClick={handlePublish}
              loading={isPublishing}
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
              发布
            </SettingButton>
          </div>

          {isPublishing && progress && (
            <PublishProgressCard
              progress={progress}
              onCancel={handleCancelPublish}
            />
          )}
        </div>
      </SettingSection>
    </SettingContainer>
  );
};

export default PublishSetting;
