import NotionVideoProgress from "@/components/NotionVideoProgress";
import { type NotionCacheProgress } from "@/commands/notion-cache";

interface NotionVideoLoaderProps {
  loading: boolean;
  error: string | null;
  streamProgress: NotionCacheProgress | null;
}

const NotionVideoLoader = ({
  loading,
  error,
  streamProgress,
}: NotionVideoLoaderProps) => {
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "200px",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div>正在加载 Notion 视频...</div>

        {streamProgress ? (
          <NotionVideoProgress streamProgress={streamProgress} />
        ) : (
          <div style={{ fontSize: "12px", color: "#666" }}>
            正在获取视频信息并下载，请稍候
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "200px",
          flexDirection: "column",
          gap: "16px",
          color: "#ff4d4f",
        }}
      >
        <div>Notion 视频加载失败</div>
        <div style={{ fontSize: "12px", textAlign: "center" }}>{error}</div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          请检查网络连接或在设置中配置 Notion 集成
        </div>
      </div>
    );
  }

  return null;
};

export default NotionVideoLoader;
