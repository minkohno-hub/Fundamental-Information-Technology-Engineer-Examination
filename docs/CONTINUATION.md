# 作業の引き継ぎ

最終更新：2026-10-22（開発を中断。下記から再開できる）

## 公開状況

- 公開 URL：https://minkohno-hub.github.io/Fundamental-Information-Technology-Engineer-Examination/
- GitHub Pages（Source＝GitHub Actions）で公開済み。push のたびに自動デプロイ。2026-10-21 に公開環境でホーム表示・問題演習・オフライン再読み込み・用語辞典・横スクロールなしを確認（スマホ幅）

## Git

- ブランチ：`claude/fe-exam-learning-app-nuiom6`（リモートに push 済み。Pull Request は未作成）
- 教材作成は `.claude/worktrees/` の作業ツリー（ブランチ `worktree-agent-*`）で並行して行い、完了後にこのブランチへマージしている

## 最後に成功したテスト

- `npm run content`：エラー 0（公開 1,392 問、網羅 624/624）
- `npm run check:release`：すべての公開条件を満たす
- `npm test`：72 件成功（a11y・キーボード操作の E2E を含め E2E 118 件成功）
- `npx vite build && npm run test:e2e`：118 件成功（スマホ・PC、オフライン・アクセシビリティ・キーボード含む）
- GitHub Actions：教材ビルド・型検査・単体テスト・ビルドは成功

## 失敗している項目

- なし（Pages は有効化済み）

## 中断時点の状態（2026-10-22）

- `claude/fe-exam-learning-app-nuiom6` の最新 = リモートの最新。未コミットの変更なし。バックグラウンド作業なし
- 公開サイトは最新の push（公開 1,392 問、網羅 624/624）で動作中
- 別ブランチ `worktree-agent-a00816fd4aba2593e`（`.claude/worktrees/agent-a00816fd4aba2593e`）は利用上限で止まった作業の残骸。マージしていない。内容は下記「残作業 1」の途中成果

## 再開手順

1. `git checkout claude/fe-exam-learning-app-nuiom6 && git pull`、`npm ci`（または `npm install --legacy-peer-deps`）
2. `npm run content && npx vitest run && npx vite build && npx playwright test` が全部通ることを確認
3. 下の「残作業」を上から着手。教材を増やす・直すときは `docs/CONTENT_GUIDE.md` に従い、並行作業の統合時は `python3 tools/fix-glossary-dups.py` で用語重複を解消

## 残作業（優先順）

0. （任意の追加品質）用語の別名の監査は完了。第二次レビューは科目Aと科目Bの一部のみ。科目Bの機械検証済み問題は再レビュー対象外
1. 壊れた保存データへの耐性（IndexedDB の不正レコードを無視して起動できること、長いメモの上限、保存失敗時の通知、教材更新で消えた問題 ID の扱い）の実装とテスト、および Firefox / WebKit での E2E（この環境にブラウザを入れられるか確認。不可なら `docs/QUALITY_REPORT.md` の既知の制約に明記）

1. 追加の一次情報照合（`docs/FACTCHECK_LOG.md` の未確認項目）
2. iOS Safari 実機での確認
3. 擬似言語の `÷` の整数除算など、IPA 仕様が定めていない挙動は問題文で前提を明示する運用を継続

## 未検証事項

- 知識問題の第三者監修、法務・規格の原典照合
- 実機（iOS Safari）での確認
