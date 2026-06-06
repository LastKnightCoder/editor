import { useState, useCallback } from "react";
import {
  getAllCards,
  getAllArticles,
  getProjectList,
  getAllDocuments,
  getAllQuestions,
} from "@/commands";
import {
  listQuestionGroups,
  QuestionGroupDTO,
} from "@/commands/question-group";
import { ICard } from "@/types/card";
import { IArticle } from "@/types/article";
import { Project } from "@/types/project";
import { IDocument } from "@/types/document";
import { IQuestion } from "@/types/question";

interface UseContentLoaderReturn {
  cards: ICard[];
  articles: IArticle[];
  projects: Project[];
  documents: IDocument[];
  questionGroups: QuestionGroupDTO[];
  questions: IQuestion[];
  isLoading: boolean;
  loadContent: () => Promise<void>;
}

export function useContentLoader(): UseContentLoaderReturn {
  const [cards, setCards] = useState<ICard[]>([]);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<IDocument[]>([]);
  const [questionGroups, setQuestionGroups] = useState<QuestionGroupDTO[]>([]);
  const [questions, setQuestions] = useState<IQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        cardsData,
        articlesData,
        projectsData,
        documentsData,
        questionGroupsData,
        questionsData,
      ] = await Promise.all([
        getAllCards(),
        getAllArticles(),
        getProjectList(),
        getAllDocuments(),
        listQuestionGroups(),
        getAllQuestions(),
      ]);

      setCards(cardsData);
      setArticles(articlesData);
      // 只保留文档树类型的项目
      setProjects(
        projectsData.filter((p) => p.projectType === "document-tree"),
      );
      setDocuments(documentsData);
      setQuestionGroups(questionGroupsData);
      setQuestions(questionsData);
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
    questionGroups,
    questions,
    isLoading,
    loadContent,
  };
}
