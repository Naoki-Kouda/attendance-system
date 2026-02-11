// init-db.js
const { Client } = require('pg');

// ★ここをあなたのExternal Database URLに書き換えてください
const connectionString = 'postgresql://codiq_admin:Euzpcv8KMHsq0Z1p39TXYGyapMPMs6eb@dpg-d5sc12n18n1s73cbpmi0-a.oregon-postgres.render.com/attendance_db_mzlq';

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false },
});

async function initDatabase() {
  try {
    await client.connect();
    console.log('データベースに接続しました。テーブルを作成します...');

    // SQLコマンド：テーブル（棚）を作成する命令
    const query = `
      -- 1. 企業テーブル（マルチテナントの親）
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 2. ユーザーテーブル（従業員情報）
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id), -- どの会社の社員か
        name VARCHAR(255) NOT NULL,
        face_descriptor TEXT NOT NULL, -- 顔の特徴量データ（画像そのものではなく数値データ）
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 3. 打刻履歴テーブル
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id), -- 誰の打刻か
        type VARCHAR(50) NOT NULL, -- 'clock-in' (出勤) か 'clock-out' (退勤)
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await client.query(query);
    console.log('✅ テーブル作成完了！(companies, users, attendance_records)');

    // ついでに、最初の企業「辻衞組」を作成しておきます
    const insertCompany = `
      INSERT INTO companies (name)
      SELECT '有限会社辻衞組'
      WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = '有限会社辻衞組');
    `;
    await client.query(insertCompany);
    console.log('✅ 初期企業データ「有限会社辻衞組」を作成しました。');

    await client.end();
  } catch (err) {
    console.error('❌ エラーが発生しました:', err);
  }
}

initDatabase();
