import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const images = {
  'preflyt-api': ['deploy/api.Dockerfile', 'runtime'],
  'preflyt-api-migration': ['deploy/api.Dockerfile', 'migration'],
  'preflyt-native-controller': ['deploy/api.Dockerfile', 'native-docker-controller'],
  'preflyt-health-scanner': ['deploy/api.Dockerfile', 'health-scanner'],
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
    if (!['amd64', 'arm64'].includes(arch) || !['api', 'web'].includes(group) || !temp) throw new Error('Invalid native build target');
    const targets = {};
    for (const [image, [dockerfile, stage]] of Object.entries(images)) {
      if ((image === 'preflyt-web') !== (group === 'web') || exists(tag(image, `-${arch}`))) continue;
      targets[image] = {
        context: '.', dockerfile, target: stage, platforms: [`linux/${arch}`],
        tags: [tag(image, `-${arch}`)],
        'cache-from': [`type=registry,ref=ghcr.io/${owner}/${image}:build-cache-${arch}`],
        'cache-to': [`type=registry,mode=max,ref=ghcr.io/${owner}/${image}:build-cache-${arch}`],
        labels: { 'org.opencontainers.image.source': `https://github.com/${repository}`, 'org.opencontainers.image.revision': sha },
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
