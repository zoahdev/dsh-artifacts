import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply, assertPeerCompatible, name, inject, writeArtifact } from '../src/index.ts'

describe('plugin contract', () => {
  it('declares the expected name and service injection', () => {
    expect(name).toBe('dsh-artifacts')
    expect(inject).toEqual(['tools'])
  })

  it('does not throw when the resolved dsh-tools peer is compatible', () => {
    expect(() => assertPeerCompatible()).not.toThrow()
  })
})

describe('writeArtifact', () => {
  it('writes a real HTML file and reports its byte size', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-artifacts-'))
    const out = join(dir, 'out.html')
    const written = writeArtifact({ title: 'Hi', markdown: '# hello', out, theme: 'dark' })
    expect(existsSync(written.path)).toBe(true)
    expect(written.bytes).toBeGreaterThan(100)
    expect(readFileSync(out, 'utf8')).toContain('<h1>hello</h1>')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('apply / artifact_render tool', () => {
  it('registers the tool and executes the real handler end-to-end', async () => {
    const registered: Array<{
      name: string
      parameters?: Record<string, unknown>
      execute: (args: Record<string, unknown>, exec?: unknown) => Promise<unknown>
    }> = []
    const ctx = { tools: { register: (definition: unknown) => { registered.push(definition as never); return () => {} } } }

    apply(ctx as never)
    const tool = registered.find((definition) => definition.name === 'artifact_render')
    expect(tool).toBeDefined()

    const dir = mkdtempSync(join(tmpdir(), 'dsh-artifacts-tool-'))
    const out = join(dir, 'result.html')
    const result = (await tool!.execute({
      title: 'Report',
      markdown: '# Deployed',
      data: JSON.stringify({ metrics: [{ label: 'ok', value: 42 }] }),
      template: 'dashboard',
      theme: 'brand',
      out,
    }, { signal: new AbortController().signal })) as Record<string, unknown>

    expect(result.title).toBe('Report')
    expect(result.template).toBe('dashboard')
    expect(result.theme).toBe('brand')
    expect(existsSync(out)).toBe(true)
    const html = readFileSync(out, 'utf8')
    expect(html).toContain('<h1>Deployed</h1>')
    expect(html).toContain('42')
    rmSync(dir, { recursive: true, force: true })
  })
})
