// super_admin.js
// 開発者用 管理ツール (No Emoji Ver.)
// 実行: node super_admin.js

const { Client } = require('pg');
const bcrypt = require('bcrypt');
const readline = require('readline');

// データベース接続情報
const connectionString = 'postgresql://codiq_admin:Euzpcv8KMHsq0Z1p39TXYGyapMPMs6eb@dpg-d5sc12n18n1s73cbpmi0-a.oregon-postgres.render.com/attendance_db_mzlq';

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  try {
    await client.connect();
    console.log('\n=== SUPER ADMIN TOOL - DB Connected ===');

    while (true) {
      console.log('\n-----------------------------------');
      console.log('1. 会社一覧を表示');
      console.log('2. 新しい会社を追加');
      console.log('3. 会社の社員を確認');
      console.log('4. 会社を削除 (危険)');
      console.log('5. 管理者パスワードをリセット');
      console.log('6. 管理者ID(ユーザー名)を変更'); // 追加
      console.log('9. 終了');
      console.log('-----------------------------------');

      const choice = await ask('選択してください > ');

      if (choice === '1') {
        await listCompanies();
      } else if (choice === '2') {
        await addCompany();
      } else if (choice === '3') {
        await listEmployees();
      } else if (choice === '4') {
        await deleteCompany();
      } else if (choice === '5') {
        await resetPassword();
      } else if (choice === '6') {
        await changeAdminId();
      } else if (choice === '9') {
        break;
      } else {
        console.log('無効な選択です');
      }
    }

  } catch (err) {
    console.error('エラー:', err);
  } finally {
    await client.end();
    rl.close();
    console.log('終了します。');
  }
}

// 1. 会社一覧
async function listCompanies() {
  const res = await client.query('SELECT * FROM companies ORDER BY id');
  console.table(res.rows);
}

// 2. 会社追加
async function addCompany() {
  const name = await ask('会社名: ');
  const adminId = await ask('管理者ログインID: ');
  const adminPass = await ask('管理者パスワード: ');

  try {
    // 会社作成
    const companyRes = await client.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [name]);
    const companyId = companyRes.rows[0].id;

    // 管理者作成
    const hash = await bcrypt.hash(adminPass, 10);
    await client.query('INSERT INTO admins (company_id, username, password_hash) VALUES ($1, $2, $3)', [companyId, adminId, hash]);

    console.log(`[成功] 作成完了 (CompanyID: ${companyId})`);
  } catch (e) {
    console.log('[失敗] エラー:', e.message);
  }
}

// 3. 社員確認
async function listEmployees() {
  await listCompanies();
  const id = await ask('社員を見たい会社のIDを入力: ');
  
  const res = await client.query('SELECT id, name, created_at FROM users WHERE company_id = $1', [id]);
  if (res.rows.length === 0) {
    console.log('（社員はいません）');
  } else {
    console.table(res.rows);
  }
}

// 4. 会社削除
async function deleteCompany() {
  await listCompanies();
  const id = await ask('削除する会社のIDを入力: ');
  const confirm = await ask(`本当にID ${id} の会社と関連データを全て消しますか？ (yes/no): `);

  if (confirm === 'yes') {
    try {
      await client.query('BEGIN'); 
      await client.query('DELETE FROM attendance_records WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)', [id]);
      await client.query('DELETE FROM users WHERE company_id = $1', [id]);
      await client.query('DELETE FROM admins WHERE company_id = $1', [id]);
      await client.query('DELETE FROM companies WHERE id = $1', [id]);
      await client.query('COMMIT'); 
      console.log('[成功] 削除しました');
    } catch (e) {
      await client.query('ROLLBACK');
      console.log('[失敗] 削除できませんでした:', e.message);
    }
  } else {
    console.log('キャンセルしました');
  }
}

// 5. パスワードリセット
async function resetPassword() {
  await listCompanies();
  const companyId = await ask('対象の会社IDを入力: ');
  
  const adminRes = await client.query('SELECT * FROM admins WHERE company_id = $1', [companyId]);
  
  if (adminRes.rows.length === 0) {
    console.log('[エラー] その会社の管理者が見つかりません。');
    return;
  }

  const targetAdmin = adminRes.rows[0];
  console.log(`\n対象管理者: ${targetAdmin.username} (CompanyID: ${companyId})`);
  
  const newPass = await ask('新しいパスワードを入力: ');
  if (!newPass) return console.log('キャンセルしました');

  try {
    const hash = await bcrypt.hash(newPass, 10);
    await client.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hash, targetAdmin.id]);
    console.log(`[成功] パスワードを変更しました。新しいパスワード: ${newPass}`);
  } catch (e) {
    console.log('[失敗] エラー:', e.message);
  }
}

// 6. 管理者ID変更 (追加)
async function changeAdminId() {
  await listCompanies();
  const companyId = await ask('対象の会社IDを入力: ');
  
  const adminRes = await client.query('SELECT * FROM admins WHERE company_id = $1', [companyId]);
  
  if (adminRes.rows.length === 0) {
    console.log('[エラー] その会社の管理者が見つかりません。');
    return;
  }

  const targetAdmin = adminRes.rows[0];
  console.log(`\n現在のログインID: ${targetAdmin.username}`);
  
  const newId = await ask('新しいログインIDを入力: ');
  if (!newId) return console.log('キャンセルしました');

  try {
    await client.query('UPDATE admins SET username = $1 WHERE id = $2', [newId, targetAdmin.id]);
    console.log(`[成功] ログインIDを変更しました: ${targetAdmin.username} -> ${newId}`);
  } catch (e) {
    if (e.code === '23505') {
      console.log('[失敗] そのIDは既に使用されています。別のIDにしてください。');
    } else {
      console.log('[失敗] エラー:', e.message);
    }
  }
}

main();
