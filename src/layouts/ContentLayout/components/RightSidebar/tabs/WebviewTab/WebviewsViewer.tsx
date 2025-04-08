import React, { useContext, useRef, useState, useMemo } from "react";
import { Empty, Input, Button, Modal, Form, message } from "antd";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import { PlusOutlined, GlobalOutlined } from "@ant-design/icons";

import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { RightSidebarContext } from "../../RightSidebarContext";
import Webview, { WebviewRef } from "@/components/Webview";
import { nodeFetch } from "@/commands";
import TabsIndicator from "@/components/TabsIndicator";

import styles from "./index.module.less";

const WebviewsViewer: React.FC = () => {
  const { isConnected } = useContext(RightSidebarContext);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const webviewRef = useRef<WebviewRef>(null);

  const { activeKey, tabs } = useRightSidebarStore(
    useShallow((state) => ({
      activeKey: state.activeTabKey.webview,
      tabs: state.tabs.webview || [],
    })),
  );

  const tabItems = useMemo(() => {
    return tabs.map((tab) => ({
      key: tab.id,
      label: (
        <div className={styles.tabTitle}>
          <GlobalOutlined className={styles.tabIcon} />
          <span className={styles.tabText}>{tab.title}</span>
        </div>
      ),
    }));
  }, [tabs]);

  const handleAddWebview = useMemoizedFn(() => {
    console.log("handleAddWebview called, setting modal visible");
    setIsModalVisible(true);
  });

  const handleModalCancel = useMemoizedFn(() => {
    setIsModalVisible(false);
    form.resetFields();
  });

  const handleRemoveTab = useMemoizedFn((id: string) => {
    useRightSidebarStore.getState().removeTab({
      id,
      type: "webview",
      title: "",
    });
  });

  const handleTabChange = useMemoizedFn((key: string) => {
    const tab = tabs.find((tab) => tab.id === key);
    if (tab) {
      useRightSidebarStore.getState().setActiveTabKey(tab);
    }
  });

  const handleModalSubmit = useMemoizedFn(async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      try {
        // 获取网页标题
        const url = values.url;
        let title = url;

        try {
          // 使用 node-fetch 获取网页元信息
          const response = await nodeFetch(url, {
            method: "GET",
            timeout: 5000,
          });

          // 从 HTML 中提取标题
          if (typeof response === "string") {
            const titleMatch = response.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
              title = titleMatch[1].trim();
            }
          }
        } catch (error) {
          console.error("获取网页标题失败:", error);
        }

        // 添加新的 webview 标签页
        useRightSidebarStore.getState().addTab({
          id: url,
          type: "webview",
          title: title || url,
        });

        setIsModalVisible(false);
        form.resetFields();
      } catch (error) {
        message.error("添加网页失败，请检查网址是否正确");
      }
    } catch (error) {
      // 表单验证失败
    } finally {
      setLoading(false);
    }
  });

  // 创建直接的回调函数避免闭包问题
  const onTabsAddClick = () => {
    console.log("onTabsAddClick called");
    setIsModalVisible(true);
  };

  // 渲染内容部分
  let content;
  if (!isConnected) {
    content = (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未连接数据库" />
    );
  } else if (!tabs || tabs.length === 0) {
    content = (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无网页"
        className={styles.emptyContainer}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddWebview}
        >
          添加网页
        </Button>
      </Empty>
    );
  } else {
    content = (
      <div className={styles.tabsContainer}>
        <TabsIndicator
          tabs={tabItems}
          activeTab={activeKey || ""}
          onChange={handleTabChange}
          closable={true}
          onClose={handleRemoveTab}
          showAddButton={true}
          onAdd={onTabsAddClick}
        />
        <div className={styles.tabContent}>
          {activeKey && tabs.length > 0 && (
            <div className={styles.webviewContainer}>
              {/* <iframe 
                src={activeKey} 
                className={styles.webview}></iframe> */}
              <Webview
                ref={webviewRef}
                src={activeKey}
                className={styles.webview}
                allowPopups={false}
                onError={(err) => console.error("加载失败:", err)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {content}
      <Modal
        title="添加网页"
        open={isModalVisible}
        onCancel={handleModalCancel}
        destroyOnClose={true}
        footer={[
          <Button key="cancel" onClick={handleModalCancel}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={loading}
            onClick={handleModalSubmit}
          >
            确定
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="url"
            label="网址"
            rules={[
              { required: true, message: "请输入网址" },
              {
                type: "url",
                message: "请输入有效的网址",
                warningOnly: true,
              },
            ]}
          >
            <Input
              placeholder="请输入网址，例如 https://www.example.com"
              prefix={<GlobalOutlined />}
              autoFocus
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WebviewsViewer;
