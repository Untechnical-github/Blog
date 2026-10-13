-- アクセス数の集計用テーブル。適用: npm run worker:db:init
-- どのテーブルも WITHOUT ROWID にして、書き込む行数を最小にしている
-- （D1 の無料枠は「1日に書き込める行数」に上限があるため）。

-- 日本時間の日付 × ページごとの表示回数。アクセスのたびに書くのはこのテーブルだけ。
-- 行数は「ページ数 × 日数」でしか増えない。
CREATE TABLE IF NOT EXISTS views (
  day   TEXT    NOT NULL,
  path  TEXT    NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
) WITHOUT ROWID;

-- ページごとの累計（2026-10-14〜）。1日1回の締め処理で、前日までの分をまとめて足し込む。
-- through_day は「何日の分まで足したか」。二重に足さないための目印。行数はページ数と同じ。
CREATE TABLE IF NOT EXISTS totals (
  path        TEXT    NOT NULL PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 0,
  through_day TEXT    NOT NULL DEFAULT ''
) WITHOUT ROWID;

-- 計算済みの順位（常に1行）。through_day の日までのデータで計算したもので、日付が変わるまで使い回す。
CREATE TABLE IF NOT EXISTS ranking_snapshot (
  id          INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
  computed_at INTEGER NOT NULL,
  through_day TEXT    NOT NULL DEFAULT '',
  ranking     TEXT    NOT NULL
) WITHOUT ROWID;
