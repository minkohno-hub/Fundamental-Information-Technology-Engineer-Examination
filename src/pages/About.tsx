import { useApp } from '../app/context';
import { Link } from '../app/router';

export default function About() {
  const { content } = useApp();
  const src = content?.sources;
  const c = content?.manifest.counts;
  return (
    <div className="stack">
      <h1 tabIndex={-1}>このアプリについて</h1>
      <div className="card">
        <p>基本情報技術者試験（FE）の全範囲を、問題演習を中心に学ぶための無料の非公式Webアプリです。登録・ログイン・インストールは不要で、学習データはこの端末の中だけに保存されます。</p>
        {c && <p className="small">収録問題：{c.total}問（科目A {c.A}問・科目B {c.B}問）。いずれも自動検証とレビューを通過した問題だけを公開しています。<Link to="/coverage">シラバスの論点ごとの収録状況</Link></p>}
        {src && <p className="small muted">{src.disclaimer}</p>}
      </div>
      {src && (
        <>
          <div className="card">
            <h2>参照した公式情報（確認日 {src.checkedAt}）</h2>
            <ul className="small">
              {src.official.map((o) => (
                <li key={o.url} style={{ marginBottom: 8 }}><a href={o.url} target="_blank" rel="noopener noreferrer">{o.name}</a><br /><span className="muted">{o.note}</span></li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2>出典と利用条件</h2>
            <p className="small">{src.license.original}</p>
            <p className="small">{src.license.ipa}</p>
            <p className="small">IPA 公開問題は「試験に関するよくある質問」の利用条件（教育目的の使用は許諾・使用料不要、出典の明記、改変の明記）に従って掲載しています。各問題の解説の末尾に、問題ID・出典・改変の有無を表示しています。</p>
          </div>
        </>
      )}
      <div className="card">
        <h2>品質について</h2>
        <ul className="small">
          <li>すべての問題でスキーマ（必須項目・選択肢数・正解番号・各選択肢の解説）と重複・類似を自動検査しています。</li>
          <li>計算問題は、作問とは別に記述した検算式で正答を計算して照合しています。</li>
          <li>擬似言語の問題は、IPA の記述形式に従うインタプリタで実際に実行し、正解の選択肢だけがテストケースを満たすことを確認しています。</li>
          <li>知識問題は作成後に正答の根拠をシラバス等と照合するレビューを行っていますが、専門家による人手の監修は受けていません。誤りに気付いた場合は各問題の「誤りを報告」からお知らせください。</li>
        </ul>
        <p className="small"><a href="https://github.com/minkohno-hub/fundamental-information-technology-engineer-examination" target="_blank" rel="noopener noreferrer">GitHub リポジトリ</a>（ソースコード・品質レポート・問題データ）</p>
      </div>
    </div>
  );
}
