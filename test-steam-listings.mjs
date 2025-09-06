import dotenv from 'dotenv';
dotenv.config();

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!FIRECRAWL_API_KEY) {
  console.error('FIRECRAWL_API_KEY not found in environment variables');
  process.exit(1);
}

async function testSteamListings() {
  const url = 'https://store.steampowered.com/demos/?flavor=recentlyreleased&offset=48';
  
  console.log('🎮 Testing Steam listings scrape with offset=48...');
  console.log(`📍 URL: ${url}`);
  
  try {
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

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        formats: ['json'],
        jsonOptions: { schema: listingSchema }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(data)}`);
    }

    console.log('\n✅ Steam listings scraping successful!');
    console.log(`📊 Found ${data.data?.json?.games?.length || 0} games`);
    
    if (data.data?.json?.games?.length > 0) {
      console.log('\n🎲 Sample games:');
      data.data.json.games.slice(0, 5).forEach((game, index) => {
        console.log(`${index + 1}. ${game.name}`);
        console.log(`   Developer: ${game.developer || 'N/A'}`);
        console.log(`   Link: ${game.link}`);
      });
      
      console.log('\n📝 All games found:');
      data.data.json.games.forEach((game, index) => {
        console.log(`${index + 1}. ${game.name} by ${game.developer || 'Unknown'}`);
      });
      
      return data.data.json.games;
    } else {
      console.log('\n📝 Raw data structure:');
      console.log(JSON.stringify(data.data, null, 2));
      return [];
    }

  } catch (error) {
    console.error('❌ Error testing Steam listings:', error.message);
    throw error;
  }
}

testSteamListings()
  .then(games => console.log(`\n🎯 Steam listings test complete! Found ${games.length} games`))
  .catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });