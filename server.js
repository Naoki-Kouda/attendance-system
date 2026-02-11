// server.js (商用版v2: マルチテナント・ログイン対応)
const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const bcrypt = require('bcrypt'); // 追加：パスワード照合用
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// RenderのデータベースURL
const connectionString = 'postgresql://codiq_admin:Euzpcv8KMHsq0Z1p39TXYGyapMPMs6eb@dpg-d5sc12n18n1s73cbpmi0-a.oregon-postgres.render.com/attendance_db_mzlq';

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false },
});

client.connect()
  .then(() => console.log('✅ PostgreSQL Database Connected!'))
  .catch(err => console.error('❌ DB Connection Error:', err));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ----------------------------------------------------
// API: ログイン (新規追加)
// ----------------------------------------------------
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. IDで検索
    const query = 'SELECT * FROM admins WHERE username = $1';
    const result = await client.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'IDまたはパスワードが違います' });
    }

    const admin = result.rows[0];

    // 2. パスワード照合
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'IDまたはパスワードが違います' });
    }

    // 3. 会社情報を取得して返す
    const companyRes = await client.query('SELECT name FROM companies WHERE id = $1', [admin.company_id]);
    const companyName = companyRes.rows[0].name;

    // 成功！会社IDと名前を返す
    res.json({ 
      success: true, 
      companyId: admin.company_id,
      companyName: companyName
    });

  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'ログイン処理中にエラーが発生しました' });
  }
});

// ----------------------------------------------------
// API: ユーザー登録 (マルチテナント対応)
// ----------------------------------------------------
app.post('/api/register-user', async (req, res) => {
  // companyIdを受け取るように変更
  const { name, faceDescriptor, companyId } = req.body;
  
  if (!name || !faceDescriptor || !companyId) {
    return res.status(400).json({ error: 'データ不足' });
  }

  try {
    const descriptorStr = JSON.stringify(faceDescriptor);
    
    const query = `
      INSERT INTO users (company_id, name, face_descriptor)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    
    const result = await client.query(query, [companyId, name, descriptorStr]);
    console.log(`[DB保存] 新規ユーザー登録: ${name} (Company: ${companyId})`);
    
    res.json({ success: true, userId: result.rows[0].id });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ error: 'DBエラー' });
  }
});

// ----------------------------------------------------
// API: 顔データ取得 (マルチテナント対応)
// ----------------------------------------------------
app.get('/api/face-descriptors', async (req, res) => {
  const companyId = req.query.companyId; // URLパラメータから取得

  if (!companyId) return res.status(400).json({ error: '会社IDが必要です' });

  try {
    // 指定された会社の社員だけを取得
    const query = 'SELECT id, name, face_descriptor FROM users WHERE company_id = $1';
    const result = await client.query(query, [companyId]);

    const users = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      descriptor: JSON.parse(row.face_descriptor)
    }));

    res.json(users);
  } catch (err) {
    console.error('Fetch Users Error:', err);
    res.status(500).json({ error: 'DBエラー' });
  }
});

// ----------------------------------------------------
// API: 打刻記録 (変更なし)
// ----------------------------------------------------
app.post('/api/attendance', async (req, res) => {
  const { userId, type } = req.body;
  try {
    const query = `INSERT INTO attendance_records (user_id, type) VALUES ($1, $2)`;
    await client.query(query, [parseInt(userId), type]);
    res.json({ success: true });
  } catch (err) {
    console.error('Attendance Error:', err);
    res.status(500).json({ error: '打刻エラー' });
  }
});

// ----------------------------------------------------
// API: 履歴取得 (マルチテナント対応)
// ----------------------------------------------------
app.get('/api/attendance', async (req, res) => {
  const companyId = req.query.companyId;
  if (!companyId) return res.status(400).json({ error: '会社IDが必要です' });

  try {
    const query = `
      SELECT r.id, u.name as user_name, u.id as user_id, r.type, r.timestamp
      FROM attendance_records r
      JOIN users u ON r.user_id = u.id
      WHERE u.company_id = $1
      ORDER BY r.timestamp DESC
      LIMIT 50
    `;
    const result = await client.query(query, [companyId]);
    
    const records = result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      userName: row.user_name,
      type: row.type,
      timestamp: row.timestamp
    }));

    res.json(records);
  } catch (err) {
    console.error('History Error:', err);
    res.status(500).json({ error: '履歴エラー' });
  }
});

// ----------------------------------------------------
// API: CSVダウンロード (マルチテナント対応)
// ----------------------------------------------------
app.get('/api/download-csv', async (req, res) => {
  const companyId = req.query.companyId;
  if (!companyId) return res.status(400).send('会社IDが必要です');

  try {
    const query = `
      SELECT u.name, r.type, r.timestamp
      FROM attendance_records r
      JOIN users u ON r.user_id = u.id
      WHERE u.company_id = $1
      ORDER BY r.timestamp ASC
    `;
    const result = await client.query(query, [companyId]);
    
    const summary = {};
    result.rows.forEach(row => {
      const dateObj = new Date(row.timestamp);
      const dateStr = dateObj.toLocaleDateString('ja-JP');
      const timeStr = dateObj.toLocaleTimeString('ja-JP');
      const key = `${dateStr}_${row.name}`;

      if (!summary[key]) {
        summary[key] = { date: dateStr, name: row.name, clockIn: null, clockOut: null };
      }
      if (row.type === 'clock-in') {
        if (!summary[key].clockIn || timeStr < summary[key].clockIn) summary[key].clockIn = timeStr;
      } else if (row.type === 'clock-out') {
        if (!summary[key].clockOut || timeStr > summary[key].clockOut) summary[key].clockOut = timeStr;
      }
    });

    let csvContent = '\uFEFF日付,名前,出勤時刻,退勤時刻\n';
    Object.values(summary)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach(row => {
        const inTime = row.clockIn || '--:--:--';
        const outTime = row.clockOut || '--:--:--';
        csvContent += `${row.date},${row.name},${inTime},${outTime}\n`;
      });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
    res.send(csvContent);

  } catch (err) {
    console.error('CSV Error:', err);
    res.status(500).send('CSVエラー');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ログイン画面へのルート
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
