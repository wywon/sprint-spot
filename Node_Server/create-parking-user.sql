-- ==========================================
-- create-parking-user.sql
-- 이 프로젝트 전용 DB 계정을 만든다.
--
-- ⚠ 반드시 PDB(XEPDB1)에 접속한 상태에서 실행할 것.
--   CDB 루트에 접속하면 계정명이 C## 로 시작해야 해서 실패한다.
--
-- 실행 방법 (cmd):
--   sqlplus system/SYSTEM비밀번호@localhost:1521/XEPDB1
--   SQL> @C:\Git\Team-Project\Node_Server\create-parking-user.sql
--
-- 아래 비밀번호 parking1234 는 반드시 본인 것으로 바꾸세요.
-- ==========================================

-- 지금 어디에 접속했는지 확인 (XEPDB1 이 나와야 함)
SHOW CON_NAME;

-- 계정 생성
CREATE USER parking IDENTIFIED BY parking1234;

-- 접속 권한 + 테이블 생성 권한
GRANT CREATE SESSION TO parking;
GRANT RESOURCE TO parking;

-- 21c 에서는 RESOURCE 롤이 테이블스페이스 사용량을 주지 않으므로 따로 준다
ALTER USER parking QUOTA UNLIMITED ON USERS;

-- 확인
SELECT username, account_status
  FROM dba_users
 WHERE username = 'PARKING';

-- ==========================================
-- 만든 뒤 .env 를 이렇게 바꾼다
--
--   DB_USER=parking
--   DB_PASSWORD=parking1234
--   DB_CONNECT_STRING=localhost:1521/XEPDB1
--
-- 그리고 node db-test.js 를 다시 실행해서 접속되는지 확인.
-- ==========================================
