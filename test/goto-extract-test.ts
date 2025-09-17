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
  console.log('🎯 Testing Extract After Explicit Goto');
  
  let stagehand;
  
  try {
    // Initialize Stagehand
    stagehand = new Stagehand({
      env: "BROWSERBASE"
    });

    await stagehand.init();
    console.log('✅ Stagehand initialized');

    // Step 1: Navigate to itch.io games page
    console.log('🌐 Step 1: Going to itch.io/games...');
    await stagehand.page.goto('https://itch.io/games');
    await stagehand.page.waitForLoadState('networkidle');
    console.log('✅ Main page loaded');

    // Step 2: Observe game links
    console.log('\n👁️  Step 2: Observing game links...');
    const gameElements = await stagehand.page.observe("Find game links");
    console.log(`✅ Found ${gameElements.length} game elements`);
    
    if (gameElements.length > 0) {
      console.log(`🎮 Will investigate: ${gameElements[0].description}`);
      
      // Step 3: Click on first game
      console.log('\n🎯 Step 3: Clicking on game...');
      await stagehand.page.act(gameElements[0]);
      await stagehand.page.waitForLoadState('networkidle');
      
      // Step 4: Get the current URL and do explicit goto
      const gameUrl = stagehand.page.url();
      console.log(`🌐 Step 4: Current URL: ${gameUrl}`);
      console.log('🔄 Doing explicit goto to ensure page is ready...');
      await stagehand.page.goto(gameUrl);
      await stagehand.page.waitForLoadState('networkidle');
      console.log('✅ Game page reloaded and ready');

      // Step 5: Simple extract using exact docs format
      console.log('\n📊 Step 5: Simple extract using docs format...');
      const gameTitle = await stagehand.page.extract({
        instruction: "extract the title of this game",
        schema: z.object({
          title: z.string(),
        }),
      });
      
      console.log('✅ Extract successful!');
      console.log('📝 Extracted data:', gameTitle);

      // Step 6: Try extracting price using docs format
      console.log('\n📊 Step 6: Extract price using docs format...');
      const gamePrice = await stagehand.page.extract({
        instruction: "extract the price of this game",
        schema: z.object({
          price: z.string(),
        }),
      });
      
      console.log('✅ Price extract successful!');
      console.log('📝 Price data:', gamePrice);

    } else {
      console.log('❌ No game elements found to test with');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Proper cleanup
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