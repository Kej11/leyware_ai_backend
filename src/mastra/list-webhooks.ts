/**
 * List all registered webhooks
 * Run: npx tsx src/mastra/list-webhooks.ts
 */

import { AgentMailClient } from "agentmail";
import * as dotenv from 'dotenv';

dotenv.config();

async function listWebhooks() {
  const client = new AgentMailClient({ 
    apiKey: process.env.AGENTMAIL_API_KEY! 
  });
  
  console.log('📋 Fetching registered webhooks...\n');
  
  try {
    const response: any = await client.webhooks.list();
    const webhooks = response.webhooks || response.data || [];
    
    if (webhooks && webhooks.length > 0) {
      console.log(`✅ Found ${webhooks.length} webhook(s):\n`);
      
      webhooks.forEach((webhook: any, index: number) => {
        console.log(`Webhook #${index + 1}:`);
        console.log(`  📡 URL: ${webhook.url}`);
        console.log(`  🆔 ID: ${webhook.webhook_id || webhook.id}`);
        console.log(`  📅 Created: ${webhook.created_at || webhook.createdAt || 'Unknown'}`);
        console.log(`  🎯 Events: ${webhook.event_types?.join(', ') || webhook.events?.join(', ') || 'All events'}`);
        console.log(`  ✅ Enabled: ${webhook.enabled}`);
        console.log('');
      });
    } else {
      console.log('❌ No webhooks registered');
      console.log('\nTo register a webhook, run:');
      console.log('  npx tsx src/mastra/register-webhook.ts');
    }
  } catch (error: any) {
    console.error('❌ Error listing webhooks:', error.message);
    if (error.body) {
      console.error('Details:', error.body);
    }
  }
}

listWebhooks();