# 作業の引き継ぎ

最終更新：2026-10-29

## 再開メモ（2026-10-29）

- ユーザーの指示で、実装主体を Muse Wonder（専用チャット「基本情報技術者 学習アプリ開発（Claude）」）へ移して再開。Claude セッションへの送信・監視は行わない。ブランチ運用（`claude/fe-exam-learning-app-nuiom6` のみ、PR はユーザーが明示するまで作らない）は従来どおり。コミットへの Claude 名義の署名行は、実装主体が変わったため付けない。
- PR 保留の解除（2026-10-29）：ユーザーが FP 側チャットで「PRを勝手にやってもいいです」と明言し、FE にも適用される明示許可として伝達された。`HANDOFF_PROMPT.md` の「ユーザーが明示するまで Pull Request を作らない」は解除済み。今後は品質ゲート（テスト・ビルド green、独立レビュー合格）通過後に、PR の作成とマージまで自律的に行う。なお本リポジトリには main ブランチがなく、デフォルト（兼デプロイ対象）が `claude/fe-exam-learning-app-nuiom6` のため、PR は作業ブランチからこのブランチへ向ける形になる。
- 再開時の実測：公開 1,478 問（A 1,233・B 245）、作成 1,574 問、H2 作成 182（公開 86・未レビュー 96）、用語 2,441、網羅 624/624、教材ビルドエラー 0、単体テスト 80 件通過、型検査クリーン。
- A04 第1バッチ完了：`04-h2-a04.yaml`（A04-501〜508、8 問。信頼性・RAID・待ち行列・性能・TCO）を新規作成し、用語 2 件（ホットスペア、リトルの法則）を `content/glossary/h2-a04.yaml` に追加。執筆後に独立レビュー（解答を伏せた解き直し・全問再計算・誤答検証・既存 36 問との重複確認）で全問合格し、`reviewed:` を付与して公開。公開 1,486 問（A 1,241）、H2 公開 94 問（応用+高難度 76.6%）。A04 の残りは 37 問（目標 45）。

## 中断メモ（2026-10-28）

- ユーザーの指示で中断。開発ブランチ `claude/fe-exam-h2-expansion-0x88gw` と `claude/fe-exam-learning-app-nuiom6` は同一コミットで push 済み（デプロイ対象は後者）
- 第2波として起動した10担当（A04、A22、A15+A16、A23+A13+A08、balg1 追記、balg2、balg3 追記、B-SEC、A01+A02 追記、A10、A11 追記）は**コミット前に停止**。成果はなく、H2 の問題数は 182 のまま
- 再開時：`.claude/worktrees/agent-*`（ブランチ `worktree-agent-*`）は未使用の古い基底。`git worktree remove -f` で片付けてよい
- 再開手順：担当ごとに新しいエージェントを起動する（プロンプトは `docs/H2_WRITER_BRIEF.md` を読ませ、ファイル名・ID 範囲・問題数を指定）。担当割当は `docs/HANDOFF_PROMPT.md` の 6.3 と本ファイルの目標数を参照。未着手：A04、A22、A23、A13、A08、A15、A16、B-ALG 3、B-SEC、A10b、A11b、ほか既存ファイルの続き
- 執筆要領のトピック一覧は `content/syllabus/syllabus-9.2.json` の majors→middles→subs→items から `大-中-小-項目` の ID で生成できる

## 公開状況

- 公開 URL：https://minkohno-hub.github.io/Fundamental-Information-Technology-Engineer-Examination/
- GitHub Pages（Source＝GitHub Actions）で公開済み。push のたびに自動デプロイ。2026-10-21 に公開環境でホーム表示・問題演習・オフライン再読み込み・用語辞典・横スクロールなしを確認（スマホ幅）

## Git

- ブランチ：`claude/fe-exam-learning-app-nuiom6`（リモートに push 済み。Pull Request は未作成）
- 教材作成は `.claude/worktrees/` の作業ツリー（ブランチ `worktree-agent-*`）で並行して行い、完了後にこのブランチへマージしている

## 最後に成功したテスト

- `npm run content`：エラー 0（公開 2,002 問、網羅 624/624、用語 2,684 語、レビュー待ち 0）
- `npm run check:release`：`ENFORCE_H2=1` でもすべての公開条件を満たす
- `npm test`：80 件成功、`npx tsc --noEmit`：成功
- `npx vite build && npm run test:e2e`：Chromium（スマホ・PC）・Firefox・WebKit で成功（オフライン・アクセシビリティ・キーボード・保存データ破損対策を含む）
- GitHub Actions：教材ビルド・型検査・単体テスト・ビルドは成功

## 失敗している項目

- なし（Pages は有効化済み）

## 完了：H2 高難度拡充（2,000問以上）

- **達成（2026-10-30）**：公開 2,002 問（科目A 1,635・科目B 367）。H2 の追加は 610 問で、全て独立レビュー（別のエージェントが回答を伏せて解き直し、正答・解説・重複を確認）を通過して `reviewed:` を付与済み。レビュー待ちは 0。
- 検証：`npm run content` エラー 0、`npm test` 80 件成功、`npx tsc --noEmit` 成功、`ENFORCE_H2=1 npm run check:release` はすべての公開条件を満たす。
- 以下は達成までの経緯の記録である。

## 進行中だった当時の記録：H2 高難度拡充（2,000問以上）

- 目標：公開 2,000 問以上、追加 608 問以上（目安 780）、追加の 70% 以上が応用・高難度、全追加問題が現行シラバス内（scope 必須）
- 書式：`docs/CONTENT_GUIDE.md`「難易度と高難度拡充バッチ（H2）」。問題ファイルは `content/questions/*/<分野>-h2-<キー>.yaml`（ファイル先頭に `batch: H2`）
- 集計：`docs/generated/hard-batch.json`、判定：`ENFORCE_H2=1 npm run check:release`
- 手順：執筆（並行ワークツリー）→ 独立レビュー（正答・範囲・重複）→ 統合（`python3 tools/fix-glossary-dups.py`）→ テスト → push → 公開確認
- 状況は `docs/PROGRESS.md` の H2 行を参照
- **中断中（2026-10-27）**：基盤と執筆要領（`docs/H2_WRITER_BRIEF.md`）は push 済み。利用上限（リセット 16:00 UTC）で執筆担当の多くが途中停止。書けた分は開発ブランチに統合済み（下表）。ファイル先頭に `reviewed:` がない H2 ファイルは**未レビューとして非公開**（ビルドの仕様）。独立レビューで正答・範囲を確認してから `reviewed:` を付けて公開する
- 現在の H2 ファイルと問題数：
  - `01-h2-a01a.yaml`：8 問（公開）
  - `01-h2-a01b.yaml`：9 問（未レビュー（非公開））
  - `02-h2-a02.yaml`：8 問（未レビュー（非公開））
  - `03-h2-a03a.yaml`：9 問（公開）
  - `03-h2-a03b.yaml`：20 問（公開）
  - `04-h2-a04.yaml`：8 問（公開。2026-10-29 追加、独立レビュー合格済み）
  - `07-h2-a07.yaml`：8 問（公開）
  - `09-h2-a09a.yaml`：8 問（公開）
  - `09-h2-a09b.yaml`：8 問（未レビュー（非公開））
  - `10-h2-a10a.yaml`：13 問（未レビュー（非公開））
  - `11-h2-a11a.yaml`：14 問（未レビュー（非公開））
  - `12-h2-a12a.yaml`：8 問（未レビュー（非公開））
  - `12-h2-a12b.yaml`：12 問（公開）
  - `14-h2-a14.yaml`：9 問（未レビュー（非公開））
  - `17-h2-a17.yaml`：12 問（公開）
  - `19-h2-a19.yaml`：9 問（未レビュー（非公開））
- 未着手の担当：A22（会計・OR 40 問、A22-501〜）、A23（法務 20 問、A23-501〜）、B-ALG 3 担当（B-ALG-201/301/401〜 各 40 問）、B-SEC（B-SEC-101〜 30 問）。途中停止した担当（A01〜A19 の各ファイル）は、目標数（`docs/H2_WRITER_BRIEF.md` と下記）に達するまで同じファイル名・続きの ID で追記
- 目標数（ファイル）：a01a 25（A01-501〜）、a01b 20（601〜）、a02 40（A02-501〜）、a03a 25、a03b 20（完了）、a04 45、a05 25＋A06 8、a07：A07 8＋A08 10＋A13 20、a09a 25、a09b 20（601〜）、a10a 25、a10b 25（601〜）、a11a 28、a11b 27（601〜）、a12a 25（701〜）、a12b 25（801〜）、a14 35、a15：A15 22＋A16 8、a17：A17 12＋A18 12、a19：A19 18＋A20 5＋A21 15。ファイル名は `<分野>-h2-<キー>.yaml`
- 次のステップ：未完了の担当を再開（新しいエージェントに「ファイル X の続きを ID N から書く」と指示）→ 全完了後に独立レビュー（別のエージェントが回答を伏せて解き直し、範囲・重複を確認し `reviewed:` を付与）→ 統合 → `ENFORCE_H2=1 npm run check:release` → push → 公開確認

## 引き継ぎプロンプト

新しいチャットへ貼る全文は `docs/HANDOFF_PROMPT.md`。2026-10-28 時点：H2 は約182問執筆、ローカルのビルドで作成1,574／公開1,478（未レビュー96は非公開）。

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
