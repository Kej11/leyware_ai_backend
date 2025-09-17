import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Load environment variables from test directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function runCleanWorkflow() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: false,
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    // Initialize Stagehand
    console.log('🚀 Initializing Stagehand...');
    await stagehand.init();
    console.log('✅ Stagehand initialized successfully.');

    const page = stagehand.page;
    if (!page) {
      throw new Error('Failed to get page instance from Stagehand');
    }

    // Step 1: Navigate to itch.io games
    console.log('📍 Navigating to itch.io/games...');
    await page.goto("https://itch.io/games");
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded');

    // Step 2: Extract game URLs directly from the page
    console.log('\n📊 Extracting game URLs from the page...');
    const urlData = await page.extract({
      instruction: "Look at the game cards on this page. Extract the URLs that link to the actual game pages (not jam pages). These usually have a pattern like https://username.itch.io/game-name. Get the first 5 game page URLs.",
      schema: z.object({
        gameUrls: z.array(z.object({
          title: z.string(),
          url: z.string()
        }))
      })
    });

    console.log(`✅ Extracted ${urlData.gameUrls.length} game URLs`);
    console.log('URLs:', urlData.gameUrls);

    // Step 3: Visit each game URL and extract details
    const gameDetails = [];
    
    for (let i = 0; i < Math.min(3, urlData.gameUrls.length); i++) {
      const game = urlData.gameUrls[i];
      console.log(`\n🎮 Visiting game ${i + 1}: ${game.title}`);
      console.log(`   URL: ${game.url}`);
      
      // Navigate directly to the game URL
      await page.goto(game.url);
      await page.waitForLoadState('networkidle');
      
      // Extract game details
      console.log('📊 Extracting game information...');
      const details = await page.extract({
        instruction: "Extract all available information about this game",
        schema: z.object({
          url: z.string().default(game.url),
          title: z.string().optional(),
          developer: z.string().optional(),
          description: z.string().optional(),
          fullDescription: z.string().optional(),
          price: z.string().optional(),
          tags: z.array(z.string()).optional(),
          platforms: z.array(z.string()).optional(),
          releaseDate: z.string().optional(),
          rating: z.string().optional(),
          downloadCount: z.string().optional(),
          genre: z.string().optional(),
          lastUpdated: z.string().optional(),
        })
      });
      
      gameDetails.push(details);
      console.log('✅ Extracted:', details.title || 'Unknown title');
    }

    // Display all collected data
    console.log('\n' + '='.repeat(50));
    console.log('📊 FINAL EXTRACTED DATA:');
    console.log('='.repeat(50));
    console.log(JSON.stringify(gameDetails, null, 2));

  } catch (error) {
    console.error('❌ Error during workflow:', error);
  } finally {
    if (stagehand) {
      await stagehand.close();
      console.log('\n🧹 Stagehand closed.');
    }
  }
}

runCleanWorkflow().catch(console.error);