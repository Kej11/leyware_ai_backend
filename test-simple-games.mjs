import 'dotenv/config';
import FirecrawlApp from '@mendable/firecrawl-js';

async function testSimpleGamesExtraction() {
  console.log('🎮 Testing simple "get any games" extraction...\n');

  if (!process.env.FIRECRAWL_API_KEY || process.env.FIRECRAWL_API_KEY === 'your-firecrawl-api-key-here') {
    console.log('❌ FIRECRAWL_API_KEY not set in .env file');
    return;
  }

  const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  const targetUrl = 'https://itch.io/games/new-and-popular/tag-retro';

  try {
    console.log(`🔍 Scraping: ${targetUrl}`);
    
    const result = await firecrawl.scrape(targetUrl, {
      formats: [{
        type: "json",
        prompt: "get any games you can find on this page",
        schema: {
          type: "object",
          properties: {
            games: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  developer: { type: "string" },
                  price: { type: "string" }
                }
              }
            }
          }
        }
      }]
    });

    console.log('\n🎉 Scrape completed!');
    
    if (result.json && result.json.games) {
      const games = result.json.games;
      console.log(`\n📦 Found ${games.length} games:\n`);
      
      games.slice(0, 10).forEach((game, index) => {
        console.log(`${index + 1}. "${game.title}" by ${game.developer} - ${game.price}`);
      });
      
      if (games.length > 10) {
        console.log(`\n... and ${games.length - 10} more games!`);
      }
    } else {
      console.log('❌ No games found in result');
      console.log('Raw result keys:', Object.keys(result));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSimpleGamesExtraction().catch(console.error);