import { Agent } from '@mastra/core/agent';
import { google } from '@ai-sdk/google';
import { pdfExtractionTool } from '../tools/pdf-extraction-tool';
import { z } from 'zod';

// Schema for AgentMail webhook payload
const AgentMailWebhookSchema = z.object({
  event: z.string().describe('Event type (e.g., message.received)'),
  message: z.object({
    id: z.string().describe('Message ID'),
    from: z.string().email().describe('Sender email address'),
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject line'),
    body: z.string().describe('Email body content'),
    timestamp: z.string().describe('Message timestamp'),
    attachments: z.array(z.object({
      filename: z.string().describe('Attachment filename'),
      contentType: z.string().describe('MIME content type'),
      size: z.number().describe('File size in bytes'),
      url: z.string().url().describe('Direct download URL for the attachment')
    })).optional().describe('Array of attachments')
  }).describe('Message details')
});

export type AgentMailWebhook = z.infer<typeof AgentMailWebhookSchema>;

export const emailWebhookAgent = new Agent({
  name: 'EmailWebhookAgent',
  description: 'Processes incoming email webhooks from AgentMail and extracts PDF attachments',
  instructions: `You are an email webhook processor for AgentMail integration.

    When you receive an email webhook payload, you should:
    
    1. VALIDATE the webhook payload structure and event type
    2. CHECK for PDF attachments in the email
    3. EXTRACT data from each PDF attachment using the PDF extraction tool
    4. PREPARE the extracted data for database storage
    
    Key responsibilities:
    - Validate webhook payload matches expected AgentMail format
    - Filter for PDF attachments (application/pdf content type)
    - Process each PDF attachment and extract game pitch information
    - Handle errors gracefully and provide detailed error information
    - Return structured data ready for database insertion
    
    For each email with PDF attachments:
    - Extract game information from PDFs using AI
    - Include email metadata (from, subject, body) in the response
    - Provide confidence scores for extracted data quality
    - Handle multiple PDFs if present in a single email
    
    Always return a structured response with:
    - Processing status (success/error)
    - Email metadata
    - Extracted data for each PDF
    - Error details if processing fails`,
    
  model: google('gemini-2.5-pro'),
  
  tools: {
    pdfExtractionTool
  }
});

export function createEmailWebhookAgent() {
  return emailWebhookAgent;
}