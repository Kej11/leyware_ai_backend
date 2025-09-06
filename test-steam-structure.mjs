import dotenv from 'dotenv';
dotenv.config();

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!FIRECRAWL_API_KEY) {
  console.error('FIRECRAWL_API_KEY not found in environment variables');
  process.exit(1);
}

async function testSteamStructure() {
  const steamUrl = 'https://store.steampowered.com/demos/?flavor=recentlyreleased&offset=48';
  
  console.log('🎮 Testing Steam demos page structure...');
  console.log(`📍 URL: ${steamUrl}`);
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: steamUrl,
        formats: ['json'],
        jsonOptions: {
          schema: {
            type: "object",
            properties: {
              demos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    developer: { type: "string" },
                    publisher: { type: "string" },
                    url: { type: "string" },
                    price: { type: "string" },
                    discount: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    description: { type: "string" },
                    releaseDate: { type: "string" },
                    reviews: { type: "string" }
                  },
                  required: ["title", "url"]
                }
              }
            },
            required: ["demos"]
          }
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(data)}`);
    }

    console.log('\n✅ Steam scraping successful!');
    console.log(`📊 Found ${data.data?.demos?.length || 0} demo games`);
    
    if (data.data?.demos?.length > 0) {
      console.log('\n🎲 Sample games:');
      data.data.demos.slice(0, 3).forEach((game, index) => {
        console.log(`\n${index + 1}. ${game.title}`);
        console.log(`   Developer: ${game.developer || 'N/A'}`);
        console.log(`   URL: ${game.url}`);
        console.log(`   Tags: ${game.tags?.join(', ') || 'N/A'}`);
        console.log(`   Description: ${game.description?.substring(0, 100) || 'N/A'}...`);
      });
      
      console.log('\n📝 Full structure sample:');
      console.log(JSON.stringify(data.data.demos[0], null, 2));
    }

    return data.data;

  } catch (error) {
    console.error('❌ Error testing Steam structure:', error.message);
    throw error;
  }
}

testSteamStructure()
  .then(() => console.log('\n🎯 Steam structure analysis complete!'))
  .catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });