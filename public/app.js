// グローバル変数
let video;
let canvas;
let displaySize;
let faceDetected = false;
let currentFaceDescriptor = null;
let currentMatchedUser = null; // 現在認識されているユーザー
let registeredUsers = [];
let recognition = null; // 音声認識オブジェクト
let lastVoiceCommandTime = 0; // 連続反応防止用

const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : window.location.origin;

// 初期化
async function init() {
  try {
    // モデル読み込み
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
      faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
      faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
    ]);

    // UI表示切り替え
    document.getElementById('loading').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    
    // 各種セットアップ
    await startVideo();
    await loadUsers();
    await loadAttendanceRecords();
    
    setupEventListeners();
    
    // 音声認識開始
    initVoiceRecognition();
    
  } catch (error) {
    console.error('INIT ERROR:', error);
    showMessage('registerMessage', 'エラー: ' + error.message, 'error');
  }
}

// ---------------------------------------------------------
// ▼▼▼ 演出・エフェクト関連関数 (新規追加) ▼▼▼
// ---------------------------------------------------------

// 1. フラッシュ演出
function triggerFlashEffect() {
  const flash = document.getElementById('flashOverlay');
  if (flash) {
    flash.classList.add('flash-active');
    setTimeout(() => {
      flash.classList.remove('flash-active');
    }, 100);
  }
}

// 2. 音声合成（システムが喋る）
function speakGreeting(type, userName) {
  if (!window.speechSynthesis) return;

  let text = "";
  if (type === 'clock-in') {
    text = `おはようございます、${userName}さん。出勤を受け付けました。`;
  } else {
    text = `お疲れ様でした、${userName}さん。退勤を受け付けました。`;
  }

  // 既存の発話をキャンセルして即座に話す
  window.speechSynthesis.cancel();

  const uttr = new SpeechSynthesisUtterance(text);
  uttr.lang = "ja-JP";
  uttr.rate = 1.1; // 少し早めに
  uttr.pitch = 1.0;
  uttr.volume = 1.0;
  window.speechSynthesis.speak(uttr);
}

// 3. 巨大ポップアップ表示
function showSuccessPopup(type, userName) {
  const popup = document.getElementById('successPopup');
  const icon = document.getElementById('popupIcon');
  const title = document.getElementById('popupTitle');
  const msg = document.getElementById('popupMessage');
  const time = document.getElementById('popupTime');

  if (!popup) return;

  // 現在時刻
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ja-JP');

  // 内容セット
  msg.textContent = `${userName} さん`;
  time.textContent = timeStr;

  // クラスのリセット
  popup.classList.remove('popup-type-in', 'popup-type-out');

  if (type === 'clock-in') {
    popup.classList.add('popup-type-in');
    icon.textContent = '出勤処理しました'; 
    title.textContent = 'よろしくお願いします！';
  } else {
    popup.classList.add('popup-type-out');
    icon.textContent = '退勤処理しました'; 
    title.textContent = 'お疲れ様でした！';
  }

  // 表示
  popup.classList.add('show');

  // 3秒後に消す
  setTimeout(() => {
    popup.classList.remove('show');
  }, 3000);
}

// ---------------------------------------------------------
// ▲▲▲ 演出関数終了 ▲▲▲
// ---------------------------------------------------------


// 音声認識（聞き取り）の初期化
function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('voiceStatus').innerHTML = '⚠️ 音声認識非対応ブラウザです';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    const el = document.getElementById('voiceStatus');
    if(el) {
      el.innerHTML = '🎤 音声認識: <b>ON</b> (待機中)';
      el.style.color = '#27ae60';
    }
  };

  recognition.onerror = (event) => {
    console.log('Voice Error:', event.error);
    // エラー時は再起動を試みる
    setTimeout(() => { if(recognition) recognition.start(); }, 1000);
  };

  recognition.onend = () => {
    // 停止したら自動再開
    setTimeout(() => { if(recognition) recognition.start(); }, 1000);
  };

  recognition.onresult = (event) => {
    const last = event.results.length - 1;
    const transcript = event.results[last][0].transcript.trim();
    console.log('Voice Input:', transcript);
    processVoiceCommand(transcript);
  };

  recognition.start();
}

// 音声コマンドの処理
function processVoiceCommand(text) {
  // ユーザーが認識されていない、または前回のコマンドから3秒以内の場合は無視
  if (!currentMatchedUser || (Date.now() - lastVoiceCommandTime < 3000)) return;

  // 判定ロジック
  if (text.includes('出勤します')) {
    lastVoiceCommandTime = Date.now();
    showVoiceFeedback(`音声認識: 「${text}」`);
    recordAttendance('clock-in');
  } else if (text.includes('退勤します')) {
    lastVoiceCommandTime = Date.now();
    showVoiceFeedback(`音声認識: 「${text}」`);
    recordAttendance('clock-out');
  }
}

function showVoiceFeedback(msg) {
  const el = document.getElementById('voiceStatus');
  if (!el) return;
  const original = '🎤 音声認識: <b>ON</b> (待機中)';
  el.innerHTML = `🔊 ${msg}`;
  el.style.backgroundColor = '#dff0d8';
  setTimeout(() => {
    el.innerHTML = original;
    el.style.backgroundColor = '#f0f0f0';
  }, 3000);
}

// カメラ起動
async function startVideo() {
  video = document.getElementById('video');
  canvas = document.getElementById('overlay');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 640 }, height: { ideal: 480 } } 
    });
    video.srcObject = stream;
    
    video.addEventListener('play', () => {
      displaySize = { width: video.videoWidth, height: video.videoHeight };
      faceapi.matchDimensions(canvas, displaySize);
      detectFaces();
    });
  } catch (err) {
    alert('カメラエラー: ' + err.message);
  }
}

// 顔認識ループ
async function detectFaces() {
  // 軽量モデルで検出
  const detections = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (detections) {
    faceDetected = true;
    currentFaceDescriptor = detections.descriptor;
    
    // ユーザー照合
    const matched = await matchFace(currentFaceDescriptor);
    currentMatchedUser = matched;

    // 描画設定
    const label = matched ? matched.name : '未登録';
    const boxColor = matched ? '#27ae60' : '#f39c12';

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    const box = resizedDetections.detection.box;
    
    const drawBox = new faceapi.draw.DrawBox(box, {
      label: label,
      boxColor: boxColor,
      lineWidth: 2
    });
    drawBox.draw(canvas);

    updateDetectionStatus(true, matched);
    
    // ボタン有効化
    document.getElementById('clockInBtn').disabled = false;
    document.getElementById('clockOutBtn').disabled = false;
    
  } else {
    faceDetected = false;
    currentFaceDescriptor = null;
    currentMatchedUser = null;
    updateDetectionStatus(false);
    
    // ボタン無効化
    document.getElementById('clockInBtn').disabled = true;
    document.getElementById('clockOutBtn').disabled = true;
  }
  
  requestAnimationFrame(detectFaces);
}

// 顔マッチング
async function matchFace(descriptor) {
  if (registeredUsers.length === 0) return null;
  const threshold = 0.5;
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

function updateDetectionStatus(detected, user = null) {
  const indicator = document.querySelector('.status-indicator');
  const text = document.getElementById('statusText');
  
  if (detected) {
    indicator.classList.add('detected');
    if (user) {
      text.innerHTML = `認証OK: <b>${escapeHtml(user.name)}</b>`;
      text.style.color = '#27ae60';
    } else {
      text.innerHTML = '未登録ユーザー';
      text.style.color = '#e67e22';
    }
  } else {
    indicator.classList.remove('detected');
    text.textContent = 'スキャン中...';
    text.style.color = '#333';
  }
}

function setupEventListeners() {
  document.getElementById('registerBtn').addEventListener('click', registerUser);
  document.getElementById('clockInBtn').addEventListener('click', () => recordAttendance('clock-in'));
  document.getElementById('clockOutBtn').addEventListener('click', () => recordAttendance('clock-out'));
  document.getElementById('downloadCsvBtn').addEventListener('click', downloadCsv);
}

// ユーザー登録処理
async function registerUser() {
  const nameInput = document.getElementById('userName');
  const name = nameInput.value.trim();
  
  if (!name || !currentFaceDescriptor) {
    showMessage('registerMessage', '名前を入力し、顔をカメラに向けてください', 'error');
    return;
  }
  
  try {
    const faceImage = await captureFaceImage();
    const res = await fetch(`${API_URL}/api/register-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, faceDescriptor: Array.from(currentFaceDescriptor) })
    });
    
    if ((await res.json()).success) {
      showMessage('registerMessage', `登録完了: ${name}`, 'success');
      nameInput.value = '';
      loadUsers();
    }
  } catch (err) {
    showMessage('registerMessage', '登録エラー', 'error');
  }
}

// ---------------------------------------------------------
// 打刻処理（演出組み込み版）
// ---------------------------------------------------------
async function recordAttendance(type) {
  if (!currentMatchedUser) {
    showMessage('actionMessage', 'ユーザーが認証されていません', 'error');
    return;
  }
  
  try {
    // ★演出実行（体感速度向上のため通信前に実行）
    triggerFlashEffect();
    showSuccessPopup(type, currentMatchedUser.name);
    speakGreeting(type, currentMatchedUser.name);

    // サーバー記録
    const faceImage = await captureFaceImage();
    const res = await fetch(`${API_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentMatchedUser.id,
        userName: currentMatchedUser.name,
        type,
        faceImage
      })
    });
    
    if ((await res.json()).success) {
      // ログ更新
      loadAttendanceRecords();
    }
  } catch (err) {
    console.error(err);
    showMessage('actionMessage', '通信エラー', 'error');
  }
}

// CSVダウンロード
function downloadCsv() {
  window.location.href = `${API_URL}/api/download-csv`;
}

// ユーティリティ
async function captureFaceImage() {
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  return c.toDataURL('image/jpeg', 0.7);
}

async function loadUsers() {
  try {
    const res = await fetch(`${API_URL}/api/face-descriptors`);
    const data = await res.json();
    registeredUsers = data.map(d => ({ ...d, descriptor: new Float32Array(d.descriptor) }));
    
    const listEl = document.getElementById('usersList');
    if(registeredUsers.length === 0) {
      listEl.innerHTML = '<p class="loading-text">データなし</p>';
    } else {
      listEl.innerHTML = registeredUsers.map(u => `<div class="user-item"><h3>${escapeHtml(u.name)}</h3></div>`).join('');
    }
  } catch(e) { console.error(e); }
}

async function loadAttendanceRecords() {
  try {
    const res = await fetch(`${API_URL}/api/attendance`);
    const records = await res.json();
    
    const listEl = document.getElementById('attendanceRecords');
    if(records.length === 0) {
      listEl.innerHTML = '<p class="loading-text">ログなし</p>';
      return;
    }

    listEl.innerHTML = records.map(r => `
      <div class="record-item ${r.type}">
        ${r.faceImage ? `<img src="${r.faceImage}">` : ''}
        <div class="record-info">
          <h4>${escapeHtml(r.userName)}</h4>
          <p>${new Date(r.timestamp).toLocaleString('ja-JP')}</p>
        </div>
        <span class="record-badge">${r.type === 'clock-in' ? '出勤' : '退勤'}</span>
      </div>
    `).join('');
  } catch(e) { console.error(e); }
}

function showMessage(id, text, type) {
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = text;
  el.className = `message ${type}`;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 開始
document.addEventListener('DOMContentLoaded', init);
