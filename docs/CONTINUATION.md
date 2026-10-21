# 作業の引き継ぎ

最終更新：2026-10-21

## Git

- ブランチ：`claude/fe-exam-learning-app-nuiom6`（リモートに push 済み。Pull Request は未作成）
- 教材作成は `.claude/worktrees/` の作業ツリー（ブランチ `worktree-agent-*`）で並行して行い、完了後にこのブランチへマージしている

## 最後に成功したテスト

- `npm run content`：エラー 0（公開 1,040 問）
- `npm test`：52 件成功
- `npx vite build && npm run test:e2e`：16 件成功（スマホ・PC、オフライン含む）
- GitHub Actions：教材ビルド・型検査・単体テスト・ビルドは成功

## 失敗している項目

- GitHub Actions の `configure-pages`：「Create Pages site failed. Resource not accessible by integration」。リポジトリ所有者が **Settings → Pages → Build and deployment → Source を「GitHub Actions」** に設定する必要がある。設定後、Actions の最新 run を Re-run すればデプロイされる見込み（未検証）
- `npm run check:release`：中分類 21〜23 の問題、網羅率 80%、参考書、一部 docs が未達

## 作業中・残作業（優先順）

1. 中分類 21〜23（ビジネスインダストリ・企業活動・法務）の問題と用語：作業ツリーで作成中 → マージ後に `python3 tools/fix-glossary-dups.py` で用語重複を解消
2. シラバス未網羅論点の補充：12（41論点）、13〜19（約40論点）を作成中 → `docs/CONTENT_COVERAGE.md`（`node tools/gen-coverage-doc.mjs` で再生成）で確認
3. コンパクト参考書 13 章（`content/reference/*.yaml`）を作成中
4. 用語の別名の監査（別概念が別名になっているものを独立項目にする）を実施中
5. Pages 有効化後：公開 URL で主要機能・オフラインを確認し、README と本書に URL を記載
6. IPA 公開問題（令和5〜8年度 CBT）の取り込み（出典・改変を明記、図表を再現できない問題は rejected）
7. `npm run check:release` をワークフローに追加（全条件達成後）

## 未検証事項

- 知識問題の第三者監修、法務・規格の原典照合
- 学習プラン画面の自動テスト
- 実機（iOS Safari）での確認
