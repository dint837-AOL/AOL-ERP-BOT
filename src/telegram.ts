/**
 * Official Telegram Bot API Service
 * 
 * To activate, set TELEGRAM_BOT_TOKEN in your environment.
 */

export function getBotToken(): string {
  const rawToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || '';
  let botToken = rawToken.replace(/^["']|["']$/g, '').trim();
  if (botToken.toLowerCase().startsWith('bot') && botToken.length > 3 && !botToken.startsWith('bot:')) {
    const candidate = botToken.substring(3).trim();
    if (/^\d+:/.test(candidate)) {
      botToken = candidate;
    }
  }
  return botToken;
}

export async function getTelegramBotInfo(): Promise<{ success: boolean; bot?: any; error?: string }> {
  const botToken = getBotToken();
  if (!botToken) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN is missing in environment variables.' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await res.json();
    if (data.ok) {
      return { success: true, bot: data.result };
    }
    return { success: false, error: `Telegram returned: ${data.description || 'Unauthorized'}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendTelegramMessage(chatId: string, message: string): Promise<{ success: boolean, error?: string }> {
  const cleanChatId = chatId.trim();
  if (!cleanChatId) return { success: false, error: 'No Chat ID provided' };

  const botToken = getBotToken();

  if (!botToken) {
    console.log(`🚀 [Telegram Placeholder] Message to Chat ID: ${cleanChatId}: ${message}`);
    return { success: false, error: 'TELEGRAM_BOT_TOKEN is missing in environment variables (.env / Render Environment). Please set TELEGRAM_BOT_TOKEN and restart/redeploy.' }; 
  }

  try {
    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: message
      })
    });

    if (response.ok) {
      console.log(`[Telegram] Successfully sent message to ${cleanChatId}`);
      return { success: true };
    } else {
      const errText = await response.text();
      console.error(`[Telegram] Failed to send to ${cleanChatId}:`, errText);
      try {
        const parsed = JSON.parse(errText);
        if (parsed.description) {
          if (parsed.error_code === 403) {
            return {
              success: false,
              error: `Forbidden (403): You must open your bot in Telegram and click "START" (/start) first before it is allowed to message you!`
            };
          }
          if (parsed.error_code === 400 && parsed.description.includes('chat not found')) {
            return {
              success: false,
              error: `Chat Not Found (400): Telegram requires your NUMERIC Chat ID (e.g. 123456789), not your @username or phone number. Get it by messaging @userinfobot.`
            };
          }
          return { success: false, error: `${parsed.description} (${parsed.error_code})` };
        }
      } catch {}
      return { success: false, error: errText };
    }
  } catch (err: any) {
    console.error(`[Telegram] Error sending message:`, err.message);
    return { success: false, error: err.message };
  }
}

