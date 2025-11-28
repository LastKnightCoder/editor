import React from "react";
import BilibiliSetting from "./BilibiliSetting";
import YouTubeSetting from "./YouTubeSetting";
import NotionSetting from "./NotionSetting";
import MinimaxSetting from "./MinimaxSetting";
import GithubSetting from "./GithubSetting";
import S3Setting from "./S3Setting";
import WebDavSetting from "./WebDavSetting";
import AliOSSSetting from "./AliOSSSetting";
import WeReadSetting from "./WeReadSetting";

const IntegrationSetting: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header Section */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          应用集成
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          管理与第三方应用的集成，配置凭证信息以获得更好的体验
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700 mb-6" />

      {/* Integration Cards Grid - 使用容器查询 */}
      <div className="@container">
        <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4 gap-4">
          <BilibiliSetting />
          <YouTubeSetting />
          <NotionSetting />
          <MinimaxSetting />
          <GithubSetting />
          <S3Setting />
          <WebDavSetting />
          <AliOSSSetting />
          <WeReadSetting />
        </div>
      </div>
    </div>
  );
};

export default IntegrationSetting;
