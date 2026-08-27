/**
 * Official Meta WhatsApp Business Cloud API Service
 * 
 * To activate, set META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID in your environment.
 */

export async function sendWhatsAppMessage(phoneNumber: string, message: string): Promise<boolean> {
  const cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
  if (!cleanNumber || cleanNumber.length < 10) return false;

  const apiToken = process.env.META_WHATSAPP_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;

  if (!apiToken || !phoneId) {
    // Development/Fallback mode
    console.log(`\n===========================================`);
    console.log(`📲 [Official WhatsApp Placeholder] Message to ${cleanNumber}`);
    console.log(`💬 Message: ${message}`);
    console.log(`ℹ️ Configure META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID to send real messages`);
    console.log(`===========================================\n`);
    return true; 
  }

  try {
    const apiUrl = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
    
    // NOTE: Sending free-form text only works if the user has messaged the bot in the last 24 hours.
    // For unsolicited ERP alerts, you must create a Template in Meta Dashboard and use "type": "template".
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      })
    });

    if (response.ok) {
      console.log(`[WhatsApp] Successfully sent Meta message to ${cleanNumber}`);
      return true;
    } else {
      console.error(`[WhatsApp] Failed to send via Meta to ${cleanNumber}:`, await response.text());
      return false;
    }
  } catch (err: any) {
    console.error(`[WhatsApp] Error sending Meta message:`, err.message);
    return false;
  }
}
