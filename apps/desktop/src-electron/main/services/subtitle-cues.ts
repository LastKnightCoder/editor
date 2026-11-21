import type { TranscriptionSegment } from "./whisper-engine";

export function groupTimedWords(words: TranscriptionSegment[], separator: string) {
  const cues: TranscriptionSegment[] = [];
  let cue: TranscriptionSegment | undefined;
  for (const word of words) {
    if (
      !cue ||
      word.start - cue.end > 700 ||
      word.end - cue.start > 6000 ||
      cue.text.length >= 48 ||
      /[。！？.!?]$/.test(cue.text.trimEnd())
    ) {
      cue = { ...word };
      cues.push(cue);
    } else {
      cue.text += separator + word.text;
      cue.end = Math.max(cue.end, word.end);
    }
  }
  return cues.map(cue => ({ ...cue, text: cue.text.trim() }));
}
