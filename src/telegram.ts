/**
 * Official Telegram Bot API Service
 * 
 * To activate, set TELEGRAM_BOT_TOKEN in your environment.
 */

export async function sendTelegramMessage(chatId: string, message: string): Promise<{ success: boolean, error?: string }> {
  const cleanChatId = chatId.trim();
  if (!cleanChatId) return { success: false, error: 'No Chat ID provided' };

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!botToken) {
    console.log(`🚀 [Telegram Placeholder] Message to Chat ID: ${cleanChatId}: ${message}`);
    return { success: false, error: 'TELEGRAM_BOT_TOKEN is missing in Render Environment Variables. Please add it and deploy again.' }; 
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
