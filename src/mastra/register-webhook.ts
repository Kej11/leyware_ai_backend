/**
 * Register webhook with AgentMail
 * Run: npx tsx src/mastra/register-webhook.ts
 */

import { AgentMailClient } from 'agentmail';
import * as dotenv from 'dotenv';

dotenv.config();

async function register() {
  const client = new AgentMailClient({
    apiKey: process.env.AGENTMAIL_API_KEY!
  });
  
  console.log('🚀 Registering webhook...');
  console.log('📡 URL: https://73d022e8c7a6.ngrok-free.app/webhooks/email\n');
  
  try {
    const webhook = await client.webhooks.create({
      url: "https://73d022e8c7a6.ngrok-free.app/webhooks/email",
      event_types: ["message.received"]  // Required parameter
    } as any);
    
    console.log('✅ Webhook registered successfully!');
    console.log('   URL:', webhook.url || 'https://73d022e8c7a6.ngrok-free.app/webhooks/email');
    console.log('   ID:', webhook.id || 'Created');
    console.log('\n📧 Send an email to: pitch@agentmail.to');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Details:', error.body);
    }
  }
}

register();