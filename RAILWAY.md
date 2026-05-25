# Railway 배포 가이드

이 모노레포를 Railway에 올리는 방법을 정리했어요. 한 프로젝트 안에 서비스를 여러 개 만들고, 같은 GitHub 저장소를 가리키도록 한 다음 서비스마다 다른 Dockerfile을 쓰는 구조입니다.

## 어떤 서비스를 올릴까

기본 구성은 다섯 개입니다. 각각 별도 Railway 서비스로 만드세요.

| Railway 서비스 | Config Path | 역할 |
|---|---|---|
| `dashboard` | `apps/dashboard/railway.toml` | 관리자 UI (Next.js) |
| `status-page` | `apps/status-page/railway.toml` | 공개 상태 페이지 (Next.js) |
| `server` | `apps/server/railway.toml` | 외부 REST/tRPC API (Hono on Bun) |
| `workflows` | `apps/workflows/railway.toml` | 모니터 스케줄러 / 백그라운드 잡 |
| `docs` | `apps/docs/railway.toml` | 문서 사이트 (Astro starlight, 정적) |

선택적으로 운영할 수 있는 것들:

| Railway 서비스 | Config Path | 비고 |
|---|---|---|
| `web` | `apps/web/railway.toml` | 마케팅 사이트 (Next.js). 보통 Vercel 에 두지만 Railway 에서도 동작. |
| `screenshot-service` | `apps/screenshot-service/railway.toml` | Playwright 기반 스크린샷 워커. 상태 페이지 OG 이미지가 필요할 때만. |

`docs` / `screenshot-service` / `web` 은 코어 운영에 필수가 아닙니다. 문서/스크린샷/마케팅이 필요 없으면 빼도 됩니다.

데이터베이스(LibSQL/Turso)는 Railway에 띄우지 않고 [Turso Cloud](https://turso.tech)에 별도로 만들어 쓰는 걸 권장합니다. 자체 호스팅하고 싶다면 Railway에 sqld 컨테이너를 하나 더 띄워도 되지만, 영속 볼륨과 백업까지 직접 챙겨야 해요.

Redis/QStash 같은 외부 의존성도 마찬가지로 Upstash 같은 매니지드 서비스를 그대로 쓰는 게 편합니다.

## 새 서비스 추가 체크리스트 (매번 그대로 따라하기)

Railway 가 서비스를 만들 때마다 monorepo 의 `package.json` 을 스캔해서 **자동으로 Build Command 와 Start Command 를 UI 에 채워 넣습니다**. 이 UI 값들은 `railway.toml` 과 Dockerfile 의 의도를 모두 덮어쓰기 때문에, **비워주지 않으면 배포가 거의 100% 깨집니다** (`pnpm` 이 runtime 이미지에 없어서 즉시 크래시, 또는 `next build` 가 turbo 의존성을 건너뛰어 빌드 실패).

서비스 하나 만들 때마다 다음 다섯 가지를 그대로 따라 주세요.

1. **Source 설정** (Settings → Source)
   - Repository: `Muchon-Inc/muchon-status`
   - Branch: 배포 브랜치 (보통 `main`)
   - Root Directory: `/` (비워둠)

2. **Config-as-Code File**
   - 서비스에 맞는 `apps/<service>/railway.toml` 경로 입력.
   - 입력란이 안 보이는 플랜이면 Variables 에 `RAILWAY_CONFIG_FILE=apps/<service>/railway.toml` 추가.
   - 이게 빠지면 Railpack 으로 fallback → monorepo 전체 빌드 → 거의 무조건 깨짐.

3. **Build Command 비우기** (Settings → Build)
   - Railway 가 자동으로 `pnpm turbo run build --filter=...` 또는 `next build` 같은 값을 채워둡니다. **완전히 지워서 빈 칸으로** 두세요.
   - Dockerfile 빌드를 쓰는 한 이 필드는 무시되는 게 정상.

4. **Start Command 비우기** (Settings → Deploy)
   - Railway 가 `pnpm --filter @openstatus/<service> start` 식으로 채워둡니다. **완전히 지워서 빈 칸으로** 두세요.
   - 런타임 이미지는 알파인/슬림 베이스라 `pnpm` 이 설치돼 있지 않아 그대로 두면 즉시 크래시.
   - 비우면 `railway.toml` 의 `[deploy].startCommand` (또는 Dockerfile CMD/ENTRYPOINT) 가 사용됩니다.

5. **환경변수 입력** (Variables 탭)
   - 아래 "서비스별 환경변수" 섹션의 목록을 그대로 붙여 넣습니다.

> 빌드 로그 첫 줄이 `$ turbo run build` (필터 없음) 으로 시작한다면 1~2번이 안 먹은 신호.
> 빌드 자체는 통과했는데 컨테이너가 `The executable pnpm could not be found` 로 죽는다면 4번을 빠뜨린 거예요.

## 빌드 타임 vs 런타임 환경변수

Next.js / Astro 같은 빌드 시스템은 `process.env.NEXT_PUBLIC_*` 또는 `import.meta.env.*` 값을 **빌드 단계에서 정적으로 인라인**합니다. 즉, Railway 의 Service Variables 에 적은 값은 컨테이너가 부팅할 때 들어오는 거고, 빌드 시점에는 들어오지 않습니다.

이 프로젝트는 두 가지 방식으로 빌드 깨짐을 방지합니다.

1. **Dockerfile 에 박힌 빌드 placeholder** — `apps/dashboard/Dockerfile`, `apps/status-page/Dockerfile` 에 `UPSTASH_REDIS_REST_URL=https://placeholder.upstash.io`, `NEXT_PUBLIC_OPENPANEL_CLIENT_ID=test` 같은 값이 ENV 로 들어가 있어 zod / SDK 검증이 빌드 시점에 통과합니다. 진짜 값은 런타임에 Railway Service Variables 가 덮어씁니다.
2. **모듈 레벨 부수효과 지연** — `packages/upstash/src/redis/client.ts` 의 Redis 싱글톤은 Proxy 로 감싸 첫 호출 시점까지 `Redis.fromEnv()` 실행을 미룹니다.

### 진짜 값으로 빌드해야 하는 경우 (예: OpenPanel 분석)

`NEXT_PUBLIC_*` 처럼 클라이언트 번들에 박히는 값은 런타임에 못 바꿉니다. 진짜 클라이언트 ID 를 쓰려면 Railway 서비스의 **Build Variables** (Settings → Build → Variables) 에 같은 이름으로 값을 주세요. Dockerfile 의 `ENV` 가 그 값으로 덮어써집니다.

이게 안 되면 Service Variables 에 넣고 매번 컨테이너가 새 placeholder 로 빌드된 번들을 받게 됩니다 — analytics 가 동작 안 함.

## 서비스별 환경변수

### 공통 (모든 서비스)

```
DATABASE_URL=libsql://<your-turso-host>
DATABASE_AUTH_TOKEN=<turso-token>
UPSTASH_REDIS_REST_URL=https://<upstash-host>
UPSTASH_REDIS_REST_TOKEN=<upstash-token>
NODE_ENV=production
```

Turso가 아니라 자체 sqld를 쓴다면 `DATABASE_URL=http://<service-name>.railway.internal:8080` 처럼 Railway 내부 네트워크 주소를 넣을 수 있습니다.

### dashboard

```
AUTH_SECRET=<openssl rand -base64 32 결과>
SELF_HOST=true
NEXT_PUBLIC_URL=https://<dashboard-도메인>
RESEND_API_KEY=<resend-key>
# 선택값: OAuth, Stripe, Tinybird 등
```

마이그레이션은 dashboard에서 돌리지 않습니다. `workflows`가 부팅 직후 자동으로 실행해요.

### status-page

```
NEXT_PUBLIC_URL=https://<status-도메인>
```

상태 페이지는 비로그인 트래픽이라 비밀값이 많지 않습니다. dashboard와 같은 DB / Redis를 봅니다.

### server (Hono API)

```
UNKEY_API_ID=<unkey-id>
UNKEY_TOKEN=<unkey-token>
TINY_BIRD_API_KEY=<tinybird-key>
RESEND_API_KEY=<resend-key>
CRON_SECRET=<랜덤 문자열>
SUPER_ADMIN_TOKEN=<랜덤 문자열>
AXIOM_TOKEN=<axiom-token>          # 로깅을 안 쓰면 빈 값
AXIOM_DATASET=<axiom-dataset>
FLY_REGION=self-hosted
QSTASH_TOKEN=<qstash-token>        # 백그라운드 잡 안 쓰면 빈 값
SCREENSHOT_SERVICE_URL=
```

`apps/server/src/index.ts`는 `process.env.PORT`(없으면 3000)에서 듣습니다. Railway가 알아서 PORT를 주입하므로 따로 지정하지 않아도 됩니다.

### workflows

```
GCP_PROJECT_ID=
GCP_LOCATION=
GCP_CLIENT_EMAIL=
GCP_PRIVATE_KEY=
CRON_SECRET=<server와 동일 값>
RESEND_API_KEY=<resend-key>
```

GCP Cloud Tasks를 쓰지 않으면 GCP 값은 빈 문자열로 둬도 됩니다(스케줄링 기능 일부가 비활성화됩니다).

### docs

런타임 환경변수는 필요 없습니다. 정적 사이트라 `serve` 가 빌드된 파일만 노출합니다.

OpenPanel analytics 를 활성화하려면 **Build Variables** 에 `NEXT_PUBLIC_OPENPANEL_CLIENT_ID=<id>` 를 넣으세요. 비워두면 analytics 만 비활성, 빌드는 통과 (envField 가 optional 로 잡혀 있음).

### screenshot-service (선택)

런타임 환경변수는 거의 필요 없습니다. 다른 서비스가 이 워커를 호출하도록 `server` 서비스의 `SCREENSHOT_SERVICE_URL` 을 `http://screenshot-service.railway.internal:3000` 으로 설정하세요.

### web (선택, 마케팅 사이트)

`apps/web/src/env.ts` 가 `skipValidation: true` 라 런타임 검증은 없지만, 기능을 켜려면 다음 변수들이 필요합니다.

```
# 공통 (DATABASE_URL/AUTH_TOKEN, UPSTASH_REDIS_*) 외에:
RESEND_API_KEY=<resend-key>
STRIPE_SECRET_KEY=<stripe-key>
STRIPE_WEBHOOK_SECRET_KEY=<stripe-webhook>
QSTASH_TOKEN=<qstash-token>
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
TINY_BIRD_API_KEY=<tinybird>
UNKEY_TOKEN=<unkey>
UNKEY_API_ID=<unkey-id>
GCP_PROJECT_ID= GCP_LOCATION= GCP_CLIENT_EMAIL= GCP_PRIVATE_KEY=
CLICKHOUSE_URL= CLICKHOUSE_USERNAME= CLICKHOUSE_PASSWORD=
CRON_SECRET=<공통 값>
NEXT_PUBLIC_URL=https://<web-도메인>
```

`NEXT_PUBLIC_*` (URL, STRIPE_PUBLISHABLE_KEY, OPENPANEL_CLIENT_ID, SENTRY_DSN) 는 빌드 시점에 번들에 인라인됩니다 — 진짜 값이 필요하면 Railway 의 **Build Variables** 에 추가하세요. 빈 placeholder 로 두면 해당 기능만 비활성, 빌드는 통과.

## 서비스별 빌드 타임 의존성

각 서비스가 빌드를 통과하려면 다음 변수들이 Dockerfile placeholder 또는 Build Variables 로 채워져 있어야 합니다 (이미 Dockerfile 에 더미 값이 들어가 있어 기본 빌드는 OK).

| 서비스 | 빌드 타임 필수 | 비고 |
|---|---|---|
| dashboard | `@openstatus/api` 의 createEnv 전체 (STRIPE_SECRET_KEY, PROJECT_ID_VERCEL, TEAM_ID_VERCEL, VERCEL_AUTH_BEARER_TOKEN, TINY_BIRD_API_KEY, RESEND_API_KEY, CRON_SECRET, UNKEY_TOKEN, UNKEY_API_ID), `@openstatus/emails` 의 RESEND_API_KEY, AUTH_SECRET, UPSTASH_REDIS_REST_URL/TOKEN, NEXT_PUBLIC_OPENPANEL_CLIENT_ID, NEXT_PUBLIC_URL | Dockerfile placeholder 로 모두 커버 |
| status-page | dashboard 와 동일한 createEnv 세트 | Dockerfile placeholder 로 모두 커버 |
| server | 없음 (`skipValidation: true`) | 런타임 검증만 |
| workflows | 없음 (모든 필드 `.prefault("")`) | 런타임 검증만 |
| docs | `NEXT_PUBLIC_OPENPANEL_CLIENT_ID` (optional 로 잡혀 있음) | envField default 로 통과 |
| web | env 검증은 `skipValidation: true` 라 OK. `NEXT_PUBLIC_*` 만 placeholder 필요 | Dockerfile placeholder 로 커버 |
| screenshot-service | 없음 | Playwright 만 필요 |

## 서비스 간 연결

같은 Railway 프로젝트의 서비스끼리는 `<service-name>.railway.internal` 주소로 통신할 수 있습니다. 외부 노출 도메인이 아니라 이쪽을 쓰면 egress 비용도 줄고 더 빠릅니다. 예시:

- dashboard → server: `INTERNAL_API_URL=http://server.railway.internal:3000`
- workflows → server: 같은 방식

내부 통신을 받으려면 각 서비스 Settings → Networking에서 **Private Networking** 을 활성화해야 합니다.

## 배포 절차

1. Railway 프로젝트를 만들고 GitHub 저장소를 연결합니다.
2. 서비스 4개를 추가하고 위 표에 적은 Config Path 를 각각 지정합니다.
3. 서비스마다 필요한 환경변수를 입력합니다.
4. 첫 배포가 끝나면 `workflows` 로그에서 마이그레이션이 정상적으로 끝났는지 확인합니다.
   ```
   Running database migrations...
   Migrated successfully
   ```
5. dashboard 도메인에 접속해 매직 링크 로그인을 시도합니다(`SELF_HOST=true` 라면 이메일로 링크가 옵니다).

## 자주 막히는 곳

- **`https://`로 시작하지 않는 URL 오류**: Upstash 자격 증명이 비어 있거나 빌드 ENV가 덮어쓰여진 경우입니다. Railway 환경변수에서 `UPSTASH_REDIS_REST_URL` 값이 `https://...` 형태인지 확인하세요.
- **헬스체크 실패**: 첫 부팅 시간이 길어지면 `apps/<service>/railway.toml`의 `healthcheckTimeout` 을 늘려 보세요. 마이그레이션이 무거우면 workflows는 60초로는 빠듯할 수 있습니다.
- **빌드 컨텍스트 누락**: "no such file or directory" 류 에러가 나면 Root Directory가 비어 있는지(루트가 컨텍스트인지) 다시 확인합니다. `apps/dashboard` 같은 하위 경로로 잡히면 모노레포 의존성이 보이지 않습니다.
- **마이그레이션이 안 돈다**: workflows가 살아 있는지 확인하고, 죽었다면 로그에서 DB 접근 실패 원인을 봅니다. dashboard만 띄우고 workflows를 빼면 DB가 빈 상태로 남아 로그인이 깨집니다.
- **`--mount=type=bind` 또는 cache mount id 에러**: Railway 의 이미지 빌더는 `type=bind` 를 거부하고 `type=cache` 도 `id=s/<service-id>-<target>` 을 요구합니다. 모든 mount 는 제거된 상태(2026-05 작업)지만, 새 Dockerfile 을 추가할 때도 mount 를 쓰지 마세요.
- **Astro/Next.js envField required 에러**: 빌드 시점에 검증되는 env 가 비어서 깨지는 케이스. Dockerfile 에 placeholder 로 박혀 있는지, 혹은 envField/createEnv 정의를 `optional` 로 바꿔야 하는지 위 매트릭스를 참고하세요.
- **`The executable pnpm could not be found`** (런타임에 즉시 크래시): Railway UI 의 Start Command 가 `pnpm --filter @openstatus/<service> start` 로 자동 채워진 상태로 배포된 신호. Settings → Deploy → Start Command 를 **완전히 비워서** 저장하면 railway.toml 의 `startCommand` 또는 Dockerfile CMD/ENTRYPOINT 가 사용됩니다.
- **`Cannot find module '@openstatus/react'`** 같은 워크스페이스 패키지 누락: UI 의 Build Command 가 `next build` 직접 호출로 자동 채워져 turbo 의존성을 건너뛴 신호. Settings → Build → Build Command 를 비우면 Dockerfile 빌드 (turbo --filter 포함) 가 정상 실행됩니다.
