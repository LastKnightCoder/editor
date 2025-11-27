import { useState, useRef, useEffect } from "react";
import { invoke, on, off } from "@/electron";
import "./index.css";

interface StreamOption {
  id: string;
  resolution: string;
  format: string;
  fps?: number;
  codecs: string;
  bitrate?: number;
  videoOnly: boolean;
  audioOnly: boolean;
}

interface VideoMeta {
  title: string;
  thumbnail: string;
  duration: number;
  videoStreams: StreamOption[];
  audioStreams: StreamOption[];
}

interface DownloadProgress {
  id: string;
  status: string;
  progress?: number;
  speed?: string;
  eta?: string;
  log?: string;
}

const YtDlpTestPage = () => {
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [selectedVideo, setSelectedVideo] = useState("");
  const [selectedAudio, setSelectedAudio] = useState("");
  const [format, setFormat] = useState("mp4");
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const currentDownloadId = useRef<string | null>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    const handleProgress = (_e: any, data: DownloadProgress) => {
      if (data.id !== currentDownloadId.current) return;

      if (data.log) {
        setLogs((prev) => [...prev, data.log!]);
      }
      if (data.progress !== undefined) {
        setProgress(data.progress);
      }
      if (data.status) {
        if (data.status === "completed") {
          setIsDownloading(false);
          setLogs((prev) => [...prev, "✅ 下载完成！"]);
        } else if (data.status === "error") {
          setIsDownloading(false);
          setError("下载失败");
        }
      }
    };

    on("ytdlp-test-progress", handleProgress);
    return () => {
      off("ytdlp-test-progress", handleProgress);
    };
  }, []);

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError("请输入 URL");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setMeta(null);
    setLogs(["开始分析视频...", `URL: ${url}`, "正在获取 yt-dlp..."]);

    try {
      setLogs((prev) => [...prev, "调用后端分析接口..."]);
      console.log("[YtDlpTest] 开始调用 invoke");

      const result = await invoke("ytdlp_test_analyze", { url });

      console.log("[YtDlpTest] invoke 返回结果", result);
      setLogs((prev) => [...prev, "后端返回数据，开始解析..."]);

      if (!result) {
        setError("分析失败，未返回数据");
        return;
      }

      const formats = result.formats || [];

      // 与参考项目完全一致的筛选逻辑
      const videoStreams: StreamOption[] = formats
        .filter((f: any) => f.vcodec !== "none" && f.acodec === "none")
        .map((f: any) => ({
          id: f.format_id,
          resolution: f.height ? `${f.height}p` : "Unknown",
          format: f.ext,
          fps: f.fps,
          codecs: f.vcodec,
          bitrate: f.tbr ? f.tbr * 1024 : 0,
          videoOnly: true,
          audioOnly: false,
        }))
        .sort(
          (a: StreamOption, b: StreamOption) =>
            parseInt(b.resolution) - parseInt(a.resolution),
        );

      const audioStreams: StreamOption[] = formats
        .filter((f: any) => f.acodec !== "none" && f.vcodec === "none")
        .map((f: any) => ({
          id: f.format_id,
          resolution: "Audio",
          format: f.ext,
          bitrate: f.abr ? f.abr * 1024 : 0,
          codecs: f.acodec,
          videoOnly: false,
          audioOnly: true,
        }));

      // 如果没有纯视频流，使用混合流
      if (videoStreams.length === 0) {
        formats
          .filter((f: any) => f.vcodec !== "none")
          .forEach((f: any) => {
            videoStreams.push({
              id: f.format_id,
              resolution: f.height ? `${f.height}p` : "Unknown",
              format: f.ext,
              fps: f.fps,
              codecs: f.vcodec,
              videoOnly: false,
              audioOnly: false,
            });
          });
      }

      const videoMeta: VideoMeta = {
        title: result.title,
        thumbnail: result.thumbnail,
        duration: result.duration,
        videoStreams,
        audioStreams,
      };

      setMeta(videoMeta);
      if (videoStreams.length > 0) setSelectedVideo(videoStreams[0].id);
      if (audioStreams.length > 0) setSelectedAudio(audioStreams[0].id);

      setLogs((prev) => [
        ...prev,
        `✅ 分析完成: ${result.title}`,
        `视频流: ${videoStreams.length} 个`,
        `音频流: ${audioStreams.length} 个`,
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`分析失败: ${msg}`);
      setLogs((prev) => [...prev, `❌ 分析失败: ${msg}`]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownload = async () => {
    if (!meta || !selectedVideo) {
      setError("请先分析视频并选择流");
      return;
    }

    setIsDownloading(true);
    setError(null);
    setProgress(0);

    const downloadId = `test-${Date.now()}`;
    currentDownloadId.current = downloadId;

    setLogs((prev) => [
      ...prev,
      "---",
      `开始下载: ${meta.title}`,
      `视频流: ${selectedVideo}`,
      `音频流: ${selectedAudio}`,
      `格式: ${format}`,
    ]);

    try {
      const result = await invoke("ytdlp_test_download", {
        id: downloadId,
        url,
        title: meta.title,
        videoFormatId: selectedVideo,
        audioFormatId: selectedAudio,
        format,
      });

      if (result?.outputPath) {
        setLogs((prev) => [...prev, `✅ 文件保存到: ${result.outputPath}`]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`下载失败: ${msg}`);
      setLogs((prev) => [...prev, `❌ 下载失败: ${msg}`]);
      setIsDownloading(false);
    }
  };

  return (
    <div className="ytdlp-test-container">
      <h1>YT-DLP 测试工具</h1>
      <p className="description">
        这是一个与参考项目 ytb-downloader 完全一致的测试工具，用于验证下载流程。
      </p>

      {/* URL 输入 */}
      <div className="input-section">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="输入 YouTube 视频 URL..."
          disabled={isAnalyzing || isDownloading}
        />
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || isDownloading || !url.trim()}
        >
          {isAnalyzing ? "分析中..." : "分析"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* 视频信息 */}
      {meta && (
        <div className="meta-section">
          <div className="meta-header">
            {meta.thumbnail && (
              <img
                src={meta.thumbnail}
                alt={meta.title}
                className="thumbnail"
              />
            )}
            <div className="meta-info">
              <h2>{meta.title}</h2>
              <p>
                时长: {Math.floor(meta.duration / 60)}:
                {String(meta.duration % 60).padStart(2, "0")}
              </p>
            </div>
          </div>

          {/* 流选择 */}
          <div className="stream-selection">
            <div className="select-group">
              <label>视频流:</label>
              <select
                value={selectedVideo}
                onChange={(e) => setSelectedVideo(e.target.value)}
                disabled={isDownloading}
              >
                {meta.videoStreams.map((stream) => (
                  <option key={stream.id} value={stream.id}>
                    {stream.resolution} · {stream.format} · {stream.codecs}
                    {stream.fps ? ` · ${stream.fps}fps` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="select-group">
              <label>音频流:</label>
              <select
                value={selectedAudio}
                onChange={(e) => setSelectedAudio(e.target.value)}
                disabled={isDownloading}
              >
                {meta.audioStreams.map((stream) => (
                  <option key={stream.id} value={stream.id}>
                    {stream.format} · {stream.codecs} ·{" "}
                    {stream.bitrate
                      ? `${Math.round(stream.bitrate / 1024)}kbps`
                      : "Unknown"}
                  </option>
                ))}
              </select>
            </div>

            <div className="select-group">
              <label>输出格式:</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                disabled={isDownloading}
              >
                <option value="mp4">MP4</option>
                <option value="mkv">MKV</option>
                <option value="webm">WebM</option>
              </select>
            </div>
          </div>

          <button
            className="download-btn"
            onClick={handleDownload}
            disabled={isDownloading || !selectedVideo}
          >
            {isDownloading ? `下载中 ${progress.toFixed(1)}%` : "开始下载"}
          </button>

          {isDownloading && (
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* 日志输出 */}
      <div className="logs-section">
        <h3>日志输出</h3>
        <div className="logs-container">
          {logs.map((log, i) => (
            <div key={i} className="log-line">
              {log}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};

export default YtDlpTestPage;
