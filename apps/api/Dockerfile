# syntax=docker/dockerfile:1
# Production image for the API (ADR 0020). Build from the repository root:
#   docker build -f apps/api/Dockerfile --target api -t uzgo-api .
#   docker build -f apps/api/Dockerfile --target migrate -t uzgo-migrate .
ARG NODE_IMAGE=node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f

FROM ${NODE_IMAGE} AS base
ENV CI=1 PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Same pnpm as package.json "packageManager".
RUN npm install --global --no-fund --no-audit pnpm@12.11.2
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@uzgo/api..."
RUN pnpm --filter @uzgo/contracts build && pnpm --filter @uzgo/api build
# Production dependencies only; the Prisma client is already compiled into dist.
RUN pnpm --filter @uzgo/api deploy --prod --ignore-scripts /out

# One-shot tools image: `prisma migrate deploy` on every deploy, seed and
# grant-role scripts at install time. Never serves traffic.
FROM build AS migrate
WORKDIR /repo/apps/api
ENV NODE_ENV=production PATH=/repo/apps/api/node_modules/.bin:$PATH
USER node
# Other uses: `prisma db seed` (install), `tsx scripts/grant-role.ts` (first admin).
CMD ["prisma", "migrate", "deploy"]

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
WORKDIR /app
# Files are owned by root and read-only for the runtime user.
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
# Upload volume mount point (named volumes inherit this ownership).
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4000/api/v1/health/live || exit 1
CMD ["node", "dist/main.js"]
