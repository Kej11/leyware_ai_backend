import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Load environment variables from test directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function runObserveExtractWorkflow() {
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

    // Get the page instance
    const page = stagehand.page;
    if (!page) {
      throw new Error('Failed to get page instance from Stagehand');
    }

    // Step 1: Navigate to itch.io games
    console.log('📍 Navigating to itch.io/games...');
    await page.goto("https://itch.io/games");
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded');

    // Step 2: Observe the page to find game links
    console.log('👀 Observing page for game links...');
    const observations = await page.observe({
      instruction: "Find all the game cards/links on this page that lead to individual game pages"
    });
    
    console.log(`✅ Found ${observations.length} game elements`);
    
    // Show first 5 observations
    console.log('\n📋 First 5 game elements found:');
    observations.slice(0, 5).forEach((obs, index) => {
      console.log(`  ${index + 1}. ${obs.selector} - ${obs.description}`);
    });

    // Step 3: Click on the first game to navigate to its page
    if (observations.length > 0) {
      console.log('\n🖱️ Clicking on the first game...');
      await page.act({
        action: observations[0].selector
      });
      
      // Wait for navigation
      await page.waitForLoadState('networkidle');
      console.log('✅ Navigated to game page');

      // Step 4: Extract detailed information from the game page
      console.log('\n📊 Extracting detailed game information...');
      const gameDetails = await page.extract({
        instruction: "Extract all available information about this game including title, developer, description, price, tags, platforms, and any other relevant details",
        schema: z.object({
          title: z.string().optional(),
          developer: z.string().optional(),
          description: z.string().optional(),
          price: z.string().optional(),
          tags: z.array(z.string()).optional(),
          platforms: z.array(z.string()).optional(),
          releaseDate: z.string().optional(),
          rating: z.string().optional(),
          downloadCount: z.string().optional(),
          genre: z.string().optional(),
          features: z.array(z.string()).optional(),
        })
      });

      console.log('\n✅ Extraction successful!');
      console.log('📊 Game Details:', JSON.stringify(gameDetails, null, 2));

      // Step 5: Go back and try another game
      console.log('\n🔙 Going back to games list...');
      await page.goBack();
      await page.waitForLoadState('networkidle');

      // Observe again to get fresh selectors
      const newObservations = await page.observe({
        instruction: "Find all the game cards/links on this page"
      });

      if (newObservations.length > 1) {
        console.log('🖱️ Clicking on the second game...');
        await page.act({
          action: newObservations[1].selector
        });
        
        await page.waitForLoadState('networkidle');
        console.log('✅ Navigated to second game page');

        // Extract second game details
        console.log('\n📊 Extracting second game information...');
        const secondGameDetails = await page.extract({
          instruction: "Extract all available information about this game",
          schema: z.object({
            title: z.string().optional(),
            developer: z.string().optional(),
            description: z.string().optional(),
            price: z.string().optional(),
            tags: z.array(z.string()).optional(),
            platforms: z.array(z.string()).optional(),
            genre: z.string().optional(),
          })
        });

        console.log('\n✅ Second extraction successful!');
        console.log('📊 Second Game Details:', JSON.stringify(secondGameDetails, null, 2));
      }

    } else {
      console.log('❌ No game elements found to click on');
    }

  } catch (error) {
    console.error('❌ Error during workflow:', error);
  } finally {
    if (stagehand) {
      await stagehand.close();
      console.log('\n🧹 Stagehand closed.');
    }
  }
}

runObserveExtractWorkflow().catch(console.error);