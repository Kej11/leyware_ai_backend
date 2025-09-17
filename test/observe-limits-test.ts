import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Load environment variables from test directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function testObserveLimits() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: false,
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    console.log('🚀 Initializing Stagehand...');
    await stagehand.init();
    console.log('✅ Stagehand initialized successfully.\n');

    const page = stagehand.page;
    if (!page) {
      throw new Error('Failed to get page instance from Stagehand');
    }

    console.log('📍 Navigating to itch.io/games...');
    await page.goto("https://itch.io/games");
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded\n');

    // Test 1: Use observe() to find game elements
    console.log('=' + '='.repeat(50));
    console.log('TEST 1: Using observe() to find game links');
    console.log('=' + '='.repeat(50));
    
    const observations = await page.observe({
      instruction: "Find ALL clickable links to individual game pages on this page. Include every single game card/link you can find."
    });
    
    console.log(`📊 observe() found: ${observations.length} elements`);
    console.log('\nFirst 5 observations:');
    observations.slice(0, 5).forEach((obs, i) => {
      console.log(`  ${i + 1}. ${obs.selector.substring(0, 50)}... - ${obs.description}`);
    });

    // Test 2: Use extract() to get URLs
    console.log('\n' + '='.repeat(50));
    console.log('TEST 2: Using extract() to get game URLs');
    console.log('=' + '='.repeat(50));
    
    const extractedUrls = await page.extract({
      instruction: "Extract ALL game URLs from this page. Get every single game link you can find. Include the game title and full URL for each.",
      schema: z.object({
        games: z.array(z.object({
          title: z.string(),
          url: z.string()
        })),
        totalCount: z.number()
      })
    });
    
    console.log(`📊 extract() found: ${extractedUrls.games.length} game URLs`);
    console.log(`📊 Total count reported: ${extractedUrls.totalCount}`);
    
    console.log('\nFirst 5 extracted URLs:');
    extractedUrls.games.slice(0, 5).forEach((game, i) => {
      console.log(`  ${i + 1}. ${game.title} - ${game.url}`);
    });

    // Test 3: Try to get even more with specific instructions
    console.log('\n' + '='.repeat(50));
    console.log('TEST 3: Extract with pagination awareness');
    console.log('=' + '='.repeat(50));
    
    const allGameData = await page.extract({
      instruction: "Look at the entire page including any games that might be below the fold or require scrolling. Extract EVERY game's title and URL. Check if there are more games than initially visible.",
      schema: z.object({
        visibleGames: z.array(z.object({
          title: z.string(),
          url: z.string()
        })),
        hasMoreGames: z.boolean(),
        estimatedTotalGames: z.number().optional()
      })
    });
    
    console.log(`📊 Visible games found: ${allGameData.visibleGames.length}`);
    console.log(`📊 Has more games: ${allGameData.hasMoreGames}`);
    console.log(`📊 Estimated total: ${allGameData.estimatedTotalGames || 'Not provided'}`);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY OF RESULTS:');
    console.log('=' + '='.repeat(50));
    console.log(`observe() found: ${observations.length} elements`);
    console.log(`extract() found: ${extractedUrls.games.length} game URLs`);
    console.log(`extract() with scroll awareness found: ${allGameData.visibleGames.length} games`);
    
    // Show unique URLs found
    const uniqueUrls = new Set([
      ...extractedUrls.games.map(g => g.url),
      ...allGameData.visibleGames.map(g => g.url)
    ]);
    console.log(`\n📊 Total unique game URLs found: ${uniqueUrls.size}`);

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    if (stagehand) {
      await stagehand.close();
      console.log('\n🧹 Stagehand closed.');
    }
  }
}

testObserveLimits().catch(console.error);