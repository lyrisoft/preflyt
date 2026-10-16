/** Explicit branch names only; tags, SHAs and wildcard refs are not accepted. */
export function validProfileBranch(branch: unknown): branch is string {
  return (
    typeof branch === 'string' &&
    branch.length > 0 &&
    branch.length <= 244 &&
    !branch.startsWith('refs/') &&
    branch !== '@' &&
    !/[\x00-\x20\x7f~^:?*\[\\]/.test(branch) &&
    !branch.includes('..') &&
    !branch.includes('@{') &&
    !branch.includes('//') &&
    !branch.endsWith('/') &&
    !branch.endsWith('.') &&
    !branch
      .split('/')
      .some((part) => !part || part.startsWith('.') || part.endsWith('.lock'))
  )
}

export type RepositoryFile = {
  path: string
  sha: string
  size: number
  content?: string
  contentError?: string
}

export type RepositorySnapshot = {
  sourceSha: string
  treeSha: string
  branch: string
  fullName: string
  complete: boolean
  files: RepositoryFile[]
  warnings: string[]
  omittedPaths?: { path: string; kind: 'symlink' | 'submodule'; scope: 'file' | 'directory' | 'unknown'; reason: string; affectedChecks?: string[] }[]
}

export type ProfileSignal = {
  id: string
  label: string
  state: 'detected' | 'not_detected' | 'unknown'
  observations: string[]
  evidence: { path: string; blobSha: string; reason: string }[]
}

const ignored = /(^|\/)(node_modules|vendor|dist|build|coverage|\.git|\.claude\/skills|\.agents\/skills|\.codex\/skills)(\/|$)/
const manifest =
  /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(?:\.kts)?|Gemfile|composer\.json|[^/]+\.csproj)$/
const workflow = /^\.github\/workflows\/[^/]+\.ya?ml$/
export const wantsProfileContent = (path: string) =>
  !ignored.test(path) &&
  (/(^|\/)package\.json$/.test(path) || workflow.test(path))

export function omittedProfileChecks(path: string, scope: 'file' | 'directory' | 'unknown'): string[] {
  if (ignored.test(path)) return []
  // Reuse the supported file-hint rules. This probe has no omissions, performs
  // no I/O and is never persisted as repository evidence.
  if (scope !== 'file') return ['languages','frameworks','manifests','lockfiles','ci','tests','containers','iac','migrations','ownership','semgrep','trivy','gitleaks','checkov']
  const probe = discoverRepositoryProfile({ sourceSha: '', treeSha: '', branch: '', fullName: '', complete: true, warnings: [], files: [{ path, sha: '', size: 2, content: '{}' }] })
  const checks = probe.signals.filter((signal) => signal.evidence.some((file) => file.path === path)).map((signal) => signal.id)
  if (/(^|\/)package\.json$/.test(path)) checks.push('frameworks','tests')
  if (workflow.test(path)) checks.push('semgrep','trivy','gitleaks','checkov')
  return [...new Set(checks)]
}

export function discoverRepositoryProfile(snapshot: RepositorySnapshot) {
  const omittedPaths = (snapshot.omittedPaths ?? []).map((item) => ({ ...item, ...(ignored.test(item.path) ? { reason: 'Path is outside supported application profile scope (dependencies, generated output or installed agent skills).' } : {}), affectedChecks: ignored.test(item.path) ? [] : item.affectedChecks ?? omittedProfileChecks(item.path, item.scope) }))
  const affected = new Set(omittedPaths.flatMap((item) => item.affectedChecks))

  const files = snapshot.files.filter((file) => !ignored.test(file.path))
  const signals: ProfileSignal[] = []
  const warnings = [...snapshot.warnings]
  const add = (
    id: string,
    label: string,
    matches: RepositoryFile[],
    observations: string[] = [],
    uncertain = false,
  ) => {
    signals.push({
      id,
      label,
      state: matches.length
        ? 'detected'
        : !snapshot.complete || affected.has(id) || uncertain
          ? 'unknown'
          : 'not_detected',
      observations,
      evidence: matches.slice(0, 20).map((file) => ({
        path: file.path,
        blobSha: file.sha,
        reason: label + ' configuration or source hint',
      })),
    })
    if (matches.length > 20)
      warnings.push(`${label}: evidence display limited to 20 files.`)
  }
  const matching = (pattern: RegExp) =>
    files.filter((file) => pattern.test(file.path))
  const extensions: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    py: 'Python',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    kt: 'Kotlin',
    rb: 'Ruby',
    php: 'PHP',
    cs: 'C#',
    c: 'C',
    cpp: 'C++',
    swift: 'Swift',
  }
  const representativeFirst = (groups: RepositoryFile[][]) => [
    ...new Set([
      ...groups.flatMap((group) => group.slice(0, 1)),
      ...groups.flat(),
    ]),
  ]
  const languageFiles = files.filter(
    (file) => extensions[file.path.split('.').pop() ?? ''],
  )
  add(
    'languages',
    'Languages',
    representativeFirst(
      [...new Set(Object.values(extensions))].map((language) =>
        languageFiles.filter(
          (file) => extensions[file.path.split('.').pop()!] === language,
        ),
      ),
    ),
    [
      ...new Set(
        languageFiles.map((file) => extensions[file.path.split('.').pop()!]),
      ),
    ].sort(),
    languageFiles.length === 0,
  )

  const packages = matching(/(^|\/)package\.json$/)
  const dependencies = new Map<string, RepositoryFile[]>()
  const testDeclarations: RepositoryFile[] = []
  let unreadPackages = false
  for (const file of packages) {
    try {
      if (!file.content) throw new Error('unread')
      const value: unknown = JSON.parse(file.content)
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('invalid')
      const document = value as Record<string, unknown>
      for (const key of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
      ]) {
        const group = document[key]
        if (group && typeof group === 'object' && !Array.isArray(group)) {
          for (const dependency of Object.keys(group))
            dependencies.set(dependency, [
              ...(dependencies.get(dependency) ?? []),
              file,
            ])
        }
      }
      const scripts = document.scripts
      if (scripts && typeof scripts === 'object' && !Array.isArray(scripts)) {
        const test = (scripts as Record<string, unknown>).test
        if (
          typeof test === 'string' &&
          test.trim() &&
          !/no test specified/i.test(test)
        )
          testDeclarations.push(file)
      }
    } catch {
      unreadPackages = true
      warnings.push(
        `${file.path}: dependency and test-script hints could not be inspected.`,
      )
    }
  }
  const frameworks: Record<string, string> = {
    react: 'React',
    next: 'Next.js',
    '@nestjs/core': 'NestJS',
    express: 'Express',
    fastify: 'Fastify',
    vue: 'Vue',
    nuxt: 'Nuxt',
    '@angular/core': 'Angular',
    svelte: 'Svelte',
  }
  const frameworkNames = Object.keys(frameworks).filter((name) =>
    dependencies.has(name),
  )
  add(
    'frameworks',
    'Frameworks',
    representativeFirst(frameworkNames.map((name) => dependencies.get(name)!)),
    frameworkNames.map((name) => frameworks[name]),
    unreadPackages || packages.length === 0,
  )
  add('manifests', 'Dependency manifests', matching(manifest))
  add(
    'lockfiles',
    'Dependency lockfiles',
    matching(
      /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock|Pipfile\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum|packages\.lock\.json)$/,
    ),
  )
  const workflows = files.filter((file) => workflow.test(file.path))
  add(
    'ci',
    'CI configuration',
    matching(
      /(^\.github\/workflows\/[^/]+\.ya?ml$|(^|\/)(\.gitlab-ci\.ya?ml|Jenkinsfile|azure-pipelines\.ya?ml|\.circleci\/config\.yml)$)/,
    ),
  )
  const testDependencies = [
    'vitest',
    'jest',
    '@playwright/test',
    'cypress',
    'mocha',
    'ava',
  ].filter((name) => dependencies.has(name))
  add(
    'tests',
    'Tests and test tooling',
    [
      ...new Set([
        ...matching(
          /((^|\/)(__tests__|tests?|spec|cypress)(\/)|\.(test|spec)\.[^/]+$|(^|\/)(vitest|jest|playwright|pytest)\.config\.[^/]+$|(^|\/)pytest\.ini$)/,
        ),
        ...testDeclarations,
        ...testDependencies.flatMap((name) => dependencies.get(name)!),
      ]),
    ],
    testDependencies,
    unreadPackages,
  )
  add(
    'containers',
    'Container configuration',
    matching(
      /(^|\/)(Dockerfile(?:\.[^/]+)?|[^/]+\.Dockerfile|(?:docker-)?compose(?:\.[^/]+)?\.ya?ml|\.dockerignore)$/,
    ),
  )
  add(
    'iac',
    'Infrastructure as code',
    matching(
      /(\.tf$|(^|\/)(Chart\.yaml|kustomization\.ya?ml)$|(^|\/)(k8s|kubernetes|helm|terraform)\/)/,
    ),
  )
  add(
    'migrations',
    'Database migration hints',
    matching(
      /((^|\/)(migrations?|alembic)\/|(^|\/)schema\.prisma$|(^|\/)flyway\.conf$|liquibase[^/]*\.(xml|ya?ml)$)/,
    ),
  )
  add(
    'ownership',
    'Code ownership configuration',
    matching(/(^|\/)CODEOWNERS$/),
  )
  const scanners = [
    {
      id: 'semgrep',
      label: 'Semgrep',
      config: /(^|\/)\.semgrep(?:\/|\.ya?ml$)/,
      reference: /\bsemgrep\b/i,
    },
    {
      id: 'trivy',
      label: 'Trivy',
      config: /(^|\/)(trivy\.ya?ml|\.trivyignore)$/,
      reference: /\btrivy\b/i,
    },
    {
      id: 'gitleaks',
      label: 'Gitleaks',
      config: /(^|\/)(\.gitleaks\.toml|gitleaks\.toml|\.gitleaksignore)$/,
      reference: /\bgitleaks\b/i,
    },
    {
      id: 'checkov',
      label: 'Checkov',
      config: /(^|\/)\.checkov\.ya?ml$/,
      reference: /\bcheckov\b/i,
    },
  ]
  for (const scanner of scanners) {
    add(
      scanner.id,
      `${scanner.label} configuration`,
      [
        ...matching(scanner.config),
        ...workflows.filter(
          (file) => file.content && scanner.reference.test(file.content),
        ),
      ],
      [
        'Configuration and workflow references do not prove that a scanner ran.',
      ],
      workflows.some((file) => file.content === undefined),
    )
  }
  const unreadContent = files.filter(
    (file) => wantsProfileContent(file.path) && file.content === undefined,
  )
  for (const file of unreadContent) warnings.push(`${file.path}: ${file.contentError === 'size_limit' ? 'Content exceeds the inspection size limit.' : 'Manifest or workflow content was unavailable or outside the read budget.'}`)
  if (unreadContent.length)
    warnings.push(
      `${unreadContent.length} manifest/workflow files could not be inspected within discovery limits or were unavailable. Content-dependent coverage remains incomplete.`,
    )
  for (const item of omittedPaths) if (item.affectedChecks.length) warnings.push(`${item.path}: ${item.reason} Affected checks: ${item.affectedChecks.join(', ')}.`)
  return {
    version: 1,
    complete:
      snapshot.complete && !affected.size && !unreadPackages && unreadContent.length === 0,
    omittedPaths,
    inspectedFileCount: files.length,
    signals,
    warnings: [...new Set(warnings)],
    limitations: [
      'File and dependency hints only; no commands, builds, tests, or scanners were executed.',
      'Installed agent skills under .claude/skills, .agents/skills and .codex/skills are outside application profile scope.',
      'Not detected means no supported hint was found in the inspected snapshot; it is not a policy failure.',
      'Framework dependency inspection currently supports Node.js manifests. Symlinks, submodules and generated/vendor directories are not traversed.',
    ],
  }
}
