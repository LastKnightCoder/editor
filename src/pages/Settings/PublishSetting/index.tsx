import { useState, useEffect, useCallback } from "react";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { App } from "antd";
import classNames from "classnames";

import GithubPublishSetting from "./GithubPublishSetting";
import S3PublishSetting from "./S3PublishSetting";
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
  previewPublishPlan,
  checkPublishConnection,
  downloadPublishTemplate,
} from "@/commands";
import {
  IPublishPlan,
  IPublishProgress,
  IPublishResult,
} from "@/types/publish";

// 发布进度卡片组件
const PublishProgressCard = ({
  progress,
  onCancel,
}: {
  progress: IPublishProgress;
  onCancel: () => void;
}) => {
  const themeColors = useThemeColors();
  const percent = Math.round((progress.current / progress.total) * 100);

  const phaseLabels: Record<string, string> = {
    preparing: "准备中",
    uploading: "上传中",
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

// 发布计划卡片组件
const PublishPlanCard = ({ plan }: { plan: IPublishPlan }) => {
  const themeColors = useThemeColors();

  return (
    <div
      className={classNames(
        "rounded-xl p-4",
        themeColors.cardBgClass,
        themeColors.borderClass,
        "border",
      )}
    >
      <h4
        className={classNames(
          "text-sm font-medium mb-3",
          themeColors.textClass,
        )}
      >
        发布计划
      </h4>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-500">
            {plan.toUpload.length}
          </div>
          <div
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            新增/更新
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-500">
            {plan.toDelete.length}
          </div>
          <div
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            删除
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-500">
            {plan.unchanged.length}
          </div>
          <div
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            跳过
          </div>
        </div>
      </div>
    </div>
  );
};

// 发布结果卡片组件
const PublishResultCard = ({ result }: { result: IPublishResult }) => {
  const themeColors = useThemeColors();

  return (
    <div
      className={classNames(
        "rounded-xl p-4 border",
        result.success
          ? "border-green-500/50 bg-green-500/10"
          : "border-yellow-500/50 bg-yellow-500/10",
      )}
    >
      <h4
        className={classNames(
          "text-sm font-medium mb-3",
          themeColors.textClass,
        )}
      >
        {result.success ? "✓ 发布成功" : "⚠ 发布完成（有失败）"}
      </h4>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className={themeColors.secondaryTextClass}>成功上传：</span>
          <span className="text-green-500 font-medium">
            {result.uploaded.length}
          </span>
        </div>
        <div>
          <span className={themeColors.secondaryTextClass}>成功删除：</span>
          <span className="text-blue-500 font-medium">
            {result.deleted.length}
          </span>
        </div>
        <div>
          <span className={themeColors.secondaryTextClass}>跳过：</span>
          <span className="text-gray-500 font-medium">
            {result.skipped.length}
          </span>
        </div>
        {result.failed.length > 0 && (
          <div>
            <span className={themeColors.secondaryTextClass}>失败：</span>
            <span className="text-red-500 font-medium">
              {result.failed.length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const PublishSetting = () => {
  const { message, modal } = App.useApp();
  const { client } = useBackendWebsocketStore();
  const themeColors = useThemeColors();

  const { publish, integration } = useSettingStore((state) => ({
    publish: state.setting.publish,
    integration: state.setting.integration,
  }));

  const [isPublishing, setIsPublishing] = useState(false);
  const [progress, setProgress] = useState<IPublishProgress | null>(null);
  const [publishPlan, setPublishPlan] = useState<IPublishPlan | null>(null);
  const [lastResult, setLastResult] = useState<IPublishResult | null>(null);

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

  const tabItems = [
    { key: EPublishProvider.Github, label: "GitHub Pages" },
    { key: EPublishProvider.S3, label: "S3 静态托管" },
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
      };
    } else {
      return {
        accessKeyId: integration.s3.accessKeyId,
        secretAccessKey: integration.s3.secretAccessKey,
        bucket: publish.s3.bucket,
        region: publish.s3.region,
        endpoint: integration.s3.endpoint,
        pathPrefix: publish.s3.path,
        urlStyle: integration.s3.urlStyle,
      };
    }
  }, [activeKey, publish, integration]);

  const handleCheckConnection = useMemoizedFn(async () => {
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

  const handlePreviewPlan = useMemoizedFn(async () => {
    try {
      const plan = await previewPublishPlan();
      setPublishPlan(plan);
    } catch (error) {
      message.error(`获取发布计划失败: ${error}`);
    }
  });

  const handleCancelPublish = useMemoizedFn(() => {
    setIsPublishing(false);
    setProgress(null);
  });

  const handlePublish = useMemoizedFn(async () => {
    modal.confirm({
      title: "确认发布",
      content: publishPlan ? (
        <div>
          <p>即将发布以下内容：</p>
          <ul className="mt-2 list-inside list-disc text-sm">
            <li>新增/更新：{publishPlan.toUpload.length} 个文件</li>
            <li>删除：{publishPlan.toDelete.length} 个文件</li>
            <li>跳过（未修改）：{publishPlan.unchanged.length} 个文件</li>
          </ul>
        </div>
      ) : (
        "确定要发布吗？"
      ),
      onOk: async () => {
        setIsPublishing(true);
        setProgress(null);
        setLastResult(null);

        try {
          message.loading("正在准备模板...");
          await downloadPublishTemplate();

          const result = await executePublish({
            providerType: activeKey,
            providerConfig: getProviderConfig(),
            siteConfig: publish.site,
          });

          setLastResult(result);

          if (result.success) {
            message.success(
              `发布成功！已上传 ${result.uploaded.length} 个文件`,
            );
          } else {
            message.warning(
              `发布完成，但有 ${result.failed.length} 个文件失败`,
            );
          }
        } catch (error) {
          message.error(`发布失败: ${error}`);
        } finally {
          setIsPublishing(false);
          setProgress(null);
        }
      },
    });
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
              className={classNames("text-xs", themeColors.secondaryTextClass)}
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

      <SettingSection title="发布操作" description="预览发布计划并执行发布">
        <div className="space-y-4">
          {/* 操作按钮 */}
          <div className="flex items-center justify-between">
            <div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.textClass,
                )}
              >
                预览发布计划
              </div>
              <div
                className={classNames(
                  "text-xs",
                  themeColors.secondaryTextClass,
                )}
              >
                查看将要上传、删除和跳过的文件
              </div>
            </div>
            <SettingButton
              variant="secondary"
              onClick={handlePreviewPlan}
              disabled={isPublishing}
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
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              }
            >
              预览
            </SettingButton>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.textClass,
                )}
              >
                开始发布
              </div>
              <div
                className={classNames(
                  "text-xs",
                  themeColors.secondaryTextClass,
                )}
              >
                将选中的内容发布到目标服务
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

          {/* 发布计划展示 */}
          {publishPlan && !isPublishing && (
            <PublishPlanCard plan={publishPlan} />
          )}

          {/* 发布进度展示 */}
          {isPublishing && progress && (
            <PublishProgressCard
              progress={progress}
              onCancel={handleCancelPublish}
            />
          )}

          {/* 发布结果展示 */}
          {lastResult && !isPublishing && (
            <PublishResultCard result={lastResult} />
          )}
        </div>
      </SettingSection>
    </SettingContainer>
  );
};

export default PublishSetting;
