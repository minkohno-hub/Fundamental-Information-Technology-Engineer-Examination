// シラバスの論点ごとの収録状況（ビルド時に計算した網羅データを表示）
import { useApp } from '../app/context';
import { pick, startSession } from '../app/session';

export default function Coverage() {
  const { content } = useApp();
  const cov = content!.coverage;
  return (
    <div className="stack">
      <h1 tabIndex={-1}>シラバスの網羅状況</h1>
      <div className="card">
        <p style={{ margin: 0 }}>シラバス Ver.{content!.syllabus.version} の末端の学習論点 <strong>{cov.leafCovered} / {cov.leafTotal}</strong> に問題を収録しています（{Math.round((cov.leafCovered / cov.leafTotal) * 100)}%）。</p>
        <p className="xsmall muted" style={{ marginBottom: 0 }}>末端の学習論点：シラバスの小分類の中の各項目（項目がさらに①②…に分かれる場合はその単位）。小分類全体に紐づくだけの問題は網羅に数えていません。</p>
      </div>
      <div className="card">
        <h2>科目A（中分類別）</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">中分類</th><th scope="col">問題数</th><th scope="col">論点の網羅</th></tr></thead>
            <tbody>
              {cov.middles.map((m) => (
                <tr key={m.no}>
                  <td>{m.no}. {m.name}<br /><span className="xsmall muted">{m.field}</span></td>
                  <td>{m.verified}</td>
                  <td>{m.leafCovered}/{m.leafTotal}
                    {m.uncovered.length > 0 && <details><summary className="xsmall">未収録の論点</summary><ul className="xsmall">{m.uncovered.map((u) => <li key={u}>{u}</li>)}</ul></details>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>科目B（試験要綱の出題範囲別）</h2>
        <ul className="list">
          {cov.subjectB.map((b) => (
            <li key={b.id} className="item">
              <span className="grow">{b.name}</span>
              <span className="small">{b.questions}問</span>
              {b.questions > 0 && <button className="btn sm" onClick={() => startSession('practice', b.name, pick(content!.questions.filter((q) => q.topicIds.includes(b.id)), 'standard', 10))}>解く</button>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
