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
  console.log('📚 Following Stagehand Docs Examples Exactly');
  
  let stagehand;
  
  try {
    // Initialize Stagehand
    stagehand = new Stagehand({
      env: "BROWSERBASE"
    });

    await stagehand.init();
    console.log('✅ Stagehand initialized');

    // Navigate to itch.io games page
    console.log('🌐 Navigating to itch.io/games...');
    await stagehand.page.goto('https://itch.io/games');
    await stagehand.page.waitForLoadState('networkidle');
    console.log('✅ Page loaded');

    // Example 1: Basic observe (following docs exactly)
    console.log('\n📊 Example 1: Basic observe...');
    const gameElements = await stagehand.page.observe("Find game links");
    
    console.log('✅ Observe successful!');
    console.log(`📝 Found ${gameElements.length} elements`);
    gameElements.slice(0, 3).forEach((element, index) => {
      console.log(`${index + 1}. ${element.description}`);
    });

    if (gameElements.length > 0) {
      // Example 2: Act on observed element (following docs exactly)
      console.log('\n🎯 Example 2: Acting on first observed element...');
      await stagehand.page.act(gameElements[0]); // No LLM call as per docs
      await stagehand.page.waitForLoadState('networkidle');
      console.log('✅ Act successful!');

      // Example 3: Simple extract (following docs exactly)
      console.log('\n📊 Example 3: Simple extract...');
      const gameData = await stagehand.page.extract({
        instruction: "extract the title of this game",
        schema: z.object({
          title: z.string(),
        }),
      });

      console.log('✅ Extract successful!');
      console.log('📝 Extracted data:', gameData);

      // Example 4: More complex extract (following docs pattern)
      console.log('\n📊 Example 4: Complex extract...');
      const detailedData = await stagehand.page.extract({
        instruction: "Extract game details",
        schema: z.object({
          title: z.string(),
          developer: z.string(),
          price: z.string(),
        }),
      });

      console.log('✅ Complex extract successful!');
      console.log('📝 Detailed data:', detailedData);
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