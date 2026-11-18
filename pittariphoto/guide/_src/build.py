"""ぴったり写真の「困りごと記事」を articles.json から静的 HTML にする。

使い方(app-support のどこからでも):
    python3 pittariphoto/guide/_src/build.py

出力(pittariphoto/guide/ の下):
  index.html               記事の一覧(入口)
  <slug>/index.html        記事ごと
  sitemap.xml              この記事群だけのサイトマップ
  ../../sitemap.xml        ルートのサイトマップの「pittari-guide」区間を書き換える(ほかの行は触らない)

決まり:
- 提出先の数値は、公式ページを開いて確かめたものだけを articles.json の spec に書く。
  spec ごとに url と checked(確認日)を必ず入れる。ないとビルドを止める。
- slug は URL になるので、公開後は変えない。
- _src/ は GitHub Pages(Jekyll)で公開されない(先頭が _ のフォルダは除外される)。
"""
import html
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent                      # pittariphoto/guide/
ROOT = OUT.parent.parent               # app-support/
SITE = 'https://jjayck.github.io/app-support/pittariphoto/guide/'
APP_ID = '6818774616'
APP_URL = f'https://apps.apple.com/jp/app/id{APP_ID}'
APP_NAME = 'ぴったり写真'
SITE_NAME = 'ぴったり写真 写真の条件ガイド'

esc = lambda s: html.escape(str(s if s is not None else ''), quote=True)


def head(title, desc, canonical, depth, ld):
    up = '../' * depth
    return f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{esc(canonical)}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:type" content="{'article' if depth == 1 else 'website'}">
<meta property="og:url" content="{esc(canonical)}">
<meta property="og:site_name" content="{esc(SITE_NAME)}">
<meta name="apple-itunes-app" content="app-id={APP_ID}">
<meta name="theme-color" content="#F3EEE3">
<link rel="icon" href="{up}../icon.png">
<link rel="apple-touch-icon" href="{up}../icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&display=swap">
<link rel="stylesheet" href="{up}../../style.css">
<link rel="stylesheet" href="{up}guide.css">
{''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in ld)}
</head>
<body>
<main>
'''


def foot(depth):
    up = '../' * depth
    home = up or './'
    return f'''<footer>{esc(APP_NAME)} ・ <a href="{home}">写真の条件ガイド</a> ・ <a href="{up}../support.html">サポート</a> ・ <a href="{up}../privacy.html">プライバシーポリシー</a><br>
提出先の条件は変わることがあります。申請・出願の前に、かならず提出先の最新の案内を確認してください。このサイトは各提出先とは関係のない個人制作です。</footer>
</main>
</body>
</html>
'''


def app_head(depth):
    up = '../' * depth
    return f'<a class="app" href="{up}"><img src="{up}../icon.png" alt=""><div><b>{esc(APP_NAME)}</b><span>写真の条件ガイド</span></div></a>\n'


def cta(a):
    app = a['app']
    steps = ''.join(f'<li>{s}</li>' for s in app['steps'])
    note = f'<p class="note">{app["note"]}</p>' if app.get('note') else ''
    return f'''<aside class="card cta">
<h2 class="in">{esc(app.get('h', 'アプリでやる場合'))}</h2>
<p>{app['lead']}</p>
<ol class="steps">{steps}</ol>
{note}<p class="note">写真は端末の中だけで処理され、位置情報などのメタデータは変換後の写真に引き継がれません。明るさや肌などの見た目は変えず、形式・容量・ピクセル数・縦横比だけを合わせます。</p>
<a class="btn" href="{APP_URL}" rel="noopener">App Store で「{esc(APP_NAME)}」を見る(無料)</a>
</aside>
'''


def spec_block(s):
    for k in ('name', 'url', 'checked', 'rows'):
        if not s.get(k):
            sys.exit(f'spec に {k} がありません: {s.get("name")}')
    rows = ''.join(f'<tr><th>{esc(r[0])}</th><td>{r[1]}</td></tr>' for r in s['rows'])
    note = f'<p class="note">{s["note"]}</p>' if s.get('note') else ''
    return f'''<div class="card spec">
<div class="spec-h">{esc(s['name'])}</div>
<table>{rows}</table>
{note}<p class="src">出典: <a href="{esc(s['url'])}" rel="noopener">{esc(s.get('source', s['url']))}</a>({esc(s['checked'])} 確認)</p>
</div>
'''


def article(a, by_slug, updated):
    url = SITE + a['slug'] + '/'
    ld = [
        {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': '写真の条件ガイド', 'item': SITE},
            {'@type': 'ListItem', 'position': 2, 'name': a['h1'], 'item': url}]},
        {'@context': 'https://schema.org', '@type': 'Article', 'headline': a['h1'], 'description': a['description'],
         'inLanguage': 'ja', 'dateModified': a.get('updated', updated), 'url': url,
         'isPartOf': {'@type': 'WebSite', 'name': SITE_NAME, 'url': SITE}},
    ]
    b = [head(a['title'], a['description'], url, 1, ld), app_head(1)]
    b.append(f'<nav class="crumb" aria-label="パンくずリスト"><a href="../">写真の条件ガイド</a><span>{esc(a["group"])}</span></nav>\n')
    b.append(f'<h1>{esc(a["h1"])}</h1>\n<p class="date">{esc(a.get("updated", updated))} 更新</p>\n')
    b.append(f'<div class="card answer"><div class="answer-h">先に答え</div><p>{a["answer"]}</p></div>\n')
    if a.get('specs'):
        b.append('<h2>公式に書かれている条件</h2>\n')
        b.extend(spec_block(s) for s in a['specs'])
    for sec in a.get('sections', []):
        b.append(f'<h2>{esc(sec["h"])}</h2>\n{sec["html"]}\n')
    b.append(cta(a))
    srcs = [(s.get('source', s['url']), s['url'], s['checked']) for s in a.get('specs', [])]
    srcs += [(s['label'], s['url'], s['checked']) for s in a.get('sources', [])]
    if srcs:
        seen, li = set(), []
        for label, u, c in srcs:
            if u in seen:
                continue
            seen.add(u)
            li.append(f'<li><a href="{esc(u)}" rel="noopener">{esc(label)}</a>({esc(c)} 確認)</li>')
        b.append('<h2>確認した公式ページ</h2>\n<ul class="srcs">' + ''.join(li) + '</ul>\n')
    rel = [by_slug[s] for s in a.get('related', []) if s in by_slug]
    if rel:
        b.append('<h2>あわせて読む</h2>\n<div class="list">' + ''.join(
            f'<a class="item" href="../{r["slug"]}/"><b>{esc(r["h1"])}</b><span>{esc(r["summary"])}</span></a>' for r in rel) + '</div>\n')
    b.append(foot(1))
    return ''.join(b)


def index(data, updated):
    ld = [{'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': data['index']['title'],
           'description': data['index']['description'], 'inLanguage': 'ja', 'url': SITE}]
    b = [head(data['index']['title'], data['index']['description'], SITE, 0, ld)]
    b.append(f'<div class="app"><img src="../icon.png" alt=""><div><b>{esc(APP_NAME)}</b><span>写真の条件ガイド</span></div></div>\n')
    b.append(f'<h1>{esc(data["index"]["h1"])}</h1>\n<p class="date">{esc(updated)} 更新</p>\n<p>{data["index"]["lead"]}</p>\n')
    for g in data['groups']:
        items = [a for a in data['articles'] if a['group'] == g]
        b.append(f'<h2>{esc(g)}</h2>\n<div class="list">' + ''.join(
            f'<a class="item" href="{a["slug"]}/"><b>{esc(a["h1"])}</b><span>{esc(a["summary"])}</span></a>' for a in items) + '</div>\n')
    b.append(f'''<aside class="card cta">
<h2 class="in">アプリ「{esc(APP_NAME)}」について</h2>
<p>{data["index"]["app"]}</p>
<a class="btn" href="{APP_URL}" rel="noopener">App Store で見る(無料)</a>
</aside>
''')
    b.append(foot(0))
    return ''.join(b)


def main():
    data = json.loads((HERE / 'articles.json').read_text(encoding='utf-8'))
    updated = data['updated']
    slugs = [a['slug'] for a in data['articles']]
    if len(slugs) != len(set(slugs)):
        sys.exit('slug が重複しています')
    for a in data['articles']:
        if a['group'] not in data['groups']:
            sys.exit(f'group が groups にありません: {a["slug"]}')
    by_slug = {a['slug']: a for a in data['articles']}
    (OUT / 'index.html').write_text(index(data, updated), encoding='utf-8')
    for a in data['articles']:
        d = OUT / a['slug']
        d.mkdir(exist_ok=True)
        (d / 'index.html').write_text(article(a, by_slug, updated), encoding='utf-8')

    urls = [(SITE, updated)] + [(SITE + a['slug'] + '/', a.get('updated', updated)) for a in data['articles']]
    lines = [f'<url><loc>{u}</loc><lastmod>{m}</lastmod></url>' for u, m in urls]
    (OUT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                     + '\n'.join(lines) + '\n</urlset>\n', encoding='utf-8')

    # ルートのサイトマップ(robots.txt が指す方)には、目印の間だけを書き換える
    root_map = ROOT / 'sitemap.xml'
    s = root_map.read_text(encoding='utf-8')
    start, end = '<!-- pittari-guide:start -->', '<!-- pittari-guide:end -->'
    block = start + '\n' + '\n'.join(lines) + '\n' + end
    if start in s and end in s:
        s = s[:s.index(start)] + block + s[s.index(end) + len(end):]
    else:
        s = s.replace('</urlset>', block + '\n</urlset>')
    root_map.write_text(s, encoding='utf-8')
    print(f'{len(data["articles"])} 本 + 一覧を書き出しました: {OUT}')


if __name__ == '__main__':
    main()
