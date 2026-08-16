import { BirdClient } from "@messagebird/sdk";

// Use the exact API Key you put in your .env or openclaw-mock.ts
const bird = new BirdClient({ apiKey: "bk_us1_FQ5jORJeB0W1MKpXUGBhm292XmDbD" });

async function sendInitialMessage() {
  try {
    const msg = await bird.whatsapp.send({
      to: "+8801736635727", // <--- CHANGE THIS TO YOUR ACTUAL WHATSAPP NUMBER (with country code, e.g. +1234567890)
      template: {
        slug: "bird_delivery_update",
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", name: "ref", text: "A1B2C3D4" },
              { type: "text", name: "date", text: "16 Aug 2026" }
            ]
          }
        ]
      }
    });

    console.log("Template sent successfully!");
    console.log("Message ID:", msg.id, "Status:", msg.status);
    console.log("NOW check your phone, and reply to this message. That reply should trigger the webhook!");
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

sendInitialMessage();
