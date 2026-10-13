import { SMTPServer } from 'smtp-server'
import { notificationEmailTemplate } from '../src/notifications/notification-email-template.js'
import { afterEach, expect, it, vi } from 'vitest'
import { NotificationMailer, emailNotificationsConfigured, validNotificationEmail } from '../src/notifications/notification-mail.js'
let server: SMTPServer | undefined, mail: NotificationMailer | undefined
const messages: string[] = []
async function smtp() {
  messages.length = 0
  server = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData(stream, _session, callback) {
    let message = ''; stream.on('data', (chunk) => { message += chunk.toString() }); stream.on('end', () => { messages.push(message); callback() })
  } })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const address = server.server.address() as { port: number }
  vi.stubEnv('SMTP_HOST', '127.0.0.1'); vi.stubEnv('SMTP_PORT', String(address.port)); vi.stubEnv('SMTP_FROM', 'preflyt@example.test')
  vi.stubEnv('SMTP_ALLOW_INSECURE_LOCAL', 'true'); vi.stubEnv('SMTP_USER', ''); vi.stubEnv('SMTP_PASSWORD', '')
  mail = new NotificationMailer(); return mail
}
afterEach(async () => { mail?.close(); if (server) await new Promise<void>((resolve) => server!.close(resolve)); server = undefined; vi.unstubAllEnvs() })
it('validates addresses and rejects header injection', () => {
  expect(validNotificationEmail('owner@example.test')).toBe(true)
  expect(validNotificationEmail('owner@example.test\r\nBcc: other@example.test')).toBe(false)
  expect(validNotificationEmail(null)).toBe(false)
})
it('sends through real local SMTP with a stable message ID and no repository/report details', async () => {
  const sender = await smtp()
  await sender.send('owner@example.test', 'delivery-1')
  await sender.send('owner@example.test', 'delivery-1')
  expect(messages).toHaveLength(2)
  expect(messages[0]).toContain('multipart/alternative')
  expect(messages[0]).toContain('Content-Type: text/html')
  expect(messages[0]).toContain('Content-Type: text/plain')
  expect(messages[0]).toContain('http://localhost:5173/notifications')
  expect(messages[0].match(/Message-ID: (.*)/)?.[1]).toBe(messages[1].match(/Message-ID: (.*)/)?.[1])
  expect(messages[0]).not.toContain('fixture/repo'); expect(messages[0]).not.toContain('a'.repeat(40))
})
it('refuses invalid configuration and requires TLS in production even for loopback', async () => {
  const sender = await smtp()
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('WEB_ORIGIN', 'https://preflyt.example.test')
  await expect(sender.send('owner@example.test', 'delivery-1')).rejects.toThrow()
  expect(messages).toHaveLength(0)
})

it('checks transport readiness without connecting and rejects incomplete credentials or unsafe origin', () => {
  vi.stubEnv('SMTP_HOST', 'smtp.example.test'); vi.stubEnv('SMTP_FROM', 'preflyt@example.test'); vi.stubEnv('SMTP_PORT', '587'); vi.stubEnv('SMTP_USER', ''); vi.stubEnv('SMTP_PASSWORD', '')
  expect(emailNotificationsConfigured()).toBe(true)
  vi.stubEnv('SMTP_USER', 'smtp-user'); expect(emailNotificationsConfigured()).toBe(false)
  vi.stubEnv('SMTP_PASSWORD', 'fixture-password'); expect(emailNotificationsConfigured()).toBe(true)
  vi.stubEnv('SMTP_PORT', '0'); expect(emailNotificationsConfigured()).toBe(false)
  vi.stubEnv('SMTP_PORT', '587'); vi.stubEnv('NODE_ENV', 'production'); expect(emailNotificationsConfigured()).toBe(false)
  vi.stubEnv('WEB_ORIGIN', 'https://preflyt.example.test'); expect(emailNotificationsConfigured()).toBe(true)
  vi.stubEnv('WEB_ORIGIN', 'bad-url'); expect(emailNotificationsConfigured()).toBe(false)
})

it.each(['PERSONAL', 'ORGANIZATION', 'TEST'] as const)('renders a minimal %s email with a plain-text fallback', (kind) => {
  const template = notificationEmailTemplate('https://preflyt.example.test', kind)
  expect(template.html).toContain('max-width:560px')
  expect(template.html).toContain('href="https://preflyt.example.test/notifications"')
  expect(template.html.match(/<a /g)).toHaveLength(1)
  expect(template.text).toContain('https://preflyt.example.test/notifications')
  expect(template.html).not.toMatch(/<script|<img|<form/)
  expect(template.html).toContain(kind === 'TEST' ? 'Your email channel is connected' : 'You have a new update')
  expect(template.text).toContain(kind === 'PERSONAL' ? 'Manage your email preferences' : 'organization admin manages')
})
it('rejects unsafe link schemes and normalizes the notification URL', () => {
  expect(() => notificationEmailTemplate('javascript:alert(1)', 'TEST')).toThrow('SMTP_CONFIGURATION_INVALID')
  expect(notificationEmailTemplate('https://preflyt.example.test:443/path?q=unused', 'TEST').html)
    .toContain('href="https://preflyt.example.test/notifications"')
})
