// db-test.js
const { Client } = require('pg');

// Renderからコピーした「External Database URL」をここにセット
// 注意: 文字列なので '' で囲ってください
const connectionString = 'postgresql://codiq_admin:Euzpcv8KMHsq0Z1p39TXYGyapMPMs6eb@dpg-d5sc12n18n1s73cbpmi0-a.oregon-postgres.render.com/attendance_db_mzlq';

const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false, // RenderのDB接続にはこれが必要です
  },
});

async function testConnection() {
  try {
    console.log('接続を試みています...');
    await client.connect();
    console.log('✅ 成功！PostgreSQLデータベースに接続できました。');
    
    // 現在時刻を取得してみるテスト
    const res = await client.query('SELECT NOW()');
    console.log('データベース時刻:', res.rows[0].now);
    
    await client.end();
  } catch (err) {
    console.error('❌ 接続失敗:', err);
  }
}

testConnection();
