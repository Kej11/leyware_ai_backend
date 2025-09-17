import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from test/.env
dotenv.config({ path: path.join(__dirname, '.env') });

// Simple schema to test extract functionality
const GameSchema = z.object({
  title: z.string(),
  developer: z.string(),
  price: z.string(),
});

async function main() {
  console.log('🧪 Testing Zod 3.25.0 Extract Functionality');
  
  // Declare stagehand outside try block so it's accessible in finally
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

    // Try the agent approach to navigate to a game
    const agent = stagehand.agent({
      provider: "openai",
      model: "computer-use-preview",
      instructions: "You are helping test data extraction from game pages.",
      options: {
        apiKey: process.env.OPENAI_API_KEY,
      },
    });

    console.log('🎯 Using agent to find and navigate to a game...');
    await agent.execute("Click on the first interesting game on this page to view its details");
    
    await stagehand.page.waitForLoadState('networkidle');
    console.log('✅ Navigated to game page');

    // Test simple extract with schema
    console.log('📊 Testing extract with Zod 3.25.0 schema...');
    const gameData = await stagehand.page.extract({
      instruction: "Extract basic information about this game",
      schema: GameSchema,
    });

    console.log('✅ Extract successful!');
    console.log('📋 Extracted Game Data:');
    console.log(`🎮 Title: ${gameData.title}`);
    console.log(`👨‍💻 Developer: ${gameData.developer}`);
    console.log(`💰 Price: ${gameData.price}`);

    // Test extract without schema
    console.log('\n📊 Testing extract without schema...');
    const rawData = await stagehand.page.extract({
      instruction: "Get the game description and any additional details about this game"
    });

    console.log('✅ Raw extract successful!');
    console.log('📝 Raw Data:', rawData);

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