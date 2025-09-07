import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { registerApiRoute } from '@mastra/core/server';
import { scoutSearchWorkflow } from './workflows/scout-search-workflow';
import { emailProcessingWorkflow } from './workflows/email-processing-workflow';
import { manualPDFParseWorkflow } from './workflows/manual-pdf-parse-workflow';
import { searchPlanningAgent } from './agents/search-planning-agent';
import { contentAnalysisAgent } from './agents/content-analysis-agent';
import { scoutWorkflowAgent } from './agents/scout-workflow-agent';
import { emailWebhookAgent } from './agents/email-webhook-agent';

export const mastra = new Mastra({
  workflows: { 
    scoutSearchWorkflow,
    emailProcessingWorkflow,
    manualPDFParseWorkflow
  },
  agents: {
    searchPlanningAgent,
    contentAnalysisAgent,
    scoutWorkflowAgent,
    emailWebhookAgent
  },
  storage: new LibSQLStore({
    url: "file:./mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: process.env.LOG_LEVEL || 'info',
  }),
  server: {
    port: parseInt(process.env.PORT || '8080'),
    apiRoutes: [
      registerApiRoute('/webhook/agentmail', {
        method: 'POST',
        handler: async (c) => {
          try {
            console.log('📨 Received AgentMail webhook');
            
            const mastra = c.get('mastra');
            const body = await c.req.json();
            
            console.log(`🔍 Event: ${body.event}`);
            console.log(`📧 From: ${body.message?.from}`);
            console.log(`📝 Subject: ${body.message?.subject}`);
            
            // Validate webhook signature if AGENTMAIL_WEBHOOK_SECRET is set
            const webhookSecret = process.env.AGENTMAIL_WEBHOOK_SECRET;
            if (webhookSecret) {
              const signature = c.req.header('x-agentmail-signature');
              if (!signature) {
                console.warn('⚠️ Missing webhook signature');
                return c.json({ error: 'Missing webhook signature' }, 401);
              }
              // TODO: Implement signature validation
            }
            
            // Only process message.received events with PDF attachments
            if (body.event !== 'message.received') {
              console.log(`ℹ️ Ignoring event type: ${body.event}`);
              return c.json({ status: 'ignored', reason: 'Unsupported event type' });
            }
            
            const pdfAttachments = body.message?.attachments?.filter(
              (att: any) => att.contentType === 'application/pdf'
            ) || [];
            
            if (pdfAttachments.length === 0) {
              console.log('ℹ️ No PDF attachments found');
              return c.json({ status: 'ignored', reason: 'No PDF attachments' });
            }
            
            console.log(`📎 Found ${pdfAttachments.length} PDF attachment(s)`);
            
            // Trigger the email processing workflow
            const workflowResult = await mastra.executeWorkflow('emailProcessingWorkflow', {
              webhook: body,
              organizationId: 'default-org', // TODO: Map from email or domain
              userId: 'system-user' // TODO: Map from email or create user
            });
            
            console.log('✅ Webhook processing completed');
            
            return c.json({
              status: 'success',
              message: 'Webhook processed successfully',
              workflowId: workflowResult.id,
              pdfsProcessed: pdfAttachments.length
            });
            
          } catch (error) {
            console.error('❌ Webhook processing error:', error);
            
            return c.json({
              status: 'error',
              message: 'Failed to process webhook',
              error: error instanceof Error ? error.message : 'Unknown error'
            }, 500);
          }
        },
      })
    ]
  }
});