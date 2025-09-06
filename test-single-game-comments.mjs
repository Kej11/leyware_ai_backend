import FirecrawlApp from '@mendable/firecrawl-js';
import { config } from 'dotenv';

// Load environment variables
config();

// Schema for detailed game information including comments
const gameDetailSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "The full game title" },
    developer: { type: "string", description: "Developer/creator name" },
    fullDescription: { type: "string", description: "Complete game description from the game page" },
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
    platforms: {
      type: "array",
      items: { type: "string" },
      description: "Supported platforms (Windows, Mac, Linux, Web, etc.)"
    },
    rating: { type: "string", description: "Game rating or score if available" },
    hasComments: { type: "boolean", description: "Whether the page has user comments" },
    commentCount: { type: "string", description: "Total number of comments if displayed" },
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
      description: "Array of user comments and reviews (limit to first 10-15 most recent)"
    }
  },
  required: ["title", "developer", "fullDescription"]
};

async function testSingleGameComments() {
  try {
    console.log('🚀 Testing comment extraction on a single game...');
    
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('❌ FIRECRAWL_API_KEY not found');
      return;
    }

    const app = new FirecrawlApp({ apiKey });
    
    // Test with CHARK - should have some comments
    const testGameUrl = 'https://protzz.itch.io/chark';
    console.log(`📋 Testing URL: ${testGameUrl}\n`);

    console.log('🔍 Extracting game details with comments...');
    
    const detailResult = await app.scrape(testGameUrl, {
      formats: [{
        type: "json",
        prompt: "Extract comprehensive game information from this itch.io game page. Include full description, screenshots, tags, rating, supported platforms, and user comments. For comments, include author names, comment text, dates, and identify if comments are from the game developer. Limit to the 10-15 most recent comments.",
        schema: gameDetailSchema
      }]
    });

    if (!detailResult?.json) {
      console.log('❌ Failed to extract game details');
      console.log('Raw result:', JSON.stringify(detailResult, null, 2));
      return;
    }

    const game = detailResult.json;
    
    console.log('✅ Extraction successful!');
    console.log('\n🎮 Game Details:');
    console.log(`🎯 Title: ${game.title}`);
    console.log(`👨‍💻 Developer: ${game.developer}`);
    console.log(`📝 Description: ${game.fullDescription?.substring(0, 300)}...`);
    console.log(`🏷️  Tags: ${game.tags?.join(', ') || 'N/A'}`);
    console.log(`💻 Platforms: ${game.platforms?.join(', ') || 'N/A'}`);
    console.log(`⭐ Rating: ${game.rating || 'N/A'}`);
    console.log(`🖼️  Screenshots: ${game.screenshots?.length || 0} found`);
    
    console.log(`\n💬 Comments Section:`);
    console.log(`📊 Has Comments: ${game.hasComments ? 'Yes' : 'No'}`);
    console.log(`📊 Comment Count: ${game.commentCount || 'N/A'}`);
    console.log(`📊 Comments Retrieved: ${game.comments?.length || 0}`);

    if (game.comments && game.comments.length > 0) {
      console.log(`\n🗨️  Comments (showing all ${game.comments.length}):`);
      game.comments.forEach((comment, idx) => {
        const devFlag = comment.isDevReply ? ' 👨‍💻 [DEVELOPER]' : '';
        console.log(`\n   ${idx + 1}. ${comment.author}${devFlag}`);
        console.log(`      📅 ${comment.date || 'unknown date'}`);
        console.log(`      💭 "${comment.content}"`);
      });
    } else {
      console.log('❌ No comments found or extracted');
    }

    console.log('\n🎉 Single game comment test completed!');

  } catch (error) {
    console.error('❌ Error during single game test:', error.message);
    console.error('Full error:', error);
  }
}

testSingleGameComments();