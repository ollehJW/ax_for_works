# Confluence Studio

운영 접속 주소는 https://axforwork.wia.co.kr/confluencestudio/ 이다. 플랫폼 게이트웨이가 로그인 세션을 확인하고, 로그인이 필요하면 플랫폼 로그인 화면으로 이동한 뒤 Studio로 복귀한다. 프런트엔드는 기본 포트 1008에서 서비스 경로 아래의 API 요청을 루프백 백엔드(1018)로 전달한다.

## 실행

1. `pip install -r requirements.txt`로 서비스 전용 환경을 준비한다.
2. 운영 데이터베이스에 `backend/schema.sql`을 적용한다. 서비스는 `platform.sessions`와 `platform.accounts`를 조회하고 `confluence_studio.connections`에 연결 정보를 저장한다.
3. 서비스 전용 Fernet 키를 한 번 생성해 저장소 밖에 권한 0600으로 보관한다. 기존 토큰을 복호화할 때 같은 키가 필요하다. 예: `(umask 077; set -C; python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())' > /private/service/token.key)`.
4. 비공개 환경 파일에 `AX_DB_HOST`, `AX_DB_PORT`, `AX_DB_NAME`, `AX_DB_USER`, `AX_DB_PASSWORD`, `STUDIO_KEY_FILE`(키 파일 경로), `CONFLUENCE_BASE_URL`(신뢰하는 Confluence HTTPS 주소)을 지정한다.
5. 서비스 디렉터리에서 `python -m uvicorn backend.main:app --host 127.0.0.1 --port 1018 --env-file /private/service/backend.env --no-access-log`와 `npm start`를 실행한다. 로그인 페이지 주소는 `PLATFORM_LOGIN_URL`로 설정할 수 있다.

## 연결 확인

`GET /api/health`는 DB 테이블과 암호화 키 준비 상태를 확인한다. 화면을 열면 저장된 토큰으로 Confluence의 현재 사용자 프로필을 조회한다. 최초 연결과 만료 시에는 입력 폼을, 일시적인 통신 장애 시에는 재시도 버튼을 표시한다. 토큰 교체는 새 토큰으로 프로필 확인에 성공한 후 반영된다.
