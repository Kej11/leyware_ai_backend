import 'dotenv/config';
import { mastra } from './src/mastra/index.ts';

async function testScoutWorkflow() {
  console.log('🔍 Testing complete scout search workflow...\n');

  // Test scout IDs from database
  const scouts = {
    reddit: 'a2845bfa-55ec-45ec-98f0-f79c3e2b0433',
    itchio: '644410fb-11e3-482d-bbac-79cb7d0da3f8', 
    steam: 'a537f929-5831-4223-ab2b-e962a81347f0'
  };

  try {
    // Test itch.io scout first - our new implementation
    console.log('🎮 Testing itch.io scout workflow...\n');
    
    const itchioResult = await mastra.workflows.scoutSearchWorkflow.execute({
      scout_id: scouts.itchio
    });

    console.log('✅ Itch.io workflow completed!');
    console.log('📊 Results summary:');
    console.log(`- Total results: ${itchioResult?.results?.length || 0}`);
    
    if (itchioResult?.results?.length > 0) {
      console.log('\n🎮 Sample results:');
      itchioResult.results.slice(0, 3).forEach((result, i) => {
        console.log(`${i + 1}. "${result.title}" by ${result.author}`);
        console.log(`   Platform: ${result.platform} | Score: ${result.engagement_score}`);
        console.log(`   URL: ${result.source_url}\n`);
      });
    }

    // Test Steam scout
    console.log('\n🚂 Testing Steam scout workflow...\n');
    
    const steamResult = await mastra.workflows.scoutSearchWorkflow.execute({
      scout_id: scouts.steam
    });

    console.log('✅ Steam workflow completed!');
    console.log('📊 Results summary:');
    console.log(`- Total results: ${steamResult?.results?.length || 0}`);
    
    if (steamResult?.results?.length > 0) {
      console.log('\n🎮 Sample results:');
      steamResult.results.slice(0, 3).forEach((result, i) => {
        console.log(`${i + 1}. "${result.title}" by ${result.author}`);
        console.log(`   Platform: ${result.platform} | Score: ${result.engagement_score}`);
        console.log(`   URL: ${result.source_url}\n`);
      });
    }

  } catch (error) {
    console.error('❌ Error testing workflow:', error.message);
    console.error('Stack:', error.stack);
  }

  console.log('✅ Scout workflow test completed!');
}

// Run the test
testScoutWorkflow().catch(console.error);