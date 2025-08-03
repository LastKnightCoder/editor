import BilibiliVideoProgress from "@/components/BilibiliVideoProgress";
import { type StreamProgress } from "@/hooks/useBilibiliVideo";

interface BilibiliVideoLoaderProps {
  loading: boolean;
  error: string | null;
  streamProgress: StreamProgress | null;
}

const BilibiliVideoLoader = ({
  loading,
  error,
  streamProgress,
}: BilibiliVideoLoaderProps) => {
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
        <div>正在加载 Bilibili 视频...</div>

        {streamProgress && (
          <BilibiliVideoProgress streamProgress={streamProgress} />
        )}

        {!streamProgress && (
          <div style={{ fontSize: "12px", color: "#666" }}>
            正在获取视频流并合并音视频，请稍候
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
        <div>Bilibili 视频加载失败</div>
        <div style={{ fontSize: "12px", textAlign: "center" }}>{error}</div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          请检查网络连接或在设置中配置 Bilibili 凭证
        </div>
      </div>
    );
  }

  return null;
};

export default BilibiliVideoLoader;
