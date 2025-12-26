// グローバル変数
let video;
let canvas;
let displaySize;
let faceDetected = false;
let currentFaceDescriptor = null;
let registeredUsers = [];

// API URL
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : window.location.origin;

// 初期化
async function init() {
  try {
    console.log('SYSTEM: モデル読み込み中...');
    
    // Face-api.js モデルの読み込み
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
      faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
      faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
    ]);

    console.log('SYSTEM: 完了');
    
    // ローディングを非表示
    document.getElementById('loading').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    
    // カメラの起動
    await startVideo();
    
    // 登録ユーザーの読み込み
    await loadUsers();
    
    // 出退勤履歴の読み込み
    await loadAttendanceRecords();
    
    // イベントリスナーの設定
    setupEventListeners();
    
  } catch (error) {
    console.error('INIT ERROR:', error);
    showMessage('registerMessage', 'システムエラー: ' + error.message, 'error');
  }
}

// カメラの起動
async function startVideo() {
  video = document.getElementById('video');
  canvas = document.getElementById('overlay');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 640 },
        height: { ideal: 480 }
      } 
    });
    video.srcObject = stream;
    
    // ビデオが再生開始したら顔検出を開始
    video.addEventListener('play', () => {
      const { videoWidth, videoHeight } = video;
      displaySize = { width: videoWidth, height: videoHeight };
      
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      faceapi.matchDimensions(canvas, displaySize);
      
      // 顔検出ループを開始
      detectFaces();
    });
    
  } catch (error) {
    console.error('CAMERA ERROR:', error);
    alert('エラー: カメラへのアクセスが拒否されました');
  }
}

// 顔検出ループ
async function detectFaces() {
  const detections = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (detections) {
    // 顔が検出された
    faceDetected = true;
    currentFaceDescriptor = detections.descriptor;
    
    // ★変更点: 描画の前にマッチングを行う
    const matchedUser = await matchFace(currentFaceDescriptor);
    
    // ラベルの決定
    const labelText = matchedUser ? matchedUser.name : '未登録';
    
    // 描画設定（リサイズ）
    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    
    // 顔の枠を描画 (シルバー/白系) + 名前ラベル
    const box = resizedDetections.detection.box;
    const drawBox = new faceapi.draw.DrawBox(box, {
      label: labelText, // ★ここを動的に変更
      boxColor: 'rgba(255, 255, 255, 0.8)',
      lineWidth: 2,
      drawLabelOptions: {
        fontSize: 16,
        padding: 8
      }
    });
    drawBox.draw(canvas);

    // 顔のランドマークを表示
    const drawLandmarks = new faceapi.draw.DrawFaceLandmarks(resizedDetections.landmarks, {
      drawLines: true,
      drawPoints: true,
      lineWidth: 1,
      pointSize: 2,
      lineColor: 'rgba(127, 140, 141, 0.5)', // シルバーグレー
      pointColor: 'rgba(255, 255, 255, 0.8)' // 白
    });
    drawLandmarks.draw(canvas);
    
    // ステータス更新
    updateDetectionStatus(true, matchedUser);
    
    // ボタンの有効化
    document.getElementById('clockInBtn').disabled = false;
    document.getElementById('clockOutBtn').disabled = false;
    
  } else {
    // 顔が検出されない
    faceDetected = false;
    currentFaceDescriptor = null;
    
    updateDetectionStatus(false);
    
    // ボタンの無効化
    document.getElementById('clockInBtn').disabled = true;
    document.getElementById('clockOutBtn').disabled = true;
  }
  
  // 次のフレームで再検出
  requestAnimationFrame(detectFaces);
}

// 顔のマッチング
async function matchFace(descriptor) {
  if (registeredUsers.length === 0) return null;
  
  const threshold = 0.6; // マッチング閾値
  let bestMatch = null;
  let minDistance = Infinity;
  
  for (const user of registeredUsers) {
    const distance = faceapi.euclideanDistance(descriptor, user.descriptor);
    if (distance < threshold && distance < minDistance) {
      minDistance = distance;
      bestMatch = user;
    }
  }
  
  return bestMatch;
}

// 検出ステータスの更新
function updateDetectionStatus(detected, matchedUser = null) {
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.getElementById('statusText');
  
  if (detected) {
    statusIndicator.classList.add('detected');
    if (matchedUser) {
      statusText.innerHTML = `認証完了: <b>${escapeHtml(matchedUser.name)}</b>`;
    } else {
      statusText.innerHTML = '未登録ユーザーを検出';
    }
  } else {
    statusIndicator.classList.remove('detected');
    statusText.textContent = 'スキャン中...';
  }
}

// イベントリスナーの設定
function setupEventListeners() {
  document.getElementById('registerBtn').addEventListener('click', registerUser);
  document.getElementById('clockInBtn').addEventListener('click', () => recordAttendance('clock-in'));
  document.getElementById('clockOutBtn').addEventListener('click', () => recordAttendance('clock-out'));
}

// ユーザー登録
async function registerUser() {
  const nameInput = document.getElementById('userName');
  const name = nameInput.value.trim();
  
  if (!name) {
    showMessage('registerMessage', 'エラー: 名前を入力してください', 'error');
    return;
  }
  
  if (!faceDetected || !currentFaceDescriptor) {
    showMessage('registerMessage', 'エラー: 顔が検出されません', 'error');
    return;
  }
  
  try {
    // 顔画像のキャプチャ
    const faceImage = await captureFaceImage();
    
    const response = await fetch(`${API_URL}/api/register-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        faceDescriptor: Array.from(currentFaceDescriptor)
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showMessage('registerMessage', `登録完了: ${name}`, 'success');
      nameInput.value = '';
      
      // ユーザー一覧を更新
      await loadUsers();
    } else {
      showMessage('registerMessage', '登録失敗: ' + data.error, 'error');
    }
    
  } catch (error) {
    console.error('REG ERROR:', error);
    showMessage('registerMessage', 'システムエラー: ' + error.message, 'error');
  }
}

// 出退勤記録
async function recordAttendance(type) {
  if (!faceDetected || !currentFaceDescriptor) {
    showMessage('actionMessage', 'エラー: 顔が検出されません', 'error');
    return;
  }
  
  try {
    // 登録ユーザーと照合
    const matchedUser = await matchFace(currentFaceDescriptor);
    
    if (!matchedUser) {
      showMessage('actionMessage', '認証拒否: ユーザーが登録されていません', 'error');
      return;
    }
    
    // 顔画像のキャプチャ
    const faceImage = await captureFaceImage();
    
    const response = await fetch(`${API_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: matchedUser.id,
        userName: matchedUser.name,
        type: type,
        faceImage: faceImage
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      const typeText = type === 'clock-in' ? '出勤' : '退勤';
      showMessage('actionMessage', `記録完了: ${matchedUser.name} [${typeText}]`, 'success');
      
      // 履歴を更新
      await loadAttendanceRecords();
    } else {
      showMessage('actionMessage', '記録失敗: ' + data.error, 'error');
    }
    
  } catch (error) {
    console.error('LOG ERROR:', error);
    showMessage('actionMessage', 'システムエラー: ' + error.message, 'error');
  }
}

// 顔画像のキャプチャ
async function captureFaceImage() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = video.videoWidth;
  tempCanvas.height = video.videoHeight;
  const ctx = tempCanvas.getContext('2d');
  
  // モノクロにして保存（デザインに合わせて）
  ctx.filter = 'grayscale(100%)';
  ctx.drawImage(video, 0, 0);
  return tempCanvas.toDataURL('image/jpeg', 0.8);
}

// ユーザー一覧の読み込み
async function loadUsers() {
  try {
    // ユーザー情報取得
    const usersResponse = await fetch(`${API_URL}/api/users`);
    const users = await usersResponse.json();
    
    // 顔データ取得
    const descriptorsResponse = await fetch(`${API_URL}/api/face-descriptors`);
    const descriptors = await descriptorsResponse.json();
    
    // 登録ユーザーの更新
    registeredUsers = descriptors.map(d => ({
      id: d.id,
      name: d.name,
      descriptor: new Float32Array(d.descriptor)
    }));
    
    // UI更新
    const usersList = document.getElementById('usersList');
    
    if (users.length === 0) {
      usersList.innerHTML = '<p class="loading-text">データなし</p>';
      return;
    }
    
    usersList.innerHTML = users.map(user => `
      <div class="user-item">
        <h3>${escapeHtml(user.name)}</h3>
        <p>REG: ${new Date(user.registeredAt).toLocaleString('ja-JP')}</p>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('LOAD ERROR:', error);
    document.getElementById('usersList').innerHTML = '<p class="loading-text">データエラー</p>';
  }
}

// 出退勤履歴の読み込み
async function loadAttendanceRecords() {
  try {
    const response = await fetch(`${API_URL}/api/attendance`);
    const records = await response.json();
    
    const recordsList = document.getElementById('attendanceRecords');
    
    if (records.length === 0) {
      recordsList.innerHTML = '<p class="loading-text">ログなし</p>';
      return;
    }
    
    // 最新20件のみ表示
    const recentRecords = records.slice(0, 20);
    
    recordsList.innerHTML = recentRecords.map(record => {
      const typeText = record.type === 'clock-in' ? 'IN' : 'OUT';
      const typeClass = record.type;
      const date = new Date(record.timestamp);
      
      return `
        <div class="record-item ${typeClass}">
          ${record.faceImage ? `<img src="${record.faceImage}" alt="FACE">` : ''}
          <div class="record-info">
            <h4>${escapeHtml(record.userName)}</h4>
            <p>${date.toLocaleString('ja-JP', { 
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}</p>
          </div>
          <span class="record-badge ${typeClass}">${typeText}</span>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('HISTORY ERROR:', error);
    document.getElementById('attendanceRecords').innerHTML = '<p class="loading-text">データエラー</p>';
  }
}

// メッセージ表示
function showMessage(elementId, message, type) {
  const messageEl = document.getElementById(elementId);
  messageEl.textContent = message;
  messageEl.className = `message ${type}`;
  messageEl.style.display = 'block';
  
  // 5秒後に自動非表示
  setTimeout(() => {
    messageEl.style.display = 'none';
    messageEl.className = 'message';
  }, 5000);
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 初期化実行
document.addEventListener('DOMContentLoaded', init);
