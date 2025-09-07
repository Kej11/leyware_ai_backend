import { mastra } from './src/mastra/index.js';
import { emailProcessingWorkflow } from './src/mastra/workflows/email-processing-workflow.js';

// Mock webhook payload from AgentMail
const mockWebhookPayload = {
  event: 'message.received',
  message: {
    id: 'msg-test-12345',
    from: 'game-dev@example.com',
    to: 'pitches@yourcompany.com',
    subject: 'Game Pitch: Epic Adventure Quest',
    body: 'Hi there! Please find attached our game pitch for Epic Adventure Quest. We would love to discuss this opportunity with you.',
    timestamp: new Date().toISOString(),
    attachments: [
      {
        filename: 'epic-adventure-quest-pitch.pdf',
        contentType: 'application/pdf',
        size: 1024000, // 1MB
        url: 'https://example.com/download/pitch.pdf' // This would be a real URL in production
      },
      {
        filename: 'team-photo.jpg',
        contentType: 'image/jpeg',
        size: 500000,
        url: 'https://example.com/download/team.jpg'
      }
    ]
  }
};

async function testWebhookIntegration() {
  console.log('🧪 Testing AgentMail Webhook Integration');
  console.log('=======================================');
  
  try {
    console.log('📨 Mock webhook payload:');
    console.log(`  Event: ${mockWebhookPayload.event}`);
    console.log(`  From: ${mockWebhookPayload.message.from}`);
    console.log(`  Subject: ${mockWebhookPayload.message.subject}`);
    console.log(`  Attachments: ${mockWebhookPayload.message.attachments.length}`);
    console.log(`  PDF Attachments: ${mockWebhookPayload.message.attachments.filter(a => a.contentType === 'application/pdf').length}`);
    
    console.log('\n🔄 Executing email processing workflow...\n');
    
    // Test the workflow directly
    const workflowResult = await mastra.executeWorkflow('emailProcessingWorkflow', {
      webhook: mockWebhookPayload,
      organizationId: 'test-org-123',
      userId: 'test-user-456'
    });
    
    console.log('\n✅ Workflow execution completed!');
    console.log('Results:', JSON.stringify(workflowResult, null, 2));
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

async function testPdfExtractionTool() {
  console.log('\n🔍 Testing PDF Extraction Tool');
  console.log('==============================');
  
  try {
    const { pdfExtractionTool } = await import('./src/mastra/tools/pdf-extraction-tool.js');
    
    // Note: This would fail with a real URL since we don't have a real PDF
    // But it tests the tool structure and error handling
    console.log('📄 Testing with mock PDF URL...');
    
    const result = await pdfExtractionTool.execute({
      pdfUrl: 'https://httpbin.org/status/404', // This will fail, testing error handling
      fileName: 'test-pitch.pdf'
    });
    
    console.log('📊 Extraction result:', result);
    
  } catch (error) {
    console.log('⚠️ Expected error (mock URL):', error);
  }
}

async function testWebhookValidation() {
  console.log('\n✅ Testing Webhook Validation');
  console.log('=============================');
  
  // Test with invalid event type
  const invalidEventPayload = {
    ...mockWebhookPayload,
    event: 'message.sent'
  };
  
  console.log('🚫 Testing invalid event type...');
  
  try {
    const result = await mastra.executeWorkflow('emailProcessingWorkflow', {
      webhook: invalidEventPayload,
      organizationId: 'test-org',
      userId: 'test-user'
    });
    
    console.log('Result for invalid event:', result);
  } catch (error) {
    console.log('Expected validation error:', error);
  }
  
  // Test with no PDF attachments
  const noPdfPayload = {
    ...mockWebhookPayload,
    message: {
      ...mockWebhookPayload.message,
      attachments: mockWebhookPayload.message.attachments.filter(a => a.contentType !== 'application/pdf')
    }
  };
  
  console.log('\n📎 Testing email with no PDF attachments...');
  
  try {
    const result = await mastra.executeWorkflow('emailProcessingWorkflow', {
      webhook: noPdfPayload,
      organizationId: 'test-org',
      userId: 'test-user'
    });
    
    console.log('Result for no PDF attachments:', result);
  } catch (error) {
    console.log('Expected validation error:', error);
  }
}

async function runAllTests() {
  console.log('🚀 Starting AgentMail Integration Tests\n');
  
  // Test workflow execution
  await testWebhookIntegration();
  
  // Test PDF extraction tool
  await testPdfExtractionTool();
  
  // Test validation logic
  await testWebhookValidation();
  
  console.log('\n🎉 All tests completed!');
  console.log('\n📋 Next Steps:');
  console.log('1. Set up AgentMail account and get API keys');
  console.log('2. Configure webhook URL to point to /webhook/agentmail');
  console.log('3. Test with real PDF attachments');
  console.log('4. Set up organization and user mapping logic');
  console.log('5. Implement database operations using Neon MCP');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { 
  testWebhookIntegration, 
  testPdfExtractionTool, 
  testWebhookValidation,
  mockWebhookPayload 
};