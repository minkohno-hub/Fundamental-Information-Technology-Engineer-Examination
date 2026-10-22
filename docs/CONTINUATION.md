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

## 進行中：H2 高難度拡充（2,000問以上）

- 目標：公開 2,000 問以上、追加 608 問以上（目安 780）、追加の 70% 以上が応用・高難度、全追加問題が現行シラバス内（scope 必須）
- 書式：`docs/CONTENT_GUIDE.md`「難易度と高難度拡充バッチ（H2）」。問題ファイルは `content/questions/*/<分野>-h2-<キー>.yaml`（ファイル先頭に `batch: H2`）
- 集計：`docs/generated/hard-batch.json`、判定：`ENFORCE_H2=1 npm run check:release`
- 手順：執筆（並行ワークツリー）→ 独立レビュー（正答・範囲・重複）→ 統合（`python3 tools/fix-glossary-dups.py`）→ テスト → push → 公開確認
- 状況は `docs/PROGRESS.md` の H2 行を参照
- **中断中（2026-10-22）**：基盤は push 済み。問題の執筆は開始直後に中断したため、H2 の問題はまだ 0 問（公開 1,392 問のまま）
- 再開時の分担（目標 約 780 問）：科目A 約 630 問（01〜23 分野。基数変換・論理演算／確率・符号／アルゴリズム・データ構造／CPU性能・キャッシュ／入出力・論理回路／信頼性・RAID・待ち行列／OS・ハード／UI・メディア・開発手法／SQL／トランザクション・正規化／ネットワーク計算／プロトコル／暗号・認証／脅威・リスク／テスト技法／要件・設計／EVM・PERT／サービスマネジメント・監査／戦略・企画／経営・技術・ビジネス／会計・OR／法務）、科目B 約 150 問（ALG 120＝多重ループ・配列・探索整列／再帰・スタック・キュー・木／関数・境界・誤り発見・数理、SEC 30）
- 各担当の ID：科目A は `A<分野>-501` 以降（同分野で複数なら 601・701・801）、科目B は `B-ALG-201/301/401`、`B-SEC-101`。1 バッチ（約 8 問）ごとにコミットすること

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
