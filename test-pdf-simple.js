import { readFileSync } from 'fs';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import path from 'path';

// Schema for extracted game pitch data (same as in our tool)
const GamePitchSchema = z.object({
  gameTitle: z.string().nullable().describe('The title/name of the game'),
  developerName: z.string().nullable().describe('The development studio/team name'),
  publisherName: z.string().nullable().describe('The publisher name (if different from developer)'),
  gameDescription: z.string().nullable().describe('Game overview/description'),
  genre: z.array(z.string()).nullable().describe('Array of game genres'),
  platforms: z.array(z.string()).nullable().describe('Target platforms'),
  targetAudience: z.string().nullable().describe('Player demographic description'),
  uniqueSellingPoints: z.array(z.string()).nullable().describe('Array of key differentiating features'),
  monetizationModel: z.string().nullable().describe('Revenue model'),
  releaseDate: z.string().nullable().describe('Expected release timeline'),
  developmentStage: z.string().nullable().describe('Current development stage'),
  teamSize: z.string().nullable().describe('Development team size description'),
  previousTitles: z.array(z.object({
    title: z.string(),
    role: z.string(),
    year: z.string().nullable()
  })).nullable().describe('Array of team previous games'),
  fundingStatus: z.string().nullable().describe('Current funding situation'),
  marketingBudget: z.string().nullable().describe('Marketing plans/budget information'),
  revenueProjections: z.string().nullable().describe('Expected revenue/sales'),
  artStyle: z.string().nullable().describe('Visual style description'),
  likelyTags: z.array(z.string()).nullable().describe('Probable Steam/platform tags'),
  confidence: z.object({
    gameTitle: z.number().min(0).max(1).describe('Confidence score for game title'),
    developerName: z.number().min(0).max(1).describe('Confidence score for developer name'),
    overall: z.number().min(0).max(1).describe('Overall confidence score')
  }).describe('Confidence scores for extracted data')
});

async function testPdfExtractionDirect() {
  console.log('🧪 Direct PDF Extraction Test');
  console.log('=============================\n');

  try {
    // Check for API key
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.log('❌ GOOGLE_GENERATIVE_AI_API_KEY not found in environment');
      console.log('Please set your Google AI API key in the .env file');
      return;
    }

    // Load the PDF file
    const pdfPath = path.join(process.cwd(), 'public', 'pitch_deck.pdf');
    console.log(`📄 Loading PDF from: ${pdfPath}`);
    
    const pdfBuffer = readFileSync(pdfPath);
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
    
    console.log(`📊 PDF loaded successfully: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
    console.log(`🔍 Starting AI extraction with Gemini 2.5 Pro...`);
    console.log(`⏱️  This may take 30-60 seconds...\n`);

    const startTime = Date.now();

    // Use Gemini to extract data directly
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
      temperature: 0.1,
    });

    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`⏱️  AI processing completed in ${processingTime} seconds\n`);

    // Display results
    console.log('📊 EXTRACTION RESULTS');
    console.log('====================\n');
    
    const data = result.object;
    
    // Core Game Information
    console.log('🎮 CORE GAME INFORMATION');
    console.log('------------------------');
    console.log(`Game Title: ${data.gameTitle || 'Not found'}`);
    console.log(`Developer: ${data.developerName || 'Not found'}`);
    console.log(`Publisher: ${data.publisherName || 'Not found'}`);
    if (data.gameDescription) {
      const desc = data.gameDescription.length > 150 
        ? data.gameDescription.substring(0, 150) + '...' 
        : data.gameDescription;
      console.log(`Description: ${desc}`);
    } else {
      console.log(`Description: Not found`);
    }
    
    // Classification
    console.log('\n🏷️  GAME CLASSIFICATION');
    console.log('----------------------');
    console.log(`Genres: ${data.genre ? data.genre.join(', ') : 'Not found'}`);
    console.log(`Platforms: ${data.platforms ? data.platforms.join(', ') : 'Not found'}`);
    console.log(`Target Audience: ${data.targetAudience || 'Not found'}`);
    console.log(`Art Style: ${data.artStyle || 'Not found'}`);
    
    // Business Information
    console.log('\n💼 BUSINESS & DEVELOPMENT');
    console.log('-------------------------');
    console.log(`Monetization: ${data.monetizationModel || 'Not found'}`);
    console.log(`Development Stage: ${data.developmentStage || 'Not found'}`);
    console.log(`Team Size: ${data.teamSize || 'Not found'}`);
    console.log(`Release Date: ${data.releaseDate || 'Not found'}`);
    console.log(`Funding Status: ${data.fundingStatus || 'Not found'}`);
    console.log(`Marketing Budget: ${data.marketingBudget || 'Not found'}`);
    console.log(`Revenue Projections: ${data.revenueProjections || 'Not found'}`);
    
    // Unique Features
    console.log('\n✨ UNIQUE SELLING POINTS');
    console.log('------------------------');
    if (data.uniqueSellingPoints && data.uniqueSellingPoints.length > 0) {
      data.uniqueSellingPoints.forEach((point, index) => {
        console.log(`${index + 1}. ${point}`);
      });
    } else {
      console.log('No unique selling points found');
    }
    
    // Previous Titles
    console.log('\n🏆 TEAM EXPERIENCE');
    console.log('------------------');
    if (data.previousTitles && data.previousTitles.length > 0) {
      data.previousTitles.forEach((title, index) => {
        console.log(`${index + 1}. ${title.title} (${title.role}${title.year ? ', ' + title.year : ''})`);
      });
    } else {
      console.log('No previous titles found');
    }
    
    // Platform Tags
    console.log('\n🏪 SUGGESTED PLATFORM TAGS');
    console.log('---------------------------');
    if (data.likelyTags && data.likelyTags.length > 0) {
      console.log(data.likelyTags.join(', '));
    } else {
      console.log('No platform tags suggested');
    }
    
    // Confidence Scores
    console.log('\n📈 AI CONFIDENCE SCORES');
    console.log('-----------------------');
    console.log(`Game Title: ${(data.confidence.gameTitle * 100).toFixed(1)}%`);
    console.log(`Developer Name: ${(data.confidence.developerName * 100).toFixed(1)}%`);
    console.log(`Overall Confidence: ${(data.confidence.overall * 100).toFixed(1)}%`);
    
    // Quality Assessment
    const overallScore = data.confidence.overall;
    console.log('\n🎯 EXTRACTION QUALITY');
    console.log('---------------------');
    if (overallScore >= 0.8) {
      console.log('🟢 HIGH QUALITY - Excellent extraction confidence');
      console.log('   Ready for automatic processing');
    } else if (overallScore >= 0.6) {
      console.log('🟡 MODERATE QUALITY - Good extraction with some uncertainty');
      console.log('   Some fields may benefit from manual review');
    } else if (overallScore >= 0.4) {
      console.log('🟠 LOW QUALITY - Limited extraction confidence');
      console.log('   Manual review strongly recommended');
    } else {
      console.log('🔴 VERY LOW QUALITY - Poor extraction confidence');
      console.log('   Extensive manual review required');
    }
    
    // Summary Stats
    console.log('\n📊 EXTRACTION SUMMARY');
    console.log('--------------------');
    const extractedFields = Object.entries(data).filter(([key, value]) => 
      key !== 'confidence' && value !== null && value !== undefined && 
      (typeof value !== 'object' || (Array.isArray(value) && value.length > 0))
    ).length;
    
    const totalFields = Object.keys(data).length - 1; // Exclude confidence object
    console.log(`Fields extracted: ${extractedFields}/${totalFields} (${((extractedFields/totalFields)*100).toFixed(1)}%)`);
    console.log(`Processing time: ${processingTime}s`);
    console.log(`AI Model: Gemini 2.5 Pro`);
    
    console.log('\n✅ PDF EXTRACTION TEST COMPLETED SUCCESSFULLY');
    console.log('\n🎉 The AI extraction system is working correctly!');
    console.log('Ready for AgentMail webhook integration.');

  } catch (error) {
    console.error('\n💥 Test failed with error:', error);
    
    if (error.message?.includes('API_KEY')) {
      console.log('\nℹ️  This appears to be an API key issue.');
      console.log('Make sure GOOGLE_GENERATIVE_AI_API_KEY is set in your .env file');
    } else if (error.message?.includes('ENOENT')) {
      console.log('\nℹ️  PDF file not found.');
      console.log('Make sure pitch_deck.pdf exists in the public/ folder');
    } else {
      console.log('\nℹ️  This may be a network or AI service issue.');
      console.log('Try running the test again in a few moments.');
    }
  }
}

// Run the test
testPdfExtractionDirect().catch(console.error);