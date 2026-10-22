# 過去問演習 — 本番版

個人用の過去問演習PWA。ホーム、出題設定、問題演習、結果、学習進捗、設定・データ管理の6画面です。IndexedDBに学習状態と教材を保存し、Service Workerで本体・数式・フォントをオフライン保存します。教材は現在0問です。

公開先：<https://wtawdflwld.github.io/exam-trainer/>

## このリポジトリの公開方法

既存のGitHub Pages設定 **Deploy from a branch / main / (root)** をそのまま使います。ルートの `index.html`, `sw.js`, `app-release.json`, `catalog.json`, `releases/` が生成済み配信ファイルです。`.nojekyll` も含めて登録してください。GitHub Actionsへの設定変更は不要です。

試作版の `app.js`, `style.css`, `questions.csv`, `questions_edit_template.xlsx`, 旧manifest、旧ルートアイコン、例題用SVGは削除対象です。必要なアイコンは本番版の資源として `web/` と `releases/` に同梱しています。PC内の元ZIPとブラウザーの学習DBを削除する処理は行いません。

## 教材を追加・修正する

1. 教材担当ChatGPTへ [教材作成ガイド.md](教材作成ガイド.md) と現在の資格別CSVを渡します。全問題を残して追加・修正します。
2. `data/denko1.csv` または `data/denko2.csv` をUTF-8で更新します。画像は `images/<問題ID>/` に配置します。
3. このREADMEのフォルダーで実行します（Node.js 20.11以降）。

```powershell
node scripts/prepare-pages.mjs
```

4. 成功したら、ソースの変更と生成されたルートの変更をGitHubへ反映します。Gitを使う場合は `git add -A` → commit → `git push origin main`。CSVだけをGitHub画面で直接変更しても整合性チェックにより取り込めません。
5. GitHub Pagesの公開完了を待ち、iPhoneのホーム画面アプリで「設定・データ管理 → 対象資格の教材を更新」。中断演習が使う資格は完了・明示的破棄後に更新します。

`prepare-pages.mjs` は既存の `build.mjs` を実行し、教材一覧・ハッシュ・版を生成して配信ファイルをルートへコピーします。`dist/` は一時生成先でGit管理から除外します。生成済みindexやカタログを手編集しません。新資格・新試験回はガイドに従って `data/exams.json` も編集します。

## PCで起動確認

```powershell
node scripts/serve.mjs . 8000
```

<http://localhost:8000/> を開きます。停止はCtrl+C。GitHub Pages公開後のiPhone利用では、このサーバーを起動しておく必要はありません。

## 試作版から切り替える

旧版で学習していた場合は旧版JSONを先に保管してください。旧形式は本版へ直接復元できません。旧試作の問題・例題は本版へ収録していません。公開後はオンラインで試作版のタブ／ホーム画面アプリを閉じて開き直し、新しい画面で「アプリ・数式・フォント：オフライン保存済み」を確認してください。旧版表示が残る場合はSafariで公開URLを開き直してください。サイトデータの一括消去は学習記録を消すため、切り替えの標準手順にはしていません。

## 利用とデータ保護

選択肢タップで解答確定。「わからない」は不正解。保存失敗時は解説を保持し、成功まで次へ進めません。中断演習は順序・位置・解答を保存します。教材更新・削除で学習状態は削除しません。JSONバックアップは学習状態・中断演習・前回設定を含み、教材は含みません。復元は事前確認後の全置換です。アプリ本体の更新は通知後の手動適用です。

定期的にJSONを「ファイル」等へ保存してください。iPhone実機でのホーム画面起動・共有シート保存は未確認です。実装時のWindows Chrome確認は [docs/確認結果.md](docs/確認結果.md)、採用技術は [docs/採用技術と保存更新方式.md](docs/採用技術と保存更新方式.md) を参照してください。

## ソース

`web/` が本体、`data/` と `images/` が教材、`scripts/` がビルド・ローカル配信です。KaTeX 0.16.22と全数式フォントを同梱。ライセンスは `web/vendor/KATEX-LICENSE.txt`。ログイン、サーバー処理、同期はありません。
