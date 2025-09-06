import dotenv from 'dotenv';
dotenv.config();

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!FIRECRAWL_API_KEY) {
  console.error('FIRECRAWL_API_KEY not found in environment variables');
  process.exit(1);
}

async function scrapeWithDelay(url, options, delay = 2000) {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      ...options
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(data)}`);
  }

  // Add delay to avoid rate limiting
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  return data.data;
}

async function testSteamTwoStep() {
  console.log('🎮 Testing Steam two-step scraping approach...');
  
  try {
    // Step 1: Scrape game listings from Steam demos with offset=48
    console.log('\n🔍 STEP 1: Scraping Steam game listings (offset=48)...');
    
    const listingSchema = {
      type: "object",
      properties: {
        games: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              link: { type: "string" },
              developer: { type: "string" }
            },
            required: ["name", "link"]
          }
        }
      },
      required: ["games"]
    };

    const listingsUrl = 'https://store.steampowered.com/demos/?flavor=recentlyreleased&offset=48';
    const listingsResult = await scrapeWithDelay(listingsUrl, {
      formats: ['json'],
      jsonOptions: { schema: listingSchema }
    });

    if (!listingsResult?.json?.games || listingsResult.json.games.length === 0) {
      console.log('❌ No games found in listings');
      return;
    }

    const games = listingsResult.json.games;
    console.log(`✅ Found ${games.length} games in listings`);
    
    games.slice(0, 5).forEach((game, i) => {
      console.log(`  ${i+1}. ${game.name} - ${game.developer || 'Unknown Dev'}`);
    });

    // Step 2: Scrape detailed information for first 2 games
    console.log('\n🔍 STEP 2: Scraping detailed info for 2 games...');
    
    const testGames = games.slice(0, 2);
    const detailedSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        fullDescription: { type: "string" },
        developer: { type: "string" },
        publisher: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        price: { type: "string" },
        releaseDate: { type: "string" },
        reviews: {
          type: "object",
          properties: {
            overall: { type: "string" },
            totalCount: { type: "number" }
          }
        },
        comments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              author: { type: "string" },
              content: { type: "string" },
              date: { type: "string" },
              helpful: { type: "number" },
              isDevReply: { type: "boolean" },
              playtime: { type: "string" }
            },
            required: ["author", "content"]
          }
        }
      }
    };

    const detailedGames = [];
    
    for (let i = 0; i < testGames.length; i++) {
      const game = testGames[i];
      console.log(`🔍 Scraping ${i+1}/${testGames.length}: ${game.name}`);
      
      try {
        const detailResult = await scrapeWithDelay(game.link, {
          formats: ['json'],
          jsonOptions: { schema: detailedSchema }
        }, 6000); // 6 second delay

        if (detailResult?.json) {
          const detailedGame = {
            name: game.name,
            link: game.link,
            ...detailResult.json
          };
          detailedGames.push(detailedGame);
          console.log(`✅ Successfully scraped: ${detailedGame.title || game.name}`);
        } else {
          console.warn(`⚠️ No detailed data for: ${game.name}`);
        }
      } catch (error) {
        console.error(`❌ Error scraping ${game.name}:`, error.message);
      }
    }

    // Summary
    console.log('\n📊 RESULTS SUMMARY:');
    console.log(`📋 Step 1 - Listings: ${games.length} games found`);
    console.log(`🔍 Step 2 - Detailed: ${detailedGames.length}/${testGames.length} games successfully scraped`);
    
    const totalComments = detailedGames.reduce((sum, g) => sum + (g.comments?.length || 0), 0);
    console.log(`💬 Total comments collected: ${totalComments}`);

    if (detailedGames.length > 0) {
      console.log('\n📦 Sample detailed game:');
      const sample = detailedGames[0];
      console.log(`   Name: ${sample.name}`);
      console.log(`   Developer: ${sample.developer || 'N/A'}`);
      console.log(`   Description: ${sample.description?.substring(0, 100) || 'N/A'}...`);
      console.log(`   Tags: ${sample.tags?.slice(0, 3).join(', ') || 'N/A'}`);
      console.log(`   Reviews: ${sample.reviews?.overall || 'N/A'} (${sample.reviews?.totalCount || 0} reviews)`);
      console.log(`   Comments: ${sample.comments?.length || 0}`);
      
      if (sample.comments?.length > 0) {
        console.log(`   Sample comment: "${sample.comments[0].content?.substring(0, 80)}..."`);
      }
    }

    console.log('\n🎉 Steam two-step approach test completed successfully!');
    return { listings: games.length, detailed: detailedGames.length, comments: totalComments };

  } catch (error) {
    console.error('❌ Steam two-step test failed:', error);
    throw error;
  }
}

testSteamTwoStep()
  .then(results => {
    if (results) {
      console.log(`\n✨ Final Summary: ${results.listings} → ${results.detailed} games → ${results.comments} comments`);
      console.log('🎯 Steam implementation is ready for the intelligent workflow!');
    }
  })
  .catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });