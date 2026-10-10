import { configurationValue } from '../configuration/runtime-configuration.js'
import nodemailer, { type Transporter } from 'nodemailer'
import { createHash } from 'node:crypto'
import { resolveWebOrigin } from '../config/web-origin.js'
export const emailNotificationsEnabled = () => configurationValue('NOTIFICATION_EMAIL_ENABLED') === 'true'
export function validNotificationEmail(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
}
export class NotificationMailer {
  private transport?: Transporter
  async send(to: string, deliveryId: string) {
    const from = configurationValue('SMTP_FROM')
    const host = configurationValue('SMTP_HOST')
    const port = Number(configurationValue('SMTP_PORT') ?? 587)
    if (!validNotificationEmail(to) || !validNotificationEmail(from) || !host || !Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('SMTP_CONFIGURATION_INVALID')
    const origin = resolveWebOrigin()
    if (process.env.NODE_ENV === 'production' && new URL(origin).protocol !== 'https:') throw new Error('SMTP_CONFIGURATION_INVALID')
    const insecureLocal = process.env.NODE_ENV !== 'production' && process.env.SMTP_ALLOW_INSECURE_LOCAL === 'true' && ['localhost', '127.0.0.1', '::1'].includes(host)
    if (!this.transport) this.transport = nodemailer.createTransport({
      host, port, secure: port === 465, requireTLS: !insecureLocal && port !== 465,
      ignoreTLS: insecureLocal, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      ...(configurationValue('SMTP_USER') ? { auth: { user: configurationValue('SMTP_USER'), pass: configurationValue('SMTP_PASSWORD') } } : {}),
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    })
    const result = await this.transport.sendMail({ from, to, subject: 'New Preflyt notification',
      messageId: `<${createHash('sha256').update(deliveryId).digest('hex')}@preflyt.local>`,
      text: `You have a new Preflyt update. Sign in to view details.\n\n${origin}/notifications\n\nManage optional email notifications in your Preflyt inbox.`,
    })
    if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP_RECIPIENT_REJECTED')
  }
  close() { this.transport?.close() }
}
