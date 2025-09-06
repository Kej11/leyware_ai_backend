import FirecrawlApp from '@mendable/firecrawl-js';
import { config } from 'dotenv';

// Load environment variables
config();

async function checkForComments() {
  try {
    console.log('🔍 Checking if comments are available on itch.io game pages...');
    
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      console.log('❌ FIRECRAWL_API_KEY not found');
      return;
    }

    const app = new FirecrawlApp({ apiKey });
    
    // Test with one of the games we found earlier
    const testGameUrl = 'https://overboy.itch.io/noobs-are-coming-demo';
    console.log(`📋 Testing URL: ${testGameUrl}\n`);

    // First, do a regular scrape to see raw content
    console.log('📄 Step 1: Raw content scrape...');
    const rawResult = await app.scrape(testGameUrl, {
      formats: ['markdown']
    });

    if (rawResult?.markdown) {
      console.log('✅ Raw scrape successful');
      
      // Look for comment-related keywords
      const markdown = rawResult.markdown.toLowerCase();
      const commentKeywords = [
        'comment', 'comments', 'review', 'reviews', 
        'feedback', 'discussion', 'reply', 'replies',
        'user said', 'wrote', 'posted', 'rating'
      ];
      
      console.log('\n🔍 Searching for comment indicators...');
      const foundKeywords = commentKeywords.filter(keyword => 
        markdown.includes(keyword)
      );
      
      if (foundKeywords.length > 0) {
        console.log(`✅ Found comment-related keywords: ${foundKeywords.join(', ')}`);
        
        // Look for patterns that might indicate comments
        const commentPatterns = [
          /comment[s]?\s*\(/gi,
          /review[s]?\s*\(/gi,
          /\d+\s+comment[s]?/gi,
          /\d+\s+review[s]?/gi,
          /user\s+said/gi,
          /\*\*.*\*\*.*wrote/gi,
          /posted\s+\d+/gi
        ];
        
        console.log('\n📝 Looking for comment patterns...');
        commentPatterns.forEach((pattern, index) => {
          const matches = rawResult.markdown.match(pattern);
          if (matches) {
            console.log(`✅ Pattern ${index + 1} found: ${matches.slice(0, 3).join(', ')}`);
          }
        });
        
        // Show a snippet around comment-related content
        const commentIndex = markdown.indexOf('comment');
        if (commentIndex !== -1) {
          const start = Math.max(0, commentIndex - 100);
          const end = Math.min(rawResult.markdown.length, commentIndex + 300);
          console.log('\n📄 Context around "comment":');
          console.log('...' + rawResult.markdown.substring(start, end) + '...');
        }
        
      } else {
        console.log('❌ No comment-related keywords found');
      }
      
      console.log(`\n📊 Total content length: ${rawResult.markdown.length} characters`);
      
    } else {
      console.log('❌ Raw scrape failed');
      console.log(JSON.stringify(rawResult, null, 2));
      return;
    }

    // Now test with JSON format specifically looking for comments
    console.log('\n📋 Step 2: JSON scrape targeting comments...');
    
    const commentSchema = {
      type: "object",
      properties: {
        hasComments: {
          type: "boolean",
          description: "Whether the page has user comments or reviews"
        },
        commentCount: {
          type: "string", 
          description: "Number of comments if displayed"
        },
        comments: {
          type: "array",
          items: {
            type: "object", 
            properties: {
              author: { type: "string", description: "Comment author name" },
              content: { type: "string", description: "Comment text content" },
              date: { type: "string", description: "Comment date if available" },
              rating: { type: "string", description: "Star rating if given" }
            }
          },
          description: "Array of user comments and reviews"
        },
        communitySection: {
          type: "string",
          description: "Any community/discussion section content"
        }
      }
    };

    const commentResult = await app.scrape(testGameUrl, {
      formats: [{
        type: "json",
        prompt: "Look for user comments, reviews, feedback, or community discussion on this game page. Extract any user-generated content including comments, reviews, ratings, or discussion posts. Include author names, comment text, dates, and any ratings if available.",
        schema: commentSchema
      }]
    });

    console.log('📊 Comment extraction result:');
    console.log(JSON.stringify(commentResult?.json || commentResult, null, 2));

  } catch (error) {
    console.error('❌ Error checking for comments:', error.message);
    console.error('Full error:', error);
  }
}

checkForComments();