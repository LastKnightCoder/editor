export interface SpeakerListResult {
  Result: {
    Statuses: Array<{
      SpeakerID: string;
      InstanceNO: string;
      IsActivatable: boolean;
      State: string;
      DemoAudio: string | null;
      Version: string | null;
      CreateTime: number;
      ExpireTime: number;
      Alias: string | null;
      AvailableTrainingTimes: number;
    }>;
  };
  ResponseMetadata: {
    RequestId: string;
    Service: string;
    Action: string;
    Region: string;
  };
}

export interface TrainSpeakerResult {
  BaseResp: {
    StatusCode: number;
    StatusMessage: string;
  };
  speaker_id: string;
}
