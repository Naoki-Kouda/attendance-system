const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'attendance_data.json');

// データ初期化
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], records: [] }, null, 2));
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    return { users: [], records: [] };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

// ユーザー登録
app.post('/api/register-user', (req, res) => {
  const { name, faceDescriptor } = req.body;
  if (!name || !faceDescriptor) return res.status(400).json({ error: 'データ不足' });

  const data = readData();
  const userId = Date.now().toString();
  
  data.users.push({
    id: userId,
    name: name,
    faceDescriptor: faceDescriptor,
    registeredAt: new Date().toISOString()
  });

  saveData(data);
  res.json({ success: true, userId });
});

// ユーザー取得
app.get('/api/users', (req, res) => {
  const data = readData();
  res.json(data.users.map(u => ({ id: u.id, name: u.name, registeredAt: u.registeredAt })));
});

// 顔データ取得
app.get('/api/face-descriptors', (req, res) => {
  const data = readData();
  res.json(data.users.map(u => ({ id: u.id, name: u.name, descriptor: u.faceDescriptor })));
});

// 打刻記録
app.post('/api/attendance', (req, res) => {
  const { userId, userName, type, faceImage } = req.body;
  const data = readData();
  
  data.records.push({
    id: Date.now().toString(),
    userId, userName, type,
    timestamp: new Date().toISOString(),
    faceImage
  });

  saveData(data);
  res.json({ success: true });
});

// 履歴取得
app.get('/api/attendance', (req, res) => {
  const data = readData();
  res.json(data.records.slice(-50).reverse());
});

// ▼▼▼ 新規追加: CSVダウンロード機能 ▼▼▼
app.get('/api/download-csv', (req, res) => {
  const data = readData();
  const records = data.records;

  // データを「日付_ユーザーID」でグループ化して、開始・終了時間を計算
  const summary = {};

  records.forEach(r => {
    const date = new Date(r.timestamp);
    const dateStr = date.toLocaleDateString('ja-JP'); // YYYY/MM/DD
    const timeStr = date.toLocaleTimeString('ja-JP'); // HH:MM:SS
    
    // キー: 日付_ユーザーID
    const key = `${dateStr}_${r.userId}`;

    if (!summary[key]) {
      summary[key] = {
        date: dateStr,
        name: r.userName,
        clockIn: null,
        clockOut: null
      };
    }

    // 出勤: その日一番早い時間を採用
    if (r.type === 'clock-in') {
      if (!summary[key].clockIn || timeStr < summary[key].clockIn) {
        summary[key].clockIn = timeStr;
      }
    }
    // 退勤: その日一番遅い時間を採用
    if (r.type === 'clock-out') {
      if (!summary[key].clockOut || timeStr > summary[key].clockOut) {
        summary[key].clockOut = timeStr;
      }
    }
  });

  // CSV作成
  let csvContent = '\uFEFF'; // Excelで文字化けしないためのBOM
  csvContent += '日付,名前,出勤時刻,退勤時刻\n';

  Object.values(summary).sort((a, b) => a.date.localeCompare(b.date)).forEach(row => {
    const inTime = row.clockIn || '--:--:--';
    const outTime = row.clockOut || '--:--:--';
    csvContent += `${row.date},${row.name},${inTime},${outTime}\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=attendance_log.csv');
  res.send(csvContent);
});
// ▲▲▲ 追加終了 ▲▲▲

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ▼▼▼ 修正箇所: ログ出力を変更 ▼▼▼
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access here: http://localhost:${PORT}`);
});
