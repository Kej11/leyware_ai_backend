# 🚀 Webhook Ready for Testing!

Your email webhook is now registered and running!

## ✅ Current Setup
- **Webhook URL**: `https://73d022e8c7a6.ngrok-free.app/webhook/email`
- **Email Address**: `pitch@agentmail.to`
- **Server Running**: Port 4114
- **Webhook Status**: ✅ Registered with AgentMail

## 📧 Test Your Email Webhook

### Method 1: Send a Real Email
1. Open your email client
2. Send an email to: **pitch@agentmail.to**
3. Watch your terminal for the webhook log!

### Method 2: Monitor Server Logs
```bash
# Watch the server logs in real-time
tail -f server.log
```

## 🔍 What to Expect

When an email arrives, you'll see something like this in your logs:

```
============================================================
📧 EMAIL WEBHOOK RECEIVED!
============================================================
📮 From: sender@example.com
📬 To: pitch@agentmail.to
📝 Subject: Your email subject
🕐 Time: 2025-08-25T00:00:00.000Z
📄 Body Preview:
   Your email content here...
   
🔍 Full Payload Structure:
{
  // Full JSON payload from AgentMail
}
============================================================
```

## 🛠️ Troubleshooting

If you don't see the webhook:
1. Make sure ngrok is still running at: `https://73d022e8c7a6.ngrok-free.app`
2. Check that the server is running: `ps aux | grep "mastra dev"`
3. Verify webhook registration: `npx tsx src/mastra/test-agentmail.ts`

## 📝 Quick Commands

```bash
# Check if emails have arrived
npx tsx src/mastra/test-agentmail.ts

# Re-register webhook if needed
npx tsx src/mastra/setup-webhook.ts

# Test webhook locally
node test-webhook.js
```

---

**Ready!** Send an email to `pitch@agentmail.to` and watch the magic happen! 🎉