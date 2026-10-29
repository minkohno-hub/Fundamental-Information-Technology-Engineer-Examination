# 進捗

状態の区分：未着手／実装途中／実装済み・未検証／検証済み／不具合あり／完了

| 項目 | 状態 | 根拠 |
| --- | --- | --- |
| 公式情報の確認・シラバス構造化（Ver.9.2、624 末端論点） | 検証済み | `content/syllabus/`、ビルドで論点 ID を検証 |
| アプリ基盤（Vite/React/TS、ルーティング、PWA、CSP） | 検証済み | 型検査・E2E |
| 端末内保存・中断再開・エクスポート/インポート | 検証済み | storage.test.ts、E2E |
| 一問一答・標準出題・各種出題モード | 検証済み | learning.test.ts、E2E |
| 科目B 短時間学習（入力式含む）・計算/プログラムモード | 検証済み | features.spec.ts |
| 擬似言語インタプリタ・シミュレーター | 検証済み（既知の制約あり） | pseudo.test.ts、全シミュレーター問題の実行テスト |
| 模擬試験・試験後分析・復習セット | 検証済み | exam.test.ts、E2E |
| 学習分析・学習プラン | 検証済み | learning.test.ts |
| 用語辞典・検索 | 検証済み | E2E（略語の正式名称表示） |
| オフライン対応 | 検証済み | offline.spec.ts（遮断後の再読み込みで演習・辞典） |
| 問題 1,000 問以上（verified） | 達成：2,002 問（科目A 1,635・科目B 367） | content-summary.json |
| シラバス網羅（末端論点 80% 以上・23 中分類） | 達成：624/624 | coverage.json |
| コンパクト参考書 | 完了：14 章 | 教材ビルド |
| プログラミング講座 | 完了：12 回 | 教材ビルド |
| IPA 公開問題の取り込み | 完了：令和5〜8年度の科目A 80 問・科目B 24 問をすべて公開（図は表に置換、改変は問題ごとに明記） | content/questions/IPA/ |
| ドキュメント | 完了 | docs/ |
| GitHub Pages 公開 | 完了 | https://minkohno-hub.github.io/Fundamental-Information-Technology-Engineer-Examination/ |
| ブラウザ対応・堅牢性（壊れた保存データ、保存失敗、教材更新） | 検証済み（Chromium / Firefox / WebKit） | robustness.spec.ts、QUALITY_REPORT |
| 公開環境での動作確認 | 検証済み（スマホ幅・オフライン含む）。iOS 実機は未確認 | 2026-10-21 |
| H2 高難度拡充（2,000問以上） | 達成（2026-10-30）：公開 2,002 問（H2 で 610 問を追加）、レビュー待ち 0。全 H2 ファイルが独立レビュー（盲検で再解答し、正答・解説・重複を確認）を通過。`ENFORCE_H2=1 npm run check:release` はすべての公開条件を満たす | docs/generated/hard-batch.json |
