import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  inlineMarkdown,
  markdownToHtml,
  renderArtifact,
  THEMES,
  TEMPLATES,
} from '../src/render.ts'

describe('escapeHtml', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&#39;')
  })
})

describe('inlineMarkdown', () => {
  it('renders bold, italic, inline code, links, and strike', () => {
    const html = inlineMarkdown('**bold** _em_ `code` [link](https://example.com) ~~gone~~')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>em</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<a href="https://example.com">link</a>')
    expect(html).toContain('<del>gone</del>')
  })

  it('does not create javascript: links', () => {
    expect(inlineMarkdown('[x](javascript:alert(1))')).toBe('<a>x</a>')
  })

  it('escapes HTML inside inline code', () => {
    expect(inlineMarkdown('`<img>`')).toBe('<code>&lt;img&gt;</code>')
  })
})

describe('markdownToHtml', () => {
  it('renders headings, lists, blockquotes, code fences, and tables', () => {
    const md = [
      '# Title',
      '',
      '- one',
      '- two',
      '',
      '> quote',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n')
    const html = markdownToHtml(md)
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('<blockquote>quote</blockquote>')
    expect(html).toContain('<pre><code class="language-ts">const x = 1</code></pre>')
    expect(html).toContain('<th>A</th>')
    expect(html).toContain('<td>2</td>')
  })
})

describe('renderArtifact', () => {
  it('produces a complete self-contained HTML document', () => {
    const { html, title, theme, template } = renderArtifact({
      title: 'Hello <world>',
      markdown: '# Hi',
      theme: 'dark',
      template: 'doc',
    })
    expect(title).toBe('Hello <world>')
    expect(theme).toBe('dark')
    expect(template).toBe('doc')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('<h1>Hello &lt;world&gt;</h1>')
    expect(html).toContain('<h1>Hi</h1>')
    expect(html).toContain('</html>')
    expect(html).not.toContain('http://')
  })

  it('renders a dashboard with metrics, bars, and a table', () => {
    const { html } = renderArtifact({
      title: 'Metrics',
      template: 'dashboard',
      theme: 'brand',
      data: {
        metrics: [
          { label: 'Stars', value: 128, delta: '+12' },
          { label: 'CI', value: true },
        ],
        bars: [
          { label: 'A', value: 10 },
          { label: 'B', value: 20 },
        ],
        columns: ['name', 'count'],
        rows: [['foo', '3'], ['bar', '5']],
      },
    })
    expect(html).toContain('data-theme="brand"')
    expect(html).toContain('metric-label">Stars')
    expect(html).toContain('bar-fill')
    expect(html).toContain('<th>name</th>')
  })

  it('renders a gallery from items', () => {
    const { html } = renderArtifact({
      title: 'Gallery',
      template: 'gallery',
      data: { items: [{ title: 'A', image: 'https://example.com/a.png', tag: 'new' }] },
    })
    expect(html).toContain('gallery-card')
    expect(html).toContain('A')
    expect(html).toContain('<img src="https://example.com/a.png"')
    expect(html).toContain('gallery-tag')
  })

  it('exposes the expected theme and template enums', () => {
    expect(THEMES.length).toBe(5)
    expect(TEMPLATES).toEqual(['doc', 'card', 'dashboard', 'gallery'])
  })
})
