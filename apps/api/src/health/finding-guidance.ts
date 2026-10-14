/** Preflyt advice saved with a health report; never part of signed scanner evidence. */
export type FindingGuidance = {
 version: 1 | 2; source: 'PREFLYT_RULE_GUIDANCE'; rule: string;
 why: string; fix: string; limits: string; reference?: string;
}
type Entry = { check: string; why: string; fix: string; limits: string; reference?: string }
const dynamic = {
 why: 'Executing text as code can allow unintended operations when the text contains untrusted input.',
 fix: 'Replace dynamic execution with explicit function calls or a dispatch table. For data, use a data parser. Trace the input source and add tests for rejected input.',
 limits: 'This rule detects a call pattern. It does not prove that untrusted input reaches the call or that it is exploitable.',
}
const md5 = {
 why: 'MD5 has known collision weaknesses. Its impact depends on whether this hash is used for security or only as a non-security checksum.',
 fix: 'Review the purpose and input. For security-sensitive hashing, choose an appropriate modern algorithm; password storage needs a dedicated password-hashing scheme. Record the rationale if no change is needed.',
 limits: 'This is a hotspot for human review, not a confirmed vulnerability. The call pattern alone cannot establish the purpose of the hash.',
 reference: 'https://docs.python.org/3/library/hashlib.html',
}
const rules: Record<string, Entry> = {
  'preflyt-js-async-promise-executor': {
  check:'quality.reliability',
  why:'Errors thrown inside an async Promise executor do not reject the outer Promise automatically. The outer operation can remain pending while an error goes unhandled.',
  fix:'Use an async function directly when possible. If a Promise constructor is needed, keep its executor synchronous and connect failures to reject. Test both success and failure paths.',
  limits:'The rule detects an async executor. Review whether the outer Promise represents the intended operation; this does not establish a production incident.',
  reference:'https://eslint.org/docs/latest/rules/no-async-promise-executor',
 },
 'preflyt-python-return-finally': {
  check:'quality.reliability',
  why:'A return from finally replaces a pending return and can suppress an exception from the try block. Cleanup can therefore hide a failure or change the returned value.',
  fix:'Keep cleanup in finally and move the return after the try statement. Test the failure path to confirm that expected exceptions still reach the caller.',
  limits:'This rule reports a return in the matched cleanup block. Intentional suppression requires explicit review.',
  reference:'https://docs.python.org/3/reference/compound_stmts.html#finally',
 },
 'preflyt-python-mutable-default': {
  check:'quality.maintainability',
  why:'Python creates a default argument once when defining the function. Mutating a default list or dictionary can carry state between calls.',
  fix:'Default the argument to None and create a fresh collection inside the function. Add repeated-call tests. If shared state is intentional, make that choice explicit.',
  limits:'The rule detects empty list and dictionary defaults, not every mutable object. A finding does not prove the default is mutated.',
  reference:'https://docs.python.org/3/tutorial/controlflow.html#default-argument-values',
 },
 'preflyt-python-sql-fstring': {
  check:'security.sast',
  why:'Inserting values directly into SQL text can let input alter the query. The rule reports an f-string SQL expression passed directly to execute.',
  fix:'Use the database API’s parameter placeholders and a separate values argument. Keep SQL identifiers on an explicit allowlist; placeholders generally bind values rather than table or column names.',
  limits:'This call pattern does not prove that input is untrusted. It covers direct f-string SQL statements beginning with SELECT, INSERT, UPDATE, DELETE or REPLACE, not all SQL construction paths.',
  reference:'https://docs.python.org/3/library/sqlite3.html#how-to-use-placeholders-to-bind-values-in-sql-queries',
 },

 'preflyt-js-eval': {check:'security.sast', ...dynamic, reference:'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval'},
 'preflyt-python-dynamic-execution': {check:'security.sast', ...dynamic, reference:'https://docs.python.org/3/library/functions.html#exec'},
 'preflyt-js-nan-comparison': {
  check:'quality.reliability',
  why:'Equality comparisons with NaN are false, and inequality comparisons are true, even when the other value is NaN. This can make a numeric validation branch behave incorrectly.',
  fix:'Use Number.isNaN(value), or its negation for an inequality check. Add tests for NaN and ordinary numeric values; Number.isNaN does not coerce strings to numbers.',
  limits:'Review the matched expression and intended branch behavior before changing it.',
  reference:'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/NaN',
 },
 'preflyt-python-bare-except': {
  check:'quality.reliability',
  why:'A bare except catches every exception, including KeyboardInterrupt and SystemExit. It can hide failures and prevent expected interruption or exit.',
  fix:'Catch the specific exception types the operation is expected to raise. Preserve unexpected failures and test the recovery path. If interruption handling is intentional, document it explicitly.',
  limits:'The rule detects a broad handler; it does not determine whether recovery is intentional or correct.',
  reference:'https://docs.python.org/3/library/exceptions.html',
 },
 'preflyt-python-redundant-reraise': {
  check:'quality.maintainability',
  why:'The matched exception handler only re-raises the active exception without additional handling.',
  fix:'Remove the redundant handler while preserving other exception handlers, else clauses and finally cleanup.',
  limits:'Review the entire try statement first. This suggestion does not establish that exceptions are handled incorrectly.'
 },
 'preflyt-python-wildcard-import': {
  check:'quality.maintainability',
  why:'A wildcard import hides which names a module uses and can introduce unexpected name collisions.',
  fix:'Replace the wildcard with explicit imported names. Keep intentional public API re-exports where needed.',
  limits:'This is advisory. Package initializers may deliberately re-export a documented public API.'
 },
 'preflyt-js-redundant-catch': {
  check:'quality.maintainability',
  why:'The matched catch block throws the same error without adding handling or context.',
  fix:'Remove the redundant catch block, preserving any finally cleanup and the surrounding error propagation.',
  limits:'The check targets only a direct rethrow. Review surrounding cleanup before changing control flow.'
 },
 'preflyt-js-nested-ternary': {
  check:'quality.maintainability',
  why:'Nested ternary branches combine several decisions in one expression, making each outcome harder to follow.',
  fix:'Extract named intermediate values or use explicit if/else branches while preserving evaluation order.',
  limits:'This is a readability suggestion, not proof of a bug. A short, familiar conditional may be clearer as written.'
 },
 'preflyt-no-debugger': {
  check:'quality.maintainability',
  why:'A debugger statement can pause execution when debugging is available. Leftover statements can disrupt debugging and obscure production intent.',
  fix:'Remove the statement if it was left from development. Keep intentional debugging tools outside production code and verify the affected behavior.',
  limits:'The statement has no effect when debugging functionality is unavailable. This is a maintainability review, not proof of a production failure.',
  reference:'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger',
 },
 'preflyt-python-exec-statement': {
  check:'quality.maintainability',
  why:'Dynamic execution makes dependencies and control flow harder to understand because behavior is supplied as code at runtime.',
  fix:'Prefer explicit functions or a dispatch table. If dynamic execution is required, isolate it, document the reason and test its input boundaries.',
  limits:'The rule reports an exec call. It does not prove a security flaw or measure overall maintainability.',
  reference:'https://docs.python.org/3/library/functions.html#exec',
 },
 'preflyt-js-md5-review': {check:'security.hotspots', ...md5},
 'preflyt-python-md5-review': {check:'security.hotspots', ...md5},
 'preflyt-duplicate-block-v1': {
  check:'quality.duplication',
  why:'The analyzer found a repeated token block within its recorded source scope. Repeated logic can drift when a change is applied to only one copy.',
  fix:'Compare the repeated blocks and their callers. Extract shared behavior only when their responsibilities are the same; keep intentional repetition when abstraction would make the code harder to follow.',
  limits:'Token similarity does not prove identical behavior or a defect. Comments, whitespace and excluded files follow the recorded duplication settings.',
 },
}
export function findingGuidance(check: string, ruleId: string | null): FindingGuidance | undefined {
 if (check === 'secrets.scan') return {
  version:2,source:'PREFLYT_RULE_GUIDANCE',rule:'secret-detection',
  why:ruleId==='generic-api-key' ? 'Gitleaks detected a credential-like value near an API key or token name. This pattern can also match dummy values in tests and examples. Review the indicated line to determine whether the value is a real credential.' : ruleId==='curl-auth-header' ? 'Gitleaks detected a credential-like value in an HTTP authorization header. Review the indicated line and whether the value is a live credential or an intentional example.' : 'The secret analyzer reported a pattern that may contain credentials or other sensitive material in the assessed revision. The credential value is redacted; the surrounding code and reported location remain available.',
  fix:'Check the reported path securely. If it is a real credential, revoke or rotate it with its issuer, remove it from source and use the deployment secret store. Review access and repository history; deleting a line does not revoke a credential. For a dummy test value, use an unmistakable placeholder instead of a realistic token. Reassess after the change.',
  limits:'Severity indicates potential impact: generic API key patterns are medium and recognized credential types are high. Test or example paths do not prove a value is harmless. A pattern match does not establish whether a credential is valid or has been used. Do not paste the value into review notes.',
 }
 // Semgrep can prefix rule IDs with the fixed config path. Do not use substring matches.
 const rule = ruleId?.split('.').at(-1)
 if (!rule || !Object.hasOwn(rules, rule) || rules[rule].check !== check) return undefined
 const {check: _check, ...entry} = rules[rule]
 return {version:2, source:'PREFLYT_RULE_GUIDANCE', rule, ...entry}
}


export type FindingReferenceGuidance = Omit<FindingGuidance, 'source'> & {
 source: 'PREFLYT_RULE_REFERENCE'; problem?: string;
}
/** Current rule knowledge for CI/legacy display, separate from saved analyzer evidence. */
export function findingReferenceGuidance(ruleId: string | null): FindingReferenceGuidance | undefined {
 const rule = ruleId?.split('.').at(-1)
 if (!rule) return undefined
 if (rule === 'sql-string-interpolation') return {
  version:2, source:'PREFLYT_RULE_REFERENCE', rule,
  problem:'Input is interpolated into SQL query text',
  why:'Interpolating input into SQL makes that input part of the query itself. Quotes or SQL operators in a supplied value can change the query’s meaning, potentially returning unintended records or exposing data.',
  fix:'Use parameter placeholders and pass values separately to the database API. For sqlite3, use execute("SELECT ... WHERE name = ?", (name,)). This keeps input as data. Verify with a test containing quotes or SQL operators.',
  limits:'The rule reports a SQL construction pattern; whether it is exploitable depends on the input source and how the query is executed.',
 }
 if (!Object.hasOwn(rules,rule)) return undefined
 const {check:_check,...entry}=rules[rule]
 return {version:2,source:'PREFLYT_RULE_REFERENCE',rule,...entry}
}
