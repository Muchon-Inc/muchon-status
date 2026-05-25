# syntax=docker/dockerfile:1.11
#
# Web (marketing) Next.js 빌드. dashboard / status-page 와 동일 구조.
# 핵심 차이:
#   - `pnpm turbo run build --filter=@openstatus/web` 으로 빌드해야
#     `@openstatus/react` 가 tsup 으로 먼저 빌드돼서 dist/index.d.ts 가
#     생긴다. `pnpm --filter @openstatus/web build` 만 호출하면 turbo
#     의존 그래프를 건너뛰어 TS check 단계에서 깨진다.
#   - NEXT_PUBLIC_* 는 빌드 시점에 번들에 인라인된다. 실제 값을 쓰려면
#     Railway 의 Build Variables 에 같은 이름으로 덮어쓰면 된다.

# builder
FROM node:24-slim AS builder
ENV \
    PATH="$PNPM_HOME:$PATH" \
    PNPM_HOME="/pnpm" \
    NODE_ENV="production" \
    SELF_HOST="true" \
    DATABASE_URL="http://libsql:8080" \
    DATABASE_AUTH_TOKEN="test" \
    UPSTASH_REDIS_REST_URL="https://placeholder.upstash.io" \
    UPSTASH_REDIS_REST_TOKEN="build-placeholder" \
    RESEND_API_KEY="test" \
    STRIPE_SECRET_KEY="test" \
    STRIPE_WEBHOOK_SECRET_KEY="test" \
    TINY_BIRD_API_KEY="test" \
    UNKEY_TOKEN="test" \
    UNKEY_API_ID="test" \
    QSTASH_CURRENT_SIGNING_KEY="test" \
    QSTASH_NEXT_SIGNING_KEY="test" \
    QSTASH_TOKEN="test" \
    CRON_SECRET="test" \
    CLICKHOUSE_URL="http://placeholder" \
    CLICKHOUSE_USERNAME="test" \
    CLICKHOUSE_PASSWORD="test" \
    GCP_PROJECT_ID="test" \
    GCP_LOCATION="europe-west1" \
    GCP_CLIENT_EMAIL="test" \
    GCP_PRIVATE_KEY="test" \
    NEXT_PUBLIC_URL="http://localhost:3000" \
    NEXT_PUBLIC_SENTRY_DSN="" \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder" \
    NEXT_PUBLIC_OPENPANEL_CLIENT_ID="test"
WORKDIR /app
COPY --link . /app/
RUN <<EOF
corepack enable
pnpm install --frozen-lockfile
pnpm turbo run build --filter=@openstatus/web
EOF

# runtime
FROM node:24-slim AS runtime
WORKDIR /app/apps/web
COPY --from=builder --chown=1000:1000 --chmod=555 --link \
    /app/apps/web/.next/standalone/apps/web/ ./
COPY --from=builder --chown=1000:1000 --link \
    /app/node_modules/ /app/node_modules/
COPY --from=builder --chown=1000:1000 --link \
    /app/apps/web/.next/static/ ./.next/static/
COPY --from=builder --chown=1000:1000 --link \
    /app/apps/web/public/ ./public/
USER 0:0
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1
CMD ["node", "server.js"]
