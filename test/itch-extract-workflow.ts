// Generated script for workflow d7305223-b647-4f48-93d4-dbbb1934b4b1
// Generated at 2025-09-15T23:43:22Z

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Load environment variables from test directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function runWorkflow() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: false,
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    // Initialize Stagehand
    console.log('Initializing Stagehand...');
    await stagehand.init();
    console.log('Stagehand initialized successfully.');

    // Get the page instance
    const page = stagehand.page;
    if (!page) {
      throw new Error('Failed to get page instance from Stagehand');
    }

    // Step 1: Navigate to URL
    // Navigate to URL
    await page.goto("https://itch.io/games");

    // Step 2: Extract data
    // Extract data: Extract ALL the game listings and their details, including game title, developer, description, genre, and price if available.
    const extractedData = await page.extract({
      instruction: `Extract ALL the game listings and their details, including game title, developer, description, genre, and price if available.`,
      schema: z.object({
        list_of_games: z.array(
          z.object({
            title: z.string().optional(),
            developer: z.string().optional(),
            description: z.string().optional(),
            genre: z.string().optional(),
            price: z.string().optional()
          })
        )
      })
    });
    console.log("Extracted:", extractedData);

  } catch (error) {
    console.error('Error during workflow:', error);
  } finally {
    if (stagehand) {
      await stagehand.close();
      console.log('Stagehand closed.');
    }
  }
}

runWorkflow().catch(console.error);