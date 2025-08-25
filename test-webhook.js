/**
 * Test the email webhook endpoint
 * Run: node test-webhook.js
 */

const testWebhook = async () => {
  console.log('🧪 Testing email webhook...\n');
  
  // Simulate an email webhook payload
  const emailPayload = {
    from: 'user@example.com',
    to: 'pitch@agentmail.to',
    subject: 'Test Email',
    body: 'This is a test email to verify the webhook is working. Can you help me with something?',
    messageId: 'test-123',
    timestamp: new Date().toISOString()
  };
  
  try {
    const response = await fetch('http://localhost:4111/webhook/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload)
    });
    
    const result = await response.json();
    
    console.log('📬 Webhook Response:');
    console.log('Status:', response.status);
    console.log('Body:', result);
    
    if (response.ok) {
      console.log('\n✅ Webhook test successful!');
    } else {
      console.log('\n❌ Webhook test failed');
    }
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
    console.log('\nMake sure the Mastra server is running: pnpm dev');
  }
};

// Run the test
testWebhook();