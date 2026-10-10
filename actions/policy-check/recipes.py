"""Reviewed defaults executed only in the repository's GitHub runner."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def run(argv, env=None):
    return subprocess.run(argv, env=env, check=False).returncode


def installed(name):
    tool = shutil.which(name)
    if not tool:
        raise ValueError('Use a tool already installed by this workflow, or add your own check command.')
    return tool


def node_script(script):
    package = json.loads(Path('package.json').read_text())
    if not package.get('scripts', {}).get(script):
        raise ValueError('No matching package script. Add a custom workflow command to this check.')
    manager = 'pnpm' if Path('pnpm-lock.yaml').exists() else 'yarn' if Path('yarn.lock').exists() else 'npm'
    return [installed(manager), 'run', script]


def main(check, report):
    output = Path(report)
    output.parent.mkdir(parents=True, exist_ok=True)
    if check in ('types.required', 'build.required'):
        return run(node_script('typecheck' if check == 'types.required' else 'build'))
    if check == 'tests.required':
        if Path('node_modules/.bin/vitest').exists():
            return run(['node_modules/.bin/vitest', 'run', '--reporter=default', '--reporter=junit', f'--outputFile={report}'])
        if Path('node_modules/.bin/jest').exists():
            if not Path('node_modules/jest-junit').exists():
                raise ValueError('Use your existing JUnit test command, or install its reporter in your workflow.')
            env = {**os.environ, 'JEST_JUNIT_OUTPUT_FILE': str(output.resolve())}
            return run(['node_modules/.bin/jest', '--ci', '--reporters=default', '--reporters=jest-junit'], env)
        if Path('package.json').exists():
            package = json.loads(Path('package.json').read_text())
            if 'node --test' in package.get('scripts', {}).get('test', ''):
                return run(['node', '--test', '--test-reporter=junit', f'--test-reporter-destination={report}'])
            raise ValueError('Unsupported test runner. Add your JUnit-producing test command to this check.')
        return run([sys.executable, '-m', 'pytest', f'--junitxml={report}'])
    if check == 'security.sast':
        config = next((name for name in ('.semgrep.yml', '.semgrep.yaml', '.semgrep') if Path(name).exists()), None)
        if not config:
            raise ValueError('Use your existing Semgrep configuration in a custom workflow command.')
        code = run([installed('semgrep'), 'scan', '--config', config, '--metrics=off', '--disable-version-check', '--strict', '--sarif', '--output', report, '.'])
    elif check == 'secrets.scan':
        tool = installed('gitleaks')
        code = run([tool, 'dir', '.', '--redact', '--exit-code', '0', '--report-format', 'sarif', '--report-path', report])
    elif check in ('security.dependencies', 'containers.scan', 'iac.policy', 'iac.exposures'):
        tool = installed('trivy')
        if check == 'containers.scan':
            image = os.environ.get('CONTAINER_IMAGE')
            if not image: raise ValueError('Set CONTAINER_IMAGE to the image produced by your build.')
            command = [tool, 'image', '--scanners', 'vuln']
            target = image
        else:
            command = [tool, 'fs', '--scanners', 'vuln' if check == 'security.dependencies' else 'misconfig']
            target = '.'
        code = run([*command, '--format', 'sarif', '--output', report, target])
    elif check == 'lint.required':
        if not Path('node_modules/.bin/eslint').exists():
            raise ValueError('No ESLint installation. Add your SARIF-producing lint command to this check.')
        if not Path('node_modules/@microsoft/eslint-formatter-sarif').exists():
            raise ValueError('Use your existing SARIF lint command, or install its formatter in your workflow.')
        code = run(['node_modules/.bin/eslint', '.', '--format', '@microsoft/eslint-formatter-sarif', '--output-file', report])
    else:
        raise ValueError('Add a custom workflow command for this check.')
    # Scanner formats sometimes omit invocation metadata. Record a successful
    # invocation only after this runner observed a successful real command.
    if code == 0:
        data = json.loads(output.read_text())
        for scan in data.get('runs', []):
            if not scan.get('invocations'):
                scan['invocations'] = [{'executionSuccessful': True}]
        output.write_text(json.dumps(data))
    return code


if __name__ == '__main__':
    try:
        raise SystemExit(main(sys.argv[1], sys.argv[2]))
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        # No invented results or echoed secrets when a recipe cannot execute.
        print('::error::This check needs a repository-specific workflow command or installed test dependencies. Edit the check in Standards.')
        raise SystemExit(78)
