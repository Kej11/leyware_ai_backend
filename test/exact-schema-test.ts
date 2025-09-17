import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from test/.env
dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
  console.log('🎯 Testing Exact Schema Format You Suggested');
  
  let stagehand;
  
  try {
    // Initialize Stagehand
    stagehand = new Stagehand({
      env: "BROWSERBASE"
    });

    await stagehand.init();
    console.log('✅ Stagehand initialized');

    // Navigate to a specific game page first (bypass searching)
    console.log('🌐 Going to a specific game page...');
    await stagehand.page.goto('https://itch.io/games');
    await stagehand.page.waitForLoadState('networkidle');
    console.log('✅ Itch.io games page loaded');

    // Use observe to find the first game
    console.log('👁️  Finding first game...');
    const gameElements = await stagehand.page.observe("Find the first game link");
    console.log(`✅ Found ${gameElements.length} game elements`);
    
    if (gameElements.length > 0) {
      // Click on first game
      console.log('🎯 Clicking on first game...');
      await stagehand.page.act(gameElements[0]);
      await stagehand.page.waitForLoadState('networkidle');
      
      // Get current URL and do explicit goto as you suggested
      const gameUrl = stagehand.page.url();
      console.log(`🌐 Current URL: ${gameUrl}`);
      console.log('🔄 Doing explicit goto before extract...');
      await stagehand.page.goto(gameUrl);
      await stagehand.page.waitForLoadState('networkidle');
      console.log('✅ Page ready for extraction');

      // Test exact schema format you suggested for price
      console.log('\n📊 Testing exact schema format you suggested...');
      const item = await stagehand.page.extract({
        instruction: "extract the price of the item",
        schema: z.object({
          price: z.number(),
        }),
      });
      
      console.log('✅ Extract successful!');
      console.log('📝 Extracted item:', item);

    } else {
      console.log('❌ No game elements found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    try {
      if (stagehand) {
        await stagehand.close();
        console.log('✅ Session closed');
      }
    } catch (cleanupError) {
      console.error('❌ Cleanup error:', cleanupError);
    }
  }
}

main();