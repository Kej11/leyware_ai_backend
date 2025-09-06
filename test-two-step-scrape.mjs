import FirecrawlApp from '@mendable/firecrawl-js';
import { config } from 'dotenv';

// Load environment variables
config();

// Schema for Step 1: Game listing from main page
const gameListingSchema = {
  type: "object",
  properties: {
    games: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { 
            type: "string", 
            description: "The game title" 
          },
          developer: { 
            type: "string", 
            description: "The game developer/creator name" 
          },
          url: { 
            type: "string", 
            description: "Full URL to the game's individual page on itch.io" 
          },
          price: { 
            type: "string", 
            description: "Game price (e.g. '$5', 'Free', '$0')" 
          },
          genre: { 
            type: "string", 
            description: "Primary game genre or category" 
          },
          description: { 
            type: "string", 
            description: "Brief game description or tagline from the listing" 
          }
        },
        required: ["title", "developer", "url"]
      },
      maxItems: 5,
      description: "Array of up to 5 games from the itch.io listing page"
    }
  },
  required: ["games"]
};

// Schema for Step 2: Detailed game information from individual pages
const gameDetailSchema = {
  type: "object",
  properties: {
    title: { 
      type: "string", 
      description: "The full game title" 
    },
    developer: { 
      type: "string", 
      description: "Developer/creator name" 
    },
    fullDescription: { 
      type: "string", 
      description: "Complete game description from the game page" 
    },
    screenshots: { 
      type: "array", 
      items: { type: "string" },
      description: "Array of screenshot/image URLs" 
    },
    tags: { 
      type: "array", 
      items: { type: "string" },
      description: "Game tags, genres, and categories" 
    },
    systemRequirements: { 
      type: "string", 
      description: "System requirements if available" 
    },
    releaseDate: { 
      type: "string", 
      description: "Game release date" 
    },
    downloadCount: { 
      type: "string", 
      description: "Number of downloads if visible" 
    },
    rating: { 
      type: "string", 
      description: "Game rating or score if available" 
    },
    platforms: {
      type: "array",
      items: { type: "string" },
      description: "Supported platforms (Windows, Mac, Linux, Web, etc.)"
    },
    fileSize: {
      type: "string",
      description: "Download file size if available"
    },
    hasComments: {
      type: "boolean",
      description: "Whether the page has user comments"
    },
    commentCount: {
      type: "string", 
      description: "Total number of comments if displayed"
    },
    comments: {
      type: "array",
      items: {
        type: "object", 
        properties: {
          author: { type: "string", description: "Comment author name" },
          content: { type: "string", description: "Comment text content" },
          date: { type: "string", description: "Comment date (relative, e.g. '2 days ago')" },
          isDevReply: { type: "boolean", description: "True if comment is from the game developer" }
        },
        required: ["author", "content"]
      },
      description: "Array of user comments and reviews (limit to first 10-20 most recent)"
    }
  },
  required: ["title", "developer", "fullDescription"]
};

async function testTwoStepScrape() {
  try {
    console.log('🚀 Starting two-step Firecrawl scraping test...');
    console.log('📋 Target URL: https://itch.io/games/new-and-popular');
    console.log('🎯 Goal: Extract 5 games, then get detailed info for each\n');

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('❌ FIRECRAWL_API_KEY not found');
      return;
    }

    const app = new FirecrawlApp({ apiKey });
    const itchUrl = 'https://itch.io/games/new-and-popular';

    // STEP 1: Scrape game listing with JSON format
    console.log('📋 Step 1: Scraping game listing...');
    const listingResult = await app.scrape(itchUrl, {
      formats: [{
        type: "json",
        prompt: "Extract up to 5 games from this Itch.io page. For each game, get the title, developer, full URL to the game page, price, primary genre, and brief description. Focus on the most prominent games displayed.",
        schema: gameListingSchema
      }]
    });

    console.log('✅ Step 1 completed!');
    
    if (!listingResult?.json?.games || listingResult.json.games.length === 0) {
      console.log('❌ No games found in listing');
      console.log('Raw result:', JSON.stringify(listingResult, null, 2));
      return;
    }

    const pageGames = listingResult.json.games;
    console.log(`📊 Found ${pageGames.length} games:`);
    
    pageGames.forEach((game, index) => {
      console.log(`  ${index + 1}. ${game.title} by ${game.developer} (${game.price || 'N/A'})`);
      console.log(`     URL: ${game.url || 'N/A'}`);
      console.log(`     Genre: ${game.genre || 'N/A'}`);
      console.log(`     Description: ${game.description || 'N/A'}`);
      console.log('');
    });

    // STEP 2: Get detailed information for each game
    console.log('\n🔍 Step 2: Getting detailed information for each game...');
    const detailedGames = [];

    for (let i = 0; i < pageGames.length; i++) {
      const game = pageGames[i];
      
      if (!game.url) {
        console.log(`⚠️  Skipping ${game.title} - no URL provided`);
        continue;
      }

      console.log(`\n📱 Processing ${i + 1}/${pageGames.length}: ${game.title}`);
      console.log(`🔗 URL: ${game.url}`);

      // Rate limiting - wait 6 seconds between requests
      if (i > 0) {
        console.log('⏳ Rate limiting: waiting 6 seconds...');
        await new Promise(resolve => setTimeout(resolve, 6000));
      }

      try {
        const detailResult = await app.scrape(game.url, {
          formats: [{
            type: "json",
            prompt: "Extract comprehensive game information from this itch.io game page. Include full description, screenshots, tags, system requirements, release date, download count, rating, supported platforms, file size, and user comments. For comments, include author names, comment text, dates, and identify if comments are from the game developer. Limit to the 10-15 most recent comments.",
            schema: gameDetailSchema
          }]
        });

        if (detailResult?.json) {
          detailedGames.push({
            ...game, // Include original listing info
            details: detailResult.json
          });
          console.log(`✅ Successfully scraped details for ${game.title}`);
        } else {
          console.log(`❌ Failed to get details for ${game.title}`);
          console.log('Detail result:', JSON.stringify(detailResult, null, 2));
        }

      } catch (error) {
        console.error(`❌ Error scraping ${game.title}:`, error.message);
      }
    }

    // Display final results
    console.log('\n🎉 Two-step scraping completed!');
    console.log(`📊 Summary: ${detailedGames.length}/${pageGames.length} games successfully detailed\n`);

    detailedGames.forEach((game, index) => {
      console.log(`🎮 Game ${index + 1}: ${game.details.title || game.title}`);
      console.log(`👨‍💻 Developer: ${game.details.developer || game.developer}`);
      console.log(`💰 Price: ${game.price || 'N/A'}`);
      console.log(`🎯 Genre: ${game.genre || 'N/A'}`);
      console.log(`📝 Description: ${(game.details.fullDescription || game.description || '').substring(0, 200)}...`);
      console.log(`🏷️  Tags: ${game.details.tags?.join(', ') || 'N/A'}`);
      console.log(`💻 Platforms: ${game.details.platforms?.join(', ') || 'N/A'}`);
      console.log(`📅 Release Date: ${game.details.releaseDate || 'N/A'}`);
      console.log(`⬇️  Downloads: ${game.details.downloadCount || 'N/A'}`);
      console.log(`⭐ Rating: ${game.details.rating || 'N/A'}`);
      console.log(`📦 File Size: ${game.details.fileSize || 'N/A'}`);
      console.log(`🖼️  Screenshots: ${game.details.screenshots?.length || 0} found`);
      console.log(`💬 Comments: ${game.details.commentCount || game.details.comments?.length || 'N/A'}`);
      
      // Show first few comments if available
      if (game.details.comments && game.details.comments.length > 0) {
        console.log(`\n   🗨️  Recent Comments (showing first 3):`);
        game.details.comments.slice(0, 3).forEach((comment, idx) => {
          const devFlag = comment.isDevReply ? ' 👨‍💻 [DEV]' : '';
          console.log(`     ${idx + 1}. ${comment.author}${devFlag} (${comment.date || 'unknown date'}):`);
          console.log(`        "${(comment.content || '').substring(0, 100)}..."`);
        });
      }
      
      console.log(`🔗 URL: ${game.url}`);
      console.log(''.padEnd(80, '-'));
    });

  } catch (error) {
    console.error('❌ Error during two-step scraping:', error.message);
    console.error('Full error:', error);
  }
}

testTwoStepScrape();