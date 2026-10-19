import { GitPublicationService } from "./git-publication";
import PathUtil from "../utils/PathUtil";

export const publicationGitService = new GitPublicationService(PathUtil.getAppDir());
