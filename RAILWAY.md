# Railway 배포 가이드

이 모노레포를 Railway에 올리는 방법을 정리했어요. 한 프로젝트 안에 서비스를 여러 개 만들고, 같은 GitHub 저장소를 가리키도록 한 다음 서비스마다 다른 Dockerfile을 쓰는 구조입니다.

## 어떤 서비스를 올릴까

기본 구성은 네 개입니다. 각각 별도 Railway 서비스로 만드세요.

| Railway 서비스 | Config Path | 역할 |
|---|---|---|
| `dashboard` | `apps/dashboard/railway.toml` | 관리자 UI (Next.js) |
| `status-page` | `apps/status-page/railway.toml` | 공개 상태 페이지 (Next.js) |
| `server` | `apps/server/railway.toml` | 외부 REST/tRPC API (Hono on Bun) |
| `workflows` | `apps/workflows/railway.toml` | 모니터 스케줄러 / 백그라운드 잡 |

데이터베이스(LibSQL/Turso)는 Railway에 띄우지 않고 [Turso Cloud](https://turso.tech)에 별도로 만들어 쓰는 걸 권장합니다. 자체 호스팅하고 싶다면 Railway에 sqld 컨테이너를 하나 더 띄워도 되지만, 영속 볼륨과 백업까지 직접 챙겨야 해요.

Redis/QStash 같은 외부 의존성도 마찬가지로 Upstash 같은 매니지드 서비스를 그대로 쓰는 게 편합니다.

## 서비스를 만들 때 공통으로 신경 쓸 것

각 서비스에서 Railway 대시보드의 **Settings → Source** 를 다음과 같이 맞춰 주세요. 빌드 컨텍스트가 모노레포 루트여야 합니다 — Dockerfile이 `COPY . /app/` 으로 전체 워크스페이스를 가져가기 때문입니다.

- **Repository**: `Muchon-Inc/muchon-status`
- **Branch**: 배포할 브랜치 (기본 `main`)
- **Root Directory**: `/` (비워두면 됩니다)
- **Config Path**: 서비스에 맞는 `apps/<service>/railway.toml` 경로
  - Settings 화면에 따로 입력란이 보이지 않으면 환경변수 `RAILWAY_CONFIG_FILE`에 같은 값을 넣어도 됩니다.

Dockerfile 경로와 헬스체크 경로는 각 `railway.toml`에 이미 들어 있어서 추가 설정은 필요 없어요.

## 빌드 타임 플레이스홀더 이슈

`apps/dashboard/Dockerfile`과 `apps/status-page/Dockerfile`에는 `UPSTASH_REDIS_REST_URL` 같은 변수들이 빌드 ENV로 박혀 있습니다. Next.js가 `/api/trpc/lambda/[trpc]` 같은 라우트를 분석할 때 `@openstatus/upstash`가 임포트되고, 예전엔 그 시점에 `Redis.fromEnv()`가 즉시 실행돼서 `"test"` 같은 값이 `@upstash/redis`의 `https://` 검증을 통과하지 못해 빌드가 깨졌습니다.

이제는 두 가지 안전장치를 두었습니다.

1. `packages/upstash/src/redis/client.ts`에서 Redis 클라이언트를 Proxy로 감싸 첫 호출 시점까지 생성을 미룹니다. 모듈만 import 해서는 SDK 검증이 트리거되지 않아요.
2. Dockerfile/dofigen 플레이스홀더도 `https://placeholder.upstash.io` 처럼 검증을 통과하는 값으로 바꿨습니다.

실제 Redis 자격 증명은 Railway에서 런타임 환경변수로 주입하면 됩니다. 빌드 ENV는 그대로 덮어써집니다.

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
