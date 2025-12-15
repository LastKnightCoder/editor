import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, SelectField, TextInput, TextSecondary } from "./ui";
import type { PodcastSpeaker } from "@/types/podcast";
import { SpeakerRole } from "@/types/podcast";
import type { VoiceOption } from "./types";

export interface SpeakerConfigProps {
  speakers: PodcastSpeaker[];
  setSpeakers: React.Dispatch<React.SetStateAction<PodcastSpeaker[]>>;
  voices: VoiceOption[];
  voicesLoading: boolean;
  notify: (type: "success" | "error" | "warning" | "info", text: string) => void;
}

export const SpeakerConfig = ({
  speakers,
  setSpeakers,
  voices,
  voicesLoading,
  notify,
}: SpeakerConfigProps) => {
  const addSpeaker = useCallback(() => {
    if (speakers.length >= 5) {
      notify("warning", "最多支持 5 个说话人");
      return;
    }
    const newIndex = speakers.length + 1;
    setSpeakers([
      ...speakers,
      {
        name: `Speaker${newIndex}`,
        voiceId: "",
        voiceName: "",
        role: SpeakerRole.Guest,
      },
    ]);
  }, [speakers, notify, setSpeakers]);

  const removeSpeaker = useCallback(
    (index: number) => {
      if (speakers.length <= 2) {
        notify("warning", "至少需要 2 个说话人");
        return;
      }
      setSpeakers(speakers.filter((_, i) => i !== index));
    },
    [speakers, notify, setSpeakers]
  );

  const updateSpeaker = useCallback(
    (index: number, field: keyof PodcastSpeaker, value: string | SpeakerRole) => {
      const newSpeakers = [...speakers];
      newSpeakers[index] = { ...newSpeakers[index], [field]: value };

      if (field === "voiceId") {
        const voice = voices.find((v) => v.id === (value as string));
        if (voice) {
          newSpeakers[index].voiceName = voice.name || voice.id;
        }
      }

      setSpeakers(newSpeakers);
    },
    [speakers, voices, setSpeakers]
  );

  return (
    <div className="space-y-3">
      {voicesLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <svg
            className="w-3.5 h-3.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
            <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
          </svg>
          正在加载音色...
        </div>
      )}
      <div className="space-y-3">
        {speakers.map((speaker, index) => (
          <div key={index} className="flex items-center gap-2">
            <TextInput
              placeholder="名称"
              value={speaker.name}
              onChange={(value) => updateSpeaker(index, "name", value)}
              className="w-[120px] shrink-0"
            />
            <SelectField
              value={speaker.role}
              onChange={(value) => updateSpeaker(index, "role", value)}
              className="w-[100px] shrink-0"
              options={[
                {
                  value: SpeakerRole.Host,
                  label: SpeakerRole.Host,
                },
                {
                  value: SpeakerRole.Guest,
                  label: SpeakerRole.Guest,
                },
              ]}
            />
            <SelectField
              placeholder="选择音色"
              value={speaker.voiceId || undefined}
              onChange={(value) => updateSpeaker(index, "voiceId", value)}
              className="flex-1 min-w-0"
              searchable
              options={voices.map((voice) => ({
                value: voice.id,
                label: (
                  <div>
                    <div>{voice.name || voice.id}</div>
                    {voice.description && (
                      <TextSecondary className="text-xs">{voice.description}</TextSecondary>
                    )}
                  </div>
                ),
                searchText: `${voice.name || ""} ${voice.id} ${voice.description || ""}`,
              }))}
            />
            {speakers.length > 2 && (
              <Button
                icon={<Trash2 size={14} />}
                variant="danger"
                size="small"
                className="w-7 h-7 px-0 rounded-lg shrink-0"
                onClick={() => removeSpeaker(index)}
              />
            )}
          </div>
        ))}
      </div>

      {speakers.length < 5 && (
        <Button
          icon={<Plus size={14} />}
          onClick={addSpeaker}
          block
          variant="dashed"
          className="mt-4"
        >
          添加说话人
        </Button>
      )}
    </div>
  );
};

export default SpeakerConfig;
