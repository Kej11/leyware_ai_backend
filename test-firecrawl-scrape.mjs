import FirecrawlApp from '@mendable/firecrawl-js';
import { config } from 'dotenv';

// Load environment variables
config();

async function testScrapeFirst() {
  try {
    console.log('🚀 Testing Firecrawl scrape on itch.io...');
    console.log('📋 Target URL: https://itch.io/games/new-and-popular\n');
    
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('❌ FIRECRAWL_API_KEY not found');
      return;
    }
    
    const firecrawl = new FirecrawlApp({ apiKey });
    
    // First, scrape to see what content we get
    console.log('🔍 Scraping page content...');
    const scrapeResult = await firecrawl.scrape("https://itch.io/games/new-and-popular", {
      formats: ["markdown", "html"]
    });

    console.log('✅ Scrape completed!');
    console.log('📊 Scrape result keys:', Object.keys(scrapeResult || {}));
    
    if (scrapeResult?.success && scrapeResult?.data) {
      console.log('\n📄 Content preview (first 1000 chars of markdown):');
      const markdown = scrapeResult.data.markdown || scrapeResult.data.content || '';
      console.log(markdown.substring(0, 1000) + '...');
      
      console.log('\n🔍 Looking for game-related content...');
      const gameMatches = markdown.match(/game/gi) || [];
      console.log(`Found ${gameMatches.length} instances of "game"`);
      
      // Look for common itch.io patterns
      const titleMatches = markdown.match(/[A-Z][a-zA-Z\s]{2,30}/g) || [];
      console.log(`Found ${titleMatches.length} potential titles`);
      console.log('Sample titles:', titleMatches.slice(0, 10));
    } else {
      console.log('❌ Scrape failed or returned no content');
      console.log('Full result:', JSON.stringify(scrapeResult, null, 2));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

testScrapeFirst();