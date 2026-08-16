/**
 * dsh-artifacts — Claude-Artifacts-style rendering for DeepSeek Harness.
 *
 * Registers one model-facing tool, `artifact_render`, that turns Markdown and
 * JSON into a styled, self-contained HTML document, then writes it to disk and
 * returns the path so the agent (and the user) can open or share it.
 *
 * @module dsh-artifacts
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { satisfiesCaret } from './version.js'
import { renderArtifact, TEMPLATES, THEMES, type RenderOptions } from './render.js'

export const name = 'dsh-artifacts'

/** Services required by this plugin. */
export const inject = ['tools']

/** Peer range this plugin is tested against and guards at runtime. */
export const TESTED_PEER_RANGE = '^0.1.0-rc.6'

const require = createRequire(import.meta.url)

/** Resolve the dsh-tools version the plugin is actually linked against. */
export function resolvedDshToolsVersion(): string {
  try {
    const pkg = require('@deepseek-ai/dsh-tools/package.json') as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unresolved'
  }
}

/** Turn a silent peer mismatch into a loud, actionable load error. */
export function assertPeerCompatible(): void {
  const version = resolvedDshToolsVersion()
  if (!satisfiesCaret(version, TESTED_PEER_RANGE)) {
    throw new Error(
      `dsh-artifacts: resolved @deepseek-ai/dsh-tools ${version}, but this plugin is tested with `
      + `${TESTED_PEER_RANGE}. Upgrade DeepSeek Harness to 0.1.0-rc.6 or later, then reinstall. `
      + 'See Troubleshooting in the README.',
    )
  }
}

interface RenderArgs {
  title?: string
  subtitle?: string
  markdown?: string
  data?: string
  template?: string
  theme?: string
  out?: string
  footer?: string
}

function parseData(raw: string | undefined): unknown {
  if (raw === undefined || raw.trim() === '') return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    throw new Error(`dsh-artifacts: data is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function resolveOut(out: string | undefined): string {
  if (out !== undefined && out.trim() !== '') return out
  const slug = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  return join(tmpdir(), `dsh-artifact-${slug}.html`)
}

/** Build an artifact and write it to disk. Exported for tests and the CLI. */
export function writeArtifact(options: RenderOptions & { out?: string }): { path: string; bytes: number } {
  const result = renderArtifact(options)
  const out = resolveOut(options.out)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, result.html, 'utf8')
  return { path: out, bytes: Buffer.byteLength(result.html, 'utf8') }
}

/** Register the `artifact_render` tool on the tool registry. */
export function apply(ctx: Context): void {
  assertPeerCompatible()
  ctx.tools.register(defineTool({
    name: 'artifact_render',
    description:
      'Render Markdown and/or JSON data into a beautiful, shareable, '
      + 'self-contained HTML artifact (document, card, dashboard, or gallery) '
      + 'and write it to disk. Returns the file path and byte size so the '
      + 'result can be opened or shared.',
    parameters: {
      title: { type: 'string', description: 'Document title (defaults to "Untitled artifact")' },
      subtitle: { type: 'string', description: 'Optional subtitle or byline' },
      markdown: { type: 'string', description: 'Markdown body content' },
      data: { type: 'string', description: 'Optional JSON string for dashboard/gallery templates' },
      template: { type: 'string', description: `One of: ${TEMPLATES.join(', ')}` },
      theme: { type: 'string', description: `One of: ${THEMES.join(', ')}` },
      out: { type: 'string', description: 'Output path (defaults to a temp file)' },
      footer: { type: 'string', description: 'Optional footer line' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          bytes: { type: 'number', required: true },
          title: { type: 'string', required: true },
          template: { type: 'string', required: true },
          theme: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `artifact written to ${value.path} (${value.bytes} bytes, ${value.template}/${value.theme})` }],
    },
    async execute(args: RenderArgs) {
      const data = parseData(args.data)
      const options: RenderOptions & { out?: string } = {
        title: args.title,
        subtitle: args.subtitle,
        markdown: args.markdown,
        data,
        template: args.template as RenderOptions['template'],
        theme: args.theme as RenderOptions['theme'],
        footer: args.footer,
        out: args.out,
      }
      const written = writeArtifact(options)
      const result = renderArtifact(options)
      return {
        path: written.path,
        bytes: written.bytes,
        title: result.title,
        template: result.template,
        theme: result.theme,
      }
    },
    presentCall: (args: RenderArgs) => ({
      card: 'generic',
      title: `render artifact · ${args.title ?? 'untitled'}`,
      kind: 'other',
      rawInput: args,
    }),
  }))
}

export { renderArtifact } from './render.js'
export type { RenderOptions, RenderResult, ThemeName, TemplateName } from './render.js'
