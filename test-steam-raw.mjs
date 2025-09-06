import dotenv from 'dotenv';
dotenv.config();

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!FIRECRAWL_API_KEY) {
  console.error('FIRECRAWL_API_KEY not found in environment variables');
  process.exit(1);
}

async function testSteamRaw() {
  const steamUrl = 'https://store.steampowered.com/demos/?flavor=recentlyreleased&offset=48';
  
  console.log('🎮 Testing Steam demos page raw content...');
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
        formats: ['markdown'],
        onlyMainContent: true
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(data)}`);
    }

    console.log('\n✅ Steam raw scraping successful!');
    console.log('\n📄 Content preview (first 2000 characters):');
    console.log(data.data.markdown.substring(0, 2000));
    console.log('\n...\n');

    return data.data;

  } catch (error) {
    console.error('❌ Error testing Steam raw:', error.message);
    throw error;
  }
}

testSteamRaw()
  .then(() => console.log('\n🎯 Steam raw analysis complete!'))
  .catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });