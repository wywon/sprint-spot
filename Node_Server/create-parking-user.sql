-- ==========================================
-- create-parking-user.sql
-- 이 프로젝트 전용 DB 와 계정을 만든다. (MySQL 8.4)
--
-- ⚠ root 로 접속해서 실행할 것.
--
-- 실행 방법 (PowerShell):
--   mysql -u root -p
--   mysql> source C:/Git/Team-Project/Node_Server/create-parking-user.sql
--
--   ※ 경로의 \ 대신 / 를 쓴다.
--   ※ PowerShell 에서는 mysql ... < 파일 형식의 입력 연결이 되지 않는다.
--
-- 아래 '여기에비밀번호' 를 반드시 본인 것으로 바꾸세요.
--   ' (작은따옴표), # 은 쓰지 마세요. (SQL / .env 에서 문제가 됨)
--   바꾼 비밀번호를 이 파일에 저장한 채로 커밋하지 마세요.
--
-- 이미 만들어져 있으면 건너뛰므로 여러 번 실행해도 안전하다.
-- (기존 계정의 비밀번호는 바뀌지 않는다.)
-- ==========================================

-- 지금 root 로 접속했는지 확인
SELECT CURRENT_USER();

-- 데이터베이스 생성 (한글이 깨지지 않도록 utf8mb4)
CREATE DATABASE IF NOT EXISTS parking_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- 계정 생성. 'localhost' → 이 노트북에서만 접속 가능
CREATE USER IF NOT EXISTS 'parking_user'@'localhost' IDENTIFIED BY '여기에비밀번호';

-- parking_db 안에서만 권한을 준다.
--   서버는 SELECT, UPDATE 만 쓰지만
--   npm run db:init / db:reset 이 테이블을 만들고 지우므로 CREATE, DROP 도 준다.
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP
   ON parking_db.* TO 'parking_user'@'localhost';

-- 확인
SHOW GRANTS FOR 'parking_user'@'localhost';

-- ==========================================
-- 만든 뒤 .env 를 이렇게 맞춘다
--
--   DB_HOST=localhost
--   DB_PORT=3306
--   DB_USER=parking_user
--   DB_PASSWORD=(위에서 정한 비밀번호)
--   DB_NAME=parking_db
--
-- 그다음
--   npm run db:test   접속 확인
--   npm run db:init   테이블 + 1~10번 행 만들기
-- ==========================================
