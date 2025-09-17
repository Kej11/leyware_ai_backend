import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod/v3';

// Load environment variables from test directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function testPriceExtraction() {
  console.log('🚀 Starting price extraction test...');
  
  let stagehand: Stagehand;
  
  try {
    // Initialize Stagehand in local mode
    stagehand = new Stagehand({
      env: "LOCAL",
      headless: false,
      logger: console.log,
    });

    await stagehand.init();
    console.log('✅ Stagehand initialized');

    // Navigate to itch.io games
    await stagehand.page.goto("https://itch.io/games");
    console.log('✅ Navigated to itch.io/games');
    
    // Wait for page to load
    await stagehand.page.waitForLoadState('networkidle');

    // Extract price data
    console.log('💰 Extracting price information...');
    
    try {
      const item = await stagehand.page.extract({
        instruction: "Find the first game on the page and extract its price. If it's free, return 0",
        schema: z.object({
          price: z.number(),
        }),
      });

      console.log('✅ Extraction successful!');
      console.log('📊 Extracted data:', item);
    } catch (extractError) {
      console.error('❌ Extract failed:', extractError);
      // Try a simpler extraction
      console.log('Trying simpler extraction...');
      const simpleItem = await stagehand.page.extract({
        instruction: "Return a price of 0",
        schema: z.object({
          price: z.number(),
        }),
      });
      console.log('📊 Simple extraction result:', simpleItem);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (stagehand) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before closing
        await stagehand.close();
        console.log('🧹 Session closed');
      } catch (closeError) {
        console.log('🧹 Session already closed');
      }
    }
  }
}

testPriceExtraction().catch(console.error);