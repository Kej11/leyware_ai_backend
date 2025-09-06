import 'dotenv/config';
import FirecrawlApp from '@mendable/firecrawl-js';

async function testCrawlRetroGames() {
  console.log('🕷️ Testing Firecrawl crawl on retro games page...\n');

  if (!process.env.FIRECRAWL_API_KEY || process.env.FIRECRAWL_API_KEY === 'your-firecrawl-api-key-here') {
    console.log('❌ FIRECRAWL_API_KEY not set in .env file');
    console.log('Please set your Firecrawl API key to test crawling');
    return;
  }

  const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
  const targetUrl = 'https://itch.io/games/new-and-popular/tag-retro';

  try {
    // First, let's preview crawl params
    console.log('🔍 Getting crawl params preview...');
    const params = await firecrawl.crawlParamsPreview(targetUrl, 'find some interesting games');
    console.log('📋 Crawl params preview:', JSON.stringify(params, null, 2));

    console.log('\n🕷️ Starting crawl with limit 1 (just the main page)...');
    
    // Now crawl with our game extraction schema
    const result = await firecrawl.crawl(targetUrl, {
      limit: 1, // Just crawl the main page
      scrapeOptions: {
        formats: [{
          type: "json",
          prompt: "find some interesting games. Extract retro games with their titles, developers, prices, descriptions, and what makes them interesting or retro",
          schema: {
            type: "object",
            properties: {
              pageTitle: { type: "string" },
              totalGamesFound: { type: "number" },
              games: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    developer: { type: "string" },
                    price: { type: "string" },
                    description: { type: "string" },
                    url: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    whyInteresting: { type: "string" },
                    retroAspects: { type: "string" }
                  },
                  required: ["title", "developer", "price"]
                }
              }
            },
            required: ["games"]
          }
        }]
      }
    });

    console.log('\n🎉 Crawl completed!');
    
    if (result.data && result.data.length > 0 && result.data[0].json) {
      const extracted = result.data[0].json;
      
      console.log(`\n📊 Results from: ${extracted.pageTitle || 'Retro Games Page'}`);
      console.log(`🎮 Total games found: ${extracted.totalGamesFound || 'Unknown'}`);
      console.log(`📦 Games extracted: ${extracted.games?.length || 0}\n`);
      
      if (extracted.games && extracted.games.length > 0) {
        console.log('🕹️ INTERESTING RETRO GAMES FOUND:\n');
        
        extracted.games.slice(0, 5).forEach((game, index) => {
          console.log(`${index + 1}. 🎮 ${game.title}`);
          console.log(`   👨‍💻 Developer: ${game.developer}`);
          console.log(`   💰 Price: ${game.price}`);
          if (game.url) console.log(`   🔗 URL: ${game.url}`);
          if (game.description) console.log(`   📝 Description: ${game.description.substring(0, 100)}${game.description.length > 100 ? '...' : ''}`);
          if (game.tags && game.tags.length > 0) console.log(`   🏷️ Tags: ${game.tags.join(', ')}`);
          if (game.whyInteresting) console.log(`   ⭐ Why interesting: ${game.whyInteresting}`);
          if (game.retroAspects) console.log(`   🕰️ Retro aspects: ${game.retroAspects}`);
          console.log('');
        });

        if (extracted.games.length > 5) {
          console.log(`... and ${extracted.games.length - 5} more games!`);
        }
      } else {
        console.log('❌ No games extracted from the page');
      }
    } else {
      console.log('❌ No data returned from crawl');
      console.log('Raw result:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('❌ Error during crawl test:', error.message);
    
    if (error.message?.includes('rate limit')) {
      console.log('💡 Tip: Wait a minute and try again due to rate limiting');
    }
  }

  console.log('\n✅ Crawl test completed!');
}

// Run the test
testCrawlRetroGames().catch(console.error);