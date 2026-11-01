import { invoke } from "@/electron";
import { ICreatePodcast, IPodcast } from "@/types/podcast";

export async function createPodcast(data: ICreatePodcast): Promise<IPodcast> {
  return invoke("podcast:create", data);
}

export async function getPodcastById(podcastId: number): Promise<IPodcast | null> {
  return invoke("podcast:get-by-id", podcastId);
}
