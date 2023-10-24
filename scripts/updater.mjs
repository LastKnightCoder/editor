import { getOctokit, context } from '@actions/github';
import fs from 'fs';

import updatelog from './updatelog.mjs';

const token = process.env.GITHUB_TOKEN;

async function updater() {
  if (!token) {
    console.log('GITHUB_TOKEN is required');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync('./package.json', { encoding: 'utf8' }));
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