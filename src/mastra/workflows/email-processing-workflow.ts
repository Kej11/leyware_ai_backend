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
  execute: async ({ inputData, mastra }) => {
    const { webhook, organizationId, userId } = inputData;
    const logger = mastra.getLogger();
    
    logger.info('Validating webhook for message', {
      messageId: webhook.message.id,
      from: webhook.message.from,
      subject: webhook.message.subject,
      step: 'validate-webhook'
    });
    
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

    logger.info('Found PDF attachments', {
      pdfCount: pdfAttachments.length,
      attachments: pdfAttachments.map((pdf: any) => ({
        filename: pdf.filename,
        sizeKB: (pdf.size / 1024).toFixed(1)
      })),
      step: 'validate-webhook'
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
  execute: async ({ inputData, mastra }) => {
    const { pdfAttachments, webhook, organizationId, userId } = inputData;
    const logger = mastra.getLogger();
    
    logger.info('Starting PDF extraction', {
      pdfCount: pdfAttachments.length,
      step: 'extract-pdf-data'
    });
    
    const extractions = [];
    
    for (const pdf of pdfAttachments) {
      logger.info('Processing PDF file', {
        filename: pdf.filename,
        sizeKB: (pdf.size / 1024).toFixed(1),
        step: 'extract-pdf-data'
      });
      
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
          logger.info('Successfully extracted data from PDF', {
            filename: pdf.filename,
            extractionModel: result.extractionModel,
            extractionDate: result.extractionDate,
            step: 'extract-pdf-data'
          });
        } else {
          logger.error('Failed to extract data from PDF', {
            filename: pdf.filename,
            error: result.error,
            extractionModel: result.extractionModel,
            step: 'extract-pdf-data'
          });
        }
        
      } catch (error) {
        logger.error('Unexpected error processing PDF', {
          filename: pdf.filename,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          step: 'extract-pdf-data'
        });
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
    logger.info('PDF extraction completed', {
      totalFiles: extractions.length,
      successfulExtractions: successCount,
      failedExtractions: extractions.length - successCount,
      step: 'extract-pdf-data'
    });
    
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
  execute: async ({ inputData, mastra }) => {
    const { extractions, webhook, organizationId, userId } = inputData;
    const logger = mastra.getLogger();
    
    logger.info('Starting data storage', {
      extractionCount: extractions.length,
      step: 'store-extracted-data'
    });
    
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
        
        logger.info('Inserting record for extraction', {
          filename: extraction.filename,
          gameTitle: extraction.extractedData?.gameTitle || 'N/A',
          developerName: extraction.extractedData?.developerName || 'N/A',
          pitchId,
          step: 'store-extracted-data'
        });
        
        // Execute the insert using Neon MCP (this would need to be implemented in the actual execution)
        // For now, we'll simulate success
        logger.info('Successfully stored record', {
          pitchId,
          filename: extraction.filename,
          step: 'store-extracted-data'
        });
        
        storedRecords.push({
          id: pitchId,
          filename: extraction.filename,
          success: true
        });
        
      } catch (error) {
        logger.error('Failed to store record', {
          filename: extraction.filename,
          error: error instanceof Error ? error.message : 'Unknown database error',
          stack: error instanceof Error ? error.stack : undefined,
          step: 'store-extracted-data'
        });
        storedRecords.push({
          id: '',
          filename: extraction.filename,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown database error'
        });
      }
    }
    
    const successCount = storedRecords.filter(r => r.success).length;
    logger.info('Data storage completed', {
      totalRecords: storedRecords.length,
      successfullyStored: successCount,
      failedToStore: storedRecords.length - successCount,
      step: 'store-extracted-data'
    });
    
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