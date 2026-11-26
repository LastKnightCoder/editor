import { projectsTranslator } from "@/features/projects/i18n";
import { useMemoizedFn } from "ahooks";

import { RemotePdfSelectResult } from "@/components/RemotePdfSelectModal";
import {
  CreateProjectItem,
  EProjectItemType,
  Project as IProject,
  type ProjectItem as IProjectItem,
  Pdf,
} from "@/types";
import { ModalKey } from "../constants/modalKeys";
import { useCreatePdfRecord } from "@/features/pdfs/queries";
import { toast } from "@tau/ui";

export interface PdfAddStrategy {
  addProjectItem: (createItem: CreateProjectItem) => Promise<void>;
}

export interface UsePdfHandlersOptions {
  closeModal: (key: ModalKey) => void;
  strategy: PdfAddStrategy;
}

export interface RootPdfStrategyConfig {
  project: IProject | null;
  addRootProjectItem: (
    projectId: number,
    createItem: CreateProjectItem
  ) => Promise<[IProject, IProjectItem | null]>;
  setProject: (project: IProject) => void;
  navigateTo: (tabType: string, params: { id: number; itemId?: number }, title?: string) => void;
}

export interface ChildPdfStrategyConfig {
  projectItem: IProjectItem | undefined;
  projectId: number | undefined;
  addChildProjectItem: (
    parentId: number,
    createItem: CreateProjectItem
  ) => Promise<[IProjectItem | null, IProjectItem | null]>;
  setProjectItem: (projectItem: IProjectItem) => void;
  projectItemEventBus: {
    publishProjectItemEvent: (event: string, item: IProjectItem) => void;
  };
}

export const createRootPdfStrategy = (config: RootPdfStrategyConfig): PdfAddStrategy => ({
  addProjectItem: async createItem => {
    if (!config.project) {
      toast.error(t("loading.project"));
      return;
    }

    const [newProject, projectItem] = await config.addRootProjectItem(
      config.project.id,
      createItem
    );

    if (projectItem) {
      config.navigateTo(
        "project-detail",
        {
          id: newProject.id,
          itemId: projectItem.id,
        },
        `项目 - ${projectItem.title || `#${projectItem.id}`}`
      );
    }
    config.setProject(newProject);
  },
});

export const createChildPdfStrategy = (config: ChildPdfStrategyConfig): PdfAddStrategy => ({
  addProjectItem: async createItem => {
    if (!config.projectItem || !config.projectId) {
      toast.error(t("loading.document"));
      return;
    }

    const [parentProjectItem] = await config.addChildProjectItem(config.projectItem.id, createItem);

    if (parentProjectItem) {
      config.setProjectItem(parentProjectItem);
      config.projectItemEventBus.publishProjectItemEvent("project-item:updated", parentProjectItem);
    }
  },
});

export const createProjectItemFromPdf = (pdf: Pdf): CreateProjectItem => ({
  title: pdf.fileName,
  content: [],
  children: [],
  refType: "pdf",
  refId: pdf.id,
  projectItemType: EProjectItemType.Pdf,
  count: 0,
  whiteboardContentId: 0,
});

export const usePdfHandlers = ({ closeModal, strategy }: UsePdfHandlersOptions) => {
  const createPdfRecord = useCreatePdfRecord();

  const handleRemotePdfConfirm = useMemoizedFn(async (result: RemotePdfSelectResult) => {
    try {
      const pdf = await createPdfRecord({
        fileName: result.fileName,
        filePath: "",
        isLocal: false,
        remoteUrl: result.url,
        tags: [],
        category: "",
      });

      await strategy.addProjectItem(createProjectItemFromPdf(pdf));
      closeModal(ModalKey.RemotePdf);
      toast.success(t("pdf.remoteAdded"));
    } catch (error) {
      console.error("添加远程 PDF 失败:", error);
      toast.error(t("pdf.remoteFailed"));
    }
  });

  const handleSelectPdfConfirm = useMemoizedFn(async (pdf: Pdf) => {
    try {
      await strategy.addProjectItem(createProjectItemFromPdf(pdf));
      closeModal(ModalKey.SelectPdf);
      toast.success(t("pdf.linked"));
    } catch (error) {
      console.error("关联 PDF 失败:", error);
      toast.error(t("pdf.linkFailed"));
    }
  });

  return { handleRemotePdfConfirm, handleSelectPdfConfirm };
};

export type UsePdfHandlersReturn = ReturnType<typeof usePdfHandlers>;

const t = projectsTranslator.t;
