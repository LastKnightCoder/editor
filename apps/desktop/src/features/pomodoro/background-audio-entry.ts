import { createPomodoroAudioPlayer } from "./background-audio";

const player = createPomodoroAudioPlayer();
window.tauPomodoroAudio.listen(player.apply);
window.addEventListener("pagehide", player.release, { once: true });
