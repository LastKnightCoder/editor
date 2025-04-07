import { useState, memo } from "react";
import { useAsyncEffect } from "ahooks";
import { getVersions } from "@/commands";

import styles from "./index.module.less";
import { LoadingOutlined } from "@ant-design/icons";
import SelectDatabase from "@/components/SelectDatabase";
import { Flex } from "antd";
const AppAbout = memo(() => {
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState("0.0");

  useAsyncEffect(async () => {
    setLoading(true);
    const versions = await getVersions();
    setVersion(versions.app);
    setLoading(false);
  });

  return (
    <div className={styles.container}>
      <Flex vertical gap={12}>
        <h2>软件信息</h2>
        <div className={styles.version}>
          {loading ? <LoadingOutlined spin /> : <div>软件版本：{version}</div>}
        </div>
        <h2>选择数据库</h2>
        <SelectDatabase />
      </Flex>
    </div>
  );
});

export default AppAbout;
