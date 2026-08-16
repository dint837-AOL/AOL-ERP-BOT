import express from 'express';
import next from 'next';
import { fileURLToPath } from 'url';
import path from 'path';
import { OpenClaw, WhatsAppGateway } from './src/openclaw-mock.js';
import * as dotenv from 'dotenv';
import { logAttendanceTool } from './src/tools/attendanceTool.js';

dotenv.config();

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function start() {
  // 1. Prepare Next.js
  await nextApp.prepare();

  // 2. Initialize the OpenClaw / Express App
  const whatsapp = new WhatsAppGateway({
    phoneNumberId: process.env.WHATSAPP_PHONE_ID!,
    accessToken: process.env.WHATSAPP_TOKEN!,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN!
  });

  const bot = new OpenClaw({
    databaseUrl: process.env.DATABASE_URL,
    modelProvider: process.env.MODEL_PROVIDER,
    gateways: [whatsapp],
    tools: [logAttendanceTool]
  });

  bot.setSystemPrompt(`
    You are the internal ERP assistant for AlliedOne.
    When a user messages you to check in or check out of the office:
    1. Identify their intent (IN or OUT).
    2. Use the 'log_attendance' tool.
    3. Extract the user's phone number from the message metadata/context.
    4. Confirm to the user that their attendance was recorded.
  `);

  // Start the bot which initializes the Express app and DB
  await bot.start(3000, false); // Pass false to prevent it from listening yet

  const app = bot.app;

  // Let Next.js handle all other routes (like /, /dashboard, /hr)
  app.use((req, res, next) => {
    console.log('Next.js intercepting:', req.url);
    handle(req, res).catch(next);
  });

  app.listen(3000, () => {
    console.log('============================================================');
    console.log('ALLIEDONE ERP SYSTEM READY (Next.js + Express)');
    console.log('Running on http://localhost:3000');
    console.log('============================================================');
  });
}

start().catch(console.error);
