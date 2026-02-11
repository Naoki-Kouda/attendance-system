// init-db.js
const { Client } = require('pg');
const bcrypt = require('bcrypt'); // パスワード暗号化用

// External Database URL
const connectionString = 'postgresql://codiq_admin:Euzpcv8KMHsq0Z1p39TXYGyapMPMs6eb@dpg-d5sc12n18n1s73cbpmi0-a.oregon-postgres.render.com/attendance_db_mzlq';

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false },
});

async function initDatabase() {
  try {
    await client.connect();
    console.log('データベースに接続しました。テーブル構成を更新します...');

    // 1. 企業テーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. 管理者テーブル（★今回追加！）
    // 会社(company_id)に紐づく管理者アカウントです
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        username VARCHAR(50) UNIQUE NOT NULL, -- ログインID
        password_hash VARCHAR(255) NOT NULL,  -- 暗号化されたパスワード
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. ユーザーテーブル（従業員）
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name VARCHAR(255) NOT NULL,
        face_descriptor TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. 打刻履歴テーブル
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ テーブル作成完了！');

    // --- 初期データの投入 ---

    // 1. 辻衞組の作成（なければ）
    const companyRes = await client.query(`
      INSERT INTO companies (name)
      SELECT '有限会社辻衞組'
      WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = '有限会社辻衞組')
      RETURNING id;
    `);
    
    // 既に存在する場合はIDを取得し直す
    let companyId;
    if (companyRes.rows.length > 0) {
      companyId = companyRes.rows[0].id;
      console.log(`✅ 企業データ作成: ID ${companyId}`);
    } else {
      const res = await client.query("SELECT id FROM companies WHERE name = '有限会社辻衞組'");
      companyId = res.rows[0].id;
      console.log(`ℹ️ 企業データ確認: ID ${companyId}`);
    }

    // 2. 初期管理者の作成（ID: admin, Pass: password123）
    // ※本番運用前に必ず変更する前提の仮パスワードです
    const checkAdmin = await client.query("SELECT * FROM admins WHERE username = 'admin'");
    
    if (checkAdmin.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('password123', 10); // パスワードを暗号化
      await client.query(`
        INSERT INTO admins (company_id, username, password_hash)
        VALUES ($1, 'admin', $2)
      `, [companyId, hashedPassword]);
      console.log('✅ 初期管理者を作成しました (ID: admin / Pass: password123)');
    } else {
      console.log('ℹ️ 管理者は既に存在します');
    }

    await client.end();
  } catch (err) {
    console.error('❌ エラーが発生しました:', err);
  }
}

initDatabase();
