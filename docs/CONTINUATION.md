# 作業の引き継ぎ

最終更新：2026-10-22

## 公開状況

- 公開 URL：https://minkohno-hub.github.io/Fundamental-Information-Technology-Engineer-Examination/
- GitHub Pages（Source＝GitHub Actions）で公開済み。push のたびに自動デプロイ。2026-10-21 に公開環境でホーム表示・問題演習・オフライン再読み込み・用語辞典・横スクロールなしを確認（スマホ幅）

## Git

- ブランチ：`claude/fe-exam-learning-app-nuiom6`（リモートに push 済み。Pull Request は未作成）
- 教材作成は `.claude/worktrees/` の作業ツリー（ブランチ `worktree-agent-*`）で並行して行い、完了後にこのブランチへマージしている

## 最後に成功したテスト

- `npm run content`：エラー 0（公開 1,392 問、網羅 624/624）
- `npm run check:release`：すべての公開条件を満たす
- `npm test`：78 件成功
- `npx vite build && npm run test:e2e`：Chromium（スマホ・PC）・Firefox・WebKit で成功（オフライン・アクセシビリティ・キーボード・保存データ破損対策を含む）
- GitHub Actions：教材ビルド・型検査・単体テスト・ビルドは成功

## 失敗している項目

- なし（Pages は有効化済み）

## 再開手順

1. `git checkout claude/fe-exam-learning-app-nuiom6 && git pull`、`npm ci`（または `npm install --legacy-peer-deps`）
2. `npm run content && npx vitest run && npx vite build && npx playwright test` が全部通ることを確認
3. 下の「残作業」を上から着手。教材を増やす・直すときは `docs/CONTENT_GUIDE.md` に従い、並行作業の統合時は `python3 tools/fix-glossary-dups.py` で用語重複を解消

## 残作業（優先順）

1. iOS Safari / Android Chrome / Firefox 実機での確認（Playwright の WebKit / Firefox では確認済み）
2. 追加の一次情報照合（`docs/FACTCHECK_LOG.md` の未確認項目）と、専門家による問題内容の監修
3. 擬似言語の `÷` の整数除算など、IPA 仕様が定めていない挙動は問題文で前提を明示する運用を継続

## 未検証事項

- 知識問題の第三者監修、法務・規格の原典照合
- 実機（iOS Safari）での確認
