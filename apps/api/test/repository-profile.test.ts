import { describe, expect, it } from 'vitest'
import {
  discoverRepositoryProfile,
  type RepositorySnapshot,
} from '../src/github/repository-profile.js'
const base = (): RepositorySnapshot => ({
  sourceSha: 'a'.repeat(40),
  treeSha: 'b'.repeat(40),
  branch: 'main',
  fullName: 'fixture/app',
  complete: true,
  warnings: [],
  files: [],
})
const signal = (snapshot: RepositorySnapshot, id: string) =>
  discoverRepositoryProfile(snapshot).signals.find((item) => item.id === id)!

describe('repository engineering profile', () => {
  it('keeps representative evidence for every language and framework within display limits', () => {
    const snapshot = base()
    snapshot.files = Array.from({ length: 25 }, (_, index) => ({
      path: 'web/' + index + '.ts',
      sha: 'c'.repeat(40),
      size: 1,
    }))
    snapshot.files.push({ path: 'api/main.go', sha: 'd'.repeat(40), size: 1 })
    snapshot.files.push(
      ...Array.from({ length: 25 }, (_, index) => ({
        path: 'web/' + index + '/package.json',
        sha: 'e'.repeat(40),
        size: 30,
        content: '{"dependencies":{"react":"1"}}',
      })),
    )
    snapshot.files.push({
      path: 'api/package.json',
      sha: 'f'.repeat(40),
      size: 30,
      content: '{"dependencies":{"express":"1"}}',
    })
    expect(
      signal(snapshot, 'languages').evidence.some(
        (file) => file.path === 'api/main.go',
      ),
    ).toBe(true)
    expect(
      signal(snapshot, 'frameworks').evidence.some(
        (file) => file.path === 'api/package.json',
      ),
    ).toBe(true)
    expect(signal(snapshot, 'frameworks').evidence).toHaveLength(20)
  })
  it('reports Node framework/test hints with exact blob evidence without retaining source content', () => {
    const snapshot = base()
    snapshot.files = [
      {
        path: 'apps/api/package.json',
        sha: 'c'.repeat(40),
        size: 100,
        content: JSON.stringify({
          dependencies: { '@nestjs/core': '1' },
          devDependencies: { vitest: '1' },
          scripts: { test: 'vitest run' },
        }),
      },
      { path: 'src/main.ts', sha: 'd'.repeat(40), size: 1 },
      { path: 'pnpm-lock.yaml', sha: 'e'.repeat(40), size: 1 },
    ]
    expect(signal(snapshot, 'frameworks')).toMatchObject({
      state: 'detected',
      observations: ['NestJS'],
      evidence: [{ path: 'apps/api/package.json', blobSha: 'c'.repeat(40) }],
    })
    expect(signal(snapshot, 'tests').state).toBe('detected')
    expect(signal(snapshot, 'ci').state).toBe('not_detected')
    expect(JSON.stringify(discoverRepositoryProfile(snapshot))).not.toContain(
      'vitest run',
    )
  })
  it('never reports absent controls when the tree is partial', () => {
    const snapshot = { ...base(), complete: false }
    expect(signal(snapshot, 'ci').state).toBe('unknown')
    expect(signal(snapshot, 'tests').state).toBe('unknown')
    expect(signal(snapshot, 'trivy').state).toBe('unknown')
  })
  it('marks malformed and unread manifests unknown and ignores generated/vendor hints', () => {
    const snapshot = base()
    snapshot.files = [
      {
        path: 'package.json',
        sha: 'c'.repeat(40),
        size: 1,
        content: '{broken',
      },
      {
        path: 'node_modules/next/package.json',
        sha: 'd'.repeat(40),
        size: 1,
        content: '{"dependencies":{"next":"1"}}',
      },
      { path: 'dist/app.spec.js', sha: 'e'.repeat(40), size: 1 },
    ]
    expect(signal(snapshot, 'frameworks').state).toBe('unknown')
    expect(signal(snapshot, 'tests').state).toBe('unknown')
    expect(discoverRepositoryProfile(snapshot).complete).toBe(false)
  })
  it('treats scanner references as hints and unread workflows as unknown coverage', () => {
    const snapshot = base()
    snapshot.files = [
      {
        path: '.github/workflows/security.yml',
        sha: 'c'.repeat(40),
        size: 10,
        content: 'uses: aquasecurity/trivy-action@v1',
      },
    ]
    expect(signal(snapshot, 'trivy').state).toBe('detected')
    expect(signal(snapshot, 'gitleaks').state).toBe('not_detected')
    snapshot.files[0]!.content = undefined
    expect(signal(snapshot, 'trivy').state).toBe('unknown')
    expect(discoverRepositoryProfile(snapshot).warnings.join(' ')).toContain(
      'coverage remains incomplete',
    )
  })
})
