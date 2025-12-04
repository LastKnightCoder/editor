import { useState, useCallback } from "react";
import {
  getAllCards,
  getAllArticles,
  getProjectList,
  getAllDocuments,
} from "@/commands";
import { ICard } from "@/types/card";
import { IArticle } from "@/types/article";
import { Project } from "@/types/project";
import { IDocument } from "@/types/document";

interface UseContentLoaderReturn {
  cards: ICard[];
  articles: IArticle[];
  projects: Project[];
  documents: IDocument[];
  isLoading: boolean;
  loadContent: () => Promise<void>;
}

export function useContentLoader(): UseContentLoaderReturn {
  const [cards, setCards] = useState<ICard[]>([]);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<IDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cardsData, articlesData, projectsData, documentsData] =
        await Promise.all([
          getAllCards(),
          getAllArticles(),
          getProjectList(),
          getAllDocuments(),
        ]);

      setCards(cardsData);
      setArticles(articlesData);
      // 只保留文档树类型的项目
      setProjects(
        projectsData.filter((p) => p.projectType === "document-tree"),
      );
      setDocuments(documentsData);
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
    documents,
    isLoading,
    loadContent,
  };
}
