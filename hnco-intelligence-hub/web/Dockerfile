# HN.CO Intelligence Hub — web (Next.js standalone).
# Build from the hnco-intelligence-hub folder so ../shared/catalog.json is available:
#   docker build -f web/Dockerfile -t hnco-web .
FROM node:22-alpine AS deps
WORKDIR /srv/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /srv/web
COPY shared /srv/shared
COPY --from=deps /srv/web/node_modules ./node_modules
COPY web/ ./
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time (public identifiers only — never secrets).
ARG NEXT_PUBLIC_ENTRA_CLIENT_ID=""
ARG NEXT_PUBLIC_ENTRA_TENANT_ID=""
ARG NEXT_PUBLIC_ENTRA_API_SCOPE=""
ENV NEXT_PUBLIC_ENTRA_CLIENT_ID=$NEXT_PUBLIC_ENTRA_CLIENT_ID \
    NEXT_PUBLIC_ENTRA_TENANT_ID=$NEXT_PUBLIC_ENTRA_TENANT_ID \
    NEXT_PUBLIC_ENTRA_API_SCOPE=$NEXT_PUBLIC_ENTRA_API_SCOPE \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /srv/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S hnco && adduser -S hnco -G hnco
COPY --from=build --chown=hnco:hnco /srv/web/.next/standalone ./
COPY --from=build --chown=hnco:hnco /srv/web/.next/static ./.next/static
COPY --from=build --chown=hnco:hnco /srv/web/public ./public
USER hnco
EXPOSE 3000
# HNCO_API_URL (server-side only) points the /api/hub proxy at the backend, e.g. http://api:8000
CMD ["node", "server.js"]
