/**
 * Test AgentMail API and list webhooks
 * Run: npx tsx src/mastra/test-agentmail.ts
 */

import { AgentMailClient } from 'agentmail';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testAgentMail() {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  
  if (!apiKey) {
    console.error('❌ AGENTMAIL_API_KEY not found in .env file');
    process.exit(1);
  }
  
  console.log('🔍 Testing AgentMail API...\n');
  
  const client = new AgentMailClient({ apiKey });
  
  try {
    // List webhooks
    console.log('📡 Checking webhooks...');
    try {
      const webhooks = await client.webhooks.list();
      if (webhooks.data && webhooks.data.length > 0) {
        console.log(`Found ${webhooks.data.length} webhook(s):`);
        webhooks.data.forEach(webhook => {
          console.log(`  - URL: ${webhook.url}`);
          console.log(`    ID: ${webhook.id}`);
          console.log(`    Events: ${webhook.events?.join(', ') || 'All'}`);
        });
      } else {
        console.log('No webhooks registered yet.');
      }
    } catch (error: any) {
      console.log('Could not list webhooks:', error.message);
    }
    
    // List threads (messages)
    console.log('\n📧 Checking for messages...');
    try {
      const threads = await client.threads.list();
      if (threads.data && threads.data.length > 0) {
        console.log(`Found ${threads.data.length} thread(s)`);
        threads.data.slice(0, 3).forEach(thread => {
          console.log(`  - Subject: ${thread.subject}`);
          console.log(`    From: ${thread.from}`);
          console.log(`    Date: ${thread.createdAt}`);
        });
      } else {
        console.log('No messages yet. Send an email to pitch@agentmail.to');
      }
    } catch (error: any) {
      console.log('Could not list threads:', error.message);
    }
    
    console.log('\n✅ pitch@agentmail.to is ready to receive emails!');
    console.log('\n📮 Next Steps:');
    console.log('1. Send a test email to: pitch@agentmail.to');
    console.log('2. For webhook: Start ngrok (npx ngrok http 4111)');
    console.log('3. Register webhook URL with AgentMail');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.statusCode === 401) {
      console.log('⚠️  Check your API key is valid');
    }
  }
}

// Run the test
testAgentMail();