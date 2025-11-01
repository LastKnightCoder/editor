import { invoke } from "@/electron";
import { ICreatePodcast, IPodcast } from "@/types/podcast";

export async function createPodcast(data: ICreatePodcast): Promise<IPodcast> {
  return invoke("podcast:create", data);
}

export async function getPodcastById(
  podcastId: number,
): Promise<IPodcast | null> {
  return invoke("podcast:get-by-id", podcastId);
}

export async function deletePodcast(podcastId: number): Promise<number> {
  return invoke("podcast:delete", podcastId);
}

export async function incrementPodcastRefCount(
  podcastId: number,
): Promise<void> {
  return invoke("podcast:increment-ref-count", podcastId);
}

export async function attachPodcastToCard(
  cardId: number,
  podcastId: number,
): Promise<void> {
  return invoke("attach-podcast-to-card", cardId, podcastId);
}

export async function detachPodcastFromCard(cardId: number): Promise<void> {
  return invoke("detach-podcast-from-card", cardId);
}
