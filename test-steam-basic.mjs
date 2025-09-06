import dotenv from 'dotenv';
dotenv.config();

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!FIRECRAWL_API_KEY) {
  console.error('FIRECRAWL_API_KEY not found in environment variables');
  process.exit(1);
}

async function testSteamBasic() {
  const steamUrl = 'https://store.steampowered.com/demos/?flavor=recentlyreleased';
  
  console.log('🎮 Testing Steam demos basic page...');
  console.log(`📍 URL: ${steamUrl}`);
  
  try {
    // First try JSON with simple schema
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
              games: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    link: { type: "string" },
                    developer: { type: "string" }
                  }
                }
              }
            }
          }
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(data)}`);
    }

    console.log('\n✅ Steam JSON scraping successful!');
    console.log(`📊 Found ${data.data?.games?.length || 0} games`);
    
    if (data.data?.games?.length > 0) {
      console.log('\n🎲 First few games:');
      data.data.games.slice(0, 5).forEach((game, index) => {
        console.log(`${index + 1}. ${game.name} - ${game.link}`);
      });
    } else {
      console.log('\n📝 Raw data structure:');
      console.log(JSON.stringify(data.data, null, 2));
    }

    return data.data;

  } catch (error) {
    console.error('❌ Error testing Steam basic:', error.message);
    
    // Fallback to markdown if JSON fails
    console.log('\n🔄 Trying markdown format...');
    
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: steamUrl,
          formats: ['markdown'],
          onlyMainContent: true
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log('\n✅ Steam markdown scraping successful!');
        console.log('\n📄 Content preview (looking for game entries):');
        const content = data.data.markdown;
        
        // Look for patterns that might indicate games
        const lines = content.split('\n').filter(line => 
          line.includes('Demo') || 
          line.includes('Free') || 
          line.includes('$') ||
          line.toLowerCase().includes('game') ||
          line.toLowerCase().includes('play')
        );
        
        console.log(`Found ${lines.length} potentially relevant lines:`);
        lines.slice(0, 10).forEach((line, index) => {
          console.log(`${index + 1}. ${line.trim()}`);
        });
        
        return { markdown: content };
      }
    } catch (mdError) {
      console.error('❌ Markdown fallback also failed:', mdError.message);
    }
    
    throw error;
  }
}

testSteamBasic()
  .then(() => console.log('\n🎯 Steam basic analysis complete!'))
  .catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });