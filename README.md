# AX for Works

`Main.dc.html` 목업을 바탕으로 만든 업무용 AI Agent 통합 진입 플랫폼입니다.
React 프론트엔드와 Python FastAPI 백엔드를 사용하며, 운영에서는 Python이 빌드된 화면과 API를 HTTPS로 함께 제공합니다.
**PC 전용**이며 최소 너비 1280px을 유지합니다. 모바일 반응형 레이아웃은 제공하지 않습니다.

## 접속과 Agent

포털: **https://dev-axforwork.wia.co.kr/** (443)

| Agent | 프로젝트 | 연결 주소 |
| --- | --- | --- |
| WiaMeet | `../meeting_write_agent` | https://dev-axforwork.wia.co.kr:9702/ |
| WiaReport | `../weekly_report` | https://dev-axforwork.wia.co.kr:9602/ |
| WiaNews | `../wianews` | https://dev-axforwork.wia.co.kr/wianews/ |
| WiaCoding | `../wiacoding` | https://dev-axforwork.wia.co.kr/wiacoding/ |

WiaNews와 WiaCoding은 포털의 `/wianews/`, `/wiacoding/` 하위 경로로 제공합니다.
끝의 `/`가 없는 주소는 `/`가 붙은 주소로 308 이동하며 쿼리는 유지합니다.
WiaNews 소개는 `/wianews/`, 실제 서비스는 `/wianews/agent`입니다. 기존 `/wianews/#app`은 서비스 주소로 자동 전환됩니다.
WiaCoding 소개는 `/wiacoding/`, 실제 서비스는 `/wiacoding/agent`입니다. 기존 `/wiacoding/#app`은 서비스 주소로 자동 전환됩니다.
기존 `:9802`, `:9902` 주소도 지원하고 WiaMeet/WiaReport 주소는 기존 포트를 유지합니다.

`backend/gateway.py`가 `config/config.yaml`의 경로·대상 주소를 읽어 경로 접두사를 제거하고 요청을 전달합니다.
현재 WiaNews/WiaCoding의 기존 HTTPS 프론트엔드(9802/9902)가 등록되어 있습니다.
API와 응답 스트리밍을 중계합니다. 공통 `ax_platform_session` 쿠키는 `Path=/`를 유지하고 그 외 서비스 쿠키는 서비스별 경로로 변환합니다.
게이트웨이 HTTP 연결 풀에는 사용자 로그인 쿠키를 저장하지 않습니다. WiaNews/WiaCoding은 포털 로그인 세션을 함께 사용합니다.
상위 포털 전용 CSP를 Agent에 덮어쓰지 않아 서비스의 영상·뉴스 이미지·미리보기 동작을 유지합니다.
두 서비스 프론트엔드는 상대 자산 경로(`base: './'`)와 `serviceUrl`로 포털 경로/기존 주소를 모두 지원합니다.

포털·WiaNews·WiaCoding은 PostgreSQL `wia_platform.platform`의 계정과 세션을 공유합니다. WiaMeet/WiaReport 인증은 기존 방식입니다.
캐러셀의 업무 결과는 목업에서 가져온 **예시 화면**입니다. 공지사항은 현재 빈 상태를 안내합니다.

## 포털 로그인과 PostgreSQL

미인증 접속은 `/login`으로 이동합니다. 서비스 직접 접속은 `/login?next=/wianews/agent`처럼 원래 경로를 보존하며 로그인 후 해당 서비스로 돌아갑니다. 외부 주소는 복귀 경로로 허용하지 않습니다.
초기 비밀번호 변경이 필요한 사용자는 변경을 완료해야 포털을 사용할 수 있습니다.

- DB: `wia_platform`, 스키마: `platform`
- `platform.teams`, `platform.roles`, `platform.users`: WiaNews의 필드와 관계를 유지합니다.
- PostgreSQL에서는 계정 상태를 BOOLEAN, 날짜를 TIMESTAMPTZ로 저장합니다.
- `platform.sessions`, `platform.login_attempts`: 세 서비스 공통 로그인 세션과 실패 제한을 관리합니다.
- PBKDF2-SHA256 600,000회 비밀번호 해시, 8시간 세션, 사번당 10회/IP당 40회 실패 시 15분 제한입니다.
- 쿠키는 `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`이며 원문 토큰 대신 SHA-256 해시를 DB에 저장합니다.
- 비밀번호 변경 시 기존 세션을 폐기하고 현재 브라우저에 새 세션을 발급합니다.

`.env.example`을 참고해 `.env`에 접속 정보를 넣고 권한을 `600`으로 설정하세요.
`.env`는 Git 및 Docker 빌드에서 제외되며 운영 컨테이너에 환경변수로 전달됩니다.
DB 호스트는 **컨테이너에서 접근 가능한 주소**여야 합니다. 호스트 PostgreSQL이 `127.0.0.1:5432`에만
리스닝하는 경우, Docker 컨테이너의 `127.0.0.1`은 해당 DB 서버가 아니므로 배포 전 연결 구성이 필요합니다.

DB 연결을 확인한 뒤 WiaNews 계정을 이관합니다.

```bash
.venv/bin/python -m backend.import_accounts
.venv/bin/python -m backend.check_database
```

이관은 하나의 트랜잭션으로 수행합니다. 원본 SQLite는 읽기 전용으로 열고, 기존 ID·비밀번호 해시·관리자/활성 상태를 유지합니다.
이미 존재하는 플랫폼 ID는 덮어쓰지 않으며 다른 ID의 사번 충돌이 있으면 전체 작업을 롤백합니다.
원본의 로그인 세션/실패 횟수는 새 포털로 가져오지 않습니다. 플랫폼 테이블만 생성하고 기본 계정을 임의로 추가하지 않습니다.

`ops/start.sh`는 새 이미지에서 실제 마운트할 YAML 설정, DB 연결 및 활성 계정 존재 여부를 먼저 확인합니다.
검사가 실패하면 실행 중인 기존 포털을 중지하지 않습니다. DB 준비와 이관 완료 후 새 로그인 버전을 배포하세요.
`/api/health`는 프로세스/게이트웨이 상태, `/api/ready`는 계정 DB 준비 상태를 확인합니다.

## 운영

현재 서버의 Docker CLI로 빌드하고 실행합니다. 다른 Agent의 프로세스나 소스 수정은 필요하지 않습니다.

```bash
./ops/build.sh
./ops/start.sh

docker ps --filter name=ax-for-works
docker logs --tail 100 ax-for-works
docker restart ax-for-works
```

- 컨테이너 이름: `ax-for-works`, 이미지: `ax-for-works:local`
- 외부 `443` → 컨테이너 HTTPS `8443`. 일반 사용자 UID 1000, 읽기 전용 파일시스템으로 실행합니다.
- `unless-stopped` 정책으로 프로세스 종료 및 Docker 재시작 후 복구합니다. 수동 중지한 컨테이너는 자동 시작되지 않습니다.
- 정지: `docker stop ax-for-works`, 재시작: `docker start ax-for-works`
- 이미지 재배포: `./ops/build.sh && ./ops/start.sh` (컨테이너 교체 중 짧은 중단 발생)
- 상태 확인: `curl https://dev-axforwork.wia.co.kr/api/health`
- 상태 API는 포털 자체 상태입니다. 개별 Agent의 처리 상태나 가용성을 검사하지 않습니다.

기본 TLS 인증서 경로는 기존 도메인 인증서가 있는 `/home/wia/.local/share/wianews/tls`이며 **읽기 전용** 마운트합니다.
`fullchain.pem`, `privkey.pem`을 사용합니다. 인증서/개인 키는 소스나 이미지에 포함하지 않습니다.
인증서 교체 후 `docker restart ax-for-works`로 반영합니다. 도메인 인증서이므로 IP 대신 도메인으로 접속하세요.

다른 인증서 디렉터리를 사용할 때:

```bash
AX_TLS_DIR=/absolute/path/to/tls ./ops/start.sh
```

호스트의 공개 CA 신뢰 번들은 빌드 시 `.build/ca-certificates.crt`로 복사합니다.
사내 인증서 체인 검증을 유지하기 위한 것이며 Git에서 제외합니다.
해당 공개 번들은 컨테이너 내부의 기존 Agent HTTPS 인증서 검증에도 사용합니다.
다른 번들은 `AX_BUILD_CA_BUNDLE=/path/to/ca-bundle.crt ./ops/build.sh`로 지정합니다.

`compose.yaml`도 제공합니다. Compose 플러그인이 있는 환경에서만 사용하며, 위 CLI 실행 방식과 동시에 사용하지 마세요.
Compose 빌드 전 `mkdir -p .build && cp /etc/ssl/certs/ca-certificates.crt .build/ca-certificates.crt`로 공개 신뢰 번들을 준비하고 `docker compose up -d --build`를 실행합니다.

## 게이트웨이 추가 및 변경 (자동 반영)

**`config/config.yaml`**에서 관리합니다. 필드 설명과 복사할 수 있는 예시를 파일 안의 주석에 포함했습니다.
`gateways` 목록에 다음 형태의 항목을 추가하세요. 실제 서비스 주소와 포트로 변경해야 합니다.

```yaml
  - prefix: /newagent
    upstream: http://10.217.183.72:9912
    enabled: true
    redirect_hosts: []
    read_timeout_seconds: 660
```

저장 후 **다음 요청부터 적용**됩니다. 서비스 추가·주소 변경·비활성화·삭제 모두 재시작이나 이미지 재빌드가 필요 없습니다.
변경 전에 시작된 요청은 기존 설정으로 마무리됩니다. 설정 파일은 디렉터리 단위로 읽기 전용 마운트하므로
편집기가 파일을 새 파일로 교체하는 방식으로 저장해도 컨테이너에 반영됩니다.

- `https://dev-axforwork.wia.co.kr/newagent/api/health` → `http://10.217.183.72:9912/api/health`
- `enabled: false` 또는 항목 삭제 시 해당 게이트웨이를 제거합니다.
- 문법 오류, 중복 경로, 잘못된 주소, 오타 필드는 적용하지 않고 마지막 정상 설정을 유지합니다.
- `/api/health`의 `gateway_config.status`는 정상일 때 `ok`, 오류로 기존 설정 유지 시 `last_known_good`입니다.
- 세부 설정 오류는 `docker logs --tail 100 ax-for-works`에서 확인합니다. 최초 실행 시 유효한 설정이 없으면 시작하지 않습니다.

저장한 설정을 직접 검증할 수도 있습니다.

```bash
.venv/bin/python -c "from pathlib import Path; from backend.gateway_config import load_gateway_config; load_gateway_config(Path('config/config.yaml')); print('게이트웨이 설정 정상')"
```

새 서비스의 프론트엔드는 지정한 하위 경로에서 동작하도록 준비되어 있어야 합니다.
게이트웨이 등록은 서비스 내부의 고정 `/api`, `/assets` 주소를 자동 수정하지 않습니다.
포털 카드·소개 문구는 아래의 `agents.json`에서 별도로 관리합니다.

## Agent 추가 및 변경

`config/agents.json`의 항목을 복제해 다음을 수정합니다.

- 고유한 `id` (소문자 영문으로 시작, 영문/숫자/하이픈), `name`, `url` (HTTPS)
- `sub`, `desc`, `title`, `detail`: 카드와 소개 문구
- `color`, `tint`: 6자리 HEX 색상, `d`: SVG 아이콘 path
- `preview`, `meta`, `tag`, `row1`, `text1`, `row2`, `text2`, `note`: 예시 화면 문구
- `enabled`: `false`이면 목록에서 숨기고 진입 API도 404 처리

```bash
.venv/bin/python -c "from pathlib import Path; from backend.main import load_agents; load_agents(Path('config/agents.json')); print('설정 정상')"
docker restart ax-for-works
```

설정은 시작 시 검증하며 잘못된 URL, 중복 ID, 누락되거나 알 수 없는 필드는 시작 오류로 처리합니다.
설정 디렉터리를 읽기 전용으로 마운트하므로 목록/문구/주소 변경에는 이미지 재빌드가 필요하지 않습니다.
카드 수와 캐러셀은 목록에서 자동 생성됩니다.

## 로컬 개발

Python 3.12, Node.js 24 기준입니다.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
npm ci --prefix frontend

# 터미널 1
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 터미널 2
npm run dev --prefix frontend
```

http://127.0.0.1:5173 에서 개발 화면을 확인합니다. `/api`는 개발용 Python 서버로 프록시됩니다.
운영 화면은 `npm run build --prefix frontend`로 빌드합니다.

## 검증

```bash
npm run build --prefix frontend
.venv/bin/python -m unittest discover -s backend/tests -v
cd frontend
npx playwright install chromium
npm run test:e2e
```

브라우저 테스트는 8000 포트에서 임시 Python 서버를 시작하므로 개발 서버를 종료한 뒤 실행합니다.
기존 Chromium은 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chrome npm run test:e2e`로 지정할 수 있습니다.
실행 중인 배포를 테스트할 때는 `AX_TEST_URL=https://dev-axforwork.wia.co.kr npm run test:e2e`를 사용합니다.

- API: 등록된 Agent 연결, 비활성/미등록 차단, 임의 redirect 차단, Agent 추가, 빈 목록, 잘못된 설정, 소스 비노출
- 브라우저: PC 화면과 작은 화면에서의 PC 레이아웃 유지, 캐러셀/키보드/재생 제어, 안내창, API 오류 재시도

## 구조

- `frontend/src/`: React 화면, 로그인/비밀번호 변경 및 PC 스타일
- `backend/auth.py`: PostgreSQL 기반 로그인·세션·비밀번호 변경
- `backend/sql/platform.sql`: 계정 테이블 정의
- `backend/import_accounts.py`: WiaNews 계정 이관
- `backend/main.py`: Agent 레지스트리, 진입 API, 정적 파일 서비스
- `backend/gateway.py`: 설정 기반 HTTP/스트리밍 프록시
- `backend/gateway_config.py`: YAML 검증과 자동 재로딩
- `config/config.yaml`: 게이트웨이 경로·주소 및 주석 가이드
- `config/agents.json`: 확장 가능한 Agent 설정
- `ops/`: 이미지 빌드와 HTTPS 실행 스크립트
- `Main.dc.html`, `support.js`: 원본 디자인 참고 파일 (운영에 제공하지 않음)

실제 두 서비스와 연결한 브라우저 검증(영상 코덱을 포함하는 Chrome 필요):

```bash
AX_TEST_URL=https://dev-axforwork.wia.co.kr AX_TEST_AGENTS=1 \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm run test:e2e --prefix frontend
```

통합 로그인 브라우저 검증은 별도의 테스트 계정을 사용합니다. 운영 계정을 초기화하는 테스트를 실행하지 마세요.
포털 인증 통합 테스트는 운영과 분리된 PostgreSQL `wia_platform_test` DB와 `ax_test_admin` 역할을 사용합니다.
`AX_TEST_POSTGRES=1`과 `AX_DB_*` 환경변수를 지정하면 `backend/tests/test_auth.py`가 실행됩니다.
이 테스트는 전용 테스트 DB의 platform 테이블을 초기화하며, 지정된 테스트 DB/역할이 아니면 거부합니다.

포털 브라우저 테스트는 별도 테스트 계정을 `AX_E2E_PORTAL_EMPLOYEE`, `AX_E2E_EMPLOYEE`,
`AX_E2E_INITIAL_EMPLOYEE` 및 `AX_E2E_PASSWORD` 환경변수로 전달합니다.
초기 비밀번호 계정은 테스트 중 비밀번호가 변경되므로 운영 계정을 사용하지 마세요.
로컬 HTTPS 실행은 `AX_TEST_TLS_CERT`, `AX_TEST_TLS_KEY`로 인증서 경로를 전달합니다.
운영 URL 검사에서는 인증서 검증을 유지합니다.

## 호스트 내부 PostgreSQL 연결

현재 PostgreSQL은 `127.0.0.1:5432`에서만 접속을 받습니다. 포털 컨테이너는
Docker 내부 인터페이스 `172.17.0.1:15433`의 socat 연결을 통해 접근합니다.
DB 비밀번호 인증은 그대로 적용되며, 외부 인터페이스에는 DB 포트를 열지 않습니다.
호스트의 이관 도구는 `.env`의 `AX_DB_HOST`/`AX_DB_PORT`, 컨테이너는
`AX_CONTAINER_DB_HOST`/`AX_CONTAINER_DB_PORT`를 사용합니다.

```bash
# 최초 1회: socat 설치 및 사용자 systemd의 linger 활성화가 필요합니다.
systemctl --user link "$PWD/ops/ax-platform-db-bridge.service"
systemctl --user enable --now ax-platform-db-bridge.service
# DB 연결 검사 성공 후 포털을 교체합니다.
./ops/start.sh
```

이 서비스는 재부팅 후 자동 실행되며 Docker 인터페이스가 아직 없으면 재시도합니다.
Docker bridge 주소/서브넷이 달라지면 unit의 `bind`, `range`와 `.env`의 컨테이너 주소를
함께 수정하고 `systemctl --user daemon-reload` 및 서비스를 재시작하세요.
별도 DB 서버를 사용하는 경우 컨테이너 주소를 해당 서버로 변경하고 이 연결 서비스를 중지할 수 있습니다.

## WiaNews·WiaCoding 업무 DB

업무 데이터는 `wia_platform.wianews`(25개 테이블)와 `wia_platform.wiacoding`(13개 테이블)에 이관했습니다.
각 서비스의 `config.yaml`에서 host/port/name/user 및 password 또는 password_env를 설정합니다.
계정 테이블은 복제하지 않고 `platform`을 공통 참조합니다. 운영 설정과 이관 절차는
[WiaNews 가이드](../wianews/POSTGRESQL.md), [WiaCoding 가이드](../wiacoding/POSTGRESQL.md)를 참고하세요.
원본 SQLite와 전환 전 소스는 각 서비스의 `backups/postgres-cutover-*`에 보관합니다.
로그아웃과 비밀번호 변경·초기화로 폐기한 세션은 세 서비스에서 즉시 사용할 수 없습니다.

통합 로그인 회귀 검증은 실행 중인 테스트 서비스와 전용 일반 계정을 사용합니다.
`AX_TEST_SSO=1 AX_TEST_URL=https://호스트 AX_E2E_EMPLOYEE=테스트사번 AX_E2E_PASSWORD=테스트비밀번호 npm run test:e2e --prefix frontend -- sso.spec.js`
복귀 URL 검증은 `node --test frontend/tests/loginDestination.test.js`로 실행합니다.

## 로그인 화면의 계정 생성·패스워드 초기화

- 계정 생성: 사번, 비밀번호(확인 포함), 이름, 조직, 팀, 직급, 이메일을 입력합니다.
- 가입 추천 API `GET /api/auth/registration-options`는 로그인 없이 조직·팀·직급 문자열 목록만 제공합니다.
  임직원 이름·사번·이메일·계정 ID는 포함하지 않습니다. 조직·팀·직급은 각각 `platform.orgs`, `platform.teams`, `platform.roles`의 이름에서 중복·빈 값·`미지정`을 제외합니다.
  추천 목록에 없는 값은 직접 입력할 수 있습니다.
  조직은 `platform.orgs`에서 조회·생성하고 `platform.users.org_id`로 연결합니다. 조직이 연결되지 않은 계정도 로그인할 수 있습니다.
  신규 계정은 일반 사용자, 활성 상태, `must_change_password=false`로 생성합니다.
  사번 중복은 거부하며 비밀번호는 영문·숫자·특수문자를 포함한 8자 이상이어야 합니다.
- 패스워드 초기화: 사번과 이름이 일치하는 활성 계정만 `wia1234!`로 초기화합니다.
  공통 세션을 모두 폐기하고 `must_change_password=true`로 설정하여 다음 로그인에서 변경을 요구합니다.
  사번·이름 방식은 별도 본인 인증이 아니므로 해당 정보를 아는 사람이 초기화할 수 있습니다.
- 두 API는 CSRF 검사를 적용하며, 15분 동안 초기화 사번별 3회/IP별 20회,
  가입 IP별 20회로 성공·실패 요청을 함께 제한합니다.
- 운영 스키마 반영: `backend/sql/platform.sql`의 ADD COLUMN IF NOT EXISTS는 기존 계정과 호환됩니다.
- 브라우저 검증: 전용 테스트 DB에서 `AX_TEST_SELF_SERVICE=1`과
  `AX_SELF_SERVICE_EMPLOYEE`(새 테스트 사번)를 지정하고 `selfservice.spec.js`를 실행합니다.
  검증 중 계정을 생성하고 비밀번호를 변경하므로 실제 사용자의 사번을 지정하지 마세요.

## 공지사항 / 패치노트

- 상단 공지사항 메뉴의 두 탭에서 목록·제목 검색·페이지 이동·상세 보기를 제공합니다.
- 로그인한 사용자는 열람할 수 있으며, 초기 비밀번호 변경이 필요한 계정은 먼저 변경해야 합니다.
- `platform.users.is_admin`이 true인 관리자만 작성·수정할 수 있습니다. 본문은 서식 편집기에서 글자색·배경색·굵게·밑줄·목록 등을 적용할 수 있습니다. 기존 일반 텍스트 글도 유지됩니다.
- 게시글은 `platform.board_posts`에 보관합니다. 기존 서버 업데이트 시 `backend/sql/board.sql`을 DB에 적용한 뒤 배포하세요. 초기 DB 구성에는 자동 포함됩니다.

서식 편집 배포 시에도 `backend/sql/board.sql`을 적용해 `content_format` 컬럼을 추가하세요. 기본값은 `plain`이며 새 서식 글은 `html`로 저장합니다. 서버는 허용된 HTML 태그와 색상만 저장하고, 상세 화면에서도 HTML을 정화합니다.
