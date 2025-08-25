/**
 * Setup script for AgentMail
 * Run this once to create your inbox and register the webhook
 * 
 * Usage: npx tsx src/mastra/setup-agentmail.ts
 */

import { AgentMailClient } from 'agentmail';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function setupAgentMail() {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const username = process.env.INBOX_USERNAME || 'my-agent';
  
  if (!apiKey) {
    console.error('❌ AGENTMAIL_API_KEY not found in .env file');
    console.log('Please sign up at https://agentmail.to and add your API key to .env');
    process.exit(1);
  }
  
  console.log('🚀 Setting up AgentMail...');
  
  const client = new AgentMailClient({
    apiKey: apiKey
  });
  
  try {
    // Create an inbox
    console.log(`📬 Creating inbox: ${username}@agentmail.to...`);
    const inbox = await client.inboxes.create({
      username: username,
      displayName: 'My AI Agent'
    });
    
    console.log('✅ Inbox created successfully!');
    console.log(`📧 Email address: ${inbox.address}`);
    console.log(`📮 Inbox ID: ${inbox.id}`);
    
    // Note: To register a webhook, you'll need a public URL
    // For local development, use ngrok: ngrok http 4111
    console.log('\n📌 Next steps:');
    console.log('1. For local development, expose your webhook using ngrok:');
    console.log('   npx ngrok http 4111');
    console.log('2. Register the webhook URL:');
    console.log('   https://your-ngrok-url.ngrok.io/webhook/email');
    console.log('3. Send a test email to:', inbox.address);
    
    // Example of registering a webhook (uncomment when you have a public URL)
    /*
    const webhookUrl = 'https://your-ngrok-url.ngrok.io/webhook/email';
    const webhook = await client.webhooks.create({
      url: webhookUrl,
      events: ['message.received']
    });
    console.log('✅ Webhook registered:', webhook.id);
    */
    
  } catch (error) {
    console.error('❌ Error setting up AgentMail:', error);
    process.exit(1);
  }
}

// Run the setup
setupAgentMail();