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

    // UI表示切り替え（ヘッダーのバッジ更新とメインエリア表示）
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.textContent = "READY";
      loadingEl.style.background = "rgba(46, 204, 113, 0.3)";
    }
    
    // CSSでFlexboxレイアウトを使用しているため 'block' ではなく 'flex' に設定
    document.getElementById('mainContent').style.display = 'flex';
    
    // 各種セットアップ
    await startVideo();
    await loadUsers();
    await loadAttendanceRecords(); // データ取得のみ行う（表示はしない）
    
    setupEventListeners();
    
    // 音声認識開始
    initVoiceRecognition();
    
  } catch (error) {
    console.error('INIT ERROR:', error);
    showMessage('registerMessage', 'エラー: ' + error.message, 'error');
  }
}

// ---------------------------------------------------------
// ▼▼▼ 演出・エフェクト関連関数 ▼▼▼
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

// 3. ポップアップ表示
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
    icon.textContent = '☀️'; 
    title.textContent = '出勤しました';
  } else {
    popup.classList.add('popup-type-out');
    icon.textContent = '🌙'; 
    title.textContent = '退勤しました';
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
    const statusEl = document.getElementById('voiceStatus');
    if (statusEl) statusEl.innerHTML = '⚠️ 音声非対応';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    const el = document.getElementById('voiceStatus');
    if(el) {
      el.innerHTML = '🎤 待機中';
      el.style.color = '#fff';
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
  if (text.includes('出勤')) {
    lastVoiceCommandTime = Date.now();
    showVoiceFeedback(`認識: ${text}`);
    recordAttendance('clock-in');
  } else if (text.includes('退勤')) {
    lastVoiceCommandTime = Date.now();
    showVoiceFeedback(`認識: ${text}`);
    recordAttendance('clock-out');
  }
}

function showVoiceFeedback(msg) {
  const el = document.getElementById('voiceStatus');
  if (!el) return;
  const original = '🎤 待機中';
  el.innerHTML = `🔊 ${msg}`;
  el.style.backgroundColor = 'rgba(46, 204, 113, 0.8)';
  setTimeout(() => {
    el.innerHTML = original;
    el.style.backgroundColor = 'rgba(0,0,0,0.6)';
  }, 3000);
}

// カメラ起動
async function startVideo() {
  video = document.getElementById('video');
  canvas = document.getElementById('overlay');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 640 }, 
        height: { ideal: 480 },
        facingMode: "user" // インカメラ優先
      } 
    });
    video.srcObject = stream;
    
    video.addEventListener('play', () => {
      // コンテナサイズに合わせてキャンバスを調整
      const container = document.querySelector('.video-container');
      displaySize = { width: container.clientWidth, height: container.clientHeight };
      faceapi.matchDimensions(canvas, displaySize);
      detectFaces();
    });
  } catch (err) {
    alert('カメラエラー: ' + err.message);
  }
}

// 顔認識ループ
async function detectFaces() {
  if (!video || video.paused || video.ended) return setTimeout(() => detectFaces(), 100);

  // 軽量モデルで検出
  const detections = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  // キャンバスのサイズをビデオの表示サイズに合わせる（レスポンシブ対応）
  const container = document.querySelector('.video-container');
  if (container.clientWidth !== displaySize.width || container.clientHeight !== displaySize.height) {
    displaySize = { width: container.clientWidth, height: container.clientHeight };
    faceapi.matchDimensions(canvas, displaySize);
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (detections) {
    faceDetected = true;
    currentFaceDescriptor = detections.descriptor;
    
    // ユーザー照合
    const matched = await matchFace(currentFaceDescriptor);
    currentMatchedUser = matched;

    // 描画設定
    const label = matched ? matched.name : 'Unknown';
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
    const inBtn = document.getElementById('clockInBtn');
    const outBtn = document.getElementById('clockOutBtn');
    if(inBtn) inBtn.disabled = false;
    if(outBtn) outBtn.disabled = false;
    
  } else {
    faceDetected = false;
    currentFaceDescriptor = null;
    currentMatchedUser = null;
    updateDetectionStatus(false);
    
    // ボタン無効化
    const inBtn = document.getElementById('clockInBtn');
    const outBtn = document.getElementById('clockOutBtn');
    if(inBtn) inBtn.disabled = true;
    if(outBtn) outBtn.disabled = true;
  }
  
  ctx.restore();
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
  
  if (!indicator || !text) return;

  if (detected) {
    indicator.classList.add('detected');
    if (user) {
      text.innerHTML = `OK: <b>${escapeHtml(user.name)}</b>`;
      text.style.color = '#2ecc71';
    } else {
      text.innerHTML = '未登録';
      text.style.color = '#f1c40f';
    }
  } else {
    indicator.classList.remove('detected');
    text.textContent = 'SCANNING...';
    text.style.color = '#fff';
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
    showMessage('registerMessage', '名前を入力し、カメラを見てください', 'error');
    return;
  }
  
  try {
    // メッセージ表示
    showMessage('registerMessage', '登録中...', 'success');

    const res = await fetch(`${API_URL}/api/register-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, faceDescriptor: Array.from(currentFaceDescriptor) })
    });
    
    if ((await res.json()).success) {
      showMessage('registerMessage', `登録しました: ${name}`, 'success');
      nameInput.value = '';
      loadUsers();
    }
  } catch (err) {
    showMessage('registerMessage', '登録エラー', 'error');
  }
}

// ---------------------------------------------------------
// 打刻処理
// ---------------------------------------------------------
async function recordAttendance(type) {
  if (!currentMatchedUser) {
    showMessage('actionMessage', 'ユーザーが認証されていません', 'error');
    return;
  }
  
  try {
    // 演出実行（通信待ち時間を体感させないため先に実行）
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
      console.log(`${type} recorded for ${currentMatchedUser.name}`);
      // ログデータのリロード（UIには表示しないが内部データは更新）
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

// ユーザー一覧読み込み（コンソール出力のみ）
async function loadUsers() {
  try {
    const res = await fetch(`${API_URL}/api/face-descriptors`);
    const data = await res.json();
    registeredUsers = data.map(d => ({ ...d, descriptor: new Float32Array(d.descriptor) }));
    console.log(`Loaded ${registeredUsers.length} users.`);
  } catch(e) { console.error(e); }
}

// ログ読み込み（コンソール出力のみ）
async function loadAttendanceRecords() {
  try {
    // データ自体は取得するが、画面には描画しない
    const res = await fetch(`${API_URL}/api/attendance`);
    const records = await res.json();
    console.log(`Loaded ${records.length} attendance records.`);
  } catch(e) { console.error(e); }
}

function showMessage(id, text, type) {
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = text;
  
  // エラーなら赤、成功なら緑っぽい色などに変更可能
  if (type === 'error') {
    el.style.backgroundColor = 'rgba(192, 57, 43, 0.9)';
  } else {
    el.style.backgroundColor = 'rgba(39, 174, 96, 0.9)';
  }
  
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