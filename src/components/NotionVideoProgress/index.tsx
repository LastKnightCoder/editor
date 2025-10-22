import { Progress } from "antd";
import { type NotionCacheProgress } from "@/commands/notion-cache";

interface NotionVideoProgressProps {
  streamProgress: NotionCacheProgress;
}

const NotionVideoProgress = ({ streamProgress }: NotionVideoProgressProps) => {
  return (
    <div style={{ width: "300px", textAlign: "center" }}>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", marginBottom: "8px" }}>
          {streamProgress.message}
        </div>

        {streamProgress.stage === "downloading" && (
          <div className="flex flex-col gap-2">
            <Progress
              percent={Number(streamProgress.progress.toFixed(2))}
              size="small"
              strokeColor="#1890ff"
              status="active"
            />
            {streamProgress.downloaded && streamProgress.total && (
              <div style={{ fontSize: "12px", color: "#666" }}>
                {(streamProgress.downloaded / 1024 / 1024).toFixed(2)} MB /{" "}
                {(streamProgress.total / 1024 / 1024).toFixed(2)} MB
              </div>
            )}
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

export default NotionVideoProgress;
