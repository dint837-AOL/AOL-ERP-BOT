/**
 * Official Telegram Bot API Service
 * 
 * To activate, set TELEGRAM_BOT_TOKEN in your environment.
 */

export async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  const cleanChatId = chatId.trim();
  if (!cleanChatId) return false;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    // Development/Fallback mode
    console.log(`\n===========================================`);
    console.log(`🚀 [Telegram Placeholder] Message to Chat ID: ${cleanChatId}`);
    console.log(`💬 Message: ${message}`);
    console.log(`ℹ️ Configure TELEGRAM_BOT_TOKEN to send real messages`);
    console.log(`===========================================\n`);
    return true; 
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
      return true;
    } else {
      console.error(`[Telegram] Failed to send to ${cleanChatId}:`, await response.text());
      return false;
    }
  } catch (err: any) {
    console.error(`[Telegram] Error sending message:`, err.message);
    return false;
  }
}
