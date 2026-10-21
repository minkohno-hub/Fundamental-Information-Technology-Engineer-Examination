# アーキテクチャ

## 構成

| 層 | 内容 |
| --- | --- |
| 教材ソース | `content/`（YAML）：`questions/A/*.yaml`、`questions/B/*.yaml`、`glossary/*.yaml`、`reference/*.yaml`、`lessons/programming.yaml`、`syllabus/syllabus-9.2.json`、`syllabus/subject-b.yaml`、`sources.yaml` |
| 教材ビルド | `tools/build-content.ts`：スキーマ検証、正答と解説の整合、計算の独立検算（`verify.value`）、擬似言語の実行検証（`verify.cases`/`result`）、SQL の SQLite 実行検証、用語の存在確認、重複・類似検出（文字3-gram Jaccard）、網羅率計算。出力は `public/data/*.<hash>.json` と `manifest.json`、レポートは `docs/generated/` |
| アプリ | Vite 6 + React 19 + TypeScript。ハッシュルーティング（`src/app/router.tsx`）、ページは遅延読み込み |
| 擬似言語 | `src/pseudo/`（lexer・parser・interpreter）。トレース記録付きで実行し、シミュレーターと教材検証の両方で使う |
| 学習ロジック | `src/lib/`：出題選択（selection）、分析（stats）、模試構成（exam）、バックアップ検証（backup）、学習プラン（plan）、文字列正規化（text）、乱数（rng） |
| 保存 | `src/data/store.ts`：IndexedDB（answers/states/exams/reports/kv）、使えない場合はメモリ保存に切替えて通知 |
| 教材取得 | `src/data/content.ts`：manifest をネットワーク優先で取得、本体はハッシュ付きファイルを Cache Storage（`fe-content-v1`）に保存、古い版を削除 |
| オフライン | vite-plugin-pwa（Workbox generateSW）でアプリ本体をプリキャッシュ。教材 JSON はアプリ側でキャッシュ。更新は確認バーから適用 |
| 公開 | `.github/workflows/deploy.yml`：教材ビルド → 型検査 → 単体テスト → ビルド → Pages デプロイ |

## データの流れ

1. 起動時に `store.init()` で学習データを読み込み、`loadContent()` で教材を取得（オフライン時はキャッシュ）
2. 出題は `selectQuestions()` が状態（QuestionState）と直近の回答から決定し、セッションを IndexedDB に保存（再読み込みで続きから再開）
3. 回答は AnswerRecord として追記し、初回回答かどうかを記録（初見正答率の計算に使用）
4. 分析は保存済みの実データだけから計算する

## 安全性

- 問題文などは `RichText` が限定的な記法だけを React 要素に変換する（`dangerouslySetInnerHTML` は使わない）
- 本番ビルドでは CSP を付与（外部への接続なし）
- インポートは `parseBackup()` で型・範囲・ID 形式を検証し、置き換え前に確認する
