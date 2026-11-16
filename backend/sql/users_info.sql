-- Run explicitly in the wia_platform database; not part of app startup.
-- PostgreSQL VARCHAR replaces the supplied Oracle VARCHAR2 type.
-- Lengths and keys are unspecified: all columns are unbounded and nullable.
-- IAM synchronization and links to existing application tables are not enabled.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS wia_platform;

CREATE TABLE wia_platform.users_info (
    emp_no VARCHAR,
    email VARCHAR,
    loginid VARCHAR,
    mobile VARCHAR,
    name VARCHAR,
    title VARCHAR,
    ex_pos_code VARCHAR,
    ex_pos_name VARCHAR,
    ex_duty_code VARCHAR,
    ex_duty_name VARCHAR,
    ex_grade_code VARCHAR,
    ex_grade_name VARCHAR,
    dept_level VARCHAR,
    dept_id VARCHAR,
    dept_name VARCHAR,
    ex_group_parent_code VARCHAR,
    ex_group_parent_name VARCHAR,
    ex_is_manager VARCHAR
);

COMMENT ON TABLE wia_platform.users_info IS 'IAM 사용자 정보 수신용 빈 테이블. 컬럼 길이 및 키 정책 미확정, 데이터 연동은 별도 구현 예정.';
COMMIT;
