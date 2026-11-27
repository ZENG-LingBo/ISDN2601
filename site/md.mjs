// A small Markdown-to-HTML converter for the site's research page. It handles only what the
// project's Markdown files use: headings, paragraphs, bold, italics, code, links, bullet and
// numbered lists (one level of nesting), tables and quotes.

function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    const safe = /^(https:\/\/|\/|#)/.test(href) ? href : '#';
    return `<a href="${safe}">${label}</a>`;
  });
  return s;
}

export function markdown(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const isList = (l) => /^(\s*)([-*]|\d+\.)\s+/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = Math.max(2, h[1].length); // ## is h2, ### is h3; the page has its own h1
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(
        '<div class="md-table"><table><thead><tr>' +
          head.map((c) => `<th scope="col">${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>'
      );
      continue;
    }
    if (isList(line)) {
      // Collect the list and any indented lines that belong to its items.
      const items = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && (isList(lines[i]) || (lines[i].startsWith('   ') && lines[i].trim()) || (!lines[i].trim() && i + 1 < lines.length && (lines[i + 1].startsWith('   ') || isList(lines[i + 1]))))) {
        const l = lines[i];
        const top = l.match(/^([-*]|\d+\.)\s+(.*)$/);
        if (top) items.push({ text: top[2], sub: [], more: [] });
        else if (items.length && l.trim()) {
          const sub = l.match(/^\s+[-*]\s+(.*)$/);
          if (sub) items[items.length - 1].sub.push(sub[1]);
          else items[items.length - 1].more.push(l.trim());
        }
        i++;
        if (top === null && !l.trim() && i < lines.length && !isList(lines[i]) && !lines[i].startsWith('   ')) break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        `<${tag}>` +
          items
            .map(
              (it) =>
                `<li>${inline(it.text)}` +
                (it.more.length ? `<p>${inline(it.more.join(' '))}</p>` : '') +
                (it.sub.length ? '<ul>' + it.sub.map((s) => `<li>${inline(s)}</li>`).join('') + '</ul>' : '') +
                '</li>'
            )
            .join('') +
          `</${tag}>`
      );
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|>|\|)/.test(lines[i]) && !isList(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
