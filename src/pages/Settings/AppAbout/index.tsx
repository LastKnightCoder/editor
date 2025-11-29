import { useState, memo } from "react";
import { useAsyncEffect } from "ahooks";
import { getVersions } from "@/commands";
import SelectDatabase from "@/components/SelectDatabase";
import { SettingContainer, SettingSection } from "../components";
import useThemeColors from "@/hooks/useThemeColors";

const AppAbout = memo(() => {
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState("0.0");
  const [fetchVersionError, setFetchVersionError] = useState(false);
  const themeColors = useThemeColors();

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
    <SettingContainer>
      <SettingSection title="软件信息" description="查看当前软件版本信息">
        <div className="inline-flex items-center gap-3 px-5 py-4 rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700">
          <div
            className={`w-12 h-12 rounded-xl ${themeColors.iconBgDeepClass} flex items-center justify-center`}
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              当前版本
            </div>
            {loading ? (
              <div className="flex items-center gap-2">
                <svg
                  className="animate-spin w-4 h-4 text-blue-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span className="text-sm text-gray-400">加载中...</span>
              </div>
            ) : fetchVersionError ? (
              <div className="text-sm text-red-500">获取版本失败</div>
            ) : (
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                v{version}
              </div>
            )}
          </div>
        </div>
      </SettingSection>

      <SettingSection title="数据库管理" description="选择和管理你的笔记数据库">
        <SelectDatabase />
      </SettingSection>
    </SettingContainer>
  );
});

export default AppAbout;
