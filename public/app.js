// public/app.js (商用版v2: ログイン連携対応)

// --- グローバル変数 ---
let video;
let canvas;
let displaySize;
let faceDetected = false;
let currentFaceDescriptor = null;
let currentMatchedUser = null; 
let registeredUsers = [];
let recognition = null; 
let lastVoiceCommandTime = 0; 

// ログイン情報（localStorageから取得）
const COMPANY_ID = localStorage.getItem('attendance_company_id');
const COMPANY_NAME = localStorage.getItem('attendance_company_name');

const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : window.location.origin;

// ---------------------------------------------------------
// ▼▼▼ ログインチェックと起動 ▼▼▼
// ---------------------------------------------------------

// ページ読み込み時にログインチェック
if (!COMPANY_ID) {
  window.location.href = '/login'; // 未ログインならログイン画面へ飛ばす
} else {
  // 会社名をヘッダーに表示（もしあれば）
  document.addEventListener('DOMContentLoaded', () => {
    const headerTitle = document.querySelector('header h1');
    if (headerTitle && COMPANY_NAME) {
      headerTitle.textContent += ` - ${COMPANY_NAME}`;
    }
  });
}

async function startSystem() {
  const startScreen = document.getElementById('startScreen');
  const btn = document.getElementById('systemStartBtn');
  
  try {
    if (btn) {
      btn.innerHTML = '<span class="loading-dots">起動中...</span>';
      btn.disabled = true;
    }

    await init();

    if (startScreen) {
      startScreen.classList.add('hidden');
    }

  } catch (error) {
    console.error('Start Error:', error);
    alert('起動に失敗しました: ' + error.message);
    if (btn) {
      btn.innerHTML = '<span>再試行</span>';
      btn.disabled = false;
    }
  }
}

// ---------------------------------------------------------
// ▲▲▲ 初期化処理 ▲▲▲
// ---------------------------------------------------------

async function init() {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
      faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
      faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'),
    ]);

    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.textContent = "ONLINE";
      loadingEl.style.background = "#10b981";
      loadingEl.style.color = "#fff";
    }
    
    document.getElementById('mainContent').style.display = 'flex';
    
    await startVideo();
    await loadUsers(); // ここで会社IDを使ってユーザーを取得
    await loadAttendanceRecords(); 
    
    setupEventListeners();
    initVoiceRecognition();
    
  } catch (error) {
    throw error;
  }
}

// --- 演出系 ---

function triggerFlashEffect() {
  const flash = document.getElementById('flashOverlay');
  if (flash) {
    flash.classList.add('flash-active');
    setTimeout(() => flash.classList.remove('flash-active'), 100);
  }
}

function speakGreeting(type, userName) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const text = type === 'clock-in' ? 
    `おはようございます、${userName}さん。` : 
    `お疲れ様でした、${userName}さん。`;
  
  const uttr = new SpeechSynthesisUtterance(text);
  uttr.lang = "ja-JP";
  uttr.rate = 1.2;
  window.speechSynthesis.speak(uttr);
}

function showSuccessPopup(type, userName) {
  const popup = document.getElementById('successPopup');
  const icon = document.getElementById('popupIcon');
  const title = document.getElementById('popupTitle');
  const msg = document.getElementById('popupMessage');
  const time = document.getElementById('popupTime');

  if (!popup) return;

  const now = new Date();
  msg.textContent = `${userName} さん`;
  time.textContent = now.toLocaleTimeString('ja-JP').slice(0, -3);

  popup.classList.remove('popup-type-in', 'popup-type-out');
  if (type === 'clock-in') {
    popup.classList.add('popup-type-in');
    icon.textContent = '☀️'; 
    title.textContent = '出勤完了';
  } else {
    popup.classList.add('popup-type-out');
    icon.textContent = '🌙'; 
    title.textContent = '退勤完了';
  }
  
  popup.classList.add('show');
  setTimeout(() => popup.classList.remove('show'), 3000);
}

// --- 音声認識 ---

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    const statusEl = document.getElementById('voiceStatus');
    if (statusEl) {
      statusEl.innerHTML = '⚠️ 非対応';
      statusEl.style.opacity = '0.5';
    }
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    const el = document.getElementById('voiceStatus');
    if(el) el.innerHTML = '🎤 待機中...';
  };

  recognition.onerror = () => {
    setTimeout(() => { if(recognition) recognition.start(); }, 1000);
  };

  recognition.onend = () => {
    setTimeout(() => { if(recognition) recognition.start(); }, 1000);
  };

  recognition.onresult = (event) => {
    const last = event.results.length - 1;
    const transcript = event.results[last][0].transcript.trim();
    console.log('Voice:', transcript);
    processVoiceCommand(transcript);
  };

  recognition.start();
}

function processVoiceCommand(text) {
  if (!currentMatchedUser || (Date.now() - lastVoiceCommandTime < 3000)) return;

  if (text.includes('出勤')) {
    lastVoiceCommandTime = Date.now();
    showVoiceFeedback(`認識: 出勤`);
    recordAttendance('clock-in');
  } else if (text.includes('退勤')) {
    lastVoiceCommandTime = Date.now();
    showVoiceFeedback(`認識: 退勤`);
    recordAttendance('clock-out');
  }
}

function showVoiceFeedback(msg) {
  const el = document.getElementById('voiceStatus');
  if (!el) return;
  const original = el.innerHTML;
  el.innerHTML = `🔊 ${msg}`;
  el.style.backgroundColor = 'rgba(16, 185, 129, 0.8)';
  setTimeout(() => {
    el.innerHTML = '🎤 待機中...';
    el.style.backgroundColor = 'rgba(15, 23, 42, 0.7)';
  }, 2000);
}

// --- カメラ & 顔認識 ---

async function startVideo() {
  video = document.getElementById('video');
  canvas = document.getElementById('overlay');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 640 }, 
        height: { ideal: 480 },
        facingMode: "user" 
      } 
    });
    video.srcObject = stream;
    
    video.addEventListener('play', () => {
      const container = document.querySelector('.video-container');
      displaySize = { width: container.clientWidth, height: container.clientHeight };
      faceapi.matchDimensions(canvas, displaySize);
      detectFaces();
    });
  } catch (err) {
    throw new Error('カメラの許可が必要です');
  }
}

async function detectFaces() {
  if (!video || video.paused || video.ended) return setTimeout(() => detectFaces(), 100);

  const detections = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  const container = document.querySelector('.video-container');
  if (container && (container.clientWidth !== displaySize.width || container.clientHeight !== displaySize.height)) {
    displaySize = { width: container.clientWidth, height: container.clientHeight };
    faceapi.matchDimensions(canvas, displaySize);
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (detections) {
    faceDetected = true;
    currentFaceDescriptor = detections.descriptor;
    
    const matched = await matchFace(currentFaceDescriptor);
    currentMatchedUser = matched;

    const label = matched ? matched.name : 'Unknown';
    const boxColor = matched ? '#10b981' : '#f59e0b';

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    const box = resizedDetections.detection.box;
    
    const drawBox = new faceapi.draw.DrawBox(box, {
      label: label,
      boxColor: boxColor,
      lineWidth: 2
    });
    drawBox.draw(canvas);

    updateDetectionStatus(true, matched);
    
    document.getElementById('clockInBtn').disabled = false;
    document.getElementById('clockOutBtn').disabled = false;
    
  } else {
    faceDetected = false;
    currentFaceDescriptor = null;
    currentMatchedUser = null;
    updateDetectionStatus(false);
    
    document.getElementById('clockInBtn').disabled = true;
    document.getElementById('clockOutBtn').disabled = true;
  }
  
  requestAnimationFrame(detectFaces);
}

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
      text.style.color = '#10b981';
    } else {
      text.innerHTML = '未登録';
      text.style.color = '#f59e0b';
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
  
  // ログアウトボタン（簡易実装：ロゴクリックでログアウト）
  document.querySelector('header h1').addEventListener('click', () => {
    if(confirm('ログアウトしますか？')) {
      localStorage.removeItem('attendance_company_id');
      window.location.href = '/login';
    }
  });
}

// --- API (マルチテナント対応) ---

async function registerUser() {
  const nameInput = document.getElementById('userName');
  const name = nameInput.value.trim();
  
  if (!name || !currentFaceDescriptor) {
    showMessage('registerMessage', '名前を入力し、カメラを見てください', 'error');
    return;
  }
  
  try {
    showMessage('registerMessage', '登録中...', 'success');
    
    // ★ 会社IDを一緒に送る
    const res = await fetch(`${API_URL}/api/register-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, 
        faceDescriptor: Array.from(currentFaceDescriptor),
        companyId: COMPANY_ID // 追加
      })
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

async function recordAttendance(type) {
  if (!currentMatchedUser) {
    showMessage('actionMessage', 'ユーザーが認証されていません', 'error');
    return;
  }
  
  try {
    triggerFlashEffect();
    showSuccessPopup(type, currentMatchedUser.name);
    speakGreeting(type, currentMatchedUser.name);

    // ★ 会社IDはサーバー側でユーザーIDから特定できるので送信不要
    const res = await fetch(`${API_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentMatchedUser.id,
        type
      })
    });
    
    if ((await res.json()).success) {
      console.log(`${type} recorded`);
      loadAttendanceRecords();
    }
  } catch (err) {
    console.error(err);
    showMessage('actionMessage', '通信エラー', 'error');
  }
}

function downloadCsv() {
  // ★ 会社IDをクエリパラメータで送る
  window.location.href = `${API_URL}/api/download-csv?companyId=${COMPANY_ID}`;
}

async function loadUsers() {
  try {
    // ★ 会社IDを指定してユーザーを取得
    const res = await fetch(`${API_URL}/api/face-descriptors?companyId=${COMPANY_ID}`);
    const data = await res.json();
    registeredUsers = data.map(d => ({ ...d, descriptor: new Float32Array(d.descriptor) }));
  } catch(e) { console.error(e); }
}

async function loadAttendanceRecords() {
  try {
    // ★ 会社IDを指定して履歴を取得
    await fetch(`${API_URL}/api/attendance?companyId=${COMPANY_ID}`);
  } catch(e) { console.error(e); }
}

function showMessage(id, text, type) {
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = text;
  el.style.backgroundColor = type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)';
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// イベント
document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('systemStartBtn');
  if (startBtn) {
    startBtn.addEventListener('click', startSystem);
  } else {
    init();
  }
});
