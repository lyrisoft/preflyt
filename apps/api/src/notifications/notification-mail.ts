import { configurationValue } from '../configuration/runtime-configuration.js'
import nodemailer, { type Transporter } from 'nodemailer'
import { createHash } from 'node:crypto'
import { resolveWebOrigin } from '../config/web-origin.js'
import { notificationEmailTemplate, type NotificationEmailKind } from './notification-email-template.js'
export type { NotificationEmailKind } from './notification-email-template.js'
export const emailNotificationsEnabled = () => configurationValue('NOTIFICATION_EMAIL_ENABLED') === 'true'
export function validNotificationEmail(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
}
/** Checks transport prerequisites without making a network request or returning secrets. */
export function emailNotificationsConfigured() {
  try {
    const port = Number(configurationValue('SMTP_PORT') ?? 587)
    const user = configurationValue('SMTP_USER'), password = configurationValue('SMTP_PASSWORD')
    const origin = new URL(resolveWebOrigin())
    return validNotificationEmail(configurationValue('SMTP_FROM')) && !!configurationValue('SMTP_HOST')?.trim() &&
      Number.isInteger(port) && port >= 1 && port <= 65535 &&
      (!user || !!password) && (!password || !!user) && ['http:', 'https:'].includes(origin.protocol) &&
      (process.env.NODE_ENV !== 'production' || origin.protocol === 'https:')
  } catch { return false }
}
export class NotificationMailer {
  private transport?: Transporter
  async send(to: string, deliveryId: string, kind: NotificationEmailKind = 'PERSONAL', eventType?: string) {
    return this.sendMessage(to, deliveryId, notificationEmailTemplate(resolveWebOrigin(), kind, eventType))
  }
  async sendVerification(to: string, deliveryId: string, code: string) {
    if (!/^\d{8}$/.test(code)) throw new Error('INVALID_VERIFICATION_CODE')
    return this.sendMessage(to, deliveryId, {
      subject: 'Verify your Preflyt notification email',
      text: `Your Preflyt verification code is ${code}. It expires 15 minutes after your request. Enter it in your notification settings. If you did not request this, ignore this email.`,
      html: `<p>Your Preflyt verification code is <strong>${code}</strong>.</p><p>It expires 15 minutes after your request. Enter it in your notification settings. If you did not request this, ignore this email.</p>`,
    })
  }
  private async sendMessage(to: string, deliveryId: string, content: ReturnType<typeof notificationEmailTemplate>) {
    const from = configurationValue('SMTP_FROM')
    const host = configurationValue('SMTP_HOST')
    const port = Number(configurationValue('SMTP_PORT') ?? 587)
    if (!validNotificationEmail(to) || !emailNotificationsConfigured())
      throw new Error('SMTP_CONFIGURATION_INVALID')
    const origin = resolveWebOrigin()
    if (process.env.NODE_ENV === 'production' && new URL(origin).protocol !== 'https:') throw new Error('SMTP_CONFIGURATION_INVALID')
    const insecureLocal = process.env.NODE_ENV !== 'production' && process.env.SMTP_ALLOW_INSECURE_LOCAL === 'true' && ['localhost', '127.0.0.1', '::1'].includes(host ?? '')
    if (!this.transport) this.transport = nodemailer.createTransport({
      host, port, secure: port === 465, requireTLS: !insecureLocal && port !== 465,
      ignoreTLS: insecureLocal, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      ...(configurationValue('SMTP_USER') ? { auth: { user: configurationValue('SMTP_USER'), pass: configurationValue('SMTP_PASSWORD') } } : {}),
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    })
    const result = await this.transport.sendMail({ from, to,
      ...content,
      messageId: `<${createHash('sha256').update(deliveryId).digest('hex')}@preflyt.local>`,
    })
    if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP_RECIPIENT_REJECTED')
  }
  close() { this.transport?.close() }
}
