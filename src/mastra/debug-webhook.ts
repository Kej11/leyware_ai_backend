/**
 * Debug webhook creation with full response
 * Run: npx tsx src/mastra/debug-webhook.ts
 */

import { AgentMailClient } from "agentmail";
import * as dotenv from 'dotenv';

dotenv.config();

async function debugWebhook() {
  const client = new AgentMailClient({ 
    apiKey: process.env.AGENTMAIL_API_KEY! 
  });
  
  console.log('🔍 Debug: Creating webhook with full response...\n');
  
  try {
    // First list existing webhooks
    console.log('1️⃣ Listing existing webhooks...');
    const existing = await client.webhooks.list();
    console.log('Existing webhooks:', JSON.stringify(existing, null, 2));
    
    // Try to create webhook
    console.log('\n2️⃣ Creating new webhook...');
    const webhookData = {
      url: "https://thundering-full-monkey.mastra.cloud/webhooks/email",
      event_types: ["message.received"]
    };
    console.log('Request data:', webhookData);
    
    const response = await client.webhooks.create(webhookData as any);
    console.log('\n3️⃣ Create response:', JSON.stringify(response, null, 2));
    
    // List again to verify
    console.log('\n4️⃣ Listing webhooks after creation...');
    const afterCreate = await client.webhooks.list();
    console.log('Webhooks after creation:', JSON.stringify(afterCreate, null, 2));
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', JSON.stringify(error, null, 2));
    if (error.body) {
      console.error('Error body:', JSON.stringify(error.body, null, 2));
    }
  }
}

debugWebhook();