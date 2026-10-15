"""Render the trusted repository checkpoint into the owner dashboard page.

Supports the headings, paragraphs, lists, links and tables used by this document.
No runtime Markdown dependency or remote content fetch is needed.
"""
from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'docs/long-shift-pr100-checkpoint.md').read_text()
def inline(text):
    text = html.escape(text)
    text = re.sub(r'\[([^\]]+)\]\((https://[^\s)]+)\)', r'<a href="\2">\1</a>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'`([^`]+)`', r'<code>\1</code>', text)

blocks = source.strip().split('\n\n')
output = []
nav = []
for block in blocks:
    lines = block.splitlines()
    if lines[0].startswith('# '):
        continue
    if lines[0].startswith('## '):
        label = lines[0][3:]
        slug = re.sub('[^a-z0-9]+', '-', label.lower()).strip('-')
        nav.append(f'<a href="#{slug}">{inline(label)}</a>')
        output.append(f'<h2 id="{slug}">{inline(label)}</h2>')
    elif lines[0].startswith('|'):
        rows = [[cell.strip() for cell in line.strip('|').split('|')] for line in lines]
        head = ''.join(f'<th scope="col">{inline(cell)}</th>' for cell in rows[0])
        body = ''.join('<tr>'+''.join(f'<td>{inline(cell)}</td>' for cell in row)+'</tr>' for row in rows[2:])
        output.append(f'<div class="table-scroll" tabindex="0" role="region" aria-label="Checkpoint comparison"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>')
    elif all(re.match(r'(?:- |\d+\. )', line) for line in lines):
        ordered = lines[0][0].isdigit()
        tag = 'ol' if ordered else 'ul'
        output.append(f'<{tag}>'+''.join('<li>'+inline(re.sub(r'^(?:- |\d+\. )', '', line))+'</li>' for line in lines)+f'</{tag}>')
    else:
        output.append('<p>'+inline(' '.join(lines))+'</p>')

page = '''<!DOCTYPE html>
<html lang="en" data-login-path="../../login.html" data-workspace="platform">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>First 100 PRs | Long Shift</title><link rel="stylesheet" href="../../css/base.css"><link rel="stylesheet" href="../../css/development-dashboard.css"><link rel="stylesheet" href="milestone-100.css"></head>
<body><header class="milestone-header"><a href="development-dashboard.html">← Development Home</a><span>LONG SHIFT · OWNER WORKSPACE</span></header>
<main id="milestone-review" hidden><section class="milestone-hero"><div><p class="eyebrow">THE HUNDRED-POINT INSPECTION</p><h1>First 100 PRs</h1><p>The machine so far. The lessons that shaped it. The work before the pilot.</p><span class="review-state">Checkpoint review · Implementation still ahead</span></div><strong aria-hidden="true">100</strong></section>
<nav class="review-nav" aria-label="Checkpoint sections">NAV</nav><article class="review-document">CONTENT</article><p><a href="development-dashboard.html">← Back to your dashboard</a></p></main>
<p id="milestone-access" role="status">Checking owner access…</p>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="../../js/supabase-client.js"></script><script src="../../js/auth.js"></script><script src="milestone-100.js"></script></body></html>
'''.replace('NAV', ''.join(nav)).replace('CONTENT', '\n'.join(output))
(ROOT / 'pages/Admin/milestone-100.html').write_text(page)
print('Rendered checkpoint and', len(nav), 'section links.')
