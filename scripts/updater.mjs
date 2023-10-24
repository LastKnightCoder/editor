import { getOctokit, context } from '@actions/github';

import updatelog from './updatelog.mjs';
import pkg from '../package.json';

const token = process.env.GITHUB_TOKEN;

async function updater() {
  if (!token) {
    console.log('GITHUB_TOKEN is required');
    process.exit(1);
  }

  const github = getOctokit(token);

  const version = pkg.version;
  const tag = `v${version}`;
  const body = updatelog(tag);

  github.rest.repos.updateRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
    body,
    release_id: process.env.release_id,
    draft: false,
    prerelease: false
  })
}

updater().catch(console.error);