# 用語辞典の重複を解消する（作業用）。ビルドのエラー出力を読み、
# 用語名ごと重複していれば後から読まれた項目を削除し、別名だけが重複していればその別名を外す。
import re, subprocess, sys
out = subprocess.run(['npm', 'run', 'content'], capture_output=True, text=True); out = out.stdout + out.stderr
for file, term, dup in re.findall(r'(content/glossary/\S+\.yaml):(.+?): 用語「(.+?)」が重複しています', out):
    s = open(file).read()
    blocks = re.split(r'(?m)^(?=  - term: )', s)
    for i, b in enumerate(blocks):
        if re.match(rf'  - term: {re.escape(term)}\n', b):
            if term == dup:
                blocks[i] = ''
            else:
                b = re.sub(rf'(aliases: \[[^\]]*?)(?:, )?{re.escape(dup)}(?=[,\]])', r'\1', b)
                b = re.sub(r'aliases: \[, ?', 'aliases: [', b)
                b = re.sub(r'\n    aliases: \[\]', '', b)
                blocks[i] = b
            print('fixed', file, term, dup)
    open(file, 'w').write(''.join(blocks))
