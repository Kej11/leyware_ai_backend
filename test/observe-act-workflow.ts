import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Stagehand } from "@browserbasehq/stagehand";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from test/.env
dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
  console.log('🎯 Observe/Act Game Investigation Workflow');
  
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

    // Step 1: Observe game links (this works!)
    console.log('\n👁️  Step 1: Observing game links...');
    const gameElements = await stagehand.page.observe("Find game links");
    
    console.log(`✅ Found ${gameElements.length} game elements`);
    console.log('🎮 First few games:');
    gameElements.slice(0, 5).forEach((element, index) => {
      console.log(`${index + 1}. ${element.description}`);
    });

    // Step 2: Investigate multiple games using observe/act
    const gameData = [];
    const gamesToInvestigate = Math.min(3, gameElements.length);
    
    for (let i = 0; i < gamesToInvestigate; i++) {
      console.log(`\n🔍 Step 2.${i + 1}: Investigating game ${i + 1}/${gamesToInvestigate}...`);
      
      try {
        // Click on game using act (this works!)
        await stagehand.page.act(gameElements[i]);
        await stagehand.page.waitForLoadState('networkidle');
        console.log(`✅ Navigated to: ${gameElements[i].description}`);

        // Get basic page info using Playwright directly (avoiding extract)
        const title = await stagehand.page.title();
        const url = stagehand.page.url();
        
        // Use observe to find key elements on the game page
        console.log('👁️  Observing game page elements...');
        const gamePageElements = await stagehand.page.observe("Find price, developer info, or download buttons");
        
        const gameInfo = {
          title: title,
          url: url,
          description: gameElements[i].description,
          pageElements: gamePageElements.slice(0, 5).map(el => el.description),
          investigatedAt: new Date().toISOString()
        };

        gameData.push(gameInfo);
        console.log(`✅ Game info collected for: ${title}`);

        // Go back to games page for next investigation
        if (i < gamesToInvestigate - 1) {
          console.log('🔙 Returning to games page...');
          await stagehand.page.goto('https://itch.io/games');
          await stagehand.page.waitForLoadState('networkidle');
        }

      } catch (error) {
        console.error(`❌ Error investigating game ${i + 1}:`, error.message);
        // Try to go back to games page if something went wrong
        try {
          await stagehand.page.goto('https://itch.io/games');
          await stagehand.page.waitForLoadState('networkidle');
        } catch (navError) {
          console.error('Failed to navigate back:', navError.message);
        }
      }
    }

    // Step 3: Generate report
    console.log('\n📋 OBSERVE/ACT INVESTIGATION REPORT');
    console.log('='.repeat(80));
    
    gameData.forEach((game, index) => {
      console.log(`\n🎮 GAME ${index + 1}: ${game.title}`);
      console.log(`🌐 URL: ${game.url}`);
      console.log(`📝 Description: ${game.description}`);
      console.log(`👁️  Page Elements Found:`);
      game.pageElements.forEach(element => {
        console.log(`   - ${element}`);
      });
      console.log(`🕐 Investigated: ${game.investigatedAt}`);
      console.log('-'.repeat(60));
    });

    console.log(`\n✅ Successfully investigated ${gameData.length} games using observe/act!`);
    console.log('💡 This approach avoids the extract() Zod compatibility issue');

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