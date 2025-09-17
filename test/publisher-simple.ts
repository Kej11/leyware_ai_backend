import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function publisherScout() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: false,
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    console.log('🎮 Publisher Game Scout - Simplified');
    console.log('=' + '='.repeat(50));
    console.log('🚀 Initializing...');
    await stagehand.init();
    
    const page = stagehand.page;
    if (!page) throw new Error('Failed to get page instance');

    // Go to top-rated games for quality
    console.log('\n📍 Navigating to top-rated games...');
    await page.goto("https://itch.io/games/top-rated");
    await page.waitForLoadState('networkidle');

    // Extract initial batch with URLs
    console.log('\n📊 Extracting high-quality games...');
    const initialGames = await page.extract({
      instruction: `
        Extract the top 20 games from this page.
        For each game, get the exact game page URL (format like: https://developer.itch.io/game-name)
        Include title, developer, rating, and genre.
      `,
      schema: z.object({
        games: z.array(z.object({
          title: z.string(),
          url: z.string(),
          developer: z.string(),
          rating: z.string().optional(),
          genre: z.string().optional()
        }))
      })
    });

    console.log(`✅ Found ${initialGames.games.length} games\n`);

    // Scroll once to get more
    console.log('📜 Scrolling for more games...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // Get more games after scroll
    const moreGames = await page.extract({
      instruction: "Extract any NEW games that are now visible after scrolling. Include URLs.",
      schema: z.object({
        games: z.array(z.object({
          title: z.string(),
          url: z.string(),
          developer: z.string(),
          rating: z.string().optional()
        }))
      })
    });

    console.log(`✅ Found ${moreGames.games.length} additional games\n`);

    // Combine all games
    const allGames = [...initialGames.games, ...moreGames.games];
    
    // Filter for publisher interest (high ratings)
    const publisherTargets = allGames.filter(game => {
      const rating = parseFloat(game.rating?.match(/[\d.]+/)?.[0] || '0');
      return rating >= 4.5;
    });

    console.log('🎯 HIGH-POTENTIAL GAMES FOR PUBLISHERS:');
    console.log('=' + '='.repeat(50));
    
    // Visit top 3 games for detailed analysis
    const detailedReports = [];
    
    for (let i = 0; i < Math.min(3, publisherTargets.length); i++) {
      const game = publisherTargets[i];
      console.log(`\n🔍 Analyzing: ${game.title}`);
      console.log(`   Developer: ${game.developer}`);
      console.log(`   Rating: ${game.rating}`);
      
      try {
        // Navigate to game page
        await page.goto(game.url);
        await page.waitForLoadState('networkidle');
        
        // Extract detailed info
        const details = await page.extract({
          instruction: `
            Extract publisher-relevant information:
            - Full game description
            - Price or monetization model
            - Number of downloads or ratings
            - Platforms supported
            - Last update date
            - Any visible community metrics
          `,
          schema: z.object({
            description: z.string().optional(),
            price: z.string().optional(),
            downloads: z.string().optional(),
            platforms: z.array(z.string()).optional(),
            lastUpdate: z.string().optional(),
            community: z.string().optional()
          })
        });
        
        detailedReports.push({
          ...game,
          details
        });
        
        console.log(`   💰 Price: ${details.price || 'Free/Name your price'}`);
        console.log(`   📊 Downloads: ${details.downloads || 'Not visible'}`);
        console.log(`   🎮 Platforms: ${details.platforms?.join(', ') || 'Not specified'}`);
        
      } catch (error) {
        console.log(`   ⚠️ Could not analyze: ${error.message}`);
      }
    }

    // Final summary
    console.log('\n\n📈 PUBLISHER SUMMARY:');
    console.log('=' + '='.repeat(50));
    console.log(`Total games scanned: ${allGames.length}`);
    console.log(`High-potential games (4.5+ rating): ${publisherTargets.length}`);
    console.log(`Detailed analysis completed: ${detailedReports.length}`);
    
    console.log('\n🏆 TOP INVESTMENT OPPORTUNITIES:');
    detailedReports.forEach((report, i) => {
      console.log(`\n${i + 1}. ${report.title}`);
      console.log(`   Developer: ${report.developer}`);
      console.log(`   Rating: ${report.rating}`);
      console.log(`   Monetization: ${report.details?.price || 'Free/Flexible'}`);
      console.log(`   URL: ${report.url}`);
    });

    return {
      totalScanned: allGames.length,
      highPotential: publisherTargets.length,
      topOpportunities: detailedReports
    };

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    if (stagehand) {
      await stagehand.close();
      console.log('\n🧹 Session closed.');
    }
  }
}

// Run it
publisherScout()
  .then(result => {
    console.log('\n✅ Scout completed successfully!');
  })
  .catch(error => {
    console.error('\n❌ Scout failed:', error);
    process.exit(1);
  });