import { useState, useCallback } from "react";
import { getAllCards, getAllArticles, getProjectList } from "@/commands";
import { ICard } from "@/types/card";
import { IArticle } from "@/types/article";
import { Project } from "@/types/project";

interface UseContentLoaderReturn {
  cards: ICard[];
  articles: IArticle[];
  projects: Project[];
  isLoading: boolean;
  loadContent: () => Promise<void>;
}

export function useContentLoader(): UseContentLoaderReturn {
  const [cards, setCards] = useState<ICard[]>([]);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cardsData, articlesData, projectsData] = await Promise.all([
        getAllCards(),
        getAllArticles(),
        getProjectList(),
      ]);

      setCards(cardsData);
      setArticles(articlesData);
      setProjects(projectsData);
    } catch (error) {
      console.error("Failed to load content:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    cards,
    articles,
    projects,
    isLoading,
    loadContent,
  };
}
