# 作業の引き継ぎ

最終更新：2026-10-21

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

- GitHub Actions の `configure-pages`：「Create Pages site failed. Resource not accessible by integration」。リポジトリ所有者が **Settings → Pages → Build and deployment → Source を「GitHub Actions」** に設定する必要がある。設定後、Actions の最新 run を Re-run すればデプロイされる見込み（未検証）

## 残作業（優先順）

1. Pages 有効化（上記）後、Actions を Re-run → 公開 URL で主要機能・オフラインを確認し、README と本書に URL を記載
2. 用語の別名の監査（別概念が別名になっているものを独立項目にする）：作業ツリー `.claude/worktrees/agent-a1f95d677592b6b3f` で途中。完了したらマージ
3. IPA 公開問題 科目B 24 問（`content/questions/IPA/b.yaml`、現在 rejected）を擬似言語で再現し、`verify` 付きで公開
4. 知識問題（特に法務・規格）の原典照合
5. 学習プラン画面・科目B 短時間学習・シミュレーターの E2E 追加

## 未検証事項

- 知識問題の第三者監修、法務・規格の原典照合
- 学習プラン画面の自動テスト
- 実機（iOS Safari）での確認
