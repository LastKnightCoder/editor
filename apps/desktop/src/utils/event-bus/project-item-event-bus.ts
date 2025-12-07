import { EventBus } from "./event-bus";
import { ProjectItem } from "../../types/project";
import { v4 as uuidv4 } from "uuid";

export interface ProjectItemEventData {
  projectItem: ProjectItem;
  sourceUuid: string;
}

export interface ProjectItemEventMap {
  "project-item:created": ProjectItemEventData;
  "project-item:updated": ProjectItemEventData;
  "project-item:deleted": ProjectItemEventData;
  "project-item:content-changed": ProjectItemEventData;
  "project-item:title-changed": ProjectItemEventData;
  "project-item:children-changed": ProjectItemEventData;
  "project-item:parents-changed": ProjectItemEventData;
  "project-item:projects-changed": ProjectItemEventData;
  [key: string]: ProjectItemEventData;
}

export class ProjectItemEditor {
  private uuid: string;
  private projectItemEventBus: ProjectItemEventBus;

  constructor(projectItemEventBus: ProjectItemEventBus) {
    this.uuid = uuidv4();
    this.projectItemEventBus = projectItemEventBus;
  }

  getUuid(): string {
    return this.uuid;
  }

  publishProjectItemEvent<K extends keyof ProjectItemEventMap>(
    event: K,
    projectItem: ProjectItem,
  ): void {
    this.projectItemEventBus.publish(event, {
      projectItem,
      sourceUuid: this.uuid,
    });
  }

  subscribeToOtherEditors<K extends keyof ProjectItemEventMap>(
    event: K,
    callback: (data: ProjectItemEventMap[K]) => void,
  ): () => void {
    return this.projectItemEventBus.subscribe(event, (data) => {
      if (data.sourceUuid !== this.uuid) {
        callback(data);
      }
    });
  }

  subscribeToProjectItemWithId<K extends keyof ProjectItemEventMap>(
    event: K,
    projectItemId: number,
    callback: (data: ProjectItemEventMap[K]) => void,
  ): () => void {
    return this.projectItemEventBus.subscribe(event, (data) => {
      if (
        data.sourceUuid !== this.uuid &&
        data.projectItem.id === projectItemId
      ) {
        callback(data);
      }
    });
  }
}

export class ProjectItemEventBus extends EventBus<ProjectItemEventMap> {
  createEditor(): ProjectItemEditor {
    return new ProjectItemEditor(this);
  }

  subscribeToProjectItem<K extends keyof ProjectItemEventMap>(
    event: K,
    projectItemId: number,
    callback: (data: ProjectItemEventMap[K]) => void,
    ignoreUuid?: string,
  ): () => void {
    return this.subscribe(event, (data) => {
      if (
        data.projectItem.id === projectItemId &&
        (!ignoreUuid || data.sourceUuid !== ignoreUuid)
      ) {
        callback(data);
      }
    });
  }
}

const defaultProjectItemEventBus = new ProjectItemEventBus();

export { defaultProjectItemEventBus };
