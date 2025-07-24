import React, { useState } from "react";
import {
  Button,
  Drawer,
  List,
  Card,
  Typography,
  Space,
  Tag,
  Tooltip,
  Popconfirm,
  message,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { produce } from "immer";
import classnames from "classnames";
import useSettingStore from "@/stores/useSettingStore";
import { ProviderConfig, ModelConfig } from "@/types/llm";
import styles from "./index.module.less";

const { Text, Title } = Typography;

interface ModelSidebarProps {
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onModelSelect: (providerId: string, modelName: string) => void;
  selectedProviderId?: string;
  selectedModelName?: string;
  containerWidth?: number; // 容器宽度，用于响应式判断
}

const ModelSidebar: React.FC<ModelSidebarProps> = ({
  visible,
  onVisibleChange,
  onModelSelect,
  selectedProviderId,
  selectedModelName,
  containerWidth = 1200, // 默认宽度
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(
    null,
  );
  const [editModalVisible, setEditModalVisible] = useState(false);

  const llmConfigs = useSettingStore((state) => state.setting.llmConfigs);

  // 响应式判断：容器宽度小于 1000px 时使用抽屉模式
  const useDrawerMode = containerWidth < 1000;

  // 删除提供商
  const handleDeleteProvider = (providerId: string) => {
    useSettingStore.setState(
      produce((draft) => {
        draft.setting.llmConfigs = draft.setting.llmConfigs.filter(
          (config: ProviderConfig) => config.id !== providerId,
        );
      }),
    );
    message.success("提供商删除成功");
  };

  // 编辑提供商
  const handleEditProvider = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    setEditModalVisible(true);
  };

  // 添加新提供商
  const handleAddProvider = () => {
    setEditingProvider(null);
    setEditModalVisible(true);
  };

  // 渲染模型特性标签
  const renderModelFeatures = (model: ModelConfig) => {
    const features = [];
    if (model.features.multimodal) features.push("多模态");
    if (model.features.thinking) features.push("推理");
    if (model.features.online) features.push("联网");

    return features.map((feature) => (
      <Tag key={feature} color="blue">
        {feature}
      </Tag>
    ));
  };

  // 渲染提供商卡片
  const renderProviderCard = (provider: ProviderConfig) => {
    const isSelected = provider.id === selectedProviderId;

    return (
      <Card
        key={provider.id}
        size="small"
        className={classnames(styles.providerCard, {
          [styles.selected]: isSelected,
          [styles.collapsed]: collapsed,
        })}
        title={
          <div className={styles.providerHeader}>
            <RobotOutlined className={styles.providerIcon} />
            {!collapsed && (
              <>
                <Text strong>{provider.name}</Text>
                <Space size="small">
                  <Tooltip title="编辑">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEditProvider(provider)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确定删除这个提供商吗？"
                    onConfirm={() => handleDeleteProvider(provider.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Tooltip title="删除">
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        danger
                      />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              </>
            )}
          </div>
        }
        bodyStyle={{ padding: collapsed ? 0 : 12 }}
      >
        {!collapsed && (
          <List
            size="small"
            dataSource={provider.models}
            renderItem={(model) => {
              const isModelSelected =
                provider.id === selectedProviderId &&
                model.name === selectedModelName;

              return (
                <List.Item
                  className={classnames(styles.modelItem, {
                    [styles.selected]: isModelSelected,
                  })}
                  onClick={() => onModelSelect(provider.id, model.name)}
                >
                  <div className={styles.modelInfo}>
                    <div className={styles.modelName}>{model.name}</div>
                    <div className={styles.modelDescription}>
                      {model.description}
                    </div>
                    <div className={styles.modelFeatures}>
                      {renderModelFeatures(model)}
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
        )}
      </Card>
    );
  };

  // 侧边栏内容
  const sidebarContent = (
    <div className={styles.sidebarContent}>
      <div className={styles.sidebarHeader}>
        {!collapsed && (
          <>
            <Title level={4} style={{ margin: 0 }}>
              模型配置
            </Title>
            <Space>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleAddProvider}
              >
                添加提供商
              </Button>
              <Button
                type="text"
                size="small"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
              />
            </Space>
          </>
        )}
        {collapsed && (
          <div className={styles.collapsedHeader}>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={handleAddProvider}
              title="添加提供商"
            />
            <Button
              type="text"
              size="small"
              icon={<MenuUnfoldOutlined />}
              onClick={() => setCollapsed(false)}
              title="展开"
            />
          </div>
        )}
      </div>

      <div className={styles.providersList}>
        {llmConfigs.map(renderProviderCard)}
      </div>
    </div>
  );

  // 抽屉模式（窄屏）
  if (useDrawerMode) {
    return (
      <Drawer
        title="模型配置"
        placement="right"
        onClose={() => onVisibleChange(false)}
        open={visible}
        width={400}
        className={styles.drawer}
      >
        {sidebarContent}
      </Drawer>
    );
  }

  // 侧边栏模式（宽屏）
  return (
    <div
      className={classnames(styles.sidebar, {
        [styles.visible]: visible,
        [styles.collapsed]: collapsed,
      })}
    >
      {sidebarContent}
    </div>
  );
};

export default ModelSidebar;
