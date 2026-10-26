# Self-hosted deletewe.
#
# Everything runs in one Node process: the web app, the job queue, the cron
# sweep, and the SQLite database. No cloud account, no paid service, no native
# build step — node:sqlite is built in.

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY packages/schema/package.json      packages/schema/
COPY packages/catalog/package.json     packages/catalog/
COPY packages/engine/package.json      packages/engine/
COPY packages/browser/package.json     packages/browser/
COPY packages/adapters-node/package.json packages/adapters-node/
COPY packages/adapters-cf/package.json packages/adapters-cf/
COPY packages/web/package.json         packages/web/
COPY packages/cli/package.json         packages/cli/
COPY apps/worker/package.json          apps/worker/
COPY apps/selfhost/package.json        apps/selfhost/
COPY apps/mock-broker/package.json     apps/mock-broker/
COPY tests/package.json                tests/

RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    DELETEWE_DATA_DIR=/data \
    PORT=8787

RUN addgroup -S deletewe && adduser -S -G deletewe deletewe \
    && mkdir -p /data && chown -R deletewe:deletewe /data

COPY --from=build --chown=deletewe:deletewe /app/node_modules ./node_modules
COPY --from=build --chown=deletewe:deletewe /app/packages ./packages
COPY --from=build --chown=deletewe:deletewe /app/apps ./apps
COPY --from=build --chown=deletewe:deletewe /app/package.json ./package.json

USER deletewe
VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/selfhost/dist/main.js"]
