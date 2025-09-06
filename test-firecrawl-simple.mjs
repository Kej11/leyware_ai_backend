import FirecrawlApp from '@mendable/firecrawl-js';
import { config } from 'dotenv';

// Load environment variables
config();

async function testSimpleExtract() {
  try {
    console.log('🚀 Simple Firecrawl extract test...');
    console.log('📋 Target URL: https://itch.io/games/new-and-popular\n');
    
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('❌ FIRECRAWL_API_KEY not found');
      return;
    }
    
    const firecrawl = new FirecrawlApp({ apiKey });
    
    // Simple extraction without strict schema
    const extractResult = await firecrawl.extract({
      urls: ["https://itch.io/games/new-and-popular"],
      prompt: "Extract information about games on this page. For each game, provide the title, creator/developer, and any other details you can find."
    });

    console.log('✅ Extract completed!');
    console.log('📊 Result:');
    console.log(JSON.stringify(extractResult, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSimpleExtract();