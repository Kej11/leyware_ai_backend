/**
 * Check AgentMail connection and inbox
 * Run: npx tsx src/mastra/check-inbox.ts
 */

import { AgentMailClient } from 'agentmail';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkConnection() {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const username = process.env.INBOX_USERNAME;
  
  console.log('🔍 AgentMail Configuration:');
  console.log('===========================');
  console.log(`API Key: ${apiKey ? '✅ Found' : '❌ Missing'}`);
  console.log(`Username: ${username || 'Not set'}`);
  console.log(`Expected Email: ${username}@agentmail.to\n`);
  
  if (!apiKey) {
    console.error('❌ Please add AGENTMAIL_API_KEY to your .env file');
    process.exit(1);
  }
  
  const client = new AgentMailClient({ apiKey });
  
  try {
    console.log('📮 Fetching inbox list...');
    const response = await client.inboxes.list();
    
    if (response.data && response.data.length > 0) {
      console.log(`\n📬 Found ${response.data.length} inbox(es):\n`);
      
      response.data.forEach(inbox => {
        const isPitch = inbox.address === 'pitch@agentmail.to';
        console.log(`${isPitch ? '➡️ ' : '  '} ${inbox.address}`);
        if (isPitch) {
          console.log(`     ID: ${inbox.id}`);
          console.log(`     Ready to receive emails!`);
        }
      });
    } else {
      console.log('📭 No inboxes found');
    }
    
    console.log('\n✅ AgentMail connection successful!');
    
  } catch (error: any) {
    console.error('\n❌ Connection failed:', error.message);
    if (error.statusCode === 401) {
      console.log('⚠️  Check your API key is valid');
    }
  }
}

// Run the check
checkConnection();