import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';

// Load environment variables from test directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function testScrollAndPagination() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: false,
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    console.log('🚀 Initializing Stagehand...');
    await stagehand.init();
    console.log('✅ Stagehand initialized successfully.\n');

    const page = stagehand.page;
    if (!page) {
      throw new Error('Failed to get page instance from Stagehand');
    }

    console.log('📍 Navigating to itch.io/games...');
    await page.goto("https://itch.io/games");
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded\n');

    // Test 1: Get initial games
    console.log('=' + '='.repeat(50));
    console.log('TEST 1: Initial page load');
    console.log('=' + '='.repeat(50));
    
    let initialGames = await page.extract({
      instruction: "Extract all game URLs currently visible on the page",
      schema: z.object({
        games: z.array(z.object({
          title: z.string(),
          url: z.string()
        }))
      })
    });
    
    console.log(`📊 Initial games found: ${initialGames.games.length}`);

    // Test 2: Try scrolling with Playwright methods
    console.log('\n' + '='.repeat(50));
    console.log('TEST 2: Scroll to bottom using Playwright');
    console.log('=' + '='.repeat(50));
    
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000); // Wait for any lazy loading
    
    let afterScrollGames = await page.extract({
      instruction: "Extract all game URLs now visible on the page after scrolling",
      schema: z.object({
        games: z.array(z.object({
          title: z.string(),
          url: z.string()
        }))
      })
    });
    
    console.log(`📊 After scroll games found: ${afterScrollGames.games.length}`);
    console.log(`📊 New games loaded: ${afterScrollGames.games.length - initialGames.games.length}`);

    // Test 3: Check for pagination elements
    console.log('\n' + '='.repeat(50));
    console.log('TEST 3: Look for pagination controls');
    console.log('=' + '='.repeat(50));
    
    const paginationInfo = await page.extract({
      instruction: "Look for pagination controls, 'Load More' buttons, or infinite scroll indicators. Also check if there's a page number or next page button.",
      schema: z.object({
        hasPagination: z.boolean(),
        hasLoadMoreButton: z.boolean(),
        hasInfiniteScroll: z.boolean(),
        nextPageUrl: z.string().nullable().optional(),
        currentPage: z.number().nullable().optional(),
        totalPages: z.number().nullable().optional(),
        paginationText: z.string().nullable().optional()
      })
    });
    
    console.log('📊 Pagination info:', paginationInfo);

    // Test 4: Try to click "Load More" or pagination if it exists
    if (paginationInfo.hasLoadMoreButton || paginationInfo.hasPagination) {
      console.log('\n' + '='.repeat(50));
      console.log('TEST 4: Interact with pagination');
      console.log('=' + '='.repeat(50));
      
      try {
        const paginationElements = await page.observe({
          instruction: "Find the 'Load More' button, 'Next Page' link, or any pagination control"
        });
        
        if (paginationElements.length > 0) {
          console.log(`Found ${paginationElements.length} pagination elements`);
          console.log('Clicking first pagination element...');
          
          await page.act({
            action: paginationElements[0].selector
          });
          
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);
          
          const afterPaginationGames = await page.extract({
            instruction: "Extract all game URLs after pagination",
            schema: z.object({
              games: z.array(z.object({
                title: z.string(),
                url: z.string()
              }))
            })
          });
          
          console.log(`📊 After pagination: ${afterPaginationGames.games.length} games`);
        }
      } catch (error) {
        console.log('Could not interact with pagination:', error.message);
      }
    }

    // Test 5: Test extract() limits with a large request
    console.log('\n' + '='.repeat(50));
    console.log('TEST 5: Test extract() with large array request');
    console.log('=' + '='.repeat(50));
    
    const largeExtract = await page.extract({
      instruction: "Extract up to 100 games if available. Get as many as you can find.",
      schema: z.object({
        games: z.array(z.object({
          title: z.string(),
          url: z.string()
        })),
        actualCount: z.number(),
        couldGetMore: z.boolean()
      })
    });
    
    console.log(`📊 Large extract found: ${largeExtract.games.length} games`);
    console.log(`📊 Actual count reported: ${largeExtract.actualCount}`);
    console.log(`📊 Could get more: ${largeExtract.couldGetMore}`);

    // Test 6: Try multiple scroll attempts
    console.log('\n' + '='.repeat(50));
    console.log('TEST 6: Multiple scroll attempts');
    console.log('=' + '='.repeat(50));
    
    let allGames = new Map();
    initialGames.games.forEach(g => allGames.set(g.url, g));
    
    for (let i = 0; i < 3; i++) {
      console.log(`\nScroll attempt ${i + 1}...`);
      
      // Scroll down
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
      });
      
      await page.waitForTimeout(2000);
      
      const scrollGames = await page.extract({
        instruction: "Extract all game URLs currently visible",
        schema: z.object({
          games: z.array(z.object({
            title: z.string(),
            url: z.string()
          }))
        })
      });
      
      let newGames = 0;
      scrollGames.games.forEach(g => {
        if (!allGames.has(g.url)) {
          allGames.set(g.url, g);
          newGames++;
        }
      });
      
      console.log(`  Found ${scrollGames.games.length} games, ${newGames} new`);
      console.log(`  Total unique games: ${allGames.size}`);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 FINAL SUMMARY:');
    console.log('=' + '='.repeat(50));
    console.log(`Initial page load: ${initialGames.games.length} games`);
    console.log(`After single scroll: ${afterScrollGames.games.length} games`);
    console.log(`After multiple scrolls: ${allGames.size} unique games total`);
    console.log(`\nPagination available: ${paginationInfo.hasPagination}`);
    console.log(`Load More button: ${paginationInfo.hasLoadMoreButton}`);
    console.log(`Infinite scroll: ${paginationInfo.hasInfiniteScroll}`);

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    if (stagehand) {
      await stagehand.close();
      console.log('\n🧹 Stagehand closed.');
    }
  }
}

testScrollAndPagination().catch(console.error);