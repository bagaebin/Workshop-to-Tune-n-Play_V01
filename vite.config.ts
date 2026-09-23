// vite.config.ts — 단일 진입 · 정적 호스팅 · 빌드 식별 · 서비스 워커 프리캐시 (SPEC §1)
import { defineConfig, type Plugin } from 'vite'
import { execSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function gitShortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'nogit'
  }
}

const version = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version
const BUILD = `probe-${version}+${gitShortHash()}`

/** public/의 파일 — 번들에 없으므로 프리캐시 목록에 직접 넣는다 */
const PUBLIC_FILES = ['manifest.webmanifest', 'apple-touch-icon.png']

/** 개발 전용 — POST /__dump?name=P01_2026-09-22 로 받은 본문을 sessions/<name>.jsonl에 쓴다. 데스크톱 테스트 로그를 chain.py로 돌리기 위한 것. 빌드에는 들어가지 않는다 */
function devDump(): Plugin {
  return {
    name: 'probe-dev-dump',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dump', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        const name = (new URL(req.url ?? '/', 'http://x').searchParams.get('name') ?? 'session').replace(/[^\w.-]/g, '_')
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          mkdirSync('sessions', { recursive: true })
          const file = join('sessions', `${name}.jsonl`)
          writeFileSync(file, Buffer.concat(chunks))
          res.setHeader('content-type', 'text/plain')
          res.end(file)
        })
      })
    },
  }
}

/** 빌드 — sw.js의 '__PRECACHE_JSON__'을 산출물 목록으로 채운다 (SPEC §1 프리캐시) */
function swPrecache(): Plugin {
  return {
    name: 'probe-sw-precache',
    apply: 'build',
    generateBundle(_opts, bundle) {
      // version.json — 진행자 시트의 「새 빌드 확인」이 읽는다. 서비스 워커가 캐시하지 않는다 (R-009)
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) })
      const files = Object.keys(bundle).filter((f) => f !== 'sw.js' && f !== 'version.json')
      const list = ['./', 'index.html', ...files, ...PUBLIC_FILES]
      const sw = bundle['sw.js']
      if (sw && sw.type === 'chunk') {
        sw.code = sw.code.replace(/["']__PRECACHE_JSON__["']/, JSON.stringify(JSON.stringify(list)))
      }
    },
  }
}

export default defineConfig({
  plugins: [devDump(), swPrecache()],
  // 상대 경로 — GitHub Pages 하위 경로·로컬 미리보기 모두에서 동작
  base: './',
  define: {
    __BUILD__: JSON.stringify(BUILD),
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: 'index.html', sw: 'src/sw.ts' },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
