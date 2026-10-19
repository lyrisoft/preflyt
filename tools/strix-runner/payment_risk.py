"""Versioned source-only payment report. Evidence is bound to observed reads."""
import json
import re

PROFILE = 'payment-risk-v1'
DOMAINS = ['discovery', 'application_security', 'payment_security', 'financial_integrity',
           'infrastructure', 'data_compliance', 'fraud_abuse', 'risk_reporting']
SCENARIOS = ['provider_timeout_retry', 'duplicate_webhooks', 'concurrent_payouts',
             'status_manipulation', 'amount_manipulation', 'partial_failure']
AREAS = ['money_movement', 'ledger', 'payout', 'refund', 'settlement', 'reconciliation', 'fx']
TIMEFRAMES = ['immediate', '7_days', '30_days', 'long_term']
OUTCOMES = ['reviewed', 'needs_follow_up', 'not_applicable']
CREDENTIAL = re.compile(r'-----BEGIN|Bearer\s|(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]', re.I)


def validate_report(raw, issues, reference_valid):
    """Reject incomplete reports, invented issues, unread evidence and verification claims."""
    def require(condition, field='report structure or field value'):
        if not condition: raise ValueError('PAYMENT_RISK_REPORT_INVALID: ' + field)
    def text(value, field='text'):
        require(isinstance(value, str) and 0 < len(value.strip()) <= 6000 and not CREDENTIAL.search(value), field + ' must be nonempty, complete, at most 6000 characters and contain no credentials')
    def rows(value, maximum=50):
        require(isinstance(value, list) and len(value) <= maximum)
        require(all(isinstance(row, dict) for row in value))
        return value
    def exact(value, key, expected):
        value = rows(value)
        require(len(value) == len(expected) and {row.get(key) for row in value} == set(expected), key + ' keys must be exactly: ' + ', '.join(expected))
        return value
    def refs(value, required=False):
        value = rows(value, 10)
        require(not required or bool(value))
        for ref in value:
            require(set(ref) == {'path', 'startLine', 'endLine'})
            require(isinstance(ref['path'], str) and type(ref['startLine']) is int and type(ref['endLine']) is int)
            require(reference_valid(ref), 'reference was not observed: ' + str(ref['path']) + ':' + str(ref['startLine']) + '-' + str(ref['endLine']) + '; use observedSourceRanges from list_source_issues')
    def ids(value):
        require(isinstance(value, list) and len(value) <= 50 and all(isinstance(v, str) for v in value))
        require(len(set(value)) == len(value) and set(value) <= issue_ids, 'issueIds must be unique saved source issue IDs; use an empty list when no issue was saved')
    require(isinstance(raw, dict) and len(json.dumps(raw).encode()) <= 240000)
    require(raw.get('version') == 1 and raw.get('profile') == PROFILE)
    text(raw.get('executiveSummary'), 'executiveSummary')
    inventory = rows(raw.get('systemInventory'), 40)
    require(bool(inventory))
    for item in inventory:
        text(item.get('service'), 'systemInventory.service'); text(item.get('description'), 'systemInventory.description'); refs(item.get('references'), True)
    issue_ids = {issue['id'] for issue in issues}
    findings = rows(raw.get('findings'))
    require(len(findings) == len(issue_ids) and {f.get('issueId') for f in findings} == issue_ids, 'findings must contain exactly the saved source issue IDs, or be empty if none were saved')
    for finding in findings:
        require(finding.get('classification') in ['LIKELY', 'POTENTIAL'])
        require(finding.get('category') in DOMAINS)
        for key in ['service', 'function', 'attackScenario']: text(finding.get(key), 'findings.'+key)
        likelihood, impact = finding.get('likelihood'), finding.get('impact')
        require(type(likelihood) is int and 1 <= likelihood <= 5 and type(impact) is int and 1 <= impact <= 5)
        score = likelihood * impact
        finding.update(score=score, severity='critical' if score >= 20 else 'high' if score >= 12 else 'medium' if score >= 6 else 'low')
    for section, key, expected in [('domains', 'domain', DOMAINS), ('paymentRiskRegister', 'area', AREAS), ('attackScenarios', 'scenario', SCENARIOS)]:
        for item in exact(raw.get(section), key, expected):
            require(item.get('outcome') in OUTCOMES)
            text(item.get('reason'), section+'.'+str(item.get(key))+'.reason'); ids(item.get('issueIds'))
            refs(item.get('references'), item['outcome'] != 'needs_follow_up')
    for item in exact(raw.get('remediationPlan'), 'timeframe', TIMEFRAMES):
        text(item.get('actions'), 'remediationPlan.actions'); ids(item.get('issueIds'))
    cases = rows(raw.get('qaRegressionCases'))
    require(len(cases) == len(issue_ids) and {case.get('issueId') for case in cases} == issue_ids, 'qaRegressionCases must contain one case per saved issue, or be empty when there are no issues')
    for case in cases: text(case.get('test'), 'qaRegressionCases.test')
    final = raw.get('finalRiskSummary')
    require(isinstance(final, dict))
    text(final.get('summary'), 'finalRiskSummary.summary'); text(final.get('immediateActions'), 'finalRiskSummary.immediateActions'); ids(final.get('topIssueIds'))
    require(len(final['topIssueIds']) <= 10)
    final['topIssueIds'] = [f['issueId'] for f in sorted(findings, key=lambda f: (-f['score'], f['issueId']))[:10]]
    return raw


def save_report(inspection, raw):
    path = inspection.audit_path.with_name('payment-risk-report.json')
    issues_path = inspection.audit_path.with_name('source-issues.json')
    issues = json.loads(issues_path.read_text()) if issues_path.is_file() else []
    def observed(ref):
        return any(a <= ref['startLine'] <= ref['endLine'] <= b
                   for paths in inspection.reads.values() for a, b in paths.get(ref['path'], []))
    try:
        report = validate_report(raw, issues, observed)
    except (ValueError, TypeError, KeyError) as error:
        detail = str(error) if isinstance(error, ValueError) and str(error).startswith('PAYMENT_RISK_REPORT_INVALID:') else 'Invalid field type or missing field.'
        return {'success': False, 'detail': detail, 'error': 'Report incomplete or invalid. Include all eight sections, eight domains, seven register areas and six scenarios. Cite observed source reads, use saved issue IDs, LIKELY/POTENTIAL only, scores 1–5 and one proposed regression case per issue. Record unreviewed work as needs_follow_up.'}
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(report)); temporary.chmod(0o600); temporary.replace(path)
    return {'success': True, 'message': 'Payment risk report saved. Findings remain Needs review; scenarios and regression cases were not executed.'}
