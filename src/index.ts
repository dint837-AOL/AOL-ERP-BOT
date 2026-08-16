import { OpenClaw, WhatsAppGateway } from './openclaw-mock.js';
import * as dotenv from 'dotenv';
import { logAttendanceTool } from './tools/attendanceTool.js';

dotenv.config();

const whatsapp = new WhatsAppGateway({
  phoneNumberId: process.env.WHATSAPP_PHONE_ID!,
  accessToken: process.env.WHATSAPP_TOKEN!,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN!
});

const app = new OpenClaw({
  databaseUrl: process.env.DATABASE_URL,
  modelProvider: process.env.MODEL_PROVIDER,
  gateways: [whatsapp],
  tools: [logAttendanceTool]
});

app.setSystemPrompt(`
  You are the internal ERP assistant for AlliedOne.
  When a user messages you to check in or check out of the office:
  1. Identify their intent (IN or OUT).
  2. Use the 'log_attendance' tool.
  3. Extract the user's phone number from the message metadata/context.
  4. Confirm to the user that their attendance was recorded.
`);

async function start() {
  await app.start(3000);
}

start().catch(console.error);
