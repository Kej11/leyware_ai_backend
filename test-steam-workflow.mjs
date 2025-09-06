import dotenv from 'dotenv';
dotenv.config();

import { SteamSearchTool } from './src/mastra/tools/platform-search/steam-search-tool.ts';

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!FIRECRAWL_API_KEY) {
  console.error('FIRECRAWL_API_KEY not found in environment variables');
  process.exit(1);
}

async function testSteamWorkflow() {
  console.log('🎮 Testing Steam workflow with two-step approach...');
  
  try {
    const mockStrategy = {
      platform: 'steam',
      search_params: {
        pages: ['recentlyreleased'],
        keywords: ['indie', 'action', 'adventure'],
        detailed: true,
        maxResults: 5,
        qualityThreshold: 0.7
      },
      expanded_keywords: ['indie', 'action', 'adventure', 'new', 'demo'],
      reasoning: 'Testing Steam scout workflow with offset=48'
    };

    const steamTool = new SteamSearchTool();
    
    // Step 1: Scrape game listings
    console.log('\n🔍 STEP 1: Scraping game listings...');
    const listings = await steamTool.scrapeGameListings(mockStrategy);
    
    if (listings.length === 0) {
      console.log('❌ No listings found, cannot proceed with detailed scraping test');
      return;
    }

    console.log(`✅ Found ${listings.length} listings`);
    listings.slice(0, 3).forEach((listing, i) => {
      console.log(`  ${i+1}. ${listing.name} - ${listing.link}`);
    });

    // Step 2: Test detailed scraping with just 2 games for efficiency
    console.log('\n🔍 STEP 2: Testing detailed scraping (first 2 games only)...');
    const testUrls = listings.slice(0, 2).map(g => g.link);
    
    const detailedGames = await steamTool.scrapeDetailedGames(testUrls);
    
    console.log(`✅ Detailed scraping complete: ${detailedGames.length}/${testUrls.length} successful`);
    
    detailedGames.forEach((game, i) => {
      console.log(`\n📦 Game ${i+1}: ${game.name || game.title}`);
      console.log(`   Developer: ${game.developer || 'N/A'}`);
      console.log(`   Description: ${game.description?.substring(0, 100) || 'N/A'}...`);
      console.log(`   Tags: ${game.tags?.slice(0, 3).join(', ') || 'N/A'}`);
      console.log(`   Comments: ${game.comments?.length || 0}`);
      if (game.comments?.length > 0) {
        console.log(`   Sample comment: "${game.comments[0].content?.substring(0, 80)}..."`);
      }
    });

    console.log('\n🎉 Steam workflow test completed successfully!');
    
    return {
      listings: listings.length,
      detailed: detailedGames.length,
      totalComments: detailedGames.reduce((sum, g) => sum + (g.comments?.length || 0), 0)
    };

  } catch (error) {
    console.error('❌ Steam workflow test failed:', error);
    throw error;
  }
}

testSteamWorkflow()
  .then(results => {
    if (results) {
      console.log(`\n📊 Summary: ${results.listings} listings → ${results.detailed} detailed games → ${results.totalComments} comments`);
    }
  })
  .catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });