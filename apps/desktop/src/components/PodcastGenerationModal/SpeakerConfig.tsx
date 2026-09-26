import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Input, Select, Spinner, Tooltip } from "@tau/ui";
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
        const voice = voices.find(v => v.id === (value as string));
        if (voice) {
          newSpeakers[index].voiceName = voice.name || voice.id;
        }
      }

      setSpeakers(newSpeakers);
    },
    [speakers, voices, setSpeakers]
  );

  return (
    <div className="flex flex-col gap-2">
      {speakers.map((speaker, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            placeholder="名称"
            aria-label={`说话人 ${index + 1} 名称`}
            value={speaker.name}
            onChange={e => updateSpeaker(index, "name", e.target.value)}
            wrapperClassName="w-[120px] shrink-0"
          />
          <Select
            aria-label={`说话人 ${index + 1} 角色`}
            value={speaker.role}
            onValueChange={value => updateSpeaker(index, "role", value)}
            className="w-[96px] shrink-0"
            options={[
              { value: SpeakerRole.Host, label: SpeakerRole.Host },
              { value: SpeakerRole.Guest, label: SpeakerRole.Guest },
            ]}
          />
          <Select
            aria-label={`说话人 ${index + 1} 音色`}
            placeholder={voicesLoading ? "正在加载音色…" : "选择或输入音色 ID"}
            value={speaker.voiceId || undefined}
            onValueChange={value => updateSpeaker(index, "voiceId", value)}
            className="min-w-0 flex-1"
            searchable
            creatable
            emptyText={voicesLoading ? "正在加载音色…" : undefined}
            options={voices.map(voice => ({
              value: voice.id,
              label: (
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{voice.name || voice.id}</span>
                  {voice.description && (
                    <span className="text-ink-3 text-tau-micro truncate">{voice.description}</span>
                  )}
                </span>
              ),
              searchText: `${voice.name || ""} ${voice.id} ${voice.description || ""}`,
            }))}
          />
          {speakers.length > 2 && (
            <Tooltip content="移除说话人">
              <IconButton
                aria-label="移除说话人"
                className="enabled:hover:text-danger shrink-0"
                onClick={() => removeSpeaker(index)}
              >
                <Trash2 className="size-[15px]" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3">
        {speakers.length < 5 && (
          <Button variant="ghost" size="sm" icon={Plus} onClick={addSpeaker} className="-ml-2">
            添加说话人
          </Button>
        )}
        {voicesLoading && (
          <span className="text-ink-3 text-tau-meta flex items-center gap-1.5">
            <Spinner className="size-3" />
            正在加载音色…
          </span>
        )}
      </div>
    </div>
  );
};

export default SpeakerConfig;
