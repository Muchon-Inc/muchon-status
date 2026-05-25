FROM node:22-bookworm as dep

RUN npx -y playwright@1.46.0 install --with-deps

RUN npm install -g bun

RUN npm install -g pnpm

WORKDIR /app

COPY . .

# To keep the image small AND keep the workspace resolvable: anything that
# depends on a package we're about to delete must also be deleted. We remove
# packages/api here, so the apps that declare it as a workspace dependency
# (dashboard, status-page, web) must also go — otherwise pnpm install
# discovers them via the workspace glob and fails with
# ERR_PNPM_WORKSPACE_PKG_NOT_FOUND.
RUN rm -rf /app/apps/docs \
  && rm -rf /app/apps/web \
  && rm -rf /app/apps/dashboard \
  && rm -rf /app/apps/status-page \
  && rm -rf /app/apps/server \
  && rm -rf /app/packages/api \
  && rm -rf /app/packages/integrations/vercel

RUN pnpm install
EXPOSE 3000

WORKDIR /app/apps/screenshot-service
CMD ["bun", "start"]
