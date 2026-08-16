#!/usr/bin/env node
/**
 * Packaged integration + real runtime invocation smoke test.
 *
 * Installs the ACTUAL pnpm-packed tarball into a fresh project, loads the
 * installed plugin bundle, registers the artifact_render tool through the real
 * `apply()` / `ctx.tools.register` path, executes the real handler, writes a
 * real HTML file, and asserts the rendered bytes. A missing module, an API
 * mismatch, or a handler failure fails this script.
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tgz = path.resolve(process.argv[2] ?? path.join(root, 'dsh-artifacts-0.1.0.tgz'))

if (!existsSync(tgz)) {
  console.error(`[integration] missing tarball: ${tgz}`)
  process.exit(1)
}

function runPnpm(args, cwd) {
  if (process.platform === 'win32') {
    return spawnSync(`pnpm ${args.join(' ')}`, { cwd, stdio: 'inherit', shell: true })
  }
  return spawnSync('pnpm', args, { cwd, stdio: 'inherit' })
}

async function scenario(name, dshToolsVersion, expectGuard) {
  const dir = mkdtempSync(path.join(tmpdir(), `dsh-artifacts-${name}-`))
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'dsh-artifacts-integration-host',
        private: true,
        version: '1.0.0',
        dependencies: {
          '@deepseek-ai/cordis': '^4.0.1',
          '@deepseek-ai/dsh-tools': dshToolsVersion,
          'dsh-artifacts': `file:${tgz.replaceAll('\\', '/')}`,
        },
      },
      null,
      2,
    ),
  )

  console.log(`[integration:${name}] installing packed tarball into fresh project (dsh-tools ${dshToolsVersion})...`)
  const install = runPnpm(['install'], dir)
  if (install.status !== 0) {
    console.error(`[integration:${name}] pnpm install failed`)
    process.exit(1)
  }

  const pluginIndex = path.join(dir, 'node_modules', 'dsh-artifacts', 'lib', 'index.js')
  if (!existsSync(pluginIndex)) {
    throw new Error('packed plugin entry lib/index.js missing after install')
  }

  console.log(`[integration:${name}] loading packed plugin bundle...`)
  const plugin = await import(pathToFileURL(pluginIndex).href)
  if (plugin.name !== 'dsh-artifacts') {
    throw new Error(`unexpected plugin name: ${plugin.name}`)
  }

  const registered = []
  const ctx = {
    tools: {
      register: (definition) => {
        registered.push(definition)
        return () => {}
      },
    },
  }

  if (expectGuard) {
    let threw = false
    try {
      plugin.apply(ctx)
    } catch (error) {
      threw = true
      if (!String(error instanceof Error ? error.message : error).includes('tested with ^0.1.0-rc.6')) {
        throw new Error(`guard threw an unexpected error: ${String(error)}`)
      }
    }
    if (!threw) throw new Error('runtime guard did not reject the incompatible dsh-tools version')
    console.log(`PASS [${name}] runtime guard rejected incompatible @deepseek-ai/dsh-tools ${dshToolsVersion}`)
    rmSync(dir, { recursive: true, force: true })
    return
  }

  console.log(`[integration:${name}] calling apply(ctx) through the real registration path...`)
  plugin.apply(ctx)

  const tool = registered.find((definition) => definition.name === 'artifact_render')
  if (tool === undefined) throw new Error('artifact_render tool was not registered via apply/ctx.tools.register')
  if (tool.parameters?.properties?.markdown === undefined) throw new Error('artifact_render tool schema missing the markdown parameter')

  console.log(`[integration:${name}] executing the real artifact_render handler...`)
  const out = path.join(dir, 'smoke.html')
  const result = await tool.execute(
    {
      title: 'Smoke test',
      markdown: '# The real handler ran',
      data: JSON.stringify({ metrics: [{ label: 'ok', value: 1 }] }),
      template: 'dashboard',
      theme: 'dark',
      out,
    },
    { signal: new AbortController().signal },
  )

  if (result?.title !== 'Smoke test') throw new Error(`unexpected result title: ${JSON.stringify(result)}`)
  if (!existsSync(out)) throw new Error(`handler returned but did not write ${out}`)
  const html = readFileSync(out, 'utf8')
  if (!html.includes('<h1>The real handler ran</h1>')) throw new Error('rendered HTML missing the markdown heading')
  if (!html.includes('metric-label')) throw new Error('rendered HTML missing dashboard metrics')

  console.log(`[integration:${name}] rendering through the real output.render...`)
  const blocks = tool.output.render({}, result)
  const text = blocks.map((block) => block.text ?? '').join('\n')
  if (!text.includes(out)) throw new Error(`render output missing artifact path: ${JSON.stringify(text)}`)

  console.log(`PASS [${name}] packed artifact loaded, tool registered, handler executed, file + render asserted`)
  console.log(`PASS [${name}] result:`, JSON.stringify(result))
  rmSync(dir, { recursive: true, force: true })
}

await scenario('happy', '0.1.0-rc.6', false)
await scenario('guard', '0.1.0-rc.3', true)
