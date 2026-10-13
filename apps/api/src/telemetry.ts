import { context, propagation, trace, metrics, SpanStatusCode, type Attributes } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor, type SpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader, type PushMetricExporter, type ResourceMetrics } from '@opentelemetry/sdk-metrics'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { OTLPTraceExporter as HttpTrace } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter as HttpMetric } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPLogExporter as HttpLog } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPTraceExporter as GrpcTrace } from '@opentelemetry/exporter-trace-otlp-grpc'
import { OTLPMetricExporter as GrpcMetric } from '@opentelemetry/exporter-metrics-otlp-grpc'
import { OTLPLogExporter as GrpcLog } from '@opentelemetry/exporter-logs-otlp-grpc'

// Positive allowlist: do not export query strings, headers, SQL, error text or bodies.
const allowed = new Set(['http.request.method', 'http.method', 'http.response.status_code', 'http.status_code',
  'db.system', 'db.system.name', 'db.operation.name', 'preflyt.component', 'preflyt.outcome', 'delivery.id'])
const safe = (attributes: Attributes) => Object.fromEntries(Object.entries(attributes).filter(([key]) => allowed.has(key)).map(([key, value]) => {
  if (key === 'http.method' || key === 'http.request.method') value = ['GET', 'POST', 'PATCH', 'OPTIONS', 'PUT', 'DELETE', 'HEAD'].includes(String(value)) ? value : 'OTHER'
  if (key === 'db.operation.name') value = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'BEGIN', 'COMMIT', 'ROLLBACK'].includes(String(value)) ? value : 'OTHER'
  return [key, value]
}))
let lastExportWarning = 0
function exportResult<T extends { code: number }>(callback: (result: T) => void) {
  return (result: T) => {
    if (result.code !== 0 && Date.now() - lastExportWarning > 5000) {
      lastExportWarning = Date.now()
      console.warn('OpenTelemetry export unavailable; core services continue')
    }
    callback(result)
  }
}
let sdk: NodeSDK | undefined
let shutdown: Promise<void> | undefined

class SafeMetricExporter implements PushMetricExporter {
  constructor(private readonly exporter: PushMetricExporter) {}
  export(data: ResourceMetrics, callback: Parameters<PushMetricExporter['export']>[1]) {
    this.exporter.export({ ...data, scopeMetrics: data.scopeMetrics.map(scope => ({ ...scope,
      metrics: scope.metrics.map(metric => ({ ...metric, dataPoints: metric.dataPoints.map(point => ({ ...point, attributes: safe(point.attributes) })) }))
    })) } as ResourceMetrics, exportResult(callback))
  }
  selectAggregationTemporality(type: Parameters<NonNullable<PushMetricExporter['selectAggregationTemporality']>>[0]) {
    return this.exporter.selectAggregationTemporality?.(type) ?? 1
  }
  forceFlush() { return this.exporter.forceFlush() }
  shutdown() { return this.exporter.shutdown() }
}

class SafeTraceExporter implements SpanExporter {
  constructor(private readonly exporter: SpanExporter) {}
  export(spans: ReadableSpan[], callback: Parameters<SpanExporter['export']>[1]) {
    this.exporter.export(spans.map(span => {
      // Proxy retains SDK methods without copying private implementation fields.
      return new Proxy(span, { get(target, key) {
        if (key === 'attributes') return safe(target.attributes)
        if (key === 'events' || key === 'links') return []
        if (key === 'status') return { code: target.status.code }
        if (key === 'name') return target.name.startsWith('preflyt.') ? target.name : 'integration.request'
        const value = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      } })
    }), exportResult(callback))
  }
  shutdown() { return this.exporter.shutdown() }
}

try {
  if (process.env.OTEL_SDK_DISABLED === 'false') {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    const protocol = process.env.OTEL_EXPORTER_OTLP_PROTOCOL ?? 'http/protobuf'
    if (!endpoint || !['http/protobuf', 'grpc'].includes(protocol)) throw new Error('Telemetry configuration is incomplete')
    new URL(endpoint)
    const enabled = (signal: string) => (process.env[`OTEL_${signal}_EXPORTER`] ?? 'otlp') !== 'none'
    const grpc = protocol === 'grpc'
    const timeoutMillis = Math.min(Number(process.env.OTEL_EXPORTER_OTLP_TIMEOUT) || 3000, 10_000)
    const resourceAttributes: Record<string, string> = {}
    for (const item of (process.env.OTEL_RESOURCE_ATTRIBUTES ?? '').split(',')) {
      const index = item.indexOf('=')
      if (index > 0) resourceAttributes[item.slice(0, index)] = decodeURIComponent(item.slice(index + 1))
    }
    const exporter = grpc ? new GrpcTrace({ timeoutMillis }) : new HttpTrace({ timeoutMillis })
    sdk = new NodeSDK({
      autoDetectResources: false,
      resource: defaultResource().merge(resourceFromAttributes(resourceAttributes)),
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'preflyt-api',
      spanProcessors: enabled('TRACES') ? [new BatchSpanProcessor({ exporter: new SafeTraceExporter(exporter), exportTimeoutMillis: timeoutMillis })] : [],
      metricReaders: enabled('METRICS') ? [new PeriodicExportingMetricReader({
        exporter: new SafeMetricExporter(grpc ? new GrpcMetric({ timeoutMillis }) : new HttpMetric({ timeoutMillis })),
        exportIntervalMillis: Math.max(Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || 60_000, 1000),
        exportTimeoutMillis: Math.min(timeoutMillis, Math.max(Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || 60_000, 1000)),
      })] : [],
      logRecordProcessors: enabled('LOGS') ? [new BatchLogRecordProcessor({ exporter: grpc ? new GrpcLog({ timeoutMillis }) : new HttpLog({ timeoutMillis }), exportTimeoutMillis: timeoutMillis })] : [],
      instrumentations: [
        new HttpInstrumentation({ ignoreIncomingRequestHook: request => (request.url ?? '').startsWith('/health/'), disableIncomingRequestInstrumentation: false }),
        new UndiciInstrumentation(),
        new PgInstrumentation({ enhancedDatabaseReporting: false }),
      ],
    })
    sdk.start()
  }
} catch {
  sdk = undefined
  console.warn('OpenTelemetry unavailable; core services continue without telemetry')
}
const meter = metrics.getMeter('preflyt')
const requests = meter.createCounter('preflyt.http.requests')
const duration = meter.createHistogram('preflyt.http.duration', { unit: 'ms' })
const operations = meter.createCounter('preflyt.operations')

export function telemetryLog(event: string, attributes: Attributes = {}) {
  // Only fixed Preflyt event names; never mirror arbitrary application error/console text.
  if (sdk && /^preflyt\.[a-z.]+$/.test(event)) logs.getLogger('preflyt').emit({ body: event, severityNumber: 9, severityText: 'INFO', attributes: safe(attributes) })
}
export function recordRequest(method: string, status: number, elapsed: number) {
  const attributes = { 'http.request.method': ['GET', 'POST', 'PATCH', 'OPTIONS'].includes(method) ? method : 'OTHER', 'http.response.status_code': status }
  requests.add(1, attributes)
  duration.record(elapsed, attributes)
  telemetryLog('preflyt.http.completed', attributes)
}
export function currentTraceParent() {
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  return carrier.traceparent ?? null
}
export async function telemetryOperation<T>(name: string, attributes: Attributes, action: () => Promise<T>, parent?: string | null): Promise<T> {
  const parentContext = parent ? propagation.extract(context.active(), { traceparent: parent }) : context.active()
  return trace.getTracer('preflyt').startActiveSpan(name, { attributes: safe(attributes) }, parentContext, async span => {
    try {
      const result = await action()
      operations.add(1, { 'preflyt.component': name, 'preflyt.outcome': 'success' })
      telemetryLog('preflyt.operation.completed', { 'preflyt.component': name, 'preflyt.outcome': 'success' })
      return result
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR })
      operations.add(1, { 'preflyt.component': name, 'preflyt.outcome': 'failure' })
      throw error
    } finally { span.end() }
  })
}
export function shutdownTelemetry() {
  return shutdown ??= (sdk?.shutdown().catch(() => { console.warn('OpenTelemetry shutdown failed') }) ?? Promise.resolve())
}
