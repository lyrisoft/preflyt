import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Export only the separately licensed Action; never export app code or Git history.
const source = fileURLToPath(new URL('../../actions/policy-check/', import.meta.url));
const destination = process.argv[2] && resolve(process.argv[2]);
if (!destination || destination === resolve(source)) throw new Error('Choose an empty export directory');
await mkdir(destination, { recursive: true });
if ((await readdir(destination)).length) throw new Error('Export directory must be empty');
for (const file of ['action.yml', 'run.py', 'recipes.py', 'transport.py', 'test_run.py', 'test_transport.py', 'README.md', 'LICENSE', '.gitignore']) {
  await copyFile(resolve(source, file), resolve(destination, file));
}
console.log(`Action files exported to ${destination}`);
