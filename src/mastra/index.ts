import { Mastra } from '@mastra/core/mastra';
import { registerApiRoute } from '@mastra/core/server';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

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
          try {
            const payload = await c.req.json();
            
            // Enhanced logging for webhook testing
            console.log("\n" + "=".repeat(60));
            console.log("📧 EMAIL WEBHOOK RECEIVED!");
            console.log("=".repeat(60));
            console.log("📮 From:", payload.from || payload.sender || "Unknown");
            console.log("📬 To:", payload.to || payload.recipient || "Unknown");
            console.log("📝 Subject:", payload.subject || "No subject");
            console.log("🕐 Time:", new Date().toISOString());
            
            // Log the body content
            if (payload.body || payload.text || payload.html) {
              const body = payload.body || payload.text || payload.html;
              console.log("📄 Body Preview:");
              console.log("   " + body.substring(0, 200).replace(/\n/g, "\n   "));
              if (body.length > 200) {
                console.log("   ... (+" + (body.length - 200) + " more characters)");
              }
            }
            
            // Log full payload for debugging
            console.log("\n🔍 Full Payload Structure:");
            console.log(JSON.stringify(payload, null, 2));
            console.log("=".repeat(60) + "\n");
            
            // Return success response to AgentMail
            return c.json({ 
              status: "received",
              message: "Email webhook processed successfully",
              receivedAt: new Date().toISOString()
            });
          } catch (error) {
            console.error("❌ Webhook error:", error);
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