"""IPA 基本情報技術者試験シラバス（Ver.9.2）を pdftotext -layout の出力から構造化する。

使い方: pdftotext -layout syllabus_fe_ver9_2.pdf s.txt && python3 tools/parse-syllabus.py s.txt > content/syllabus/syllabus-9.2.json
PDF 本体は IPA の著作物のためリポジトリには含めない。
"""
import json, re, sys, unicodedata

CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮'

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'\s+', ' ', s).strip()
    # 日本語文字間の不要な空白を除去
    s = re.sub(r'(?<=[^\x00-\x7f]) (?=[^\x00-\x7f])', '', s)
    s = re.sub(r' ?([,、。)」]) ?', r'\1', s)
    s = re.sub(r' ?([(「]) ?', r'\1', s)
    s = re.sub(r',(?=\S)', ', ', s) if False else s
    return s

def join(a, b):
    a = a.rstrip(); b = b.strip()
    if a and b and re.match(r'[A-Za-z0-9]', a[-1]) and re.match(r'[A-Za-z]', b[0]):
        return a + ' ' + b
    return a + b

def split_terms(s):
    s = re.sub(r'〔[^〕]*〕', '，', s)
    s = norm(s).replace('・', '，') if s.startswith('・') else norm(s)
    s = re.sub(r'^[，,]', '', s)
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch in '(（': depth += 1
        if ch in ')）': depth -= 1
        if ch in '，,' and depth <= 0:
            if cur.strip(): out.append(cur.strip(' ・'))
            cur = ''
            continue
        cur += ch
    if cur.strip(): out.append(cur.strip(' ・'))
    return [t for t in out if t]

def main(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    # 本文の開始（目次の後の「テクノロジ系」見出し）
    start = next(i for i, l in enumerate(lines) if re.match(r'^\s*テクノロジ系\s*$', l))
    majors = []
    cur_major = cur_mid = cur_sub = cur_item = None
    mode = None  # 'goal' | 'desc' | 'terms'
    buf_terms = ''
    def flush_terms():
        nonlocal buf_terms
        if cur_item is not None and buf_terms:
            cur_item['terms'].extend(split_terms(buf_terms))
        buf_terms = ''
    field = None
    for raw in lines[start:]:
        l = raw.rstrip()
        s = l.strip()
        if not s or s.startswith('Copyright') or re.match(r'^-\s*\d+\s*-$', s):
            continue
        if re.match(r'^[ぁ-ゖ\s]+$', s) and len(s.replace(' ', '')) <= 8:
            continue  # ルビ行
        if s in ('テクノロジ系', 'マネジメント系', 'ストラテジ系'):
            field = s; continue
        m = re.match(r'^大分類\s*(\d+)：(\S+)\s+中分類\s*(\d+)：(\S+)', s)
        if m:
            flush_terms()
            mj, mjn, md, mdn = int(m[1]), m[2], int(m[3]), m[4]
            if not majors or majors[-1]['no'] != mj:
                cur_major = {'no': mj, 'name': mjn, 'field': field, 'middles': []}
                majors.append(cur_major)
            if not cur_major['middles'] or cur_major['middles'][-1]['no'] != md:
                cur_mid = {'no': md, 'name': mdn, 'subs': []}
                cur_major['middles'].append(cur_mid)
            cur_sub = cur_item = None; mode = None
            continue
        m = re.match(r'^(\d+)[\.．]\s*(\S.*)$', s)
        if m and cur_mid is not None and int(m[1]) == len(cur_mid['subs']) + 1 and len(m[2]) < 40:
            flush_terms()
            cur_sub = {'no': int(m[1]), 'name': norm(m[2]), 'goals': [], 'items': []}
            cur_mid['subs'].append(cur_sub); cur_item = None; mode = None
            continue
        if s.startswith('【目標】'):
            mode = 'goal'; continue
        if s.startswith('➢') and cur_sub is not None:
            cur_sub['goals'].append(norm(s[1:])); mode = 'goal'; continue
        m = re.match(r'^[（(](\d+)[）)]\s*(\S.*)$', s)
        if m and cur_sub is not None:
            flush_terms()
            cur_item = {'no': int(m[1]), 'name': norm(m[2]), 'desc': '', 'terms': [], 'children': []}
            cur_sub['items'].append(cur_item); cur_item['_parent'] = None; mode = 'desc'
            continue
        if s[0] in CIRCLED and cur_sub is not None and cur_sub['items']:
            flush_terms()
            parent = cur_sub['items'][-1] if cur_item.get('_parent') is None else cur_item['_parent']
            child = {'no': CIRCLED.index(s[0]) + 1, 'name': norm(s[1:]), 'desc': '', 'terms': [], '_parent': parent}
            parent['children'].append(child); cur_item = child; mode = 'desc'
            continue
        if s.startswith('用語例') and cur_item is not None:
            flush_terms(); buf_terms = s[3:]; mode = 'terms'; continue
        if mode == 'terms':
            if s.startswith('・'):
                buf_terms += '，' + s[1:]
            else:
                buf_terms = join(buf_terms, s)
            continue
        if mode == 'goal' and cur_sub is not None and cur_sub['goals']:
            cur_sub['goals'][-1] = norm(join(cur_sub['goals'][-1], s)); continue
        if mode == 'desc' and cur_item is not None:
            cur_item['desc'] = norm(join(cur_item['desc'], s)); continue
    flush_terms()
    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items() if k != '_parent' and not (k == 'children' and not v)}
        if isinstance(o, list):
            return [clean(x) for x in o]
        return o
    json.dump({'title': '基本情報技術者試験（レベル2）シラバス', 'version': '9.2',
               'source': 'https://www.ipa.go.jp/shiken/syllabus/omgdg50000005kpe-att/syllabus_fe_ver9_2.pdf',
               'publisher': '独立行政法人情報処理推進機構（IPA）', 'published': '2026-01-08',
               'majors': clean(majors)}, sys.stdout, ensure_ascii=False, indent=1)

main(sys.argv[1])
