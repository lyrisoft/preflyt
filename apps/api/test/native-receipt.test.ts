import { randomUUID, generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../src/execution/native-runtime.js', () => ({
  nativeRuntimeApproval: vi.fn(),
}))
import { nativeRuntimeApproval } from '../src/execution/native-runtime.js'
import {
  nativeAdapters,
  buildNativePlan,
  nativeToolReviews,
} from '../src/execution/native-plan.js'
import { nativeCheckOutcome } from '../src/execution/native-result.js'
import { digest } from '../src/assessments/assessment-digest.js'
import {
  nativeReceiptSummary,
  signNativeReceipt,
  verifyNativeReceipt,
  type NativeReceipt,
} from '../src/execution/native-receipt.js'
import {
  verifiedNativeEvidence,
  type NativeEvidenceRecord,
} from '../src/execution/native-evidence.js'
import { evaluatePublishedPolicy } from '../src/assessments/published-policy-evaluation.js'
const pair = generateKeyPairSync('ed25519')
const pub = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const key = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
function fixture() {
  const now = Date.now()
  vi.stubEnv(
    'NATIVE_TOOL_REVIEWS',
    JSON.stringify([
      {
        ruleId: 'tests.required',
        image: 'registry.example/tests@sha256:' + 'a'.repeat(64),
        toolVersion: '24.4.1',
        license: 'MIT',
        configHash: 'b'.repeat(64),
        reviewDigest: 'c'.repeat(64),
        expiresAt: new Date(now + 86400000).toISOString(),
        databaseBuiltAt: null,
      },
    ]),
  )
  const tools = nativeToolReviews()!
  const approvalHash = 'd'.repeat(64)
  const approval = {
    controllerPublicKey: pub,
    organizationIds: ['org'],
    environmentId: 'reviewed',
    controlsHash: 'e'.repeat(64),
    approvedAt: new Date(now - 60000).toISOString(),
    expiresAt: new Date(now + 86400000).toISOString(),
    toolReviewHash: tools.reviewHash,
  }
  vi.mocked(nativeRuntimeApproval).mockReturnValue({
    backend: 'docker',
    approval,
    approvalHash,
  } as any)
  const { planHash, ...plan } = buildNativePlan({
    organizationId: 'org',
    repositoryId: '51',
    sourceSha: 'a'.repeat(40),
    selectionId: 'selection',
    rules: [
      {
        id: 'tests.required',
        title: 'Tests',
        required: true,
        capability: 'import_only',
      },
    ],
  })
  const expected = {
    requestId: randomUUID(),
    attemptId: randomUUID(),
    organizationId: 'org',
    repositoryId: '51',
    sourceSha: plan.sourceSha,
    sourceHash: 'f'.repeat(64),
    selectionId: 'selection',
    planHash,
    plan,
    approvalHash,
    ruleIds: ['tests.required'],
  }
  const output = nativeCheckOutcome(
    'tests.required',
    0,
    Buffer.from('<testsuite><testcase name="pass"/></testsuite>'),
  )
  const value: NativeReceipt = {
    version: 1,
    requestId: expected.requestId,
    attemptId: expected.attemptId,
    organizationId: 'org',
    repositoryId: '51',
    sourceSha: plan.sourceSha,
    sourceHash: expected.sourceHash,
    selectionId: 'selection',
    planHash,
    approvalHash,
    environmentId: 'reviewed',
    controlsHash: approval.controlsHash,
    toolReviewHash: tools.reviewHash,
    cancelled: false,
    startedAt: new Date(now - 1000).toISOString(),
    finishedAt: new Date(now).toISOString(),
    checks: [
      {
        ...output,
        summary: nativeReceiptSummary(output.summary),
        adapterId: nativeAdapters['tests.required'].id,
        image: tools.reviews[0].image,
        toolVersion: '24.4.1',
        configHash: tools.reviews[0].configHash,
        commandHash: digest(nativeAdapters['tests.required']),
        exitCode: 0,
        cleanupConfirmed: true,
        coverage: 'FULL_RULE',
      },
    ],
  }
  const seal = (receipt = value) => signNativeReceipt(receipt, key, pub)
  const signature = seal()
  const record: NativeEvidenceRecord = {
    id: expected.requestId,
    controllerJobId: expected.attemptId,
    organizationId: 'org',
    repositoryGithubId: '51',
    sourceSha: plan.sourceSha,
    sourceHash: expected.sourceHash,
    selectionId: 'selection',
    planHash,
    plan,
    ruleIds: expected.ruleIds,
    state: 'SUCCEEDED',
    runtimeApprovalHash: approvalHash,
    receiptHash: digest(signature),
    receiptSignature: signature,
    requestedAt: new Date(now - 2000),
  }
  const rule = {
    id: 'tests.required',
    required: true,
    version: '1.0.0',
    operator: 'verified_check_succeeded',
    allowedSources: ['approved_sandbox'],
    maxAgeHours: 24,
    capability: 'import_only',
  }
  const snapshot: any = {
    sourceSha: plan.sourceSha,
    request: {
      sourceSha: plan.sourceSha,
      selectionId: 'selection',
      organization: 'org',
      repositoryId: '51',
    },
    plan: {
      version: 1,
      mode: 'HYBRID',
      stage: 'ci',
      enforcement: 'observe',
      sourceSha: plan.sourceSha,
      checks: [rule],
    },
    report: {
      version: 1,
      sourceSha: plan.sourceSha,
      checks: [
        {
          ruleId: rule.id,
          required: true,
          evidenceSource: 'NATIVE',
          nativeRequestId: record.id,
          nativeReceiptHash: record.receiptHash,
        },
      ],
      collectionTruncated: false,
      validationCollectionTruncated: false,
      observations: [],
      nativeExecutions: [record],
    },
  }
  const definition = {
    selectionId: 'selection',
    branchRef: 'refs/heads/main',
    rules: [rule],
  }
  const policy = {
    id: 'policy',
    state: 'PUBLISHED',
    selectionId: 'selection',
    definition,
    definitionHash: digest(definition),
  }
  const evaluate = (live = [record]) => {
    snapshot.assessmentHash = digest({
      request: snapshot.request,
      plan: snapshot.plan,
      report: snapshot.report,
    })
    return evaluatePublishedPolicy(
      snapshot,
      policy,
      'refs/heads/main',
      {},
      new Date(now),
      live,
    )
  }
  return {
    expected,
    value,
    approval,
    record,
    seal,
    now,
    snapshot,
    policy,
    evaluate,
  }
}
describe('native execution receipts', () => {
  it('verifies an exact fixed-adapter execution signed by the independently approved controller', () => {
    const f = fixture()
    expect(verifyNativeReceipt(f.seal(), f.expected, f.now)).toEqual(f.value)
    expect(verifiedNativeEvidence(f.record, f.now)).not.toBeNull()
  })
  it.each([
    'requestId',
    'attemptId',
    'organizationId',
    'repositoryId',
    'sourceSha',
    'sourceHash',
    'selectionId',
    'planHash',
    'approvalHash',
  ])('rejects a signed result bound to another %s', (field) => {
    const f = fixture()
    const changed = { ...f.value, [field]: '0'.repeat(64) }
    expect(verifyNativeReceipt(f.seal(changed), f.expected, f.now)).toBeNull()
  })
  it('rejects another signer, changed admission plan, missing or duplicate checks and raw tool text', () => {
    const f = fixture(),
      other = generateKeyPairSync('ed25519')
    const token = signNativeReceipt(
      f.value,
      other.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      other.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    )
    expect(verifyNativeReceipt(token, f.expected)).toBeNull()
    expect(
      verifyNativeReceipt(f.seal(), {
        ...f.expected,
        plan: { ...f.expected.plan, steps: [] },
      }),
    ).toBeNull()
    expect(
      verifyNativeReceipt(f.seal({ ...f.value, checks: [] }), f.expected),
    ).toBeNull()
    expect(
      verifyNativeReceipt(
        f.seal({ ...f.value, checks: [f.value.checks[0], f.value.checks[0]] }),
        f.expected,
      ),
    ).toBeNull()
    f.value.checks[0].summary = {
      ...f.value.checks[0].summary,
      snippet: 'sensitive source',
    }
    expect(verifyNativeReceipt(f.seal(), f.expected)).toBeNull()
  })
  it.each(['image', 'toolVersion', 'configHash', 'commandHash', 'adapterId'])(
    'rejects changed execution %s',
    (field) => {
      const f = fixture()
      ;(f.value.checks[0] as any)[field] = 'changed'
      expect(verifyNativeReceipt(f.seal(), f.expected)).toBeNull()
    },
  )
  it('rejects revoked runtime or tool reviews', () => {
    const f = fixture()
    vi.stubEnv('NATIVE_TOOL_REVIEWS', '[]')
    expect(verifyNativeReceipt(f.seal(), f.expected)).toBeNull()
    vi.mocked(nativeRuntimeApproval).mockReturnValue(null)
    expect(verifyNativeReceipt(f.seal(), f.expected)).toBeNull()
  })
  it.each([
    'future',
    'backwards',
    'outside-review',
    'skipped',
    'failed-success',
    'unconfirmed-cleanup',
    'cancelled-success',
  ])('does not verify an invalid %s success', (kind) => {
    const f = fixture()
    if (kind === 'future')
      f.value.finishedAt = new Date(f.now + 10000).toISOString()
    if (kind === 'backwards')
      f.value.finishedAt = new Date(f.now - 10000).toISOString()
    if (kind === 'outside-review')
      f.value.startedAt = new Date(f.now - 120000).toISOString()
    if (kind === 'skipped')
      f.value.checks[0].summary = {
        tests: 2,
        passed: 1,
        failures: 0,
        errors: 0,
        skipped: 1,
      }
    if (kind === 'failed-success') f.value.checks[0].exitCode = 1
    if (kind === 'unconfirmed-cleanup')
      f.value.checks[0].cleanupConfirmed = false
    if (kind === 'cancelled-success') f.value.cancelled = true
    expect(verifyNativeReceipt(f.seal(), f.expected)).toBeNull()
  })
  it('reduces summaries to counters, excluding source, messages and logs', () => {
    expect(
      nativeReceiptSummary({
        tests: 1,
        snippet: 'secret',
        path: '/workspace/a',
        error: 'sensitive',
        skipped: -1,
      }),
    ).toEqual({ tests: 1 })
  })
})
describe('native results in published policy evaluation', () => {
  it('passes a current verified native result without requiring a GitHub artifact attestation', () => {
    const f = fixture()
    expect(f.evaluate().status).toBe('PASS')
  })
  it('blocks a current signed failed test', () => {
    const f = fixture()
    f.value.checks[0] = {
      ...f.value.checks[0],
      state: 'FAIL',
      reason: 'CHECK_FAILED',
      exitCode: 1,
      summary: { tests: 1, passed: 0, skipped: 0, errors: 0, failures: 1 },
    }
    f.record.receiptSignature = f.seal()
    f.record.receiptHash = digest(f.record.receiptSignature)
    f.record.state = 'FAILED'
    f.snapshot.report.checks[0].nativeReceiptHash = f.record.receiptHash
    expect(f.evaluate().status).toBe('BLOCK')
  })
  it.each([
    'missing',
    'newer-queued',
    'cancelled',
    'partial',
    'expired',
    'wrong-org',
    'wrong-repo',
    'receipt-tamper',
    'revoked',
  ])('never passes %s evidence', (kind) => {
    const f = fixture()
    let live = [f.record]
    if (kind === 'missing') live = []
    if (kind === 'newer-queued')
      live.push({
        ...f.record,
        id: randomUUID(),
        state: 'QUEUED',
        receiptHash: null,
        receiptSignature: null,
        requestedAt: new Date(f.now + 1),
      })
    if (kind === 'cancelled') f.record.state = 'CANCELLED'
    if (kind === 'partial') {
      f.value.checks[0].coverage = 'PARTIAL'
      f.record.receiptSignature = f.seal()
      f.record.receiptHash = digest(f.record.receiptSignature)
      f.snapshot.report.checks[0].nativeReceiptHash = f.record.receiptHash
    }
    if (kind === 'expired') {
      f.policy.definition.rules[0].maxAgeHours = 0.00001
      f.value.finishedAt = new Date(f.now - 500).toISOString()
      f.record.receiptSignature = f.seal()
      f.record.receiptHash = digest(f.record.receiptSignature)
      f.snapshot.report.checks[0].nativeReceiptHash = f.record.receiptHash
      f.policy.definitionHash = digest(f.policy.definition)
    }
    if (kind === 'wrong-org') f.record.organizationId = 'other'
    if (kind === 'wrong-repo') f.record.repositoryGithubId = '52'
    if (kind === 'receipt-tamper')
      f.record.receiptSignature = f.record.receiptSignature!.slice(0, -5)
    if (kind === 'revoked')
      vi.mocked(nativeRuntimeApproval).mockReturnValue(null)
    expect(f.evaluate(live).status).toBe('INCOMPLETE')
  })
  it('does not enable a native source the frozen policy did not approve', () => {
    const f = fixture()
    f.policy.definition.rules[0].allowedSources = ['verified_imported_ci']
    f.policy.definitionHash = digest(f.policy.definition)
    expect(f.evaluate().status).toBe('INCOMPLETE')
  })
})

it('verifies a fitted eight-analyzer health receipt without changing failed outcomes or recorded totals',async()=>{
 const f=fixture()
 const ids=['secrets.scan','security.sast','security.dependencies','iac.policy','quality.reliability','quality.maintainability','quality.duplication','security.hotspots'] as const
 vi.stubEnv('NATIVE_TOOL_REVIEWS',JSON.stringify(ids.map(ruleId=>({ruleId,image:'registry.example/scanner@sha256:'+'a'.repeat(64),toolVersion:'1',license:nativeAdapters[ruleId].license,configHash:'b'.repeat(64),reviewDigest:'c'.repeat(64),expiresAt:new Date(f.now+86400000).toISOString(),databaseBuiltAt:ruleId==='security.dependencies'?new Date(f.now-1000).toISOString():null}))))
 const tools=nativeToolReviews(undefined,f.now)!
 f.approval.toolReviewHash=tools.reviewHash
 const built=buildNativePlan({organizationId:'org',repositoryId:'51',sourceSha:f.expected.sourceSha,selectionId:'health:fixture',rules:ids.map(id=>({id,title:id,required:false,capability:'execution'}))},tools)
 const {planHash,...plan}=built
 const expected={...f.expected,selectionId:'health:fixture',planHash,plan,ruleIds:[...ids]}
 const value:NativeReceipt={...f.value,selectionId:expected.selectionId,planHash,toolReviewHash:tools.reviewHash,checks:ids.map(ruleId=>({ruleId,state:'FAIL' as const,reason:'FINDINGS_REPORTED',reportHash:'a'.repeat(64),summary:{runs:1,results:20,suppressed:0},adapterId:nativeAdapters[ruleId].id,image:tools.reviews.find(r=>r.ruleId===ruleId)!.image,toolVersion:'1',configHash:'b'.repeat(64),commandHash:digest(nativeAdapters[ruleId]),exitCode:1,cleanupConfirmed:true,coverage:'PARTIAL' as const,...(['security.sast','quality.reliability','quality.maintainability','security.hotspots'].includes(ruleId)?{fileAnalysis:{version:1 as const,formula:'semgrep-candidate-files-v1' as const,scope:'js-ts-python' as const,candidateFiles:20,analyzedFiles:19,skippedFiles:1,pathsDigest:'e'.repeat(64)}}:{}),...(ruleId==='quality.duplication'?{measurement:{version:1 as const,kind:'duplication' as const,formula:'unique-lines-v1' as const,analyzedLines:100,duplicatedLines:20,analyzedFiles:2,clonePairs:10,minimumLines:5 as const,minimumTokens:50 as const,mode:'weak' as const}}:{}),findings:Array.from({length:20},(_,i)=>({fingerprint:String(i%10).repeat(64),category:ruleId==='quality.reliability'?'reliability':ruleId==='quality.maintainability'?'maintainability':ruleId==='quality.duplication'?'duplication':ruleId==='security.hotspots'?'hotspot':'security',severity:i===0?'critical':'low',title:'x'.repeat(200),path:'src/'+'x'.repeat(450)+'.js',line:i+1,ruleId:'fixture.rule',suppressed:false,...(ruleId==='quality.duplication'?{relatedLocations:[{path:'matching.js',line:4,endLine:12}]}:{})}))}))}
 const {fitHealthReceipt}=await import('../src/health/health-receipt-budget.js')
 const fitted=fitHealthReceipt(value)
 expect(()=>f.seal(value)).toThrow('exceeds bounds')
 const verified=verifyNativeReceipt(f.seal(fitted),expected,f.now)
 expect(verified?.checks).toHaveLength(8)
 expect(verified?.checks.find(check=>check.ruleId==='security.sast')?.fileAnalysis).toMatchObject({candidateFiles:20,analyzedFiles:19,skippedFiles:1})
 expect(verified?.checks.find(check=>check.ruleId==='quality.duplication')?.findings?.[0].relatedLocations).toEqual([{path:'matching.js',line:4,endLine:12}])
 expect(verified?.checks.every(check=>check.state==='FAIL'&&check.summary?.results===20&&check.findings!.length>0&&check.findings!.length<20)).toBe(true)
 const {healthReport}=await import('../src/health/health-report.js')
 expect(healthReport({complete:true,fileCount:10,languages:['JavaScript']},ids.map(id=>({id,title:id,state:'READY',reason:'READY'})),verified!.checks).completeness).toBe('PARTIAL')
})
