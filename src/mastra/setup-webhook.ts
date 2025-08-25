/**
 * Register webhook with AgentMail
 * Run: npx tsx src/mastra/setup-webhook.ts
 */

import { AgentMailClient } from 'agentmail';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Your ngrok URL
const WEBHOOK_URL = 'https://73d022e8c7a6.ngrok-free.app/webhook/email';

async function setupWebhook() {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  
  if (!apiKey) {
    console.error('❌ AGENTMAIL_API_KEY not found in .env file');
    process.exit(1);
  }
  
  console.log('🪝 Setting up webhook...\n');
  console.log(`📡 Webhook URL: ${WEBHOOK_URL}\n`);
  
  const client = new AgentMailClient({ apiKey });
  
  try {
    // First, list existing webhooks
    console.log('📋 Checking existing webhooks...');
    const existingWebhooks = await client.webhooks.list();
    
    if (existingWebhooks.data && existingWebhooks.data.length > 0) {
      console.log(`Found ${existingWebhooks.data.length} existing webhook(s):`);
      
      // Delete old webhooks if they exist
      for (const webhook of existingWebhooks.data) {
        console.log(`  - Deleting old webhook: ${webhook.url}`);
        await client.webhooks.delete(webhook.id);
      }
      console.log('✅ Old webhooks removed\n');
    }
    
    // Register new webhook
    console.log('📝 Registering new webhook...');
    const webhook = await client.webhooks.create({
      url: WEBHOOK_URL,
      event_types: ['message.received'] // Trigger on new emails
    } as any);
    
    console.log('✅ Webhook registered successfully!');
    console.log(`   ID: ${webhook.id}`);
    console.log(`   URL: ${webhook.url}`);
    console.log(`   Events: ${webhook.events?.join(', ')}`);
    
    console.log('\n🎯 Ready to test!');
    console.log('================================');
    console.log('1. Make sure your Mastra server is running: pnpm dev');
    console.log('2. Make sure ngrok is running: https://73d022e8c7a6.ngrok-free.app');
    console.log('3. Send an email to: pitch@agentmail.to');
    console.log('4. Watch your terminal for the webhook log!');
    console.log('================================\n');
    
  } catch (error: any) {
    console.error('❌ Error setting up webhook:', error.message);
    if (error.body) {
      console.error('Details:', error.body);
    }
  }
}

// Run the setup
setupWebhook();