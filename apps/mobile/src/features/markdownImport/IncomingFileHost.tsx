import { useEffect } from "react";
import { useAppContext } from "../../app/AppContext";
import { useSingleFlight } from "../../hooks/useSingleFlight";
import { useNavigator } from "../../router";
import * as tauri from "../../services/tauri";

/**
 * 接住外部应用「用其他应用打开」交给 Tau 的 Markdown，打开导入预览页。
 * 原生侧在收到文件时派发 tau:incoming-file；冷启动时事件早于页面加载会丢失，挂载时主动取一次兜底。
 */
export function IncomingFileHost() {
  const navigator = useNavigator();
  const app = useAppContext();

  const takeIncoming = useSingleFlight(async () => {
    try {
      const file = await tauri.takeIncomingFile();
      if (file) navigator.push("markdownImport", { title: file.title, markdown: file.markdown });
    } catch (error) {
      app.presentError(error, "打开文件失败");
    }
  });

  useEffect(() => {
    void takeIncoming();
    const handleIncoming = () => void takeIncoming();
    window.addEventListener("tau:incoming-file", handleIncoming);
    return () => window.removeEventListener("tau:incoming-file", handleIncoming);
  }, [takeIncoming]);

  return null;
}
