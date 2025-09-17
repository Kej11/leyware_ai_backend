import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from test/.env
dotenv.config({ path: path.join(__dirname, '.env') });

// Define schema for game data extraction (Zod 3.25.0 compatible with descriptions)
const GameDataSchema = z.object({
  title: z.string().describe("Game title"),
  developer: z.string().describe("Developer/creator name"),
  description: z.string().describe("Game description"),
  genre: z.string().optional().describe("Game genre or category"),
  price: z.string().optional().describe("Game price"),
  status: z.string().optional().describe("Development status"),
  tags: z.array(z.string()).optional().describe("Game tags"),
  downloadCount: z.string().optional().describe("Download count if visible"),
  rating: z.string().optional().describe("User rating if available"),
  platforms: z.array(z.string()).optional().describe("Supported platforms"),
  features: z.array(z.string()).optional().describe("Key features"),
});

async function main() {
  console.log('🚀 Structured Stagehand Game Investigation');
  
  // Debug: Check if env vars are loaded
  console.log('BROWSERBASE_API_KEY exists:', !!process.env.BROWSERBASE_API_KEY);
  console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
  
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

    // Step 1: Try to observe the page, with fallback to simple approach
    let gameLinks = [];
    let useAgentFallback = false;
    
    try {
      console.log('👁️  Observing page elements...');
      const observations = await stagehand.page.observe("Find clickable game links");
      
      console.log('📊 Observed elements:');
      console.log(`Found ${observations.length} interactive elements`);
      
      // Filter for game links
      gameLinks = observations.filter(obs => obs.method === 'click').slice(0, 3);
      
      console.log(`🎮 Found ${gameLinks.length} potential game links via observe`);
      gameLinks.forEach((link, index) => {
        console.log(`${index + 1}. ${link.description}`);
      });
      
    } catch (observeError) {
      console.log('⚠️  Observe failed, using simpler approach...');
      console.log('Error:', observeError.message);
      useAgentFallback = true;
    }
    
    if (gameLinks.length === 0 || useAgentFallback) {
      console.log('🔄 Falling back to direct agent interaction...');
      // We'll skip the structured observe/extract and just use the working agent approach
      const agent = stagehand.agent({
        provider: "openai",
        model: "computer-use-preview", 
        instructions: "You are a game publisher investigating indie games for investment opportunities.",
        options: {
          apiKey: process.env.OPENAI_API_KEY,
        },
      });
      
      const result = await agent.execute("Browse this itch.io games page and investigate 2-3 interesting indie games. For each game, click on it to get details, then provide a report with title, developer, price, description, and why it might be a good investment opportunity.");
      
      console.log('📋 AGENT INVESTIGATION REPORT');
      console.log('='.repeat(80));
      console.log(result.message);
      console.log('='.repeat(80));
      
      console.log('✅ Agent investigation completed (fallback mode)');
      return; // Exit early since we used the agent approach
    }

    const gameData = [];

    // Step 2: Visit each game link and extract structured data
    for (let i = 0; i < gameLinks.length; i++) {
      const gameLink = gameLinks[i];
      console.log(`\n🔍 Investigating game ${i + 1}/${gameLinks.length}...`);
      
      try {
        // Click on the game link
        await stagehand.page.act({
          action: "click",
          selector: gameLink.selector
        });
        
        // Wait for the page to load
        await stagehand.page.waitForLoadState('networkidle');
        console.log('✅ Game page loaded');

        // Step 3: Extract structured data using the corrected schema
        console.log('📊 Extracting game data...');
        const extractedData = await stagehand.page.extract({
          instruction: "Extract comprehensive information about this indie game for investment analysis",
          schema: GameDataSchema,
        });

        console.log(`✅ Extracted data for: ${extractedData?.title || 'Unknown Game'}`);
        // Ensure the extracted data is an object
        if (extractedData && typeof extractedData === 'object') {
          gameData.push(extractedData);
        } else {
          console.log('⚠️  Extracted data is not in expected format');
        }

        // Go back to the main games page for the next game
        if (i < gameLinks.length - 1) {
          console.log('🔙 Returning to games page...');
          await stagehand.page.goBack();
          await stagehand.page.waitForLoadState('networkidle');
        }

      } catch (error) {
        console.error(`❌ Error investigating game ${i + 1}:`, error);
        // Try to go back to games page if we're stuck
        try {
          await stagehand.page.goto('https://itch.io/games');
          await stagehand.page.waitForLoadState('networkidle');
        } catch (navError) {
          console.error('Failed to navigate back:', navError);
        }
      }
    }

    // Step 4: Generate investment analysis
    console.log('\n📋 INVESTMENT ANALYSIS REPORT');
    console.log('='.repeat(80));
    
    gameData.forEach((game, index) => {
      console.log(`\n🎮 GAME ${index + 1}: ${game?.title || 'Unknown Game'}`);
      console.log(`👨‍💻 Developer: ${game?.developer || 'Unknown Developer'}`);
      console.log(`💰 Price: ${game?.price || 'Not specified'}`);
      console.log(`📊 Status: ${game?.status || 'Unknown'}`);
      console.log(`📝 Description: ${game?.description || 'No description available'}`);
      
      if (game?.genre) console.log(`🎯 Genre: ${game.genre}`);
      if (game?.downloadCount) console.log(`📈 Downloads: ${game.downloadCount}`);
      if (game?.rating) console.log(`⭐ Rating: ${game.rating}`);
      if (game?.tags && Array.isArray(game.tags) && game.tags.length > 0) {
        console.log(`🏷️  Tags: ${game.tags.join(', ')}`);
      }
      if (game?.platforms && Array.isArray(game.platforms) && game.platforms.length > 0) {
        console.log(`💻 Platforms: ${game.platforms.join(', ')}`);
      }
      if (game?.features && Array.isArray(game.features) && game.features.length > 0) {
        console.log(`✨ Features: ${game.features.join(', ')}`);
      }
      
      // Simple investment scoring
      let investmentScore = 0;
      let reasoning = [];
      
      if (game?.price && !game.price.toLowerCase().includes('free')) {
        investmentScore += 2;
        reasoning.push('Monetized product');
      }
      if (game?.downloadCount && parseInt(game.downloadCount.replace(/\D/g, '')) > 100) {
        investmentScore += 3;
        reasoning.push('Good download traction');
      }
      if (game?.tags && Array.isArray(game.tags) && game.tags.length > 3) {
        investmentScore += 1;
        reasoning.push('Well-categorized');
      }
      if (game?.screenshots && Array.isArray(game.screenshots) && game.screenshots.length > 2) {
        investmentScore += 2;
        reasoning.push('Good visual presentation');
      }
      
      console.log(`📊 Investment Score: ${investmentScore}/10`);
      console.log(`💡 Reasoning: ${reasoning.join(', ')}`);
      console.log('-'.repeat(60));
    });

    console.log(`\n✅ Investigation completed. Analyzed ${gameData.length} games.`);

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