import { useEffect, useMemo, useState } from 'react';
import { useApp, useStore } from '../app/context';
import { Link, navigate } from '../app/router';
import { quickStart } from '../app/session';
import { checkOffline, type OfflineStatus } from '../data/content';
import { computeAnalytics } from '../lib/stats';
import { isWeak, isReviewDue } from '../lib/selection';
import { planAdvice } from '../lib/plan';
import { IArrowR, ICode, IExam, IReview, ILesson, IBook, ICloud, IChevron } from '../components/Icons';

export default function Home() {
  const { content } = useApp();
  const st = useStore();
  const [offline, setOffline] = useState<OfflineStatus | null>(null);
  const [count, setCount] = useState(st.settings.defaultCount);

  useEffect(() => {
    if (!content) return;
    let alive = true;
    const check = () => checkOffline(content.manifest).then((o) => alive && setOffline(o));
    void check();
    const t = setTimeout(check, 4000); // Service Worker のプリキャッシュ完了を待って再確認
    return () => { alive = false; clearTimeout(t); };
  }, [content]);

  const a = useMemo(() => content ? computeAnalytics(content.questions, st.answers, Date.now(), content.coverage.leafTotal) : null, [content, st.answers.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!content || !a) return null;
  const now = Date.now();
  const reviewCount = content.questions.filter((q) => isWeak(st.states.get(q.id)) || isReviewDue(st.states.get(q.id), now)).length;
  const session = st.session && st.session.index < st.session.questionIds.length ? st.session : null;
  const inProgressExam = st.exams.find((e) => e.status === 'inProgress');
  const advice = st.settings.plan ? planAdvice(st.settings.plan, a, now) : null;
  const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

  return (
    <div className="stack">
      <section className="hero">
        <h1 tabIndex={-1}>基本情報技術者試験を、1問ずつ確実に。</h1>
        <p className="muted small" style={{ marginBottom: 14 }}>未回答の問題と復習が必要な問題を自動で組み合わせて出題します。</p>
        <button className="btn primary lg block" onClick={() => quickStart(content.questions, count)}>
          今すぐ学習（{count}問）<IArrowR width={20} />
        </button>
        <div className="row" style={{ marginTop: 10 }} role="group" aria-label="問題数">
          {[5, 10, 20, 50].map((n) => (
            <button key={n} className="chip" aria-pressed={count === n} onClick={() => { setCount(n); st.updateSettings({ defaultCount: n }); }}>{n}問</button>
          ))}
        </div>
        {session && (
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => navigate('/session')}>
            続きから：{session.title}（{session.index + 1}/{session.questionIds.length}問目）
          </button>
        )}
        {inProgressExam && (
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => navigate('/exam/run')}>
            模擬試験を再開（科目{inProgressExam.kind}）
          </button>
        )}
      </section>

      {!st.settings.onboarded && (
        <div className="card">
          <h2>学習プランを作りますか？（任意）</h2>
          <p className="small muted">受験予定日や1日の学習時間から、科目A/Bの配分と進め方を提案します。設定しなくてもすぐに学習できます。</p>
          <div className="row">
            <Link to="/plan" className="btn primary sm">設定する</Link>
            <button className="btn sm ghost" onClick={() => st.updateSettings({ onboarded: true })}>今はしない</button>
          </div>
        </div>
      )}

      {advice && (
        <div className="card">
          <h2>今日の目安</h2>
          <p style={{ margin: 0 }}>{advice.headline}</p>
          <p className="small muted" style={{ margin: '6px 0 0' }}>{advice.detail}</p>
        </div>
      )}

      <div className="card">
        <div className="grid three">
          <div className="stat"><span className="v">{st.answersToday()}</span><span className="k">今日の回答数</span></div>
          <div className="stat"><span className="v">{a.streak}日</span><span className="k">連続学習</span></div>
          <div className="stat"><span className="v">{pct(a.first.rate)}</span><span className="k">初見正答率</span><span className="sub">{a.first.total}問中</span></div>
          <div className="stat"><span className="v">{a.unanswered}</span><span className="k">未回答の問題</span><span className="sub">全{content.questions.length}問</span></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="row between small"><span>回答済み {a.answeredQuestions} / {content.questions.length} 問</span><Link to="/analytics">詳しい分析</Link></div>
          <div className="progress ok" aria-hidden="true"><span style={{ width: `${(a.answeredQuestions / content.questions.length) * 100}%` }} /></div>
        </div>
      </div>

      <h2 className="section-title">学習メニュー</h2>
      <ul className="list card" style={{ padding: '4px 14px' }}>
        <MenuItem to="/quick-b" icon={<ICode />} title="科目B 短時間学習" sub="擬似言語・アルゴリズム・セキュリティを単語帳感覚で" />
        <MenuItem to="/deep" icon={<ICode />} title="計算・プログラム読解" sub="計算過程や変数の変化をじっくり追う問題（シミュレーター付き）" />
        <MenuItem to="/review" icon={<IReview />} title={`復習（${reviewCount}問）`} sub="間違えた問題・理解度が低い問題・復習時期の問題" />
        <MenuItem to="/exam" icon={<IExam />} title="模擬試験" sub="科目A 60問90分／科目B 20問100分（短縮版・時間無制限もあり）" />
        <MenuItem to="/lessons" icon={<ILesson />} title="初心者向けプログラミング講座" sub="変数から再帰・整列まで、確認問題つきで段階的に" />
        <MenuItem to="/reference" icon={<IBook />} title="コンパクト参考書・用語辞典" sub="シラバスの章立てで要点だけを整理" />
      </ul>

      <p className="small muted row" style={{ gap: 6 }}>
        <ICloud width={18} />
        {offline === null ? 'オフライン利用の準備状況を確認中…' : offline.contentCached && offline.shellCached ? 'オフライン準備完了：インターネットに接続していなくても学習できます。' : offline.contentCached ? '教材データは保存済みです。アプリ本体の保存が完了するとオフラインで起動できます（再読み込みで完了する場合があります）。' : 'オフライン用の保存を準備中です。'}
        <Link to="/settings">詳細</Link>
      </p>
    </div>
  );
}

function MenuItem({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li>
      <Link to={to} className="item">
        <span style={{ color: 'var(--primary)' }}>{icon}</span>
        <span className="grow"><strong>{title}</strong><br /><span className="small muted">{sub}</span></span>
        <IChevron className="chev" width={18} />
      </Link>
    </li>
  );
}
