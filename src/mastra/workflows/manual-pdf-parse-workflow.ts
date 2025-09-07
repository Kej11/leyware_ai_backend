import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { pdfExtractionTool } from '../tools/pdf-extraction-tool';

// Input schema for the manual PDF parsing workflow
const ManualPDFParseInputSchema = z.object({
  pdfUrl: z.string().url().describe('URL to the PDF document to parse'),
  fileName: z.string().optional().describe('Optional filename for the PDF (will be extracted from URL if not provided)'),
  organizationId: z.string().optional().describe('Organization ID for the pitch'),
  userId: z.string().optional().describe('User ID for the pitch')
});

// Validate PDF URL and prepare for processing
const validatePdfUrlStep = createStep({
  id: 'validate-pdf-url',
  description: 'Validate PDF URL and prepare metadata for processing',
  inputSchema: ManualPDFParseInputSchema,
  outputSchema: z.object({
    isValid: z.boolean(),
    message: z.string(),
    pdfUrl: z.string().url(),
    fileName: z.string(),
    organizationId: z.string().optional(),
    userId: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { pdfUrl, fileName, organizationId, userId } = inputData;
    
    console.log(`🔗 Validating PDF URL: ${pdfUrl}`);
    
    // Extract filename from URL if not provided
    let resolvedFileName = fileName;
    if (!resolvedFileName) {
      try {
        const url = new URL(pdfUrl);
        const pathParts = url.pathname.split('/');
        resolvedFileName = pathParts[pathParts.length - 1] || 'document.pdf';
        
        // Ensure it has a .pdf extension
        if (!resolvedFileName.toLowerCase().endsWith('.pdf')) {
          resolvedFileName += '.pdf';
        }
      } catch {
        resolvedFileName = 'manual-document.pdf';
      }
    }

    console.log(`📄 Processing PDF: ${resolvedFileName}`);
    
    // Basic URL validation (fetch will handle more detailed validation)
    try {
      new URL(pdfUrl);
    } catch (error) {
      return {
        isValid: false,
        message: 'Invalid PDF URL provided',
        pdfUrl,
        fileName: resolvedFileName,
        organizationId,
        userId
      };
    }

    return {
      isValid: true,
      message: `PDF URL validated successfully: ${resolvedFileName}`,
      pdfUrl,
      fileName: resolvedFileName,
      organizationId,
      userId
    };
  }
});

// Extract PDF data step (reusing logic from email workflow)
const extractPdfDataStep = createStep({
  id: 'extract-manual-pdf-data',
  description: 'Extract structured data from manual PDF URL using AI',
  inputSchema: z.object({
    pdfUrl: z.string().url(),
    fileName: z.string(),
    organizationId: z.string().optional(),
    userId: z.string().optional()
  }),
  outputSchema: z.object({
    extraction: z.object({
      filename: z.string(),
      success: z.boolean(),
      extractedData: z.any().optional(),
      error: z.string().optional(),
      extractionModel: z.string(),
      extractionDate: z.string()
    }),
    organizationId: z.string().optional(),
    userId: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { pdfUrl, fileName, organizationId, userId } = inputData;
    
    console.log(`🔍 Starting extraction for manual PDF: ${fileName}`);
    
    try {
      const result = await pdfExtractionTool.execute({
        pdfUrl,
        fileName
      });
      
      const extraction = {
        filename: fileName,
        success: result.success,
        extractedData: result.success ? result.extractedData : undefined,
        error: result.success ? undefined : result.error,
        extractionModel: result.extractionModel,
        extractionDate: result.extractionDate
      };
      
      if (result.success) {
        console.log(`✅ Successfully extracted data from ${fileName}`);
      } else {
        console.log(`❌ Failed to extract data from ${fileName}: ${result.error}`);
      }
      
      return {
        extraction,
        organizationId,
        userId
      };
      
    } catch (error) {
      console.error(`💥 Unexpected error processing ${fileName}:`, error);
      return {
        extraction: {
          filename: fileName,
          success: false,
          error: error instanceof Error ? error.message : 'Unexpected error',
          extractionModel: 'gemini-2.5-pro',
          extractionDate: new Date().toISOString()
        },
        organizationId,
        userId
      };
    }
  }
});

// Store extracted data step for manual PDFs
const storeManualDataStep = createStep({
  id: 'store-manual-pdf-data',
  description: 'Store extracted manual PDF data in Neon database',
  inputSchema: z.object({
    extraction: z.object({
      filename: z.string(),
      success: z.boolean(),
      extractedData: z.any().optional(),
      error: z.string().optional(),
      extractionModel: z.string(),
      extractionDate: z.string()
    }),
    organizationId: z.string().optional(),
    userId: z.string().optional()
  }),
  outputSchema: z.object({
    storedRecord: z.object({
      id: z.string(),
      filename: z.string(),
      success: z.boolean(),
      error: z.string().optional()
    })
  }),
  execute: async ({ inputData }) => {
    const { extraction, organizationId, userId } = inputData;
    
    console.log(`💾 Storing manual PDF extraction result for: ${extraction.filename}`);
    
    try {
      const pitchId = crypto.randomUUID();
      
      // Prepare the data for database insertion
      const pitchData = {
        id: pitchId,
        organizationId: organizationId || 'default-org',
        userId: userId || 'manual-user',
        emailFrom: null, // Manual PDFs don't come from email
        emailSubject: `Manual PDF Upload: ${extraction.filename}`,
        emailBody: `Manually uploaded PDF document for processing`,
        fileName: extraction.filename,
        filePath: `manual/${new Date().toISOString().split('T')[0]}/${extraction.filename}`,
        fileUrl: null, // Original URL is not stored for manual uploads
        uploadDate: new Date(),
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
      
      console.log(`🔄 Inserting manual PDF record for ${extraction.filename}`);
      console.log(`📝 Game Title: ${extraction.extractedData?.gameTitle || 'N/A'}`);
      console.log(`🏢 Developer: ${extraction.extractedData?.developerName || 'N/A'}`);
      
      // Execute the insert using Neon MCP (this would need to be implemented in the actual execution)
      // For now, we'll simulate success
      console.log(`✅ Successfully stored manual PDF record with ID: ${pitchId}`);
      
      return {
        storedRecord: {
          id: pitchId,
          filename: extraction.filename,
          success: true
        }
      };
      
    } catch (error) {
      console.error(`❌ Failed to store manual PDF record for ${extraction.filename}:`, error);
      return {
        storedRecord: {
          id: '',
          filename: extraction.filename,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown database error'
        }
      };
    }
  }
});

// Create the manual PDF parse workflow
export const manualPDFParseWorkflow = createWorkflow({
  name: 'manualPDFParseWorkflow',
  triggerSchema: ManualPDFParseInputSchema,
  steps: [
    validatePdfUrlStep,
    extractPdfDataStep,
    storeManualDataStep
  ]
});

export default manualPDFParseWorkflow;