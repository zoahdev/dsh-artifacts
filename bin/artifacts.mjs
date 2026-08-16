#!/usr/bin/env node
/**
 * dsh-artifacts CLI.
 *
 *   dsh-artifacts notes.md --title "Release notes" --theme dark --out notes.html
 *   dsh-artifacts --data metrics.json --template dashboard --theme brand
 *   cat notes.md | dsh-artifacts --stdin --title "From stdin"
 *   dsh-artifacts notes.md --serve 8080
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { renderArtifact, TEMPLATES, THEMES } from '../lib/render.js'

const HELP = `dsh-artifacts — render Markdown + JSON into a styled HTML artifact

Usage:
  dsh-artifacts [file.md] [options]

Options:
  --title <text>       Document title
  --subtitle <text>    Subtitle / byline
  --template <name>    ${TEMPLATES.join(' | ')}
  --theme <name>       ${THEMES.join(' | ')}
  --data <file.json>   Structured data for dashboard / gallery
  --out <file.html>    Output path (default: artifact.html)
  --footer <text>      Footer line
  --stdin              Read Markdown from stdin
  --serve [port]       Serve a live preview (default port 8080)
  --help               Show this help

Examples:
  dsh-artifacts notes.md --title "Notes" --theme dark
  dsh-artifacts --data metrics.json --template dashboard --theme brand
  dsh-artifacts notes.md --serve 8080
`

function argValue(args, index, name) {
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`dsh-artifacts: missing value for ${name}`)
  }
  return value
}

function parseArgs(argv) {
  const opts = {
    title: undefined,
    subtitle: undefined,
    template: 'doc',
    theme: 'dark',
    data: undefined,
    out: 'artifact.html',
    footer: undefined,
    stdin: false,
    serve: null,
    input: undefined,
  }

  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP)
      process.exit(0)
    } else if (arg === '--stdin') {
      opts.stdin = true
    } else if (arg === '--serve') {
      const next = argv[i + 1]
      opts.serve = next !== undefined && /^\d+$/.test(next) ? Number(argv[++i]) : 8080
    } else if (arg === '--title') {
      opts.title = argValue(argv, i, '--title')
      i++
    } else if (arg === '--subtitle') {
      opts.subtitle = argValue(argv, i, '--subtitle')
      i++
    } else if (arg === '--template') {
      opts.template = argValue(argv, i, '--template')
      i++
    } else if (arg === '--theme') {
      opts.theme = argValue(argv, i, '--theme')
      i++
    } else if (arg === '--data') {
      opts.data = argValue(argv, i, '--data')
      i++
    } else if (arg === '--out') {
      opts.out = argValue(argv, i, '--out')
      i++
    } else if (arg === '--footer') {
      opts.footer = argValue(argv, i, '--footer')
      i++
    } else if (!arg.startsWith('--')) {
      positional.push(arg)
    } else {
      throw new Error(`dsh-artifacts: unknown option ${arg}`)
    }
  }

  if (opts.stdin) {
    opts.input = '-'
  } else if (positional.length > 0) {
    opts.input = positional[0]
  }

  if (opts.input === undefined && opts.data === undefined) {
    throw new Error('dsh-artifacts: provide a Markdown file, --stdin, or --data')
  }
  if (!TEMPLATES.includes(opts.template)) {
    throw new Error(`dsh-artifacts: unknown template "${opts.template}"`)
  }
  if (!THEMES.includes(opts.theme)) {
    throw new Error(`dsh-artifacts: unknown theme "${opts.theme}"`)
  }
  return opts
}

function readStdin() {
  return readFileSync(0, 'utf8')
}

function readInput(opts) {
  if (opts.input === '-') return readStdin()
  if (opts.input !== undefined) return readFileSync(resolve(opts.input), 'utf8')
  return undefined
}

function readData(opts) {
  if (opts.data === undefined) return undefined
  return JSON.parse(readFileSync(resolve(opts.data), 'utf8'))
}

function renderOptions(opts) {
  const markdown = readInput(opts)
  const data = readData(opts)
  return {
    title: opts.title,
    subtitle: opts.subtitle,
    markdown,
    data,
    template: opts.template,
    theme: opts.theme,
    footer: opts.footer,
  }
}

function writeOut(out, html) {
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html, 'utf8')
}

async function serve(opts, out) {
  const port = opts.serve ?? 8080
  const server = createServer((_req, res) => {
    try {
      const result = renderArtifact(renderOptions(opts))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(result.html)
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`render error: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(port, () => resolvePromise())
  })
  process.stdout.write(`dsh-artifacts: serving ${opts.input ?? '--data'} at http://127.0.0.1:${port}\n`)
  return server
}

try {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.serve !== null) {
    await serve(opts, opts.out)
    await new Promise(() => {})
  }
  const result = renderArtifact(renderOptions(opts))
  const out = resolve(opts.out)
  writeOut(out, result.html)
  process.stdout.write(`artifact written to ${out} (${Buffer.byteLength(result.html, 'utf8')} bytes, ${result.template}/${result.theme})\n`)
} catch (error) {
  process.stderr.write(`dsh-artifacts: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
