# Email Webhook Setup

This project includes a basic webhook endpoint for receiving emails via AgentMail.

## Setup Instructions

### 1. Get an AgentMail API Key
Sign up at [https://agentmail.to](https://agentmail.to) to get your API key.

### 2. Configure Environment Variables
Update your `.env` file:
```env
AGENTMAIL_API_KEY=your-actual-api-key
INBOX_USERNAME=my-agent  # Creates my-agent@agentmail.to
```

### 3. Create Your Inbox
Run the setup script to create your email inbox:
```bash
npx tsx src/mastra/setup-agentmail.ts
```

This will create an email address like `my-agent@agentmail.to`.

### 4. Start the Mastra Server
```bash
pnpm dev
```

The webhook will be available at: `http://localhost:4111/webhook/email`

### 5. Expose Your Webhook (for local development)
Since AgentMail needs a public URL, use ngrok to expose your local server:
```bash
npx ngrok http 4111
```

You'll get a URL like: `https://abc123.ngrok.io`

### 6. Register the Webhook
Use the AgentMail API to register your webhook URL:
- Webhook URL: `https://your-ngrok-url.ngrok.io/webhook/email`
- Events: `message.received`

### 7. Test It!
Send an email to your agent's address (e.g., `my-agent@agentmail.to`) and watch the logs in your terminal.

## Webhook Endpoint

The webhook is located at `/webhook/email` and currently:
- Receives POST requests from AgentMail
- Logs incoming email data (from, to, subject, body preview)
- Returns a success response

## What's Next?

The webhook is currently just logging emails. You can extend it to:
- Parse email content and extract intents
- Add an AI agent to process and respond to emails
- Store emails in a database
- Send automatic replies via AgentMail API
- Integrate with other services

## Payload Structure

The webhook receives a JSON payload like:
```json
{
  "from": "sender@example.com",
  "to": "my-agent@agentmail.to",
  "subject": "Email subject",
  "body": "Email body content...",
  // Additional fields from AgentMail
}
```

## Troubleshooting

- **Webhook not receiving emails**: Make sure ngrok is running and the URL is registered
- **API key errors**: Verify your AGENTMAIL_API_KEY in .env
- **Inbox creation fails**: Check if the username is already taken