import { invoke } from "@/electron";
import { articleCommands } from "@/commands/contracts/article";
import { ICreatePodcast, IPodcast } from "@/types/podcast";

export async function createPodcast(data: ICreatePodcast): Promise<IPodcast> {
  return invoke("podcast:create", data);
}

export async function getPodcastById(podcastId: number): Promise<IPodcast | null> {
  return invoke("podcast:get-by-id", podcastId);
}

export async function deletePodcast(podcastId: number): Promise<number> {
  return invoke("podcast:delete", podcastId);
}

export async function incrementPodcastRefCount(podcastId: number): Promise<void> {
  return invoke("podcast:increment-ref-count", podcastId);
}

export async function attachPodcastToCard(cardId: number, podcastId: number): Promise<void> {
  return invoke("attach-podcast-to-card", cardId, podcastId);
}

export async function detachPodcastFromCard(cardId: number): Promise<void> {
  return invoke("detach-podcast-from-card", cardId);
}

export async function attachPodcastToArticle(articleId: number, podcastId: number): Promise<void> {
  await articleCommands.attachPodcast.call(articleId, podcastId);
}

export async function detachPodcastFromArticle(articleId: number): Promise<void> {
  await articleCommands.detachPodcast.call(articleId);
}

export async function attachPodcastToProjectItem(
  projectItemId: number,
  podcastId: number
): Promise<void> {
  return invoke("attach-podcast-to-project-item", projectItemId, podcastId);
}

export async function detachPodcastFromProjectItem(projectItemId: number): Promise<void> {
  return invoke("detach-podcast-from-project-item", projectItemId);
}

export async function updatePodcastName(podcastId: number, name: string): Promise<IPodcast | null> {
  return invoke("podcast:update-name", podcastId, name);
}

export async function updatePodcast(
  podcastId: number,
  data: Partial<ICreatePodcast>
): Promise<IPodcast | null> {
  return invoke("podcast:update", podcastId, data);
}
