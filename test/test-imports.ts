import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('Stagehand imported:', !!Stagehand);
console.log('Zod imported:', !!z);
console.log('Zod schema test:', typeof z.object === 'function');
console.log('API Key available:', !!process.env.OPENAI_API_KEY);

// Test a simple schema
const testSchema = z.object({
  test: z.string()
});

console.log('Schema created:', !!testSchema);

// Test extract capability
console.log('Testing Stagehand with Zod schema...');

const testFunc = async () => {
  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: true,
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  try {
    await stagehand.init();
    const page = stagehand.page;
    
    if (page) {
      console.log('✅ Stagehand initialized successfully');
      await page.goto("about:blank");
      
      // Test extract with schema
      const result = await page.extract({
        instruction: "Return a test value",
        schema: z.object({
          test: z.string().default("success")
        })
      });
      
      console.log('✅ Extract worked:', result);
    }
    
    await stagehand.close();
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    await stagehand.close();
  }
};

testFunc();