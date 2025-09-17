import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Stagehand } from "@browserbasehq/stagehand";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from test/.env
dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
  console.log('🧪 Testing Extract Without Schema');
  
  let stagehand;
  
  try {
    // Initialize Stagehand
    stagehand = new Stagehand({
      env: "BROWSERBASE"
    });

    await stagehand.init();
    console.log('✅ Stagehand initialized');

    // Navigate to itch.io games page
    console.log('🌐 Navigating to itch.io/games...');
    await stagehand.page.goto('https://itch.io/games');
    await stagehand.page.waitForLoadState('networkidle');
    console.log('✅ Page loaded');

    // Test 1: Extract with just an instruction (no schema)
    console.log('📊 Test 1: Extract with instruction only...');
    const basicData = await stagehand.page.extract({
      instruction: "Get the titles of the first 3 games visible on this page"
    });

    console.log('✅ Basic extract successful!');
    console.log('📝 Basic Data:', basicData);

    // Test 2: Extract page title and URL
    console.log('\n📊 Test 2: Extract page info...');
    const pageInfo = await stagehand.page.extract({
      instruction: "What is the title of this page and what is the current URL?"
    });

    console.log('✅ Page info extract successful!');
    console.log('📝 Page Info:', pageInfo);

    // Test 3: More structured request but still no schema
    console.log('\n📊 Test 3: Extract structured data without schema...');
    const structuredData = await stagehand.page.extract({
      instruction: "Find the first game on this page and tell me its title, developer, and price. Format as JSON with title, developer, and price fields."
    });

    console.log('✅ Structured extract successful!');
    console.log('📝 Structured Data:', structuredData);
    console.log('📝 Data Type:', typeof structuredData);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Proper cleanup
    console.log('\n🧹 Cleaning up...');
    try {
      if (stagehand) {
        await stagehand.close();
        console.log('✅ Session closed');
      }
    } catch (cleanupError) {
      console.error('❌ Cleanup error:', cleanupError);
    }
  }
}

main();