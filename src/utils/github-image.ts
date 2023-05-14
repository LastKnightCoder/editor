import Axios from 'axios'
import {message} from "antd";
import { useGithubStore } from "../stores";

const axios = Axios.create({
  baseURL: 'https://api.github.com',
  // 五分钟
  timeout: 300000
})

axios.defaults.headers['Content-Type'] = 'application/json'

// 响应拦截器
axios.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (!error?.response) {
      message.error('图片上传失败');
    }
    return Promise.reject(error.response)
  }
)

interface IRequestConfig {
  method: string
  params?: any
  headers?: any
  [key: string]: any
}

const request = (config: IRequestConfig) => {
  let { token } = useGithubStore.getState();
  if (!token) {
    token = localStorage.getItem('github-token') || '';
  }
  const requestConfig = {} as IRequestConfig;

  config.method = config.method.toUpperCase()

  for (const configKey in config) {
    if (configKey === 'params') {
      if (config.method === 'GET') {
        requestConfig.params = config.params
      } else {
        requestConfig.data = config.params
      }
    } else {
      requestConfig[configKey] = config[configKey]
    }
  }

  if (token) {
    requestConfig.headers = {
      ...requestConfig.headers,
      Authorization: `token ${token}`
    }
  } else {
    message.error('token 不存在').then();
    return Promise.reject('token 不存在')
  }

  return new Promise((resolve) => {
    axios
      .request(requestConfig)
      .then((res) => {
        const { status, data } = res
        if (res && (status === 200 || status === 201 || status === 204)) {
          resolve(data || 'SUCCESS')
        } else {
          resolve(null)
        }
      })
      .catch((err) => {
        if (requestConfig?.success422 && err?.status === 422) {
          resolve(err?.data || 'SUCCESS')
        } else {
          resolve(null)
        }
      })
  })
}

export const uploadSingleImage = (content: string, fileName: string) => {
  let { branch, repo, user } = useGithubStore.getState();
  if (!branch) {
    branch = localStorage.getItem('github-branch') || 'master';
  }
  if (!repo) {
    repo = localStorage.getItem('github-repo') || 'image-for-2023';
  }
  if (!user) {
    user = {
      owner: localStorage.getItem('github-owner') || 'LastKnightCoder',
      email: localStorage.getItem('github-email') || ''
    };
  }

  const path = fileName;

  const {
    owner,
    email
  } = user;

  return request({
    method: 'PUT',
    url: `/repos/${owner}/${repo}/contents/${path}`,
    data: {
      branch,
      message: `upload image ${path}`,
      content,
      commiter: {
        name: owner,
        email
      }
    }
  });
}

// 将 Github URL 替换为 CDN URL
export const replaceGithubUrlToCDNUrl = (url: string) => {
  let { branch } = useGithubStore.getState();
  if (!branch) {
    branch = localStorage.getItem('github-branch') || 'master';
  }
  return url.replace('https://raw.githubusercontent.com', 'https://cdn.staticaly.com/gh').replace(`/${branch}`, `@${branch}`);
}
