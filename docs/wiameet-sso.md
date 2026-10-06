# H200 WiaMeet 통합 로그인 (2026-10-06)

개발 서버에만 반영했습니다. WiaReport는 변경하지 않았습니다.

- WiaMeet의 `/wiameet/agent`는 플랫폼 `/login?next=...`로 이동한 뒤 원래 경로로 복귀합니다.
- `frontend/src/loginDestination.js`가 WiaMeet 경로를 허용합니다. 외부 주소와 비슷한 접두 경로는 거부합니다.
- H200의 실제 `/data/ax_for_works/config/config.yaml`에서 `/wiameet` 경로의 `require_login`은 `true`입니다.
- 업스트림은 기존 `https://axforwork.wia.co.kr:31001`이며 WiaMeet 프론트 1001, 백엔드 1011을 유지합니다.
- 공통 `ax_platform_session` 쿠키의 Path=/를 유지합니다. WiaMeet 로그아웃도 해당 platform 세션을 폐기합니다.
- WiaMeet의 개인 계정/세션은 platform 스키마를 참조하고, 팀 소유 업무 자료는 wiameet 스키마를 사용합니다.
- WiaMeet DB 설정은 `/data/wiameet/config/database.yaml`, 비밀 값은 `/data/wiameet/postgresql-runtime.env`입니다.
- 필요한 업무 테이블 17개, 2,404행을 최종 스냅샷과 전체 대조했습니다. 사용자·비밀번호·기존 인증 세션은 이관하지 않았습니다.
- 88개 팀을 기존 작업 공간에 연결했습니다. DEP, ICT지원팀, 로보틱스사업전략팀, 테스트는 통합 팀 확인 전까지 기존 데이터를 보존합니다.

WiaMeet 저장소의 `docs/postgresql-platform-auth.md`에 이관, 검증, 백업과 운영 방법을 기록했습니다.
실제 브라우저에서 로그인 복귀, 세 서비스 공통 인증, 직접 31001 접속, 전체 로그아웃 및 관리자 팀 기능을 확인했습니다.
