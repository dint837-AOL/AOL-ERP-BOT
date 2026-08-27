/**
 * WhatsApp Notification Service
 * 
 * Generic service to send WhatsApp messages using a 3rd party API (e.g. UltraMsg, Twilio, GreenAPI).
 * To activate, set WHATSAPP_API_URL and WHATSAPP_API_TOKEN in your environment.
 */

export async function sendWhatsAppMessage(phoneNumber: string, message: string): Promise<boolean> {
  const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
  if (!cleanNumber || cleanNumber.length < 10) return false;

  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;

  if (!apiUrl || !apiToken) {
    // Development/Fallback mode: Just log the message to console
    console.log(`\n===========================================`);
    console.log(`📲 [WhatsApp Placeholder] Message to ${cleanNumber}`);
    console.log(`💬 Message: ${message}`);
    console.log(`ℹ️ Configure WHATSAPP_API_URL in .env to send real messages`);
    console.log(`===========================================\n`);
    return true; // Simulate success
  }

  try {
    // Example generic API request (can be adapted for Twilio/UltraMsg easily)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify({
        to: cleanNumber,
        body: message
      })
    });

    if (response.ok) {
      console.log(`[WhatsApp] Successfully sent message to ${cleanNumber}`);
      return true;
    } else {
      console.error(`[WhatsApp] Failed to send to ${cleanNumber}:`, await response.text());
      return false;
    }
  } catch (err: any) {
    console.error(`[WhatsApp] Error sending message:`, err.message);
    return false;
  }
}
