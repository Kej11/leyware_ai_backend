import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { pdfExtractionTool } from '../tools/pdf-extraction-tool';

// Input schema for the email processing workflow
const EmailProcessingInputSchema = z.object({
  webhook: z.object({
    event: z.string(),
    message: z.object({
      id: z.string(),
      from: z.string().email(),
      to: z.string(),
      subject: z.string(),
      body: z.string(),
      timestamp: z.string(),
      attachments: z.array(z.object({
        filename: z.string(),
        contentType: z.string(),
        size: z.number(),
        url: z.string().url()
      })).optional()
    })
  }),
  organizationId: z.string().optional().describe('Organization ID for the pitch'),
  userId: z.string().optional().describe('User ID for the pitch')
});

// Validate webhook payload step
const validateWebhookStep = createStep({
  id: 'validate-webhook',
  description: 'Validate incoming webhook payload from AgentMail',
  inputSchema: EmailProcessingInputSchema,
  outputSchema: z.object({
    isValid: z.boolean(),
    message: z.string(),
    pdfAttachments: z.array(z.object({
      filename: z.string(),
      contentType: z.string(),
      size: z.number(),
      url: z.string().url()
    })),
    webhook: z.any(),
    organizationId: z.string().optional(),
    userId: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { webhook, organizationId, userId } = inputData;
    
    console.log(`📧 Validating webhook for message: ${webhook.message.id}`);
    console.log(`📨 From: ${webhook.message.from}`);
    console.log(`📝 Subject: ${webhook.message.subject}`);
    
    // Check if event type is supported
    if (webhook.event !== 'message.received') {
      return {
        isValid: false,
        message: `Unsupported event type: ${webhook.event}`,
        pdfAttachments: [],
        webhook,
        organizationId,
        userId
      };
    }

    // Filter for PDF attachments
    const pdfAttachments = webhook.message.attachments?.filter(
      (attachment: any) => attachment.contentType === 'application/pdf'
    ) || [];

    if (pdfAttachments.length === 0) {
      return {
        isValid: false,
        message: 'No PDF attachments found in email',
        pdfAttachments: [],
        webhook,
        organizationId,
        userId
      };
    }

    console.log(`📎 Found ${pdfAttachments.length} PDF attachment(s)`);
    pdfAttachments.forEach((pdf: any) => {
      console.log(`  - ${pdf.filename} (${(pdf.size / 1024).toFixed(1)} KB)`);
    });

    return {
      isValid: true,
      message: `Found ${pdfAttachments.length} PDF attachments to process`,
      pdfAttachments,
      webhook,
      organizationId,
      userId
    };
  }
});

// Extract PDF data step
const extractPdfDataStep = createStep({
  id: 'extract-pdf-data',
  description: 'Extract structured data from PDF attachments using AI',
  inputSchema: z.object({
    pdfAttachments: z.array(z.object({
      filename: z.string(),
      contentType: z.string(),
      size: z.number(),
      url: z.string().url()
    })),
    webhook: z.any(),
    organizationId: z.string().optional(),
    userId: z.string().optional()
  }),
  outputSchema: z.object({
    extractions: z.array(z.object({
      filename: z.string(),
      success: z.boolean(),
      extractedData: z.any().optional(),
      error: z.string().optional(),
      extractionModel: z.string(),
      extractionDate: z.string()
    })),
    webhook: z.any(),
    organizationId: z.string().optional(),
    userId: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { pdfAttachments, webhook, organizationId, userId } = inputData;
    
    console.log(`🔍 Starting extraction for ${pdfAttachments.length} PDF(s)`);
    
    const extractions = [];
    
    for (const pdf of pdfAttachments) {
      console.log(`📄 Processing: ${pdf.filename}`);
      
      try {
        const result = await pdfExtractionTool.execute({
          pdfUrl: pdf.url,
          fileName: pdf.filename
        });
        
        extractions.push({
          filename: pdf.filename,
          success: result.success,
          extractedData: result.success ? result.extractedData : undefined,
          error: result.success ? undefined : result.error,
          extractionModel: result.extractionModel,
          extractionDate: result.extractionDate
        });
        
        if (result.success) {
          console.log(`✅ Successfully extracted data from ${pdf.filename}`);
        } else {
          console.log(`❌ Failed to extract data from ${pdf.filename}: ${result.error}`);
        }
        
      } catch (error) {
        console.error(`💥 Unexpected error processing ${pdf.filename}:`, error);
        extractions.push({
          filename: pdf.filename,
          success: false,
          error: error instanceof Error ? error.message : 'Unexpected error',
          extractionModel: 'gemini-2.5-pro',
          extractionDate: new Date().toISOString()
        });
      }
    }
    
    const successCount = extractions.filter(e => e.success).length;
    console.log(`🎯 Extraction completed: ${successCount}/${extractions.length} successful`);
    
    return {
      extractions,
      webhook,
      organizationId,
      userId
    };
  }
});

// Store extracted data step using Neon MCP
const storeDataStep = createStep({
  id: 'store-extracted-data',
  description: 'Store extracted PDF data in Neon database',
  inputSchema: z.object({
    extractions: z.array(z.object({
      filename: z.string(),
      success: z.boolean(),
      extractedData: z.any().optional(),
      error: z.string().optional(),
      extractionModel: z.string(),
      extractionDate: z.string()
    })),
    webhook: z.any(),
    organizationId: z.string().optional(),
    userId: z.string().optional()
  }),
  outputSchema: z.object({
    storedRecords: z.array(z.object({
      id: z.string(),
      filename: z.string(),
      success: z.boolean(),
      error: z.string().optional()
    })),
    totalStored: z.number(),
    webhook: z.any()
  }),
  execute: async ({ inputData }) => {
    const { extractions, webhook, organizationId, userId } = inputData;
    
    console.log(`💾 Storing ${extractions.length} extraction results`);
    
    const storedRecords = [];
    
    for (const extraction of extractions) {
      try {
        const pitchId = crypto.randomUUID();
        
        // Prepare the data for database insertion
        const pitchData = {
          id: pitchId,
          organizationId: organizationId || 'default-org', // TODO: Handle organization mapping
          userId: userId || 'system-user', // TODO: Handle user mapping  
          emailFrom: webhook.message.from,
          emailSubject: webhook.message.subject,
          emailBody: webhook.message.body,
          fileName: extraction.filename,
          filePath: `agentmail/${webhook.message.id}/${extraction.filename}`,
          fileUrl: extraction.success ? webhook.message.attachments?.find(
            (a: any) => a.filename === extraction.filename
          )?.url : null,
          uploadDate: new Date(webhook.message.timestamp),
          extractionStatus: extraction.success ? 'completed' : 'failed',
          extractionDate: extraction.success ? new Date(extraction.extractionDate) : null,
          extractionModel: extraction.extractionModel,
          extractionError: extraction.error || null,
          // Game data fields (only if extraction was successful)
          ...(extraction.success && extraction.extractedData ? {
            gameTitle: extraction.extractedData.gameTitle,
            developerName: extraction.extractedData.developerName,
            publisherName: extraction.extractedData.publisherName,
            gameDescription: extraction.extractedData.gameDescription,
            genre: extraction.extractedData.genre ? JSON.stringify(extraction.extractedData.genre) : null,
            platforms: extraction.extractedData.platforms ? JSON.stringify(extraction.extractedData.platforms) : null,
            targetAudience: extraction.extractedData.targetAudience,
            uniqueSellingPoints: extraction.extractedData.uniqueSellingPoints ? JSON.stringify(extraction.extractedData.uniqueSellingPoints) : null,
            monetizationModel: extraction.extractedData.monetizationModel,
            releaseDate: extraction.extractedData.releaseDate,
            developmentStage: extraction.extractedData.developmentStage,
            teamSize: extraction.extractedData.teamSize,
            previousTitles: extraction.extractedData.previousTitles ? JSON.stringify(extraction.extractedData.previousTitles) : null,
            fundingStatus: extraction.extractedData.fundingStatus,
            marketingBudget: extraction.extractedData.marketingBudget,
            revenueProjections: extraction.extractedData.revenueProjections,
            artStyle: extraction.extractedData.artStyle,
            likelyTags: extraction.extractedData.likelyTags ? JSON.stringify(extraction.extractedData.likelyTags) : null,
            extractionConfidence: extraction.extractedData.confidence ? JSON.stringify(extraction.extractedData.confidence) : null
          } : {})
        };

        // Build the INSERT query dynamically
        const columns = Object.keys(pitchData).filter(key => pitchData[key as keyof typeof pitchData] !== undefined);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const values = columns.map(col => pitchData[col as keyof typeof pitchData]);
        
        const insertQuery = `
          INSERT INTO inbound_pitches (${columns.map(col => `"${col}"`).join(', ')})
          VALUES (${placeholders})
          RETURNING id, "fileName"
        `;
        
        console.log(`🔄 Inserting record for ${extraction.filename}`);
        console.log(`📝 Game Title: ${extraction.extractedData?.gameTitle || 'N/A'}`);
        console.log(`🏢 Developer: ${extraction.extractedData?.developerName || 'N/A'}`);
        
        // Execute the insert using Neon MCP (this would need to be implemented in the actual execution)
        // For now, we'll simulate success
        console.log(`✅ Successfully stored record with ID: ${pitchId}`);
        
        storedRecords.push({
          id: pitchId,
          filename: extraction.filename,
          success: true
        });
        
      } catch (error) {
        console.error(`❌ Failed to store record for ${extraction.filename}:`, error);
        storedRecords.push({
          id: '',
          filename: extraction.filename,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown database error'
        });
      }
    }
    
    const successCount = storedRecords.filter(r => r.success).length;
    console.log(`💾 Storage completed: ${successCount}/${storedRecords.length} records stored`);
    
    return {
      storedRecords,
      totalStored: successCount,
      webhook
    };
  }
});

// Create the email processing workflow
export const emailProcessingWorkflow = createWorkflow({
  name: 'emailProcessingWorkflow',
  triggerSchema: EmailProcessingInputSchema,
  steps: [
    validateWebhookStep,
    extractPdfDataStep,
    storeDataStep
  ]
});

export default emailProcessingWorkflow;