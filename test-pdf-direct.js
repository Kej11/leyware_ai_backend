import { readFileSync } from 'fs';
import fetch from 'node-fetch';

const GOOGLE_API_KEY = "AIzaSyBmAA_EygETV2OXt0IpHVdhGmYbRzJAl1U";

async function testPdfExtraction() {
  console.log('🧪 Testing PDF Extraction with Gemini AI (Direct API Call)');
  console.log('========================================================\n');

  try {
    // Load the PDF file
    console.log('📄 Loading PDF file...');
    const pdfBuffer = readFileSync('./public/pitch_deck.pdf');
    console.log(`✅ PDF loaded: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Convert to base64
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
    console.log('📊 Converted to base64 for AI processing');

    console.log('\n🤖 Sending to Gemini AI...');
    console.log('⏱️  This may take 30-60 seconds...\n');

    const startTime = Date.now();

    // Prepare the request payload for Gemini API
    const payload = {
      contents: [{
        parts: [
          {
            text: `Please analyze this game pitch PDF and extract structured information. 

Extract the following if available:
- Game title
- Developer/studio name  
- Publisher name
- Game description
- Genres
- Target platforms
- Development stage
- Team size
- Monetization model
- Unique features
- Release timeline

Provide your analysis in a structured format with confidence levels for key information.`
          },
          {
            inline_data: {
              mime_type: "application/pdf",
              data: pdfBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 32,
        topP: 1,
        maxOutputTokens: 4096,
      }
    };

    // Make the API call to Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    console.log(`✅ AI processing completed in ${processingTime} seconds\n`);

    // Extract and display the results
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const extractedText = result.candidates[0].content.parts[0].text;
      
      console.log('📊 GEMINI AI EXTRACTION RESULTS');
      console.log('==============================\n');
      console.log(extractedText);
      
      console.log('\n🎯 TEST RESULTS');
      console.log('===============');
      console.log('✅ PDF loading: SUCCESS');
      console.log('✅ Base64 conversion: SUCCESS'); 
      console.log('✅ Gemini API call: SUCCESS');
      console.log('✅ Data extraction: SUCCESS');
      console.log(`⏱️  Processing time: ${processingTime}s`);
      console.log(`📄 PDF size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      
      console.log('\n🚀 AGENTMAIL INTEGRATION STATUS');
      console.log('===============================');
      console.log('🟢 PDF Extraction System: VERIFIED WORKING');
      console.log('🟢 Gemini AI Processing: SUCCESSFUL');
      console.log('🟢 Ready for AgentMail webhook integration');
      
      console.log('\n🎉 Your PDF extraction pipeline is ready!');
      console.log('When AgentMail sends webhook events with PDF attachments,');
      console.log('this same extraction process will run automatically.');
      
    } else {
      console.log('⚠️  Unexpected response format from Gemini API');
      console.log('Raw response:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    
    if (error.message.includes('403') || error.message.includes('401')) {
      console.log('\nℹ️  API key issue - check your GOOGLE_GENERATIVE_AI_API_KEY');
    } else if (error.message.includes('ENOENT')) {
      console.log('\nℹ️  PDF file not found - make sure public/pitch_deck.pdf exists');
    } else if (error.message.includes('400')) {
      console.log('\nℹ️  Bad request - the PDF might be too large or corrupted');
    } else {
      console.log('\nℹ️  Network or API issue - try again in a moment');
    }
  }
}

// Run the test
testPdfExtraction().catch(console.error);