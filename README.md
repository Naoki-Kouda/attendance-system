# 🎯 顔認識出退勤システム

AI顔認識技術を使った出退勤管理システムです。カメラに顔を映すだけで出退勤を記録できます。

## ✨ 機能

- 📸 **顔認識によるユーザー登録** - カメラで顔を登録
- ✅ **出勤記録** - 顔認識で自動的に本人確認して出勤記録
- 🏠 **退勤記録** - 顔認識で自動的に本人確認して退勤記録
- 📊 **出退勤履歴** - リアルタイムで履歴を表示
- 👥 **複数ユーザー対応** - 複数人の登録・管理が可能
- 🎨 **モダンなUI** - 使いやすく美しいインターフェース

## 🛠 技術スタック

- **フロントエンド**: HTML5, CSS3, JavaScript (Vanilla)
- **顔認識**: face-api.js (TensorFlow.js ベース)
- **バックエンド**: Node.js + Express
- **データ保存**: JSON ファイル

## 📦 インストール

### 必要要件
- Node.js 18.0以上
- Webカメラ
- モダンブラウザ (Chrome, Firefox, Safari, Edge)

### セットアップ

1. リポジトリをクローン
```bash
git clone <your-repo-url>
cd attendance-system
```

2. 依存パッケージをインストール
```bash
npm install
```

3. サーバーを起動
```bash
npm start
```

4. ブラウザで開く
```
http://localhost:3000
```

## 🚀 使い方

### 1. ユーザー登録
1. 名前を入力
2. カメラに顔を映す
3. 「📸 顔を登録」ボタンをクリック

### 2. 出勤
1. カメラに顔を映す
2. 顔が認識されたら「✅ 出勤」ボタンをクリック

### 3. 退勤
1. カメラに顔を映す
2. 顔が認識されたら「🏠 退勤」ボタンをクリック

## 🌐 Renderへのデプロイ

### 手順

1. **GitHubにプッシュ**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. **Renderでデプロイ**
   - [Render](https://render.com) にアクセス
   - 「New +」→「Web Service」を選択
   - GitHubリポジトリを接続
   - 以下の設定を入力:
     - **Name**: attendance-system (任意)
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
   - 「Create Web Service」をクリック

3. **デプロイ完了**
   - 数分でデプロイ完了
   - 提供されたURLでアクセス可能

### 環境変数（オプション）
Renderの環境変数で設定可能:
- `PORT`: ポート番号 (デフォルト: 3000)

## 📁 プロジェクト構造

```
attendance-system/
├── public/
│   ├── index.html      # メインHTML
│   ├── style.css       # スタイルシート
│   └── app.js          # フロントエンドJavaScript
├── server.js           # Express サーバー
├── package.json        # 依存関係
├── attendance_data.json # データファイル (自動生成)
└── README.md           # このファイル
```

## 🔒 セキュリティ

- 顔データは暗号化されたディスクリプタとして保存
- 実際の顔画像は一時的なキャプチャのみ
- HTTPS推奨（本番環境）

## 📝 ライセンス

MIT License

## 👨‍💻 開発者

CODIQ - AI企業

---

© 2025 CODIQ - AI顔認識出退勤システム
