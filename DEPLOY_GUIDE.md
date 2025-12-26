# 🚀 デプロイガイド - GitHub & Render

## 📋 前提条件

- GitHubアカウント
- Renderアカウント (無料で作成可能: https://render.com)
- Git がインストールされている

---

## 🔧 ステップ1: GitHubリポジトリ作成

### 1-1. GitHubで新しいリポジトリを作成

1. GitHub (https://github.com) にアクセス
2. 右上の「+」→「New repository」をクリック
3. リポジトリ情報を入力:
   - **Repository name**: `attendance-system` (または任意の名前)
   - **Description**: `顔認識出退勤システム`
   - **Public** または **Private** を選択
   - ✅ **Initialize this repository with a README** のチェックは **外す**
4. 「Create repository」をクリック

### 1-2. ローカルからGitHubにプッシュ

プロジェクトフォルダで以下のコマンドを実行:

```bash
# プロジェクトディレクトリに移動
cd attendance-system

# Gitリポジトリを初期化
git init

# すべてのファイルをステージング
git add .

# 初回コミット
git commit -m "Initial commit: 顔認識出退勤システム"

# メインブランチ名を設定
git branch -M main

# GitHubリポジトリをリモートに追加
# ⚠️ <YOUR_GITHUB_USERNAME> を自分のユーザー名に変更してください
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/attendance-system.git

# GitHubにプッシュ
git push -u origin main
```

### 📝 コマンド例（実際のURLに置き換えてください）
```bash
git remote add origin https://github.com/yukita123/attendance-system.git
git push -u origin main
```

---

## ☁️ ステップ2: Renderでデプロイ

### 2-1. Renderアカウント作成（初回のみ）

1. [Render](https://render.com) にアクセス
2. 「Get Started for Free」をクリック
3. GitHubアカウントで連携してサインアップ

### 2-2. Web Serviceを作成

1. Renderダッシュボードで「New +」→「Web Service」をクリック

2. GitHubリポジトリを接続:
   - 「Configure account」でGitHubアカウントを接続（初回のみ）
   - リポジトリ一覧から `attendance-system` を選択
   - 「Connect」をクリック

3. サービス設定を入力:

   | 項目 | 設定値 |
   |------|--------|
   | **Name** | `attendance-system` (任意) |
   | **Region** | `Singapore` (推奨) または `Oregon` |
   | **Branch** | `main` |
   | **Root Directory** | (空欄) |
   | **Runtime** | `Node` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | **Instance Type** | `Free` |

4. 「Create Web Service」をクリック

### 2-3. デプロイ完了を待つ

- デプロイには数分かかります
- ログが表示され、進行状況を確認できます
- ✅ "Your service is live 🎉" と表示されたら完了

### 2-4. アプリケーションにアクセス

- 提供されたURL（例: `https://attendance-system-xxxx.onrender.com`）にアクセス
- カメラの権限を許可してください
- 顔認識出退勤システムが利用可能になります！

---

## 🔄 コード更新時の再デプロイ

コードを変更した後、GitHubにプッシュすると自動的にRenderで再デプロイされます:

```bash
# 変更をコミット
git add .
git commit -m "Update: 機能追加"

# GitHubにプッシュ（自動的にRenderでデプロイされる）
git push origin main
```

---

## ⚙️ オプション設定

### 環境変数（必要に応じて）

Renderの設定画面で環境変数を追加できます:

1. Renderダッシュボード → サービスを選択
2. 「Environment」タブをクリック
3. 「Add Environment Variable」で追加

| キー | 値 | 説明 |
|------|-----|------|
| `PORT` | `3000` | ポート番号（デフォルトで設定済み） |

### カスタムドメイン（Pro版のみ）

Renderの「Settings」→「Custom Domains」で独自ドメインを設定できます。

---

## 🐛 トラブルシューティング

### ❌ カメラが動作しない
- **原因**: HTTPSが必要（Renderは自動的にHTTPS対応）
- **解決**: デプロイ後のHTTPS URLでアクセス

### ❌ デプロイが失敗する
- **原因**: package.jsonのNode.jsバージョン不一致
- **解決**: `package.json` の `engines` を確認:
  ```json
  "engines": {
    "node": ">=18.0.0"
  }
  ```

### ❌ データが消える
- **原因**: Renderの無料プランではファイルシステムが永続化されない
- **解決**: 将来的にはデータベース（MongoDB、PostgreSQL等）に移行を推奨

### 📞 サポート

- Render公式ドキュメント: https://render.com/docs
- 開発者: CODIQ

---

## 📝 チェックリスト

デプロイ前の確認:

- [ ] GitHubアカウント作成済み
- [ ] Renderアカウント作成済み
- [ ] プロジェクトファイルをGitHubにプッシュ
- [ ] RenderでWeb Service作成
- [ ] デプロイ完了を確認
- [ ] ブラウザでアクセス確認
- [ ] カメラ権限を許可
- [ ] 顔認識が動作することを確認

---

## 🎉 完了!

これで顔認識出退勤システムがインターネット上で利用可能になりました！

**あなたのアプリURL**: `https://attendance-system-xxxx.onrender.com`

© 2025 CODIQ
