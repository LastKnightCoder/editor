import { useState, memo } from "react";
import { useAsyncEffect } from "ahooks";
import { getVersions } from "@/commands";

import { LoadingOutlined } from "@ant-design/icons";
import SelectDatabase from "@/components/SelectDatabase";
import { Flex } from "antd";

const AppAbout = memo(() => {
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState("0.0");
  const [fetchVersionError, setFetchVersionError] = useState(false);

  useAsyncEffect(async () => {
    setLoading(true);
    try {
      const versions = await getVersions();
      setVersion(versions.app);
    } catch (error) {
      setFetchVersionError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      <Flex vertical gap={12}>
        <h2 className="mb-5 text-2xl font-bold">软件信息</h2>
        <div className="flex items-center gap-1 h-[30px]">
          {loading ? (
            <LoadingOutlined />
          ) : fetchVersionError ? (
            <div>获取软件版本失败</div>
          ) : (
            <div>软件版本：{version}</div>
          )}
        </div>
        <h2 className="my-5 text-2xl font-bold">选择数据库</h2>
        <SelectDatabase />
      </Flex>
    </div>
  );
});

export default AppAbout;
