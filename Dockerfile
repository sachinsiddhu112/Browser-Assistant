FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm --filter @browser-assistant/backend install --frozen-lockfile --ignore-scripts
COPY apps/backend/tsconfig.json apps/backend/tsconfig.json
COPY apps/backend/src apps/backend/src
RUN pnpm --filter @browser-assistant/backend build \
 && pnpm --filter @browser-assistant/backend deploy --legacy --prod /runtime

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
COPY --from=build --chown=node:node /app/apps/backend/dist/ ./dist/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e 'fetch("http://127.0.0.1:"+process.env.PORT+"/health").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'
CMD ["node","dist/main.js"]
