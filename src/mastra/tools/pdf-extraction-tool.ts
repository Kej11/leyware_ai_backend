import { createTool } from '@mastra/core/tools';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

// Schema for extracted game pitch data
const GamePitchSchema = z.object({
  gameTitle: z.string().nullable().describe('The title/name of the game'),
  developerName: z.string().nullable().describe('The development studio/team name'),
  publisherName: z.string().nullable().describe('The publisher name (if different from developer)'),
  gameDescription: z.string().nullable().describe('Game overview/description'),
  genre: z.array(z.string()).nullable().describe('Array of game genres (e.g., ["Action", "RPG", "Indie"])'),
  platforms: z.array(z.string()).nullable().describe('Target platforms (e.g., ["PC", "Steam", "PlayStation"])'),
  targetAudience: z.string().nullable().describe('Player demographic description'),
  uniqueSellingPoints: z.array(z.string()).nullable().describe('Array of key differentiating features'),
  monetizationModel: z.string().nullable().describe('Revenue model (e.g., "Premium", "Free-to-play")'),
  releaseDate: z.string().nullable().describe('Expected release timeline'),
  developmentStage: z.string().nullable().describe('Current stage (e.g., "Alpha", "Beta", "Near Release")'),
  teamSize: z.string().nullable().describe('Development team size description'),
  previousTitles: z.array(z.object({
    title: z.string(),
    role: z.string(),
    year: z.string().nullable()
  })).nullable().describe('Array of team\'s previous games with roles and years'),
  fundingStatus: z.string().nullable().describe('Current funding situation'),
  marketingBudget: z.string().nullable().describe('Marketing plans/budget information'),
  revenueProjections: z.string().nullable().describe('Expected revenue/sales'),
  artStyle: z.string().nullable().describe('Visual style description (e.g., "Pixel Art", "3D Realistic")'),
  likelyTags: z.array(z.string()).nullable().describe('Probable Steam/platform tags'),
  confidence: z.object({
    gameTitle: z.number().min(0).max(1).describe('Confidence score for game title'),
    developerName: z.number().min(0).max(1).describe('Confidence score for developer name'),
    overall: z.number().min(0).max(1).describe('Overall confidence score')
  }).describe('Confidence scores for extracted data')
});

export type GamePitchData = z.infer<typeof GamePitchSchema>;

export const pdfExtractionTool = createTool({
  id: 'extract-pdf-data',
  description: 'Extract structured game pitch data from a PDF attachment URL using AI',
  inputSchema: z.object({
    pdfUrl: z.string().url().describe('URL to download the PDF attachment'),
    fileName: z.string().describe('Name of the PDF file')
  }),
  execute: async ({ pdfUrl, fileName, mastra }) => {
    const logger = mastra.getLogger();
    try {
      logger.info('Starting PDF extraction', { 
        fileName: fileName,
        pdfUrl: pdfUrl
      });

      // Download PDF from URL
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to download PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
      }

      const pdfBuffer = await pdfResponse.arrayBuffer();
      const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
      
      logger.info('PDF downloaded successfully', { 
        fileName: fileName,
        sizeBytes: pdfBuffer.byteLength,
        sizeMB: (pdfBuffer.byteLength / 1024 / 1024).toFixed(2)
      });

      // Use Google Gemini to extract structured data from PDF
      const result = await generateObject({
        model: google('gemini-2.5-pro'),
        messages: [
          {
            role: 'system',
            content: `You are an expert at extracting structured information from game development pitch documents.
            
            Your task is to analyze the provided PDF document and extract key information about the game being pitched.
            
            Focus on:
            - Core game information (title, developer, publisher, description)
            - Classification details (genres, platforms, target audience)
            - Unique value proposition and selling points
            - Business information (monetization, funding, revenue projections)
            - Development details (stage, team size, timeline)
            - Art style and likely platform tags
            - Previous experience of the development team
            
            For each field:
            - Extract only information that is explicitly stated in the document
            - Use null for fields that are not mentioned or unclear
            - Provide confidence scores based on how clearly the information is presented
            - Be conservative with confidence scores - only use high scores (>0.8) for very clear information
            
            Return structured data with appropriate confidence scores for reliability assessment.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Please analyze this game pitch PDF and extract the structured information about the game being pitched.`
              },
              {
                type: 'file',
                data: pdfBase64,
                mimeType: 'application/pdf'
              }
            ]
          }
        ],
        schema: GamePitchSchema,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      logger.info('PDF extraction completed successfully', { 
        fileName: fileName,
        gameTitle: result.object.gameTitle || 'Not found',
        developerName: result.object.developerName || 'Not found',
        overallConfidence: (result.object.confidence.overall * 100).toFixed(1),
        extractedGenres: result.object.genre?.length || 0,
        extractedPlatforms: result.object.platforms?.length || 0,
        extractedUSPs: result.object.uniqueSellingPoints?.length || 0
      });

      return {
        success: true,
        extractedData: result.object,
        fileName,
        extractionModel: 'gemini-2.5-pro',
        extractionDate: new Date().toISOString()
      };

    } catch (error) {
      logger.error('PDF extraction failed', { 
        fileName: fileName,
        pdfUrl: pdfUrl,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during PDF extraction',
        fileName,
        extractionModel: 'gemini-2.5-pro',
        extractionDate: new Date().toISOString()
      };
    }
  }
});