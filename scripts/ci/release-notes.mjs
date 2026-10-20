import { readFileSync } from 'node:fs';
import { images } from './publish-release.mjs';
import { stableVersion as stable } from './release-version.mjs';

const sections = ["What's new", 'Improvements and fixes', 'Upgrade notes'];

export function validateReleaseNotes(notes, version) {
  if (!stable.test(version)) throw new Error('Release notes require a stable version, vX.Y.Z');
  const content = notes.replace(/\r\n/g, '\n').trim();
  if (/preflyt-release-ready:|^## Technical details\s*$|release-notes-template|\b(?:TODO|TBD|REPLACE_ME)\b/m.test(content)) {
    throw new Error(`${version}: replace release-note placeholders; technical details are added by the publisher`);
  }
  const headings = [...content.matchAll(/^## (.+)$/gm)];
  if (headings.length !== sections.length || headings.some((heading, index) => heading[1] !== sections[index])) {
    throw new Error(`${version}: release notes must contain these sections in order: ${sections.join(', ')}`);
  }
  for (let index = 0; index < headings.length; index++) {
    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index ?? content.length;
    if (!content.slice(start, end).replace(/<!--[\s\S]*?-->/g, '').trim()) {
      throw new Error(`${version}: release notes need content under ${sections[index]}`);
    }
  }
  return content;
}

export function readReleaseNotes(version, read = readFileSync) {
  if (!stable.test(version)) throw new Error('Release notes require a stable version, vX.Y.Z');
  const file = new URL(`../../docs/releases/notes/${version}.md`, import.meta.url);
  let notes;
  try { notes = read(file, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`Missing docs/releases/notes/${version}.md. Write and review the release notes before publishing.`);
  }
  return validateReleaseNotes(notes, version);
}

export function renderReleaseNotes({ notes, version, sha, repository, previousVersion }) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[a-zA-Z0-9-]+\/preflyt$/.test(repository ?? '') || (previousVersion && !stable.test(previousVersion))) {
    throw new Error('Invalid release-note build identity');
  }
  const owner = repository.split('/')[0];
  const imageList = Object.keys(images).map(image => `- \`ghcr.io/${owner}/${image}:${version}\``).join('\n');
  const changelog = previousVersion
    ? `[Full changelog](https://github.com/${repository}/compare/${previousVersion}...${version})`
    : `[Source code](https://github.com/${repository}/tree/${version})`;
  return `${validateReleaseNotes(notes, version)}\n\n## Technical details\n\nAll ${Object.keys(images).length} application images are available for **linux/amd64** and **linux/arm64**:\n\n${imageList}\n\nSource commit: [\`${sha.slice(0, 12)}\`](https://github.com/${repository}/commit/${sha}). The same images are also tagged \`sha-${sha}\`.\n\n${changelog}\n\n<!-- preflyt-release-ready:v1 sha=${sha} -->\n`;
}
