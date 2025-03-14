import Axios from "axios";
import { v4 as uuid } from "uuid";

const axios = Axios.create({
  baseURL: "https://api.github.com",
  timeout: 300000,
});

axios.defaults.headers["Content-Type"] = "application/json";

export const getGithubUserInfo = async (token: string) => {
  if (!token) return null;
  const res = await axios.get("/user", {
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (res.status === 200) {
    return res.data;
  }
  return null;
};

export const getReposByOwner = async (token: string, owner: string) => {
  if (!token || !owner) return null;
  const res = await axios.get(`/users/${owner}/repos`, {
    params: {
      type: "owner",
      sort: "updated",
      direction: "desc",
      per_page: 100,
      page: 1,
    },
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (res.status === 200) {
    return res.data;
  }
  return null;
};

export const getBranchesByRepo = async (
  token: string,
  owner: string,
  repo: string,
) => {
  if (!token || !owner || !repo) return null;
  const res = await axios.get(`/repos/${owner}/${repo}/branches`, {
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (res.status === 200) {
    return res.data;
  }
  return null;
};

export const getPathAndContentFromFile = async (
  file: File,
): Promise<{
  path: string;
  content: string;
} | null> => {
  const reader = new FileReader();
  return new Promise((resolve) => {
    reader.onload = async (e) => {
      if (!e.target) {
        resolve(null);
        return;
      }
      const dataUrl = e.target.result as string;
      const fileName = file.name;
      const all = fileName.split(".");
      const other = all.slice(0, all.length - 1);
      const extension = all[all.length - 1];
      const path = other.join(".") + "_" + uuid() + "." + extension;
      const content = dataUrl.split(",")[1];
      resolve({
        path,
        content,
      });
    };
    reader.readAsDataURL(file);
  });
};

interface ICommitInfo {
  path: string;
  content: string;
  message: string;
  committer: {
    name: string;
    email: string;
  };
}

interface IGithubInfo {
  token: string;
  branch: string;
  repo: string;
  user: {
    name: string;
    email: string;
  };
}

export const uploadFileFromContent = async (
  githubInfo: IGithubInfo,
  commitInfo: ICommitInfo,
) => {
  const { token, branch, repo, user } = githubInfo;
  const { name: owner } = user;
  const { path, content, message, committer } = commitInfo;
  if (!token || !owner || !repo || !branch) return null;
  const res = await axios.put(
    `/repos/${owner}/${repo}/contents/${path}`,
    {
      branch,
      message,
      content,
      committer,
    },
    {
      headers: {
        Authorization: `token ${token}`,
      },
    },
  );
  if (res.status === 201 || res.status === 200 || res.status === 204) {
    return res.data;
  }
  return null;
};

export const transformGithubUrlToCDNUrl = (url: string, branch: string) => {
  if (!branch) {
    return url;
  }
  return url
    .replace("https://raw.githubusercontent.com", "https://jsd.cdn.zzko.cn/gh")
    .replace(`/${branch}`, `@${branch}`);
};

export const uploadFileFromFile = async (
  file: File,
  githubInfo: IGithubInfo,
) => {
  const { token, branch, repo, user } = githubInfo;
  if (!token || !branch || !repo || !user) return null;
  const pathRes = await getPathAndContentFromFile(file);
  if (!pathRes) {
    return null;
  }
  const { path, content } = pathRes;
  const { name: owner, email } = user;
  return uploadFileFromContent(githubInfo, {
    path,
    content,
    message: `upload image ${file.name} from editor`,
    committer: {
      name: owner,
      email,
    },
  });
};
