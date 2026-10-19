import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const images = {
  'preflyt-api': ['deploy/api.Dockerfile', 'runtime'],
  'preflyt-api-migration': ['deploy/api.Dockerfile', 'migration'],
  'preflyt-native-controller': ['deploy/api.Dockerfile', 'native-docker-controller'],
  'preflyt-health-scanner': ['deploy/api.Dockerfile', 'health-scanner'],
  'preflyt-strix-runner': ['deploy/strix.Dockerfile', 'runtime'],
  // Dockerfile paths are relative to each image's context (repository root by default).
  'preflyt-strix-sandbox': ['sandbox.Dockerfile', undefined, 'tools/strix-runner'],
  'preflyt-web': ['deploy/web.Dockerfile', 'runtime'],
};
export function publishRelease(mode, env, docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), write = writeFileSync) {
  const { GITHUB_SHA: sha, GITHUB_REPOSITORY_OWNER: owner, GITHUB_REPOSITORY: repository, ARCH: arch, BUILD_GROUP: group, RUNNER_TEMP: temp } = env;
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[a-zA-Z0-9-]+$/.test(owner ?? '') || repository !== `${owner}/preflyt`) throw new Error('Invalid release identity');
  const tag = (image, suffix = '') => `ghcr.io/${owner}/${image}:sha-${sha}${suffix}`;
  const exists = (ref) => {
    try { docker(['buildx', 'imagetools', 'inspect', ref]); return true; }
    catch (error) {
      if (/manifest unknown|not found/i.test(String(error.stderr ?? ''))) return false;
      throw error; // Registry/authentication failures must never become overwrite permission.
    }
  };
  if (mode === 'build') {
    if (!['amd64', 'arm64'].includes(arch) || !['api', 'web', 'strix'].includes(group) || !temp) throw new Error('Invalid native build target');
    const targets = {};
    for (const [image, [dockerfile, stage, context = '.']] of Object.entries(images)) {
      const imageGroup = image.startsWith('preflyt-strix-') ? 'strix' : image === 'preflyt-web' ? 'web' : 'api';
      if (imageGroup !== group || exists(tag(image, `-${arch}`))) continue;
      targets[image] = {
        context, dockerfile, target: stage, platforms: [`linux/${arch}`],
        attest: [{ type: 'sbom' }, { type: 'provenance', mode: 'max' }],
        tags: [tag(image, `-${arch}`)],
        args: { PREFLYT_BUILD_VERSION: env.PREFLYT_BUILD_VERSION ?? 'development', PREFLYT_BUILD_SHA: sha, ...(image === 'preflyt-health-scanner' ? { PREFLYT_DATABASE_EPOCH: new Date().toISOString().slice(0, 10) } : {}) },
        'cache-from': [`type=registry,ref=ghcr.io/${owner}/${image}:build-cache-${arch}`],
        // Export only the sanitized final scanner layers. The upstream Semgrep
        // build input contains an unused proprietary binary removed before export.
        'cache-to': [`type=registry,mode=${image === 'preflyt-health-scanner' ? 'min' : 'max'},ref=ghcr.io/${owner}/${image}:build-cache-${arch}`],
        labels: { 'org.opencontainers.image.source': `https://github.com/${repository}`, 'org.opencontainers.image.revision': sha, 'org.opencontainers.image.version': env.PREFLYT_BUILD_VERSION ?? 'development' },
      };
    }
    if (Object.keys(targets).length) {
      const file = `${temp}/preflyt-release-${group}-${arch}.json`;
      write(file, JSON.stringify({ group: { default: { targets: Object.keys(targets) } }, target: targets }));
      docker(['buildx', 'bake', '-f', file, '--push', '--progress=plain']);
    }
  } else if (mode === 'manifest') {
    for (const image of Object.keys(images)) {
      if (!exists(tag(image))) docker(['buildx', 'imagetools', 'create', '-t', tag(image), tag(image, '-amd64'), tag(image, '-arm64')]);
      const manifest = JSON.parse(docker(['buildx', 'imagetools', 'inspect', '--raw', tag(image)]));
      const platforms = new Set((manifest.manifests ?? []).map(item => `${item.platform?.os}/${item.platform?.architecture}`));
      if (!platforms.has('linux/amd64') || !platforms.has('linux/arm64')) throw new Error(`Missing release architecture for ${image}`);
    }
  } else throw new Error('Unknown release operation');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishRelease(process.argv[2], process.env, (args) => {
    try { return execFileSync('docker', args, { encoding: 'utf8', stdio: args.includes('bake') ? 'inherit' : ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }) ?? ''; }
    catch (error) { process.stderr.write(String(error.stderr ?? '')); throw error; }
  });
}
