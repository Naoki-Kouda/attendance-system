const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// データファイルのパス
const DATA_FILE = path.join(__dirname, 'attendance_data.json');

// データファイルの初期化
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], records: [] }, null, 2));
}

// データの読み込み
function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('データ読み込みエラー:', error);
    return { users: [], records: [] };
  }
}

// データの保存
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('データ保存エラー:', error);
    return false;
  }
}

// ユーザー登録
app.post('/api/register-user', (req, res) => {
  const { name, faceDescriptor } = req.body;
  
  if (!name || !faceDescriptor) {
    return res.status(400).json({ error: '名前と顔データが必要です' });
  }

  const data = readData();
  const userId = Date.now().toString();
  
  data.users.push({
    id: userId,
    name: name,
    faceDescriptor: faceDescriptor,
    registeredAt: new Date().toISOString()
  });

  if (saveData(data)) {
    res.json({ success: true, userId, message: 'ユーザーを登録しました' });
  } else {
    res.status(500).json({ error: 'データの保存に失敗しました' });
  }
});

// ユーザー一覧取得
app.get('/api/users', (req, res) => {
  const data = readData();
  // 顔データを除外して送信
  const users = data.users.map(u => ({
    id: u.id,
    name: u.name,
    registeredAt: u.registeredAt
  }));
  res.json(users);
});

// 全ユーザーの顔データ取得（認証用）
app.get('/api/face-descriptors', (req, res) => {
  const data = readData();
  const descriptors = data.users.map(u => ({
    id: u.id,
    name: u.name,
    descriptor: u.faceDescriptor
  }));
  res.json(descriptors);
});

// 出退勤記録
app.post('/api/attendance', (req, res) => {
  const { userId, userName, type, faceImage } = req.body;
  
  if (!userId || !type) {
    return res.status(400).json({ error: '必要なデータが不足しています' });
  }

  const data = readData();
  const record = {
    id: Date.now().toString(),
    userId: userId,
    userName: userName,
    type: type, // 'clock-in' or 'clock-out'
    timestamp: new Date().toISOString(),
    faceImage: faceImage
  };

  data.records.push(record);

  if (saveData(data)) {
    res.json({ success: true, record, message: `${type === 'clock-in' ? '出勤' : '退勤'}を記録しました` });
  } else {
    res.status(500).json({ error: 'データの保存に失敗しました' });
  }
});

// 出退勤記録取得
app.get('/api/attendance', (req, res) => {
  const data = readData();
  // 最新50件を返す
  const records = data.records.slice(-50).reverse();
  res.json(records);
});

// 特定ユーザーの記録取得
app.get('/api/attendance/:userId', (req, res) => {
  const data = readData();
  const userRecords = data.records
    .filter(r => r.userId === req.params.userId)
    .slice(-30)
    .reverse();
  res.json(userRecords);
});

// ルートパス
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 サーバーが起動しました: http://localhost:${PORT}`);
  console.log(`📊 出退勤システムが利用可能です`);
});
