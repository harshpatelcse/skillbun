import nodemailer from 'nodemailer'

import {
  getPasswordResetFrom,
  getZohoSmtpHost,
  getZohoSmtpPass,
  getZohoSmtpPort,
  getZohoSmtpUser,
} from '@/utils/server/env'
import {
  buildEmail,
  emailText,
  emailButton,
  emailNote,
  emailCredentialStrip,
  escapeHtml as escapeEmailHtml,
} from '@/utils/server/emailTheme'

export function getTransporter() {
  const host = getZohoSmtpHost()
  const port = getZohoSmtpPort()
  const user = getZohoSmtpUser()
  const pass = getZohoSmtpPass()

  if (!user || !pass) {
    throw new Error('Zoho SMTP credentials missing: Please ensure ZOHO_SMTP_USER and ZOHO_SMTP_PASS are configured in environment settings.')
  }

  const smtpPort = Number(port || 465)
  const isSecure = smtpPort === 465

  return nodemailer.createTransport({
    host: host || 'smtppro.zoho.in',
    port: smtpPort,
    secure: isSecure,
    auth: { user, pass },
    pool: false,
    connectionTimeout: 7000,
    greetingTimeout: 7000,
    socketTimeout: 10000,
  })
}

export function escapeHtml(value) {
  return escapeEmailHtml(value)
}

export async function sendSkillBunPasswordResetEmail({ email, resetLink }) {
  const subject = 'Reset your SkillBun password'

  const contentHtml = `
    ${emailText('Click the button below to choose a new password. For your security, this link expires after a short time.')}
    ${emailButton({ href: resetLink, label: 'Reset my password' })}
    ${emailCredentialStrip(
      [['Direct link', resetLink, { href: resetLink }]],
      { title: 'If the button doesn&rsquo;t work' }
    )}
    ${emailNote('Didn&rsquo;t request a password reset? You can safely ignore this email &mdash; your password won&rsquo;t change.')}
  `

  const html = buildEmail({
    title: subject,
    eyebrow: 'Account security',
    docTag: 'Password reset',
    headline: 'Reset your password',
    lede: 'We received a request to reset the password for your SkillBun account.',
    contentHtml,
    isMarketing: false,
    email,
  })

  await getTransporter().sendMail({
    from: getPasswordResetFrom() || 'SkillBun <noreply@skillbun.tech>',
    replyTo: 'harsh@skillbun.tech',
    to: email,
    subject,
    text: [
      'Hi,',
      '',
      'We received a request to reset the password for your SkillBun account.',
      'Use this link to choose a new password:',
      resetLink,
      '',
      'For your security, this link will expire after a short time.',
      "If you didn't request this, you can safely ignore this email — your password won't change.",
      '',
      'SkillBun.tech',
    ].join('\n'),
    html,
  })
}

export async function sendSkillBunSignupCodeEmail({ email, code, expiresInMinutes }) {
  const subject = 'Verify your SkillBun email';
  const html = buildEmail({
    title: subject,
    eyebrow: 'Account security',
    docTag: 'Email verification',
    headline: 'Verify your email',
    lede: 'Enter this code on the SkillBun signup page to verify that this email belongs to you.',
    contentHtml: [
      emailCredentialStrip([['Verification code', code]], { title: 'Your one-time code' }),
      emailText(`This code expires in ${expiresInMinutes} minutes. Only the most recent code works. Never share it with anyone.`),
      emailNote('If you did not request this code, ignore this email. No account will be created and no password will change without verification.'),
    ].join(''),
    isMarketing: false,
    email,
  });
  await getTransporter().sendMail({
    from: 'SkillBun <noreply@skillbun.tech>',
    replyTo: 'harsh@skillbun.tech',
    to: email,
    subject,
    text: `Your SkillBun verification code is ${code}.\n\nEnter it on the signup page within ${expiresInMinutes} minutes. Only the most recent code works. Never share this code.\n\nIf you did not request it, ignore this email. No account will be created and no password will change without verification.`,
    html,
  });
}

/**
 * Sends an email with optional binary attachments, CC, and custom Reply-To via Zoho SMTP.
 * @param {Object} params
 * @param {string} params.to - Primary recipient email
 * @param {string} [params.cc] - Optional CC email address
 * @param {string} [params.replyTo] - Optional Reply-To email address
 * @param {string} params.subject - Email subject line
 * @param {string} [params.html] - HTML formatted body
 * @param {string} [params.text] - Plain text fallback body
 * @param {Array<{ filename: string, content: Buffer|string, contentType?: string }>} [params.attachments] - Array of attachment descriptors
 * @param {string} [params.from] - Optional custom sender header
 * @returns {Promise<import('nodemailer').SentMessageInfo>}
 */
export async function sendMailWithAttachment({
  to,
  cc,
  replyTo,
  subject,
  html,
  text,
  attachments = [],
  from,
}) {
  if (!to) {
    throw new TypeError('sendMailWithAttachment requires a valid "to" recipient email address.')
  }

  const defaultFrom = getPasswordResetFrom() || 'SkillBun <noreply@skillbun.tech>'
  const mailOptions = {
    from: from || defaultFrom,
    to,
    subject,
    text: text || '',
    html: html || '',
    attachments,
    replyTo: replyTo || 'harsh@skillbun.tech',
  }

  if (cc) mailOptions.cc = cc
  if (replyTo) mailOptions.replyTo = replyTo

  const transporter = getTransporter()
  const info = await transporter.sendMail(mailOptions)
  return info
}
