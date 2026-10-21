# 作業の引き継ぎ

最終更新：2026-10-21

## 公開状況

- 公開 URL：https://minkohno-hub.github.io/Fundamental-Information-Technology-Engineer-Examination/
- GitHub Pages（Source＝GitHub Actions）で公開済み。push のたびに自動デプロイ。2026-10-21 に公開環境でホーム表示・問題演習・オフライン再読み込み・用語辞典・横スクロールなしを確認（スマホ幅）

## Git

- ブランチ：`claude/fe-exam-learning-app-nuiom6`（リモートに push 済み。Pull Request は未作成）
- 教材作成は `.claude/worktrees/` の作業ツリー（ブランチ `worktree-agent-*`）で並行して行い、完了後にこのブランチへマージしている

## 最後に成功したテスト

- `npm run content`：エラー 0（公開 1,362 問、網羅 624/624）
- `npm run check:release`：すべての公開条件を満たす
- `npm test`：52 件成功
- `npx vite build && npm run test:e2e`：16 件成功（スマホ・PC、オフライン含む）
- GitHub Actions：教材ビルド・型検査・単体テスト・ビルドは成功

## 失敗している項目

- なし（Pages は有効化済み）

## 残作業（優先順）

1. IPA 公開問題 科目B の残り 12 問（`content/questions/IPA/b-alg.yaml` ほか）：擬似言語インタプリタの未対応構文（`繰返し処理を終了する`、平方根・商・余り表現、文字列・配列の操作文など）を実装すれば公開できる
2. 知識問題の原典照合の続き（`docs/FACTCHECK_LOG.md` に確認済み・未確認を記録）
3. 学習プラン画面・科目B 短時間学習・シミュレーターの E2E 追加

## 未検証事項

- 知識問題の第三者監修、法務・規格の原典照合
- 学習プラン画面の自動テスト
- 実機（iOS Safari）での確認
