export const stableVersion = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function compareVersions(a, b) {
  const x = stableVersion.exec(a)?.slice(1).map(BigInt);
  const y = stableVersion.exec(b)?.slice(1).map(BigInt);
  if (!x || !y) throw new Error('Expected stable versions, vX.Y.Z');
  for (let index = 0; index < 3; index++) {
    if (x[index] !== y[index]) return x[index] > y[index] ? 1 : -1;
  }
  return 0;
}

export function releaseVersion(tags, sha) {
  const stable = tags.filter(tag => stableVersion.test(tag.name)).sort((a, b) => compareVersions(b.name, a.name));
  const existing = stable.find(tag => tag.sha === sha);
  if (existing) return { version: existing.name, reserved: true };
  if (!stable.length) return { version: 'v0.1.0', reserved: false };
  const [major, minor, patch] = stableVersion.exec(stable[0].name).slice(1).map(BigInt);
  return { version: `v${major}.${minor}.${patch + 1n}`, reserved: false };
}
