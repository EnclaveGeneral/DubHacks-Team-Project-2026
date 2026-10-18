#!/usr/bin/env node
// Starts the whole BackPocket dev stack in one terminal and keeps it running.
//
//   npm run dev            (from the repo root)
//
// - Starts store-server (8001), service (8000), store (5173), and the extension build.
// - Restarts any process that exits, with backoff if it keeps crashing.
// - Health-checks the three servers and restarts one that stops answering.
// - Frees a port held by a stale process from an earlier run before starting.
// - Ctrl+C stops everything.
//
// While it runs, type a command and press Enter:
//   r            restart everything        r service   restart one (store-server, service, store, extension)
//   s            show status               q           quit
// Each process's output is also written to .logs/<name>.log.

import { execSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WIN = process.platform === 'win32'
const PY = join(ROOT, '.venv', WIN ? 'Scripts' : 'bin', WIN ? 'python.exe' : 'python')
const LOGS = join(ROOT, '.logs')

const PROCS = [
  {
    name: 'store-server',
    color: 36,
    cwd: 'store-server',
    cmd: PY,
    args: ['-m', 'uvicorn', 'main:app', '--port', '8001', '--reload'],
    port: 8001,
    health: 'http://127.0.0.1:8001/prices',
  },
  {
    name: 'service',
    color: 35,
    cwd: 'service',
    cmd: PY,
    args: ['-m', 'uvicorn', 'app.main:app', '--port', '8000', '--reload'],
    port: 8000,
    health: 'http://127.0.0.1:8000/health',
  },
  {
    name: 'store',
    color: 33,
    cwd: 'store',
    cmd: 'npm',
    args: ['run', 'dev'],
    port: 5173,
    health: 'http://localhost:5173/',
  },
  {
    name: 'extension',
    color: 32,
    cwd: 'extension',
    cmd: 'npm',
    args: ['run', 'dev'],
  },
]

const HEALTH_EVERY_MS = 5000
const STARTUP_LIMIT_MS = 90000 // a server gets this long to answer for the first time
const HEALTH_FAILS = 3 // consecutive failures, once it has answered, before a restart
const STABLE_MS = 15000 // uptime that resets the crash backoff

const pad = Math.max(...PROCS.map((p) => p.name.length))
const tag = (p) => `\x1b[${p.color}m${p.name.padEnd(pad)}\x1b[0m │`
const say = (msg) => console.log(`\x1b[1m${'dev'.padEnd(pad)}\x1b[0m │ ${msg}`)

let stopping = false

// ---------- process helpers ----------

function killTree(pid) {
  if (!pid) return
  try {
    if (WIN) execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' })
    else process.kill(-pid, 'SIGTERM')
  } catch {
    // already gone
  }
}

function pidsOnPort(port) {
  try {
    if (WIN) {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' })
      return [
        ...new Set(
          out
            .split(/\r?\n/)
            .filter((l) => /LISTENING/.test(l) && new RegExp(`:${port}\\s`).test(l))
            .map((l) => Number(l.trim().split(/\s+/).pop()))
            .filter((pid) => pid > 0),
        ),
      ]
    }
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
    return out.split(/\s+/).filter(Boolean).map(Number)
  } catch {
    return []
  }
}

function freePort(p) {
  if (!p.port) return
  for (const pid of pidsOnPort(p.port)) {
    say(`port ${p.port} is held by pid ${pid} (left over from an earlier run); stopping it`)
    killTree(pid)
  }
}

async function healthy(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

// ---------- supervisor ----------

function start(p) {
  if (stopping) return
  freePort(p)
  p.startedAt = Date.now()
  p.healthFails = 0
  p.answered = false
  p.restarting = false

  const child = spawn(p.cmd, p.args, {
    cwd: join(ROOT, p.cwd),
    env: { ...process.env, FORCE_COLOR: '1', PYTHONUNBUFFERED: '1' },
    shell: WIN && p.cmd === 'npm', // npm is npm.cmd on Windows
    detached: !WIN, // own process group so killTree can stop its children
  })
  p.child = child
  say(`started ${p.name} (pid ${child.pid})`)

  const pipe = (stream) => {
    const rl = createInterface({ input: stream })
    rl.on('line', (line) => {
      console.log(`${tag(p)} ${line}`)
      p.log.write(line.replace(/\x1b\[[0-9;]*m/g, '') + '\n')
    })
  }
  pipe(child.stdout)
  pipe(child.stderr)

  child.on('exit', (code, signal) => {
    if (p.child !== child) return // replaced by a deliberate restart
    p.child = null
    if (stopping) return
    const uptime = Date.now() - p.startedAt
    p.backoff = uptime > STABLE_MS ? 1000 : Math.min((p.backoff || 500) * 2, 15000)
    say(
      `\x1b[31m${p.name} exited (${signal ?? `code ${code}`}); restarting in ${p.backoff / 1000}s\x1b[0m`,
    )
    p.timer = setTimeout(() => start(p), p.backoff)
  })
}

function restart(p, reason) {
  if (stopping || p.restarting) return
  p.restarting = true
  say(`restarting ${p.name}${reason ? ` (${reason})` : ''}`)
  clearTimeout(p.timer)
  const old = p.child
  p.child = null // so its exit handler doesn't schedule a second start
  if (old) killTree(old.pid)
  p.backoff = 1000
  setTimeout(() => start(p), 500)
}

async function checkHealth() {
  for (const p of PROCS) {
    if (!p.health || !p.child || p.restarting) continue
    if (await healthy(p.health)) {
      if (!p.answered) say(`${p.name} is up at ${p.health.replace(/\/(prices|health)$/, '')}`)
      else if (p.healthFails) say(`${p.name} is answering again`)
      p.answered = true
      p.healthFails = 0
      continue
    }
    // Startup can be slow (Python imports, first Vite build), so a server
    // only gets restarted for slowness if it never comes up at all.
    if (!p.answered) {
      if (Date.now() - p.startedAt > STARTUP_LIMIT_MS) restart(p, `didn't start within ${STARTUP_LIMIT_MS / 1000}s`)
      continue
    }
    p.healthFails += 1
    say(`\x1b[33m${p.name} isn't answering ${p.health} (${p.healthFails}/${HEALTH_FAILS})\x1b[0m`)
    if (p.healthFails >= HEALTH_FAILS) restart(p, 'not answering')
  }
}

function status() {
  for (const p of PROCS) {
    const up = p.child ? `up ${Math.round((Date.now() - p.startedAt) / 1000)}s, pid ${p.child.pid}` : 'down'
    say(`${p.name.padEnd(pad)}  ${up}${p.port ? `, port ${p.port}` : ''}`)
  }
}

function shutdown() {
  if (stopping) return
  stopping = true
  say('stopping everything…')
  for (const p of PROCS) {
    clearTimeout(p.timer)
    if (p.child) killTree(p.child.pid)
  }
  setTimeout(() => process.exit(0), 300)
}

// ---------- main ----------

if (!existsSync(PY)) {
  console.error(`Python venv not found at ${PY}. Run the one-time setup in README.md first.`)
  process.exit(1)
}
for (const p of PROCS) {
  if (!existsSync(join(ROOT, p.cwd, 'node_modules')) && p.cmd === 'npm') {
    console.error(`${p.cwd}/node_modules is missing. Run: cd ${p.cwd} && npm install`)
    process.exit(1)
  }
}

mkdirSync(LOGS, { recursive: true })
for (const p of PROCS) p.log = createWriteStream(join(LOGS, `${p.name}.log`), { flags: 'a' })

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('exit', () => {
  for (const p of PROCS) if (p.child) killTree(p.child.pid)
})

say('starting store-server, service, store, extension  (type r / r <name> / s / q + Enter)')
for (const p of PROCS) start(p)
setInterval(checkHealth, HEALTH_EVERY_MS)

if (process.stdin.isTTY || process.stdin.readable) {
  createInterface({ input: process.stdin }).on('line', (line) => {
    const [cmd, name] = line.trim().split(/\s+/)
    if (cmd === 'q') return shutdown()
    if (cmd === 's') return status()
    if (cmd === 'r') {
      const targets = name ? PROCS.filter((p) => p.name === name) : PROCS
      if (!targets.length) return say(`unknown process "${name}". Use: ${PROCS.map((p) => p.name).join(', ')}`)
      targets.forEach((p) => restart(p, 'requested'))
    }
  })
}
