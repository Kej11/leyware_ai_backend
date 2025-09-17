import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod/v3';

// Load environment variables from test directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function testExtract() {
  console.log('🚀 Starting extract test...');
  
  let stagehand: Stagehand;
  
  try {
    stagehand = new Stagehand({
      env: "LOCAL",
      headless: false,
      logger: console.log,
    });

    await stagehand.init();
    console.log('✅ Stagehand initialized');

    await stagehand.page.goto("https://itch.io/games");
    console.log('✅ Navigated to itch.io/games');
    
    await stagehand.page.waitForLoadState('networkidle');

    console.log('📊 Extracting game data...');
    
    const data = await stagehand.page.extract({
      instruction: "Extract information about games on this page",
      schema: z.object({
        list_of_games: z.array(
          z.object({
            title: z.string(),
            creator: z.string(),
            price: z.string(),
          }),
        ),
      }),
    });

    console.log('✅ Extraction successful!');
    console.log('📊 Extracted data:', JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (stagehand) {
      await stagehand.close();
      console.log('🧹 Session closed');
    }
  }
}

testExtract().catch(console.error);