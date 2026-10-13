import { FindingsService } from './findings/findings.service.js'
import { FindingAiGuidanceService } from './findings/finding-ai-guidance.service.js'
import { FindingSourceStore } from './findings/finding-source-store.service.js'
import { RepositoryHealthService } from './health/repository-health.service.js'
import { watchConfiguration } from './configuration/configuration-store.js'
import { TeamsService } from './teams/teams.service.js'
import { SkillReviewService } from './intelligence/skill-review.service.js'
import { AiConfigurationService } from './intelligence/ai-configuration.service.js'
import { NativeDispatchService } from './execution/native-dispatch.service.js'
import { NativeResultService } from './execution/native-result.service.js'
import { NativeStatusService } from './execution/native-status.service.js'
import { RulesetDeploymentService } from './github/ruleset-deployment.service.js'
import { RulesetHistoryService } from './github/ruleset-history.service.js'
import { PolicyExceptionService } from './assessments/policy-exception.service.js'
import { ReadinessAutomationService } from './assessments/readiness-automation.service.js'
import { PipelineProcessingService } from './assessments/pipeline-processing.service.js'
import { AssessmentService } from './assessments/assessment.service.js'
import { CheckPublicationService } from './assessments/check-publication.service.js'
import { AuthorizationService } from './auth/authorization.service.js'
import { GitHubIdentityProvider } from './auth/github-identity-provider.js'
import { GitHubUserAccessService } from './auth/github-user-access.service.js'
import { NotificationMailer, emailNotificationsEnabled } from './notifications/notification-mail.js'
import { deliverNotificationChannelEmail } from './notifications/notification-channel-delivery.js'
import { deliverNotificationEmail } from './notifications/notification-email-delivery.js'
import { dispatchNotifications, dispatchNotificationEmails, dispatchNotificationChannelEmails, recordDeliveryFailure } from './notifications/notification-queue.js'
import { deliverNotification } from './notifications/notification-delivery.js'
import { notificationsEnabled } from './notifications/notification-event.js'
import { GitHubPrSyncService } from './github/github-pr-sync.service.js'
import {
  telemetryLog,
  telemetryOperation,
  shutdownTelemetry,
} from './telemetry.js'
import 'reflect-metadata'
import { writeFile, unlink } from 'node:fs/promises'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { RedisCacheService } from './cache/redis-cache.service.js'
import { GitHubProviderService } from './github/github-provider.service.js'
import { GitHubSyncService } from './github/github-sync.service.js'
import { PrismaService } from './prisma/prisma.service.js'
import { GitHubEventProcessor } from './github-events/github-event-processor.js'
import {
  GitHubEventDispatcher,
  queueConfig,
  queueName,
} from './github-events/github-event-queue.js'

async function start() {
  if (!process.env.QUEUE_REDIS_URL)
    throw new Error('Configure QUEUE_REDIS_URL before starting the worker')
  const prefix = process.env.QUEUE_PREFIX ?? 'preflyt:queue'
  const producerConfig = queueConfig(process.env.QUEUE_REDIS_URL, prefix)
  const consumerConfig = queueConfig(process.env.QUEUE_REDIS_URL, prefix, true)
  const prisma = new PrismaService()
  await prisma.waitUntilWritable()
  const stopConfiguration = watchConfiguration(prisma)
  const producer = new Redis(producerConfig.connection)
  const consumer = new Redis(consumerConfig.connection)
  const queue = new Queue(queueName, {
    ...producerConfig,
    connection: producer,
  })
  const cache = new RedisCacheService()
  const githubProvider = new GitHubProviderService(cache, prisma)
  const sync = new GitHubSyncService(prisma, githubProvider)
  const prSync = new GitHubPrSyncService(prisma, githubProvider)
  const rulesetHistory = new RulesetHistoryService(prisma, githubProvider)
  let historyRun: Promise<void> | undefined
  let identityRun: Promise<void> | undefined
  let teamRun: Promise<void> | undefined
  const processor = new GitHubEventProcessor(prisma)
  const dispatcher = new GitHubEventDispatcher(prisma, queue)
  const worker = new Worker(
    queueName,
    async (job) => {
      if (
        typeof job.data?.deliveryId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(job.data.deliveryId)
      )
        throw new Error('Invalid delivery job')
      if (job.data.lifecycle) {
        const access = await prisma.gitHubAccessDelivery.findUnique({
          where: { id: job.data.deliveryId },
        })
        if (!access || access.state !== 'RECEIVED') return
        await sync.sync(access.installationId)
        await prisma.gitHubAccessDelivery.updateMany({
          where: { id: access.id, state: 'RECEIVED' },
          data: { state: 'PROCESSED', processedAt: new Date() },
        })
        return
      }
      const delivery = await prisma.gitHubWebhookDelivery.findUnique({
        where: { id: job.data.deliveryId },
        select: { traceParent: true },
      })
      return telemetryOperation(
        'preflyt.github.event.process',
        { 'delivery.id': job.data.deliveryId },
        () => processor.process(job.data.deliveryId),
        delivery?.traceParent,
      )
    },
    {
      ...consumerConfig,
      connection: consumer,
      concurrency: 4,
    },
  )
  const notificationQueue = new Queue('notifications', {
    ...producerConfig, connection: producer,
  })
  const notificationWorker = new Worker('notifications', async (job) => {
    if (typeof job.data?.eventId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(job.data.eventId))
      throw new Error('Invalid notification job')
    return telemetryOperation('preflyt.notification.deliver', { 'notification.event.id': job.data.eventId }, async () => {
      try { await deliverNotification(prisma, job.data.eventId) }
      catch (error) {
        await recordDeliveryFailure(prisma, job.data.eventId)
        throw error
      }
    })
  }, { ...consumerConfig, connection: consumer, concurrency: 2, autorun: notificationsEnabled() })
  const mail = new NotificationMailer()
  const userAccess = new GitHubUserAccessService(prisma, new GitHubIdentityProvider(githubProvider, cache), cache)
  const emailAuthorization = new AuthorizationService(prisma, userAccess)
  const teams = new TeamsService(prisma, emailAuthorization, githubProvider)
  const emailQueue = new Queue('notification-email', { ...producerConfig, connection: producer })
  const emailWorker = new Worker('notification-email', async (job) => {
    if (typeof job.data?.deliveryId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(job.data.deliveryId)) throw new Error('Invalid email delivery job')
    if (job.data.channel !== undefined && job.data.channel !== true) throw new Error('Invalid notification email job')
    if (!notificationsEnabled() || !emailNotificationsEnabled()) return
    await telemetryOperation('preflyt.notification.email', { 'notification.delivery.id': job.data.deliveryId }, () => job.data.channel === true
      ? deliverNotificationChannelEmail(prisma, emailAuthorization, mail, job.data.deliveryId)
      : deliverNotificationEmail(prisma, emailAuthorization, mail, job.data.deliveryId))
  }, { ...consumerConfig, connection: consumer, concurrency: 2, autorun: notificationsEnabled() && emailNotificationsEnabled() })
  const findingSources = new FindingSourceStore(prisma, githubProvider)
  let sourceRun: Promise<void> | undefined
  const assessments = new AssessmentService(prisma)
  const aiReviews = new SkillReviewService(prisma, emailAuthorization, assessments, new AiConfigurationService(prisma, emailAuthorization), githubProvider)
  let aiReviewRun: Promise<void> | undefined
  const native = new NativeDispatchService(prisma, emailAuthorization, githubProvider, new NativeStatusService(emailAuthorization), new NativeResultService(prisma, emailAuthorization, assessments))
  const health = new RepositoryHealthService(prisma, emailAuthorization, githubProvider, new NativeStatusService(emailAuthorization), findingSources)
  const findingAi = new FindingAiGuidanceService(prisma, emailAuthorization, new FindingsService(prisma, emailAuthorization, findingSources), health, findingSources, new AiConfigurationService(prisma, emailAuthorization))
  let findingAiRun: Promise<void> | undefined
  const healthQueue = new Queue('repository-health', { ...producerConfig, connection: producer })
  const healthWorker = new Worker('repository-health', async job => {
    if (typeof job.data?.id !== 'string' || !/^[a-f0-9-]{36}$/.test(job.data.id)) throw new Error('Invalid health job')
    await telemetryOperation('preflyt.repository.health', { 'health.assessment.id': job.data.id }, () => health.process(job.data.id))
  }, { ...consumerConfig, connection: consumer, concurrency: 2 })
  let healthRun: Promise<void> | undefined
  let nativeRun: Promise<void> | undefined
  const exceptions = new PolicyExceptionService(prisma, emailAuthorization)
  const checks = new CheckPublicationService(prisma, emailAuthorization, githubProvider, assessments, exceptions)
  const deployments = new RulesetDeploymentService(prisma, emailAuthorization, githubProvider, checks)
  let driftRun: Promise<void> | undefined
  const automation = new ReadinessAutomationService(prisma, emailAuthorization, githubProvider, assessments, checks, exceptions)
  let automationRun: Promise<void> | undefined
  const pipeline = new PipelineProcessingService(prisma, emailAuthorization, githubProvider, assessments,
    submissionId => aiReviews.dispatchVerifiedPipeline(submissionId))
  let pipelineRun: Promise<void> | undefined
  let lastWarning = 0
  const warn = () => {
    if (Date.now() - lastWarning > 5000) {
      console.warn(
        'Event worker unavailable; accepted events remain in PostgreSQL',
      )
      telemetryLog('preflyt.worker.unavailable')
      lastWarning = Date.now()
    }
  }
  producer.on('error', warn)
  consumer.on('error', warn)
  queue.on('error', warn)
  worker.on('error', warn)
  notificationQueue.on('error', warn)
  notificationWorker.on('error', warn)
  healthQueue.on('error', warn)
  healthWorker.on('error', warn)
  emailQueue.on('error', warn)
  emailWorker.on('error', warn)
  worker.on('failed', (job) => {
    if (job && job.attemptsMade >= 5) {
      const args = {
        where: { id: job.data.deliveryId, state: 'RECEIVED' as const },
        data: { state: 'FAILED' as const, processedAt: new Date() },
      }
      void (
        job.data.lifecycle
          ? prisma.gitHubAccessDelivery.updateMany(args)
          : prisma.gitHubWebhookDelivery.updateMany(args)
      ).catch(warn)
    }
  })
  let closing = false
  let reconciling = false
  let syncRun: Promise<void> | undefined
  const heartbeat =
    process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/preflyt-github-worker-heartbeat'
  const reconcile = async () => {
    if (closing || reconciling) return
    reconciling = true
    try {
      await dispatcher.reconcile()
      // Configuration switches apply to consumers already running, too.
      for (const [worker, enabled] of [
        [notificationWorker, notificationsEnabled()],
        [emailWorker, notificationsEnabled() && emailNotificationsEnabled()],
      ] as const) {
        if (enabled) {
          if (!worker.isRunning()) void worker.run().catch(warn)
          else if (worker.isPaused()) await worker.resume()
        } else if (worker.isRunning() && !worker.isPaused()) await worker.pause(true)
      }
      if (notificationsEnabled()) {
        await dispatchNotifications(prisma, notificationQueue)
        if (emailNotificationsEnabled()) {
          await dispatchNotificationEmails(prisma, emailQueue)
          await dispatchNotificationChannelEmails(prisma, emailQueue)
        }
      }
      if (!syncRun) {
        syncRun = sync
          .reconcile()
          .then(() => prSync.reconcile())
          .catch(warn)
          .finally(() => {
            syncRun = undefined
          })
      }
      if (!teamRun) teamRun = teams.reconcile().catch(warn).finally(() => { teamRun = undefined })
      if (!identityRun) identityRun = userAccess.reconcile().catch(warn).finally(() => { identityRun = undefined })
      if (!aiReviewRun) aiReviewRun = aiReviews.reconcile().catch(warn).finally(() => { aiReviewRun = undefined })
      if (!findingAiRun) findingAiRun = findingAi.reconcile().catch(warn).finally(() => { findingAiRun = undefined })
      if (!sourceRun) sourceRun = findingSources.reconcile().catch(warn).finally(() => { sourceRun = undefined })
      if (!healthRun) healthRun = health.pending().then(async rows => { for (const row of rows) await healthQueue.add('assess', { id: row.id }, { jobId: row.id, removeOnComplete: true, removeOnFail: true, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }) }).catch(warn).finally(() => { healthRun = undefined })
      if (!nativeRun) nativeRun = native.reconcile().catch(warn).finally(() => { nativeRun = undefined })
      if (!pipelineRun) pipelineRun = pipeline.reconcile().catch(warn).finally(() => { pipelineRun = undefined })
      if (!automationRun) automationRun = automation.reconcile().catch(warn).finally(() => { automationRun = undefined })
      if (!historyRun) historyRun = rulesetHistory.reconcile().catch(warn).finally(() => { historyRun = undefined })
      if (!driftRun) driftRun = deployments.reconcile().catch(warn).finally(() => { driftRun = undefined })
      // Test Redis even when the inbox is empty; readiness is not a stale process flag.
      await queue.getJobCounts('wait')
      if (!closing)
        await writeFile(heartbeat, String(Date.now()), { mode: 0o600 })
    } catch {
      warn()
    } finally {
      reconciling = false
    }
  }
  const timer = setInterval(() => void reconcile(), 5000)
  await unlink(heartbeat).catch(() => undefined)
  void reconcile()
  async function stop() {
    if (closing) return
    closing = true
    clearInterval(timer)
    aiReviews.close()
    findingAi.close()
    native.close()
    sync.close()
    prSync.close()
    rulesetHistory.close()
    deployments.close()
    githubProvider.close()
    const force = consumer.status !== 'ready'
    if (force) {
      producer.disconnect()
      consumer.disconnect()
    }
    await healthWorker.close(force)
    await healthQueue.close()
    await healthRun
    await emailWorker.close(force)
    await emailQueue.close()
    mail.close()
    await notificationWorker.close(force)
    await notificationQueue.close()
    await worker.close(force)
    await queue.close()
    producer.disconnect()
    consumer.disconnect()
    await findingAiRun
    await sourceRun
    await teamRun
    await identityRun
    await aiReviewRun
    await nativeRun
    await syncRun
    await pipelineRun
    await automationRun
    await historyRun
    await driftRun
    cache.onModuleDestroy()
    stopConfiguration()
    await prisma.$disconnect()
    await unlink(heartbeat).catch(() => undefined)
    await shutdownTelemetry()
    // The dedicated worker owns this process; cleanup is complete even if Redis retry timers remain.
    process.exit(0)
  }
  process.once('SIGTERM', () => void stop())
  process.once('SIGINT', () => void stop())
  console.info('GitHub event worker started')
  telemetryLog('preflyt.worker.started')
}
void start().catch(() => {
  console.error(
    'GitHub event worker startup failed; check database and queue configuration',
  )
  process.exit(1)
})
