import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { collectNotes, noteExcerpt, noteTitle, renderVault } from '../src/vault.ts'

describe('noteTitle / noteExcerpt', () => {
  it('prefers the first heading over the filename', () => {
    expect(noteTitle('# Real title\n\nbody', 'file.md')).toBe('Real title')
  })

  it('falls back to a cleaned filename when no heading exists', () => {
    expect(noteTitle('just text', 'my-note.md')).toBe('my note')
  })

  it('returns the first meaningful non-heading line, minus markdown noise', () => {
    expect(noteExcerpt('# Title\n\nThis is [a link](https://x) with *style*.'))
      .toBe('This is a link with style.')
  })
})

describe('collectNotes', () => {
  it('recursively collects Markdown files and skips ignored directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-vault-'))
    writeFileSync(join(dir, 'a.md'), '# Alpha\n\nfirst')
    mkdirSync(join(dir, 'nested'))
    writeFileSync(join(dir, 'nested', 'b.markdown'), '# Beta\n\nsecond')
    mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'node_modules', 'skip.md'), '# nope')

    const notes = collectNotes(dir)
    expect(notes.map((n) => n.path)).toEqual(['a.md', 'nested/b.markdown'])
    expect(notes[0].title).toBe('Alpha')
    expect(notes[1].excerpt).toBe('second')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('renderVault', () => {
  it('produces one page per note plus a linked index', () => {
    const files = renderVault(
      [
        { path: 'a.md', title: 'A | title', excerpt: 'excerpt', markdown: '# A | title\n\nbody' },
        { path: 'sub/b.md', title: 'B', excerpt: '', markdown: '# B\n\nhello' },
      ],
      { theme: 'dark', indexTitle: 'My Vault' },
    )
    expect(Object.keys(files).sort()).toEqual(['a.html', 'index.html', 'sub/b.html'])
    expect(files['index.html']).toContain('<a href="a.html">A | title</a>')
    expect(files['index.html']).toContain('<a href="sub/b.html">B</a>')
    expect(files['a.html']).toContain('<h1>A | title</h1>')
  })
})
