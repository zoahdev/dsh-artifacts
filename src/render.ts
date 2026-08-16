/**
 * dsh-artifacts renderer.
 *
 * A dependency-free, self-contained HTML artifact generator. Markdown goes in;
 * a styled, shareable document/card/dashboard/gallery comes out. Everything is
 * inlined (CSS only, no external requests), so the output can be opened from
 * disk, attached to an email, or hosted anywhere with zero moving parts.
 *
 * @module dsh-artifacts/render
 */

export type ThemeName = 'light' | 'dark' | 'paper' | 'terminal' | 'brand'
export type TemplateName = 'doc' | 'card' | 'dashboard' | 'gallery'

export const THEMES: ThemeName[] = ['light', 'dark', 'paper', 'terminal', 'brand']
export const TEMPLATES: TemplateName[] = ['doc', 'card', 'dashboard', 'gallery']

export interface RenderOptions {
  /** Document title shown in the header and `<title>`. */
  title?: string
  /** Optional subtitle / byline under the title. */
  subtitle?: string
  /** Markdown body (used by `doc`, `card`, and as fallback text). */
  markdown?: string
  /** Structured data for `dashboard` and `gallery`. */
  data?: unknown
  template?: TemplateName
  theme?: ThemeName
  /** Optional hex accent color override. */
  accent?: string
  /** Optional footer line. */
  footer?: string
  /** Optional BCP-47 language tag. Defaults to `en`. */
  lang?: string
}

export interface RenderResult {
  html: string
  title: string
  theme: ThemeName
  template: TemplateName
}

export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const SAFE_SCHEMES = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i

function safeHref(raw: string): string | null {
  const url = raw.trim()
  if (/^javascript:/i.test(url) || /^data:/i.test(url) || /^vbscript:/i.test(url)) return null
  if (SAFE_SCHEMES.test(url)) return escapeHtml(url)
  return null
}

interface InlineToken {
  code: boolean
  text: string
}

/** Split a single markdown line on single-backtick code spans. */
function splitCodeSpans(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let rest = text
  while (rest.length > 0) {
    const tick = rest.indexOf('`')
    if (tick === -1) {
      tokens.push({ code: false, text: rest })
      break
    }
    if (tick > 0) tokens.push({ code: false, text: rest.slice(0, tick) })
    const close = rest.indexOf('`', tick + 1)
    if (close === -1) {
      tokens.push({ code: false, text: rest.slice(tick) })
      break
    }
    tokens.push({ code: true, text: rest.slice(tick + 1, close) })
    rest = rest.slice(close + 1)
  }
  return tokens
}

function inlineFormats(escaped: string): string {
  let out = escaped

  // Images before links (links would otherwise match the `[...](...)` part).
  out = out.replace(/!\[([^\]]*)\]\(([^\s]+)\)/g, (_m, alt: string, url: string) => {
    const href = safeHref(url)
    return href === null ? escapeHtml(`![${alt}](${url})`) : `<img src="${href}" alt="${escapeHtml(alt)}">`
  })

  out = out.replace(/\[([^\]]+)\]\(([^\s]+)(?:\s+"[^"]*")?\)/g, (_m, label: string, url: string) => {
    const href = safeHref(url)
    return href === null ? `<a>${label}</a>` : `<a href="${href}">${label}</a>`
  })

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return out
}

export function inlineMarkdown(text: string): string {
  return splitCodeSpans(text)
    .map((token) => (token.code ? `<code>${escapeHtml(token.text)}</code>` : inlineFormats(escapeHtml(token.text))))
    .join('')
}

interface TableBlock {
  headers: string[]
  rows: string[][]
}

function parseTableLine(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim())
  if (cells.length === 0) return null
  return cells
}

function isSeparatorRow(line: string): boolean {
  const cells = parseTableLine(line)
  if (cells === null) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderTable(headers: string[], rows: string[][]): string {
  const head = `<tr>${headers.map((h) => `<th>${inlineMarkdown(h)}</th>`).join('')}</tr>`
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`)
    .join('')
  return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`
}

function collectList(lines: string[], start: number): { items: string[]; next: number } {
  const items: string[] = []
  let i = start
  const first = lines[i]
  const ordered = /^\s*\d+\.\s+/.test(first)
  while (i < lines.length) {
    const line = lines[i]
    if (ordered) {
      if (!/^\s*\d+\.\s+/.test(line)) break
      items.push(line.replace(/^\s*\d+\.\s+/, ''))
    } else {
      if (!/^\s*[-*+]\s+/.test(line)) break
      items.push(line.replace(/^\s*[-*+]\s+/, ''))
    }
    i++
  }
  return { items, next: i }
}

/** Convert a Markdown string into an HTML fragment (no page wrapper). */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  const flushParagraph = (start: number, end: number): void => {
    const text = lines.slice(start, end).join(' ').trim()
    if (text !== '') out.push(`<p>${inlineMarkdown(text)}</p>`)
  }

  let paragraphStart = -1

  while (i <= lines.length) {
    const line = i < lines.length ? lines[i] : ''
    const trimmed = line.trim()

    const isBlockStart =
      /^```/.test(trimmed)
      || /^#{1,6}\s/.test(trimmed)
      || /^---+$/.test(trimmed)
      || /^>\s?/.test(trimmed)
      || /^\s*[-*+]\s+/.test(trimmed)
      || /^\s*\d+\.\s+/.test(trimmed)
      || trimmed.startsWith('|')

    if (trimmed === '' || isBlockStart) {
      if (paragraphStart >= 0) {
        flushParagraph(paragraphStart, i)
        paragraphStart = -1
      }
    }

    if (trimmed === '') {
      i++
      continue
    }

    // Fenced code block.
    if (/^```/.test(trimmed)) {
      const lang = trimmed.slice(3).trim()
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i])
        i++
      }
      i++ // closing fence
      out.push(`<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading !== null) {
      const level = heading[1].length
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      i++
      continue
    }

    // Horizontal rule.
    if (/^---+$/.test(trimmed)) {
      out.push('<hr>')
      i++
      continue
    }

    // Blockquote.
    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote>${inlineMarkdown(quote.join(' '))}</blockquote>`)
      continue
    }

    // Unordered / ordered list.
    if (/^\s*[-*+]\s+/.test(trimmed) || /^\s*\d+\.\s+/.test(trimmed)) {
      const ordered = /^\s*\d+\.\s+/.test(trimmed)
      const { items, next } = collectList(lines, i)
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${tag}>`)
      i = next
      continue
    }

    // Table (GFM pipe table).
    if (trimmed.startsWith('|') && isSeparatorRow(lines[i + 1] ?? '')) {
      const headers = parseTableLine(line)
      if (headers !== null) {
        i += 2
        const rows: string[][] = []
        while (i < lines.length) {
          const row = parseTableLine(lines[i])
          if (row === null) break
          rows.push(row)
          i++
        }
        out.push(renderTable(headers, rows))
        continue
      }
    }

    // Paragraph accumulation.
    if (paragraphStart < 0) paragraphStart = i
    i++
  }

  if (paragraphStart >= 0) flushParagraph(paragraphStart, lines.length)

  return out.join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function valueClass(value: unknown): string {
  if (typeof value === 'number') return 'num'
  if (typeof value === 'boolean') return value ? 'bool yes' : 'bool no'
  return 'str'
}

interface Metric {
  label: string
  value: unknown
  delta?: string
}

function metricsFrom(data: unknown): Metric[] {
  if (isRecord(data) && Array.isArray(data.metrics)) {
    return data.metrics.map((m) => {
      if (isRecord(m)) return { label: text(m.label), value: m.value, delta: typeof m.delta === 'string' ? m.delta : undefined }
      return { label: text(m), value: '' }
    })
  }
  if (isRecord(data)) {
    return Object.entries(data).map(([label, value]) => ({ label, value }))
  }
  return []
}

function barsFrom(data: unknown): { label: string; value: number }[] {
  if (!isRecord(data) || !Array.isArray(data.bars)) return []
  const out: { label: string; value: number }[] = []
  for (const b of data.bars) {
    if (isRecord(b)) {
      const value = Number(b.value)
      if (Number.isFinite(value)) out.push({ label: text(b.label), value })
    }
  }
  return out
}

function rowsFrom(data: unknown): { columns: string[]; rows: string[][] } {
  if (!isRecord(data)) return { columns: [], rows: [] }
  if (Array.isArray(data.columns) && Array.isArray(data.rows)) {
    return {
      columns: data.columns.map((c) => text(c)),
      rows: data.rows.map((row) => (Array.isArray(row) ? row.map((cell) => text(cell)) : [text(row)])),
    }
  }
  return { columns: [], rows: [] }
}

interface GalleryItem {
  title: string
  image?: string
  description?: string
  tag?: string
}

function galleryItemsFrom(data: unknown): GalleryItem[] {
  if (!isRecord(data) || !Array.isArray(data.items)) return []
  const out: GalleryItem[] = []
  for (const item of data.items) {
    if (isRecord(item)) {
      out.push({
        title: text(item.title),
        image: typeof item.image === 'string' ? item.image : undefined,
        description: typeof item.description === 'string' ? item.description : undefined,
        tag: typeof item.tag === 'string' ? item.tag : undefined,
      })
    } else {
      out.push({ title: text(item) })
    }
  }
  return out
}

function renderDashboard(data: unknown, markdown: string | undefined): string {
  const metrics = metricsFrom(data)
  const bars = barsFrom(data)
  const table = rowsFrom(data)
  const max = bars.reduce((m, b) => Math.max(m, Math.abs(b.value)), 0)

  const metricCards = metrics
    .map((m) => {
      const delta = m.delta ? `<span class="delta">${escapeHtml(m.delta)}</span>` : ''
      return `<div class="metric"><div class="metric-label">${escapeHtml(m.label)}</div><div class="metric-value ${valueClass(m.value)}">${escapeHtml(text(m.value))}${delta}</div></div>`
    })
    .join('')

  const barHtml = bars.length > 0
    ? `<div class="bars">${bars
        .map((b) => {
          const width = max > 0 ? Math.max(2, Math.round((Math.abs(b.value) / max) * 100)) : 0
          return `<div class="bar-row"><div class="bar-label">${escapeHtml(b.label)}</div><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div><div class="bar-value">${escapeHtml(String(b.value))}</div></div>`
        })
        .join('')}</div>`
    : ''

  const tableHtml = table.columns.length > 0
    ? renderTable(table.columns, table.rows)
    : ''

  const prose = markdown && markdown.trim() !== '' ? `<div class="doc">${markdownToHtml(markdown)}</div>` : ''

  return `<div class="dashboard">${metricCards !== '' ? `<div class="metrics">${metricCards}</div>` : ''}${barHtml}${tableHtml}${prose}</div>`
}

function renderGallery(data: unknown, markdown: string | undefined): string {
  const items = galleryItemsFrom(data)
  const cards = items
    .map((item) => {
      const media = item.image
        ? `<div class="gallery-media"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy"></div>`
        : `<div class="gallery-media empty"><span>${escapeHtml(item.title.slice(0, 1).toUpperCase())}</span></div>`
      const tag = item.tag ? `<span class="gallery-tag">${escapeHtml(item.tag)}</span>` : ''
      const desc = item.description ? `<p class="gallery-desc">${inlineMarkdown(item.description)}</p>` : ''
      return `<figure class="gallery-card">${media}<figcaption><div class="gallery-title">${escapeHtml(item.title)}${tag}</div>${desc}</figcaption></figure>`
    })
    .join('')
  const prose = markdown && markdown.trim() !== '' ? `<div class="doc">${markdownToHtml(markdown)}</div>` : ''
  return `<div class="gallery">${cards}</div>${prose}`
}

function renderCard(title: string, subtitle: string | undefined, markdown: string | undefined): string {
  const badge = subtitle ? `<span class="card-badge">${escapeHtml(subtitle)}</span>` : ''
  const body = markdown && markdown.trim() !== '' ? `<div class="doc">${markdownToHtml(markdown)}</div>` : ''
  return `<div class="card"><div class="card-head"><h1>${escapeHtml(title)}</h1>${badge}</div>${body}</div>`
}

function renderDoc(markdown: string | undefined): string {
  return `<article class="doc">${markdownToHtml(markdown ?? '')}</article>`
}

const CSS = `
:root { color-scheme: light dark; }
*, *::before, *::after { box-sizing: border-box; }
html[data-theme="light"] {
  --bg: #f7f7f8; --surface: #ffffff; --ink: #1c1c1f; --muted: #6b7280;
  --line: #e4e4e7; --accent: #1f6feb; --accent-ink: #ffffff; --code-bg: #f0f0f2;
}
html[data-theme="dark"] {
  --bg: #0d1117; --surface: #161b22; --ink: #e6edf3; --muted: #8b949e;
  --line: #30363d; --accent: #388bfd; --accent-ink: #ffffff; --code-bg: #0b0f14;
}
html[data-theme="paper"] {
  --bg: #f4efe6; --surface: #fdfbf6; --ink: #26221a; --muted: #7a7465;
  --line: #e2d9c8; --accent: #a0522d; --accent-ink: #fffaf2; --code-bg: #efe6d6;
  font-family: Georgia, "Times New Roman", serif;
}
html[data-theme="terminal"] {
  --bg: #0a0f0a; --surface: #101710; --ink: #b8f0b0; --muted: #5f7f5f;
  --line: #1f3a1f; --accent: #39ff5f; --accent-ink: #041404; --code-bg: #041006;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
}
html[data-theme="brand"] {
  --bg: #0b1220; --surface: #111b2f; --ink: #e8eefc; --muted: #9db2d8;
  --line: #22304f; --accent: #3d8bff; --accent-ink: #ffffff; --code-bg: #0a1020;
}
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.shell { max-width: 900px; margin: 0 auto; padding: 48px 24px 64px; }
header.artifact-head { margin-bottom: 28px; border-bottom: 1px solid var(--line); padding-bottom: 20px; }
header.artifact-head .eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: 12px; color: var(--accent); font-weight: 700; }
header.artifact-head h1 { margin: 6px 0 8px; font-size: clamp(28px, 5vw, 44px); line-height: 1.12; letter-spacing: -0.02em; }
header.artifact-head .subtitle { color: var(--muted); margin: 0; }
.doc h2, .doc h3, .doc h4 { margin-top: 1.6em; line-height: 1.25; }
.doc h2 { font-size: 26px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
.doc h3 { font-size: 20px; }
.doc p { margin: 1em 0; }
.doc a { color: var(--accent); }
.doc code { background: var(--code-bg); padding: .15em .4em; border-radius: 6px; font-size: .9em; font-family: ui-monospace, Consolas, monospace; }
.doc pre { background: var(--code-bg); border: 1px solid var(--line); border-radius: 12px; padding: 16px; overflow-x: auto; }
.doc pre code { background: transparent; padding: 0; }
.doc blockquote { border-left: 3px solid var(--accent); margin: 1em 0; padding: .4em 1em; color: var(--muted); background: var(--surface); border-radius: 0 10px 10px 0; }
.doc hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
.doc img { max-width: 100%; border-radius: 12px; }
.doc ul, .doc ol { padding-left: 1.4em; }
.doc li { margin: .35em 0; }
.table-wrap { overflow-x: auto; margin: 1.2em 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; min-width: 480px; }
th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 700; color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
tr:last-child td { border-bottom: 0; }
.dashboard .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 8px 0 20px; }
.metric { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.metric-label { color: var(--muted); font-size: 13px; }
.metric-value { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
.metric-value .delta { font-size: 13px; margin-left: 8px; font-weight: 600; color: var(--accent); }
.bars { margin: 20px 0; }
.bar-row { display: grid; grid-template-columns: 140px 1fr 60px; gap: 12px; align-items: center; margin: 10px 0; }
.bar-label { color: var(--muted); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 12px; background: var(--code-bg); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, white)); border-radius: 999px; }
.bar-value { text-align: right; font-variant-numeric: tabular-nums; font-size: 14px; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin: 8px 0 20px; }
.gallery-card { margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.gallery-media { aspect-ratio: 4/3; background: var(--code-bg); }
.gallery-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gallery-media.empty { display: grid; place-items: center; font-size: 42px; font-weight: 800; color: var(--accent); }
.gallery-card figcaption { padding: 12px 14px; }
.gallery-title { font-weight: 700; display: flex; align-items: center; gap: 8px; }
.gallery-tag { font-size: 11px; font-weight: 600; color: var(--accent-ink); background: var(--accent); padding: 2px 8px; border-radius: 999px; }
.gallery-desc { color: var(--muted); margin: 6px 0 0; font-size: 14px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: clamp(24px, 5vw, 44px); box-shadow: 0 12px 40px color-mix(in srgb, var(--ink) 8%, transparent); }
.card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
.card-head h1 { margin: 0; }
.card-badge { font-size: 12px; font-weight: 700; color: var(--accent-ink); background: var(--accent); padding: 4px 10px; border-radius: 999px; }
footer.artifact-foot { margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
@media (max-width: 560px) { .bar-row { grid-template-columns: 96px 1fr 48px; } .shell { padding: 28px 16px 48px; } }
@media print { body { background: #fff; color: #000; } .shell { max-width: none; } }
`

function page(options: {
  title: string
  inner: string
  theme: ThemeName
  accent?: string
  footer?: string
  lang: string
  subtitle?: string
}): string {
  const accentStyle = options.accent ? ` style="--accent:${escapeHtml(options.accent)}"` : ''
  const footer = options.footer ? `<footer class="artifact-foot"><span>${escapeHtml(options.footer)}</span><span>rendered by dsh-artifacts</span></footer>` : ''
  return `<!doctype html>
<html lang="${escapeHtml(options.lang)}" data-theme="${escapeHtml(options.theme)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="dsh-artifacts">
<title>${escapeHtml(options.title)}</title>
<style>${CSS}</style>
</head>
<body${accentStyle}>
<main class="shell">
<header class="artifact-head"><div class="eyebrow">DeepSeek Harness artifact</div><h1>${escapeHtml(options.title)}</h1>${options.subtitle ? `<p class="subtitle">${escapeHtml(options.subtitle)}</p>` : ''}</header>
${options.inner}
${footer}
</main>
</body>
</html>
`
}

/** Render a complete, self-contained HTML artifact. */
export function renderArtifact(options: RenderOptions = {}): RenderResult {
  const theme: ThemeName = options.theme && THEMES.includes(options.theme) ? options.theme : 'dark'
  const template: TemplateName = options.template && TEMPLATES.includes(options.template) ? options.template : 'doc'
  const title = options.title && options.title.trim() !== '' ? options.title : 'Untitled artifact'
  const lang = options.lang && /^[a-zA-Z-]+$/.test(options.lang) ? options.lang : 'en'

  let inner: string
  if (template === 'card') {
    inner = renderCard(title, options.subtitle, options.markdown)
  } else if (template === 'dashboard') {
    inner = renderDashboard(options.data, options.markdown)
  } else if (template === 'gallery') {
    inner = renderGallery(options.data, options.markdown)
  } else {
    inner = renderDoc(options.markdown)
  }

  const html = page({
    title,
    inner,
    theme,
    accent: options.accent,
    footer: options.footer,
    lang,
    subtitle: options.subtitle,
  })

  return { html, title, theme, template }
}
