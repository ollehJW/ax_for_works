# Confluence Studio

운영 접속 주소는 https://axforwork.wia.co.kr/confluencestudio/ 이다. 플랫폼 게이트웨이가 로그인 세션을 확인하고, 로그인이 필요하면 플랫폼 로그인 화면으로 이동한 뒤 Studio로 복귀한다. 프런트엔드는 기본 포트 1008에서 서비스 경로 아래의 API 요청을 루프백 백엔드(1018)로 전달한다.

## 실행

1. `pip install -r requirements.txt`로 서비스 전용 환경을 준비한다.
2. 운영 데이터베이스에 `backend/schema.sql`을 적용한다. 서비스는 `platform.sessions`와 `platform.accounts`를 조회하고 `confluence_studio.connections`에 연결 정보를 저장한다.
3. 서비스 전용 Fernet 키를 한 번 생성해 저장소 밖에 권한 0600으로 보관한다. 기존 토큰을 복호화할 때 같은 키가 필요하다. 예: `(umask 077; set -C; python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())' > /private/service/token.key)`.
4. 비공개 환경 파일에 `AX_DB_HOST`, `AX_DB_PORT`, `AX_DB_NAME`, `AX_DB_USER`, `AX_DB_PASSWORD`, `STUDIO_KEY_FILE`(키 파일 경로), `CONFLUENCE_BASE_URL`(신뢰하는 Confluence HTTPS 주소)을 지정한다.
5. 서비스 디렉터리에서 서비스 가상환경을 활성화한 뒤 `python ../ops/shared-llm.py confluencestudio -- python -m uvicorn backend.main:app --host 127.0.0.1 --port 1018 --env-file /private/service/backend.env --no-access-log`와 `npm start`를 실행한다. 로그인 페이지 주소는 `PLATFORM_LOGIN_URL`로 설정할 수 있다.

## 연결 확인

`GET /api/health`는 DB 테이블과 암호화 키 준비 상태를 확인한다. 화면을 열면 저장된 토큰으로 Confluence의 현재 사용자 프로필을 조회한다. 최초 연결과 만료 시에는 입력 폼을, 일시적인 통신 장애 시에는 재시도 버튼을 표시한다. 토큰 교체는 새 토큰으로 프로필 확인에 성공한 후 반영된다.

## 초안 작성과 미리보기

운영 백엔드는 플랫폼의 `ops/shared-llm.py confluencestudio -- <기존 실행 명령>`으로 실행한다. 공통 Azure 연결 설정은 기존 비공개 LLM 환경 파일에서 상속한다. Studio의 배포 모델은 그 파일의 `CONFLUENCESTUDIO_OPENAI_MODEL=gpt-6.1-sol`로 지정하며, 변경 후 Studio 백엔드를 재시작한다. 로컬에서도 같은 런처와 `--config` 옵션으로 개발용 설정 파일을 지정할 수 있다.

초안 생성에는 작성 요청과 첨부 자료의 텍스트를 사용한다. PDF와 Office에 포함된 지원 이미지(PNG/JPEG 등)는 시각 입력으로 전달하고 미리보기의 관련 문단에 표시한다. Markdown과 HTML의 외부 이미지는 설명과 URL을 자료로 사용한다. 형식별 지침은 backend/authoring/prompts에 있으며, 파일을 첨부하지 않으면 공통 지침만 적용한다. 서로 다른 이미지 48개, 추출 이미지 합계 20 MiB까지 지원한다. 첨부는 8 MiB, 추출 본문은 60,000자까지 지원한다. 1단계에서 자료 또는 작성 방식 프롬프트를 입력하고 스페이스와 상위 페이지를 선택한다. 초안을 생성하면 2단계로 이동한다. 왼쪽 채팅에서 수정 사항을 요청하면 오른쪽 문서에 반영되며 페이지 제목을 직접 입력할 수도 있다. 3단계에서 제목과 발행 위치를 확인한 뒤 페이지 발행을 누르면 선택한 상위 페이지 아래에 본문을 게시하고 이미지와 수식을 첨부한다. 미리보기는 개인 토큰으로 Confluence의 `contentbody/convert/view`를 호출하며 선택한 상위 페이지가 있으면 렌더링 문맥으로 전달한다. 렌더링한 본문의 표와 텍스트를 표시하고, 외부 리소스와 동적 매크로 실행은 제외한다.

복잡한 수식은 공통 프롬프트에서 `<p><code>latex: …</code></p>`로 요청한다. Studio는 로컬에서 수식을 PNG 첨부 참조로 변환하며, Storage Format의 `ac:alt`에 LaTeX 원식을 보존한다. 렌더링할 수 없는 표현은 원식으로 표시한다. 챕터 제목에는 일관된 번호 또는 글머리표를 사용하고, 본문의 독립된 문단·표·그림·목록·박스 사이에는 빈 문단 한 줄을 두며, 가이드에는 제목이 ‘가이드’인 기본 Tip 매크로를 사용한다.
