import { setupConsoleLogger } from "@/utils/console-logger";
import { createPomodoroAudioPlayer } from "./background-audio";

// 该隐藏窗口的 console 输出经最小日志桥写入 session 文件
setupConsoleLogger();
const player = createPomodoroAudioPlayer();
window.tauPomodoroAudio.listen(player.apply);
window.addEventListener("pagehide", player.release, { once: true });
