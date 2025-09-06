import FirecrawlApp from '@mendable/firecrawl-js';
import { config } from 'dotenv';

// Load environment variables
config();

async function testFirecrawlExtract() {
  try {
    console.log('🚀 Starting Firecrawl extract test for itch.io games...');
    console.log('📋 Target URL: https://itch.io/games/new-and-popular');
    console.log('🎯 Goal: Extract detailed information for 5 games\n');
    
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('❌ FIRECRAWL_API_KEY environment variable is not set');
      console.log('\n📝 To run this test:');
      console.log('1. Copy .env.example to .env');
      console.log('2. Add your Firecrawl API key from https://firecrawl.dev');
      console.log('3. Run: node test-firecrawl-extract.mjs\n');
      
      console.log('🔧 Test Configuration:');
      console.log('The test is configured to extract the following data for each game:');
      console.log('- Title');
      console.log('- Developer');
      console.log('- Price');
      console.log('- Description');
      console.log('- Tags');
      console.log('- Game page URL');
      console.log('- Cover image URL\n');
      
      return;
    }
    
    const firecrawl = new FirecrawlApp({ apiKey });
    
    // Define the schema for extracting game information
    const gameSchema = {
      type: "object",
      properties: {
        games: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "The game title" },
              developer: { type: "string", description: "The game developer/creator" },
              price: { type: "string", description: "The game price or 'Free' if free" },
              description: { type: "string", description: "Brief description or tagline of the game" },
              tags: { 
                type: "array", 
                items: { type: "string" },
                description: "Game tags or categories"
              },
              url: { type: "string", description: "Link to the game page" },
              imageUrl: { type: "string", description: "Game cover image URL" }
            },
            required: ["title", "developer", "price"]
          },
          maxItems: 5,
          description: "Array of exactly 5 games with detailed information"
        }
      },
      required: ["games"]
    };

    const extractResult = await firecrawl.extract({
      urls: ["https://itch.io/games/new-and-popular"],
      prompt: "Extract detailed information for exactly 5 games from this page. Include title, developer, price, description, tags, game page URL, and cover image URL for each game. Focus on the most prominent/featured games.",
      schema: gameSchema
    });

    console.log('✅ Extract completed successfully!');
    console.log('📊 Raw extract result structure:');
    console.log('Keys:', Object.keys(extractResult || {}));
    console.log('Has data:', !!extractResult?.data);
    console.log('Data keys:', extractResult?.data ? Object.keys(extractResult.data) : 'N/A');
    console.log('\n📊 Extracted data:');
    
    console.log('Full data object:', JSON.stringify(extractResult.data, null, 2));
    
    if (extractResult?.data?.games && extractResult.data.games.length > 0) {
      console.log(`Found ${extractResult.data.games.length} games`);
      extractResult.data.games.forEach((game, index) => {
        console.log(`\n🎮 Game ${index + 1}:`);
        console.log(`  Title: ${game.title || 'N/A'}`);
        console.log(`  Developer: ${game.developer || 'N/A'}`);
        console.log(`  Price: ${game.price || 'N/A'}`);
        console.log(`  Description: ${game.description || 'N/A'}`);
        console.log(`  Tags: ${game.tags?.join(', ') || 'N/A'}`);
        console.log(`  URL: ${game.url || 'N/A'}`);
        console.log(`  Image: ${game.imageUrl || 'N/A'}`);
      });
      
      console.log(`\n📈 Summary:`);
      console.log(`- Total games extracted: ${extractResult.data.games.length}`);
      console.log(`- Tokens used: ${extractResult.tokensUsed || 'N/A'}`);
      console.log(`- Status: ${extractResult.status || 'N/A'}`);
    } else {
      console.log('❌ No games data found in extract result');
      console.log('Raw result:', JSON.stringify(extractResult, null, 2));
    }

  } catch (error) {
    console.error('❌ Error during extract test:', error.message);
    console.error('Full error:', error);
  }
}

testFirecrawlExtract();