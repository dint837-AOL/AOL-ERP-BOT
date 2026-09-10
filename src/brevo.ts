/**
 * Brevo (Sendinblue) Transactional Email Service
 * 
 * - Uses native fetch to call Brevo v3 SMTP API (zero external npm dependencies)
 * - Sends AOL_ERP branded emails from dint837@gmail.com
 * - Recipient routing for Ahsan Kabir, Orko, and Tajimur Rafi + dynamic members
 * - Manages reminder scheduling for 24 hours & 15 hours prior to events
 */

import { dbRun, dbAll, dbGet } from './db.js';

export const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
export const DEFAULT_SENDER_EMAIL = 'dint837@gmail.com';
export const DEFAULT_SENDER_NAME = 'AOL_ERP';

// Predefined notification email mapping as requested by user
export const NOTIFICATION_EMAIL_MAP: Record<string, string> = {
  'ahsan': 'ahsankabir13@gmail.com',
  'kabir': 'ahsankabir13@gmail.com',
  'ahsankabir': 'ahsankabir13@gmail.com',
  'admin': 'ahsankabir13@gmail.com',
  'orko': 'orko552@gmail.com',
  'tajimur': 'tajimurrafi@gmail.com',
  'rafi': 'tajimurrafi@gmail.com',
  'tajimurrafi': 'tajimurrafi@gmail.com'
};

export const ADMIN_NOTIFICATION_EMAIL = 'ahsankabir13@gmail.com';

/**
 * Resolves notification email addresses for a member
 */
export async function resolveMemberNotificationEmails(memberIdOrName?: number | string | null): Promise<string[]> {
  const emails = new Set<string>();
  
  // Always include Admin notification email
  emails.add(ADMIN_NOTIFICATION_EMAIL);

  if (!memberIdOrName) return Array.from(emails);

  try {
    let member: any = null;
    if (typeof memberIdOrName === 'number' || /^\d+$/.test(String(memberIdOrName))) {
      member = await dbGet('SELECT * FROM members WHERE id = ?', [Number(memberIdOrName)]);
    } else {
      member = await dbGet('SELECT * FROM members WHERE LOWER(name) LIKE ?', [`%${String(memberIdOrName).toLowerCase()}%`]);
    }

    if (member) {
      if (member.notify_email && member.notify_email.includes('@')) {
        emails.add(member.notify_email.trim());
      }
      const lowerName = (member.name || '').toLowerCase();
      for (const [key, email] of Object.entries(NOTIFICATION_EMAIL_MAP)) {
        if (lowerName.includes(key)) {
          emails.add(email);
        }
      }
      if (member.email && member.email.includes('@') && !member.email.endsWith('@alliedone.com')) {
        emails.add(member.email.trim());
      }
    } else if (typeof memberIdOrName === 'string') {
      const lower = memberIdOrName.toLowerCase();
      for (const [key, email] of Object.entries(NOTIFICATION_EMAIL_MAP)) {
        if (lower.includes(key)) {
          emails.add(email);
        }
      }
    }
  } catch (err) {
    console.error('[Brevo] Error resolving member emails:', err);
  }

  return Array.from(emails);
}

/**
 * Send an email via Brevo REST API
 */
export async function sendBrevoEmail(params: {
  to: string | string[];
  subject: string;
  htmlContent: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY || '';
  const senderEmail = process.env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL;
  const senderName = DEFAULT_SENDER_NAME;

  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  const validRecipients = recipients.filter(e => e && e.includes('@'));

  if (validRecipients.length === 0) {
    console.warn('[Brevo] No valid recipient emails provided. Aborting email send.');
    return { success: false, error: 'No valid recipients' };
  }

  if (!apiKey) {
    console.warn(`[Brevo] BREVO_API_KEY not set in environment. Simulated email to [${validRecipients.join(', ')}] with subject "${params.subject}"`);
    return { success: true, messageId: 'simulated-no-api-key' };
  }

  try {
    const payload = {
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: validRecipients.map(email => ({ email })),
      subject: params.subject,
      htmlContent: params.htmlContent
    };

    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      console.log(`[Brevo] Email successfully sent to [${validRecipients.join(', ')}]. Message ID: ${data.messageId || 'ok'}`);
      return { success: true, messageId: data.messageId };
    } else {
      const errText = await res.text();
      console.error(`[Brevo] API Error (${res.status}): ${errText}`);
      return { success: false, error: errText };
    }
  } catch (err: any) {
    console.error('[Brevo] Network error sending email:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate standard AOL_ERP email template
 */
export function buildAolErpHtml(title: string, rows: Array<{ label: string; value: string }>, notice?: string): string {
  const rowHtml = rows.map((r, i) => `
    <tr style="background-color: ${i % 2 === 0 ? '#1b2030' : '#141824'};">
      <td style="padding: 12px 16px; color: #94a3b8; font-weight: 600; font-size: 14px; width: 140px; border-bottom: 1px solid #2a3050;">
        ${r.label}:
      </td>
      <td style="padding: 12px 16px; color: #f1f5f9; font-weight: 700; font-size: 15px; border-bottom: 1px solid #2a3050;">
        ${r.value}
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 24px; background-color: #0b0e14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #131722; border: 1px solid #2a3050; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f7eff 0%, #6c4fe3 100%); padding: 20px 24px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: 1px;">
                AOL_ERP
              </h1>
              <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 13px; font-weight: 500;">
                ${title}
              </p>
            </td>
          </tr>

          <!-- Content Table -->
          <tr>
            <td style="padding: 20px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #2a3050;">
                <tbody>
                  ${rowHtml}
                </tbody>
              </table>

              ${notice ? `
                <div style="margin-top: 18px; padding: 12px 16px; background-color: rgba(79, 126, 255, 0.12); border-left: 4px solid #4f7eff; border-radius: 4px; color: #cbd5e1; font-size: 13px; line-height: 1.5;">
                  🔔 <strong>Notice:</strong> ${notice}
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 20px; background-color: #0d1017; border-top: 1px solid #2a3050; text-align: center; color: #64748b; font-size: 12px;">
              AlliedOne ERP Notification System • Sent via Brevo Transactional Service
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

/**
 * Schedule 24-hour and 15-hour reminder email jobs for an entity
 */
export async function schedule24And15HourReminders(params: {
  entityType: 'leave' | 'meeting' | 'tender' | 'credential' | 'task';
  entityId: number;
  targetDateTime: string | Date;
  recipientEmails: string[];
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  const target = new Date(params.targetDateTime);
  if (isNaN(target.getTime())) {
    console.warn(`[Brevo] Invalid target date for reminder: ${params.targetDateTime}`);
    return;
  }

  const now = Date.now();
  const targetMs = target.getTime();

  // 24 hours prior
  const time24h = new Date(targetMs - 24 * 60 * 60 * 1000);
  // 15 hours prior
  const time15h = new Date(targetMs - 15 * 60 * 60 * 1000);

  // Clear any existing pending jobs for this entity
  try {
    await dbRun('DELETE FROM email_jobs WHERE entity_type = ? AND entity_id = ? AND status = ?', [params.entityType, params.entityId, 'PENDING']);
  } catch (err) {
    console.error('[Brevo] Error clearing previous jobs:', err);
  }

  for (const email of params.recipientEmails) {
    // 24h job
    const html24 = buildAolErpHtml(
      `${params.title} (24-Hour Reminder)`,
      params.rows,
      'This is an automated 24-hour reminder before the scheduled start or deadline.'
    );
    const sendAt24 = time24h.getTime() <= now ? new Date(now + 10000) : time24h;

    await dbRun(`
      INSERT INTO email_jobs (entity_type, entity_id, job_type, scheduled_at, recipient_email, subject, html_content, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `, [
      params.entityType,
      params.entityId,
      '24h',
      sendAt24.toISOString(),
      email,
      `AOL_ERP: 24h Reminder - ${params.title}`,
      html24
    ]);

    // 15h job
    const html15 = buildAolErpHtml(
      `${params.title} (15-Hour Reminder)`,
      params.rows,
      'This is an automated 15-hour reminder before the scheduled start or deadline.'
    );
    const sendAt15 = time15h.getTime() <= now ? new Date(now + 20000) : time15h;

    // Only schedule 15h if it is after the 24h job
    if (sendAt15.getTime() > sendAt24.getTime() || time15h.getTime() > now) {
      await dbRun(`
        INSERT INTO email_jobs (entity_type, entity_id, job_type, scheduled_at, recipient_email, subject, html_content, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `, [
        params.entityType,
        params.entityId,
        '15h',
        sendAt15.toISOString(),
        email,
        `AOL_ERP: 15h Reminder - ${params.title}`,
        html15
      ]);
    }
  }

  console.log(`[Brevo] Scheduled 24h & 15h reminders for ${params.entityType} #${params.entityId} to [${params.recipientEmails.join(', ')}]`);
}

/**
 * Schedule 3-day and 1-day reminder email jobs specifically for Tenders
 */
export async function scheduleTender3And1DayReminders(params: {
  entityId: number;
  closingDateTime: string | Date;
  recipientEmails: string[];
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  const target = new Date(params.closingDateTime);
  if (isNaN(target.getTime())) {
    console.warn(`[Brevo] Invalid closing date for tender reminder: ${params.closingDateTime}`);
    return;
  }

  const now = Date.now();
  const targetMs = target.getTime();

  // 3 days prior
  const time3d = new Date(targetMs - 3 * 24 * 60 * 60 * 1000);
  // 1 day prior
  const time1d = new Date(targetMs - 1 * 24 * 60 * 60 * 1000);

  // Clear any existing pending jobs for this tender
  try {
    await dbRun('DELETE FROM email_jobs WHERE entity_type = ? AND entity_id = ? AND status = ?', ['tender', params.entityId, 'PENDING']);
  } catch (err) {
    console.error('[Brevo] Error clearing previous tender jobs:', err);
  }

  for (const email of params.recipientEmails) {
    // 3-day job
    const html3d = buildAolErpHtml(
      `Tender Closing Reminder: ${params.title} (3 Days Left)`,
      params.rows,
      'This is an automated 3-day reminder before the tender closing deadline.'
    );
    const sendAt3d = time3d.getTime() <= now ? new Date(now + 10000) : time3d;

    await dbRun(`
      INSERT INTO email_jobs (entity_type, entity_id, job_type, scheduled_at, recipient_email, subject, html_content, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `, [
      'tender',
      params.entityId,
      '3d',
      sendAt3d.toISOString(),
      email,
      `AOL_ERP: 3-Day Reminder - Tender Closing: ${params.title}`,
      html3d
    ]);

    // 1-day job
    const html1d = buildAolErpHtml(
      `Tender Closing Final Reminder: ${params.title} (1 Day Left)`,
      params.rows,
      'This is an urgent 1-day final reminder before the tender closing deadline.'
    );
    const sendAt1d = time1d.getTime() <= now ? new Date(now + 20000) : time1d;

    if (sendAt1d.getTime() > sendAt3d.getTime() || time1d.getTime() > now) {
      await dbRun(`
        INSERT INTO email_jobs (entity_type, entity_id, job_type, scheduled_at, recipient_email, subject, html_content, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `, [
        'tender',
        params.entityId,
        '1d',
        sendAt1d.toISOString(),
        email,
        `AOL_ERP: 1-Day Final Reminder - Tender Closing: ${params.title}`,
        html1d
      ]);
    }
  }

  console.log(`[Brevo] Scheduled 3-day & 1-day reminders for tender #${params.entityId} to [${params.recipientEmails.join(', ')}]`);
}

/**
 * Process due email jobs from the database (Called in openclaw-mock cron loop)
 */
export async function processDueEmailJobs() {
  try {
    const nowIso = new Date().toISOString();
    const jobs = await dbAll(
      `SELECT * FROM email_jobs WHERE status = 'PENDING' AND scheduled_at <= ? LIMIT 20`,
      [nowIso]
    ) as any[];

    for (const job of jobs) {
      console.log(`[Brevo Job] Processing job #${job.id} (${job.job_type}) for ${job.recipient_email}...`);
      const res = await sendBrevoEmail({
        to: job.recipient_email,
        subject: job.subject,
        htmlContent: job.html_content
      });

      if (res.success) {
        await dbRun(`UPDATE email_jobs SET status = 'SENT' WHERE id = ?`, [job.id]);
      } else {
        await dbRun(`UPDATE email_jobs SET status = 'FAILED' WHERE id = ?`, [job.id]);
      }
    }
  } catch (err) {
    console.error('[Brevo] Error in processDueEmailJobs:', err);
  }
}
