"""Combine actual suite results without stdout/artifact payloads or invented passes."""
import os
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

MAX_INPUT = 4_000_000
MAX_REPORT = 262144
MAX_CASES = 5000


def merge(output, inputs):
    target = Path(output)
    target.unlink(missing_ok=True)  # Missing current reports must never reuse old evidence.
    if len(inputs) != 2:
        raise ValueError('Both API and browser reports are required')
    result = ET.Element('testsuites')
    total = 0
    for filename in inputs:
        raw = Path(filename).read_bytes()
        if len(raw) > MAX_INPUT or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
            raise ValueError('Unsupported test report')
        source = ET.fromstring(raw)
        cases = list(source.iter('testcase'))
        if source.tag not in ('testsuite', 'testsuites') or not cases:
            raise ValueError('Missing actual test cases')
        suite = ET.SubElement(result, 'testsuite', name=Path(filename).stem, tests=str(len(cases)))
        failures = errors = skipped = 0
        for case in cases:
            saved = ET.SubElement(suite, 'testcase', name=case.get('name', 'unnamed')[:96])
            for tag in ('failure', 'error', 'skipped'):
                for outcome in case.findall(tag):
                    ET.SubElement(saved, tag, message=outcome.get('message', tag)[:200])
                    failures += tag == 'failure'
                    errors += tag == 'error'
                    skipped += tag == 'skipped'
        suite.set('failures', str(failures))
        suite.set('errors', str(errors))
        suite.set('skipped', str(skipped))
        total += len(cases)
    data = ET.tostring(result, encoding='utf-8', xml_declaration=True)
    if total > MAX_CASES or len(data) > MAX_REPORT:
        raise ValueError('Combined report exceeds Preflyt limits; split test suites into separate policy checks')
    temporary = target.with_suffix('.tmp')
    try:
        temporary.write_bytes(data)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'Combined {total} actual test cases ({len(data)} bytes).')


if __name__ == '__main__':
    try:
        merge(sys.argv[1], sys.argv[2:])
    except (OSError, ValueError, ET.ParseError, IndexError) as error:
        print(f'Could not combine test results: {error}', file=sys.stderr)
        sys.exit(1)
