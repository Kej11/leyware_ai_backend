import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Stagehand } from "@browserbasehq/stagehand";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from test/.env
dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
  console.log('🚀 Simple Stagehand Agent Test');
  
  // Debug: Check if env vars are loaded
  console.log('BROWSERBASE_API_KEY exists:', !!process.env.BROWSERBASE_API_KEY);
  console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
  
  // Declare stagehand outside try block so it's accessible in finally
  let stagehand;
  
  try {
    // Simple initialization as per docs
    stagehand = new Stagehand({
      env: "BROWSERBASE" // Let it handle the environment automatically
    });

    await stagehand.init();
    console.log('✅ Stagehand initialized');

    // Navigate to the page first
    console.log('🌐 Navigating to itch.io/games...');
    await stagehand.page.goto('https://itch.io/games');
    await stagehand.page.waitForLoadState('networkidle');
    console.log('✅ Page loaded');

    // Create a detailed investigation agent
    const agent = stagehand.agent({
      provider: "openai",
      model: "computer-use-preview",
      instructions: `You are an experienced video game publisher and investor looking for promising indie games that need publishing investment. 
      
      Your goal is to find games that show commercial potential but may need financial backing, marketing support, or publishing expertise. Look for:
      - High-quality indie games with professional presentation
      - Games that appear to be from smaller/independent developers
      - Projects that show innovation or unique gameplay
      - Games with good visual appeal but may lack marketing reach
      - Titles that could benefit from publishing support
      
      When investigating games, gather comprehensive details about each prospect.`,
      options: {
        apiKey: process.env.OPENAI_API_KEY,
      },
    });

    console.log('🤖 Agent created, starting detailed investigation...');

    // Enhanced task: investigate individual games in depth
    const result = await agent.execute(`Browse this itch.io games page and identify 3-4 promising indie games that might benefit from publishing investment. 

    For each interesting game you find:
    1. Click on the game to visit its individual page
    2. Gather detailed information including:
       - Game title and developer name
       - Game description and genre
       - Visual quality and screenshots
       - Price point and monetization model
       - Developer background and other games
       - Community engagement (comments, ratings, downloads if visible)
       - Development status (released, in development, demo available)
       - Unique selling points or innovative features
    3. Assess the commercial potential and why it might need publishing support
    
    After investigating each game, return to the main games page to find the next prospect.
    
    Provide a comprehensive report on each game with your investment recommendation.`);

    console.log('📊 Agent Results:');
    console.log('Success:', result.success);
    console.log('Completed:', result.completed);
    console.log('Message:', result.message);
    console.log('Actions taken:', result.actions?.length || 0);
    
    if (result.usage) {
      console.log('Usage:', {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        inference_time_ms: result.usage.inference_time_ms
      });
    }

    console.log('\n📋 Detailed Investment Report:');
    console.log('='.repeat(60));
    console.log(result.message);
    console.log('='.repeat(60));

    console.log('✅ Detailed investigation completed');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Proper cleanup
    console.log('🧹 Cleaning up...');
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