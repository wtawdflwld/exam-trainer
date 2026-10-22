# GitHubのブラウザー画面で試作版を本番版へ置き換える手順

対象リポジトリ：https://github.com/wtawdflwld/exam-trainer
公開先：https://wtawdflwld.github.io/exam-trainer/

## 1. 事前に用意するもの

- この会話で作成した「exam-trainer_既存リポジトリ置換用_20261022.zip」をWindowsで展開します。
- 展開した中に `index.html`, `sw.js`, `app-release.json`, `catalog.json`, `releases`, `web`, `data`, `scripts` などがあることを確認します。
- 試作版で実際に学習していた場合は、試作アプリからJSONバックアップを先に保存します。旧形式は本番版にそのまま復元できません。
- 対象リポジトリを編集できるGitHubアカウントでログインします。

## 2. 公開設定を確認する

リポジトリ上部の `Settings` → 左側の `Pages` を開きます。

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/ (root)`

現在はこの設定です。リポジトリ自体の削除や、公開の停止、新しいリポジトリの作成は必要ありません。

## 3. 本番版ファイルを先にアップロードする

1. 上部の `Code` へ戻ります。
2. `Add file` → `Upload files` を選びます。
3. 展開したZIPの中身をドラッグ＆ドロップします。ZIPそのものや、外側のフォルダーを追加しないでください。
4. フォルダー構造が保たれていることを確認します。特に `releases/692f9866d1aeb3644087/vendor/fonts/` のような階層を崩さないでください。
5. 件数制限やエラーが出る場合はフォルダーごとに分けます。アプリ資源・フォント・ソース・教材・文書を先に入れ、ルートの `index.html`, `sw.js`, `app-release.json` は必要ファイルが揃った後に入れると切り替え途中の不整合を避けやすくなります。
6. アップロード中の表示が消え、全ファイルの名前が表示されるまで待ちます。
7. `Commit summary` に「本番版の資源を追加」などと入力します。
8. `Commit directly to the main branch` を選択した状態で `Commit changes` を押します。
9. `Processing your files…` の後、リポジトリへ戻り、最新commitに入力した説明が出たら反映完了です。

`Choose your files` は通常ファイル選択です。フォルダー構造を保ってまとめて追加するときはドラッグ＆ドロップが便利です。フォルダー内の個別ファイルを選ぶ場合は、GitHub側でも同じ対象フォルダーのアップロード画面を使います。

`.nojekyll` と `.gitignore` も含めてください。`dist` はPCでの一時生成先なので、この置換用構成では登録しません。`web` は編集用ソース、ルートと `releases` は配信用です。

## 4. 新アプリへ切り替わったことを確認する

1. リポジトリ上部の `Actions` を開きます。
2. `pages build and deployment` の処理が成功するまで待ちます。複数のアップロードをした場合、最後のcommitを公開した処理を確認してください。
3. 公開URLをオンラインで開きます。
4. ホームに「今日も、一問ずつ。」が出ていることを確認します。
5. 「設定・データ管理」で「アプリ・数式・フォント：オフライン保存済み」を確認します。教材は0問から開始します。

## 5. 旧ファイルを削除する

新アプリで使わない以下の旧ファイルを削除します。

- `app.js`
- `style.css`
- `questions.csv`
- `questions_edit_template.xlsx`
- ルートの `manifest.webmanifest`
- ルートの `icon-192.png`, `icon-512.png`
- `images/ohm.svg`

削除操作は各ファイルについて次の順です。

1. `Code` 画面で対象ファイル名をクリックします。
2. ファイル上部の `More file actions`（三点メニュー）を押します。
3. `Delete file` を選びます。
4. 削除内容を確認して `Commit changes…` を押します。
5. 確認ダイアログで説明を入力し、`Commit directly to the main branch` のまま `Commit changes` を押します。
6. 一覧や新しいcommitで削除を確認します。

新しい `index.html`, `sw.js`, `README.md` は本番版で置き換えるファイルです。アップロード後に削除しないでください。また、`web` や `releases` の中の同名アイコン・manifestは本番版で必要です。上記の削除対象は旧ルートのファイルだけです。

GitHubのcommit履歴は残ります。過去履歴の消去やforce pushは行いません。

## 6. iPhoneで利用を始める

オンラインでSafariから公開URLを開き、本番版を確認します。旧アプリのタブ／ホーム画面アプリを閉じて開き直してください。本版のオフライン保存完了を確認してから機内モードで起動を試します。サイトデータの一括消去は学習記録も消すため、通常の切り替え手順にはしません。

## 7. 以後、問題を追加するとき

1. Windowsの `data/<資格ID>.csv` と必要画像を更新します。既存問題を残して追加します。
2. READMEのあるフォルダーで `node scripts/prepare-pages.mjs` を実行します。
3. 成功後、変更された教材と生成されたルートのファイル・新しい `releases` フォルダーをGitHubへ反映します。
4. Pagesの公開成功を待ち、iPhoneで「設定・データ管理 → 対象資格の教材を更新」を押します。

GitHub上でCSVだけを直接更新すると、生成済み一覧のハッシュと一致せず教材を更新できません。PCで生成処理を行ってからアップロードしてください。教材の詳しい作成方法はルートの「教材作成ガイド.md」を使います。
