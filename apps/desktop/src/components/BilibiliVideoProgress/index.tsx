import { Progress } from "antd";
import { type StreamProgress } from "@/hooks/useBilibiliVideo";

interface BilibiliVideoProgressProps {
  streamProgress: StreamProgress;
}

const BilibiliVideoProgress = ({
  streamProgress,
}: BilibiliVideoProgressProps) => {
  return (
    <div style={{ width: "300px", textAlign: "center" }}>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", marginBottom: "8px" }}>
          {streamProgress.message}
        </div>

        {streamProgress.stage === "downloading" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div>视频下载进度：</div>
              <Progress
                percent={Number(
                  (
                    ((streamProgress.videoDownloaded || 0) /
                      (streamProgress.videoTotal || 1)) *
                    100
                  ).toFixed(2),
                )}
                size="small"
                strokeColor="#1890ff"
                status="active"
              />
            </div>
            <div className="flex items-center gap-2">
              <div>音频下载进度：</div>
              <Progress
                percent={Number(
                  (
                    ((streamProgress.audioDownloaded || 0) /
                      (streamProgress.audioTotal || 1)) *
                    100
                  ).toFixed(2),
                )}
                size="small"
                strokeColor="#1890ff"
                status="active"
              />
            </div>
          </div>
        )}

        {streamProgress.stage === "completed" && (
          <Progress
            percent={100}
            size="small"
            strokeColor="#52c41a"
            status="success"
          />
        )}
      </div>
    </div>
  );
};

export default BilibiliVideoProgress;
