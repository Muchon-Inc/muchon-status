# Astro 정적 사이트(starlight) 빌드 후 `serve` 로 띄우는 단순 구성.
# 빌드 컨텍스트는 monorepo 루트여야 한다 — pnpm workspace + turbo 가
# 필요해서 docs 디렉터리만으로는 빌드 불가.

# builder
FROM node:24-slim AS builder
ENV \
    NODE_ENV="production" \
    PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
WORKDIR /app
COPY --link . /app/
RUN <<EOF
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm turbo run build --filter=@openstatus/docs
EOF

# runtime: 정적 파일을 `serve` 로 노출. Railway 가 PORT 를 주입.
FROM node:24-slim AS runtime
WORKDIR /app
COPY --from=builder /app/apps/docs/dist /app/dist
RUN npm install -g serve@14
ENV PORT="3000"
EXPOSE 3000
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
