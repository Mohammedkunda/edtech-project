# Build/run the ws-server out of the pnpm monorepo.
# Build context for this Dockerfile must be the REPO ROOT (not apps/ws-server),
# since it needs access to packages/shared and packages/db.
#
# Koyeb: when creating the service, set:
#   Dockerfile location: apps/ws-server/Dockerfile
#   (leave build context as the repo root / default)

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- deps ---------------------------------------------------------------
# Copy only manifests first so this layer is cached unless a dependency changes.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/ws-server/package.json apps/ws-server/package.json
# web's manifest is needed too, purely so pnpm can resolve the workspace glob —
# we never copy or build the actual Next.js app in this image.
COPY apps/web/package.json apps/web/package.json
# --ignore-scripts: the root package.json's postinstall (build:packages) would
# otherwise run right now and fail — at this point only manifests exist, not
# the actual src/ folders. The build stage below builds shared/db explicitly
# once the real source has been copied in, so skipping postinstall here is safe.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- build ---------------------------------------------------------------
FROM deps AS build
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/ws-server apps/ws-server

RUN pnpm --filter @localfirst/shared build \
 && pnpm --filter @localfirst/db build \
 && pnpm --filter ws-server build

# ---- runtime ---------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# @prisma/client is excluded from the tsup bundle (needs its native query
# engine), so node_modules has to come along. Everything else is inlined
# into apps/ws-server/dist/index.js by tsup.
#
# pnpm does NOT hoist dependencies into a flat root node_modules — each
# workspace package gets its own node_modules containing symlinks into the
# root .pnpm store. Both pieces are needed for those symlinks to resolve.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/ws-server/node_modules ./apps/ws-server/node_modules
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
COPY --from=build /app/apps/ws-server/dist ./apps/ws-server/dist
COPY --from=build /app/apps/ws-server/package.json ./apps/ws-server/package.json

WORKDIR /app/apps/ws-server

# Koyeb/Render inject PORT at runtime; index.ts already reads it.
EXPOSE 8080
CMD ["node", "dist/index.js"]
