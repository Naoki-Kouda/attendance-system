// server.js (PostgreSQL対応・商用版v1)
// 既存の機能を維持しつつ、データ保存先をJSONからDBへ移行
const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// =================================================================
// ★ここに Renderの「External Database URL」を貼り付けてください
// =================================================================
const connectionString = 'postgresql://codiq_admin:Euzpcv8KMHsq0Z1p39TXYGyapMPMs6eb@dpg-d5sc12n18n1s73cbpmi0-a.oregon-postgres.render.com/attendance_db_mzlq';

// データベース接続設定
const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }, // Render接続用必須設定
});

// サーバー起動時にDB接続
client.connect()
  .then(() => console.log('✅ PostgreSQL Database Connected! (商用版モード)'))
  .catch(err => console.error('❌ DB Connection Error:', err));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ----------------------------------------------------
// API: ユーザー登録
// ----------------------------------------------------
app.post('/api/register-user', async (req, res) => {
  const { name, faceDescriptor } = req.body;
  if (!name || !faceDescriptor) return res.status(400).json({ error: 'データ不足' });

  try {
    // 顔データ(配列)をJSON文字列に変換して保存
    const descriptorStr = JSON.stringify(faceDescriptor);
    
    // 現在は初期導入企業「辻衞組 (company_id=1)」として登録
    const query = `
      INSERT INTO users (company_id, name, face_descriptor)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const result = await client.query(query, [1, name, descriptorStr]);
    console.log(`[DB保存] 新規ユーザー登録: ${name} (ID: ${result.rows[0].id})`);
    
    res.json({ success: true, userId: result.rows[0].id });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ error: 'データベースエラーが発生しました' });
  }
});

// ----------------------------------------------------
// API: 登録済みユーザーの顔データ取得 (アプリ起動時)
// ----------------------------------------------------
app.get('/api/face-descriptors', async (req, res) => {
  try {
    const query = 'SELECT id, name, face_descriptor FROM users WHERE company_id = 1';
    const result = await client.query(query);

    // 既存アプリが期待する形式に変換
    const users = result.rows.map(row => ({
      id: row.id.toString(), // IDを文字列化（JSON版との互換性維持）
      name: row.name,
      descriptor: JSON.parse(row.face_descriptor) // 文字列を配列に戻す
    }));

    res.json(users);
  } catch (err) {
    console.error('Fetch Users Error:', err);
    res.status(500).json({ error: 'データベースエラー' });
  }
});

// ----------------------------------------------------
// API: ユーザー一覧取得 (管理用)
// ----------------------------------------------------
app.get('/api/users', async (req, res) => {
  try {
    const query = 'SELECT id, name, created_at FROM users WHERE company_id = 1 ORDER BY id DESC';
    const result = await client.query(query);

    const users = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      registeredAt: row.created_at // JSON版のキー名に合わせる
    }));

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DBエラー' });
  }
});

// ----------------------------------------------------
// API: 打刻記録
// ----------------------------------------------------
app.post('/api/attendance', async (req, res) => {
  const { userId, userName, type, faceImage } = req.body;
  // 注: 契約に基づき、プライバシー保護のため顔画像(faceImage)はDBに保存しません
  
  try {
    const query = `
      INSERT INTO attendance_records (user_id, type)
      VALUES ($1, $2)
    `;
    // userIdを数値型に変換して保存
    await client.query(query, [parseInt(userId), type]);
    
    console.log(`[DB保存] 打刻: ${userName} (${type})`);
    res.json({ success: true });
  } catch (err) {
    console.error('Attendance Error:', err);
    res.status(500).json({ error: '打刻の保存に失敗しました' });
  }
});

// ----------------------------------------------------
// API: 打刻履歴の取得 (直近50件)
// ----------------------------------------------------
app.get('/api/attendance', async (req, res) => {
  try {
    // 最新50件を取得
    const query = `
      SELECT r.id, u.name as user_name, u.id as user_id, r.type, r.timestamp
      FROM attendance_records r
      JOIN users u ON r.user_id = u.id
      WHERE u.company_id = 1
      ORDER BY r.timestamp DESC
      LIMIT 50
    `;
    const result = await client.query(query);
    
    // JSON版のデータ構造と完全に一致させる
    const records = result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      userName: row.user_name,
      type: row.type,
      timestamp: row.timestamp,
      faceImage: null // 画像はDB保存しない仕様のためnullを返す
    }));

    res.json(records);
  } catch (err) {
    console.error('History Error:', err);
    res.status(500).json({ error: '履歴の取得に失敗しました' });
  }
});

// ----------------------------------------------------
// API: CSVダウンロード
// ----------------------------------------------------
app.get('/api/download-csv', async (req, res) => {
  try {
    // 全期間のデータを取得（古い順）
    const query = `
      SELECT u.name, r.type, r.timestamp
      FROM attendance_records r
      JOIN users u ON r.user_id = u.id
      WHERE u.company_id = 1
      ORDER BY r.timestamp ASC
    `;
    const result = await client.query(query);
    
    // 集計ロジック（既存のロジックをそのまま流用）
    const summary = {};
    
    result.rows.forEach(row => {
      const dateObj = new Date(row.timestamp);
      // JST時間を確保するためにtoLocaleStringを使用
      const dateStr = dateObj.toLocaleDateString('ja-JP');
      const timeStr = dateObj.toLocaleTimeString('ja-JP');
      
      const key = `${dateStr}_${row.name}`;

      if (!summary[key]) {
        summary[key] = { date: dateStr, name: row.name, clockIn: null, clockOut: null };
      }

      if (row.type === 'clock-in') {
        if (!summary[key].clockIn || timeStr < summary[key].clockIn) {
          summary[key].clockIn = timeStr;
        }
      } else if (row.type === 'clock-out') {
        if (!summary[key].clockOut || timeStr > summary[key].clockOut) {
          summary[key].clockOut = timeStr;
        }
      }
    });

    let csvContent = '\uFEFF日付,名前,出勤時刻,退勤時刻\n';
    
    // 日付順にソートして出力
    Object.values(summary)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach(row => {
        const inTime = row.clockIn || '--:--:--';
        const outTime = row.clockOut || '--:--:--';
        csvContent += `${row.date},${row.name},${inTime},${outTime}\n`;
      });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_db.csv');
    res.send(csvContent);

  } catch (err) {
    console.error('CSV Error:', err);
    res.status(500).send('CSV生成エラー');
  }
});

// フロントエンドの配信
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access here: http://localhost:${PORT}`);
});
