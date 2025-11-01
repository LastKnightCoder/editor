import React from "react";
import { Row, Typography, Divider } from "antd";
import BilibiliSetting from "./BilibiliSetting";
import YouTubeSetting from "./YouTubeSetting";
import NotionSetting from "./NotionSetting";
import MinimaxSetting from "./MinimaxSetting";

import styles from "./index.module.less";
import ContainerCol from "@/components/ContainerCol";

const { Title, Text } = Typography;

const IntegrationSetting: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title level={4}>应用集成</Title>
        <Text type="secondary">
          管理与第三方应用的集成，配置凭证信息以获得更好的体验
        </Text>
      </div>

      <Divider />

      <div className={styles.integrationList}>
        <Row gutter={[16, 16]}>
          <ContainerCol xs={24} sm={12} md={12} lg={8} xl={6}>
            <BilibiliSetting />
          </ContainerCol>
          <ContainerCol xs={24} sm={12} md={12} lg={8} xl={6}>
            <YouTubeSetting />
          </ContainerCol>
          <ContainerCol xs={24} sm={12} md={12} lg={8} xl={6}>
            <NotionSetting />
          </ContainerCol>
          <ContainerCol xs={24} sm={12} md={12} lg={8} xl={6}>
            <MinimaxSetting />
          </ContainerCol>
        </Row>
      </div>
    </div>
  );
};

export default IntegrationSetting;
