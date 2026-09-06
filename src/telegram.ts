/**
 * Official Telegram Bot API Service
 * 
 * To activate, set TELEGRAM_BOT_TOKEN in your environment.
 */

export async function sendTelegramMessage(chatId: string, message: string): Promise<{ success: boolean, error?: string }> {
  const cleanChatId = chatId.trim();
  if (!cleanChatId) return { success: false, error: 'No Chat ID provided' };

  // Read token from TELEGRAM_BOT_TOKEN or TELEGRAM_TOKEN, strip accidental quotes and whitespace
  const rawToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || '';
  const botToken = rawToken.replace(/^["']|["']$/g, '').trim();

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
      return { success: false, error: errText };
    }
  } catch (err: any) {
    console.error(`[Telegram] Error sending message:`, err.message);
    return { success: false, error: err.message };
  }
}
