-- Run explicitly in the wia_platform database; not part of app startup.
-- IAM data loading and integration with platform.orgs/teams are out of scope.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS wia_platform;

CREATE TABLE wia_platform.departments (
    dept_id VARCHAR(100) PRIMARY KEY,
    dept_level BIGINT,
    dept_name VARCHAR(200) NOT NULL,
    dept_parent VARCHAR(100),
    dept_seq BIGINT,
    manager VARCHAR(20),
    CONSTRAINT departments_level_unsigned CHECK (dept_level BETWEEN 0 AND 4294967295),
    CONSTRAINT departments_seq_unsigned CHECK (dept_seq BETWEEN 0 AND 4294967295)
);

COMMENT ON TABLE wia_platform.departments IS 'IAM 부서 정보 수신용 테이블. 데이터 연동은 별도 구현 예정.';
COMMENT ON COLUMN wia_platform.departments.dept_id IS '그룹코드 (기본키)';
COMMENT ON COLUMN wia_platform.departments.dept_level IS '조직 Level. IAM 코드 매핑은 연동 시 확정.';
COMMENT ON COLUMN wia_platform.departments.dept_name IS '그룹이름';
COMMENT ON COLUMN wia_platform.departments.dept_parent IS '상위 그룹 코드. 최상위 조직은 NULL 사용 예정.';
COMMENT ON COLUMN wia_platform.departments.dept_seq IS '정렬 순서';
COMMENT ON COLUMN wia_platform.departments.manager IS '그룹장 코드';
COMMIT;
