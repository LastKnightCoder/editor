import type { MediaCapabilities } from "../extensions/media";
import { v4 as getUuid } from "uuid";

import { Board, Operation, AudioElement } from "../types";
import { AUDIO_CARD_HEIGHT, AUDIO_DEFAULT_WIDTH } from "../constants/audio";

export class AudioUtil {
  /**
   * Insert audio from a local file
   */
  static async insertAudio(file: File, board: Board, media: MediaCapabilities): Promise<void> {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const audioPath = await media.upload?.(file);
    if (!audioPath) return;

    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    const ops: Operation[] = [
      {
        type: "insert_node",
        path: [board.children.length],
        node: {
          id: getUuid(),
          type: "audio",
          src: audioPath,
          x: center.x - AUDIO_DEFAULT_WIDTH / 2,
          y: center.y - AUDIO_CARD_HEIGHT / 2,
          width: AUDIO_DEFAULT_WIDTH,
          height: AUDIO_CARD_HEIGHT,
          title: file.name.replace(/\.[^/.]+$/, ""),
        } as AudioElement,
      },
    ];

    if (!canSubmit()) return;

    board.apply(ops);
  }

  /**
   * Insert audio from a resource path
   */
  static async insertAudioFromPath(src: string, board: Board): Promise<void> {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    // Extract filename from path
    const parts = src.split(/[/\\]/);
    const filename = parts.pop() || "Audio";
    const title = filename.replace(/\.[^/.]+$/, "");

    const ops: Operation[] = [
      {
        type: "insert_node",
        path: [board.children.length],
        node: {
          id: getUuid(),
          type: "audio",
          src,
          x: center.x - AUDIO_DEFAULT_WIDTH / 2,
          y: center.y - AUDIO_CARD_HEIGHT / 2,
          width: AUDIO_DEFAULT_WIDTH,
          height: AUDIO_CARD_HEIGHT,
          title,
        } as AudioElement,
      },
    ];

    if (!canSubmit()) return;

    board.apply(ops);
  }

  /**
   * Insert audio from a URL
   */
  static async insertAudioFromUrl(url: string, board: Board): Promise<void> {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    // Try to extract filename from URL
    let title = "Audio";
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split("/").pop() || "Audio";
      title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ""));
    } catch {
      // Invalid URL, use default title
    }

    const ops: Operation[] = [
      {
        type: "insert_node",
        path: [board.children.length],
        node: {
          id: getUuid(),
          type: "audio",
          src: url,
          x: center.x - AUDIO_DEFAULT_WIDTH / 2,
          y: center.y - AUDIO_CARD_HEIGHT / 2,
          width: AUDIO_DEFAULT_WIDTH,
          height: AUDIO_CARD_HEIGHT,
          title,
        } as AudioElement,
      },
    ];

    if (!canSubmit()) return;

    board.apply(ops);
  }

  /**
   * Insert audio from text-to-speech
   */
  static async insertAudioFromTTS(
    audioBlob: Blob,
    text: string,
    board: Board,
    media: MediaCapabilities
  ): Promise<void> {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    // Convert blob to file and upload
    const file = new File([audioBlob], `tts-${Date.now()}.mp3`, {
      type: "audio/mp3",
    });

    const audioPath = await media.upload?.(file);
    if (!audioPath) return;

    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    // Truncate text for title if too long
    const title = text.length > 30 ? text.substring(0, 30) + "..." : text;

    const ops: Operation[] = [
      {
        type: "insert_node",
        path: [board.children.length],
        node: {
          id: getUuid(),
          type: "audio",
          src: audioPath,
          x: center.x - AUDIO_DEFAULT_WIDTH / 2,
          y: center.y - AUDIO_CARD_HEIGHT / 2,
          width: AUDIO_DEFAULT_WIDTH,
          height: AUDIO_CARD_HEIGHT,
          title,
          isFromTTS: true,
          ttsText: text,
        } as AudioElement,
      },
    ];

    if (!canSubmit()) return;

    board.apply(ops);
  }
}
