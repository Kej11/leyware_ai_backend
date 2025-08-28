import { Mastra } from '@mastra/core/mastra';
import { registerApiRoute } from '@mastra/core/server';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

// AgentMail API configuration
const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY || '';
const AGENTMAIL_API_BASE = 'https://api.agentmail.to/v0';

/**
 * Fetch the download URL for an attachment
 */
async function getAttachmentUrl(
  inboxId: string,
  threadId: string,
  attachmentId: string
): Promise<string | null> {
  try {
    const url = `${AGENTMAIL_API_BASE}/inboxes/${encodeURIComponent(inboxId)}/threads/${threadId}/attachments/${attachmentId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AGENTMAIL_API_KEY}`
      },
      redirect: 'manual' // Don't follow the redirect - we just want the URL
    });
    
    if (response.status === 302) {
      // Get the S3 URL from the Location header
      const downloadUrl = response.headers.get('location');
      return downloadUrl;
    } else {
      console.error(`Failed to get attachment URL. Status: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error('Error fetching attachment URL:', error);
    return null;
  }
}

export const mastra = new Mastra({
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    apiRoutes: [
      // Basic email webhook endpoint
      registerApiRoute("/webhooks/email", {
        method: "POST",
        handler: async (c) => {
          const mastra = c.get("mastra");
          const logger = mastra.getLogger();
          
          try {
            const payload = await c.req.json();
            
            // Log webhook received with structured logging
            logger.info("📧 EMAIL WEBHOOK RECEIVED", {
              from: payload.from || payload.sender || "Unknown",
              to: payload.to || payload.recipient || "Unknown",
              subject: payload.subject || "No subject",
              timestamp: new Date().toISOString(),
              bodyLength: payload.body?.length || payload.text?.length || payload.html?.length || 0
            });
            
            // Log body preview for debugging
            if (payload.body || payload.text || payload.html) {
              const body = payload.body || payload.text || payload.html;
              logger.debug("Email body preview", {
                preview: body.substring(0, 200),
                totalLength: body.length
              });
            }
            
            // Log full payload at debug level
            logger.debug("Full webhook payload", { payload });
            
            // Also use console.log for local development visibility
            console.log("\n" + "=".repeat(60));
            console.log("📧 EMAIL WEBHOOK RECEIVED!");
            console.log("📮 From:", payload.from || payload.sender || "Unknown");
            console.log("📝 Subject:", payload.subject || "No subject");
            console.log("=".repeat(60) + "\n");
            
            // Return success response to AgentMail
            return c.json({ 
              status: "received",
              message: "Email webhook processed successfully",
              receivedAt: new Date().toISOString()
            });
          } catch (error) {
            logger.error("❌ Webhook error", { 
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            });
            
            return c.json({ 
              status: "error",
              message: "Failed to process webhook"
            }, 500);
          }
        },
      }),
    ],
  },
});