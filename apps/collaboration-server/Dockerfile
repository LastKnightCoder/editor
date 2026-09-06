ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY packages/collaboration/package.json packages/collaboration/package.json
COPY apps/collaboration-server/package.json apps/collaboration-server/package.json
RUN pnpm install --filter @tau/collaboration-server... --frozen-lockfile --ignore-scripts
COPY packages/collaboration packages/collaboration
COPY apps/collaboration-server apps/collaboration-server
RUN pnpm --filter @tau/collaboration-server build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/collaboration-server
RUN groupadd --gid 10001 tau && useradd --uid 10001 --gid tau --home-dir /app tau
COPY --from=build --chown=tau:tau /app/apps/collaboration-server/dist ./dist
COPY --from=build --chown=tau:tau /app/apps/collaboration-server/package.json ./package.json
COPY --from=build --chown=tau:tau /app/apps/collaboration-server/node_modules ./node_modules
COPY --from=build --chown=tau:tau /app/node_modules /app/node_modules
RUN mkdir -p /data && chown tau:tau /data
USER tau
RUN node -e "const D=require('better-sqlite3');const db=new D(':memory:');db.close()"
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3210/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
