/**
 * Google Search MCP Server - Search Logic
 * 
 * Connects to existing Chromium via CDP to perform Google searches.
 * Shares cookies and localStorage with the browser for authenticated searches.
 */

import { chromium, Browser, Page } from "playwright";
import { SearchResponse, SearchResult, HtmlResponse, SearchOptions, SafeSearch, TimeRange, SearchType } from "./types.js";

const CDP_ENDPOINT = "http://127.0.0.1:9222";
const GOOGLE_DOMAIN = "https://www.google.com";

/**
 * Build Google search URL with all parameters
 */
function buildSearchUrl(query: string, options: SearchOptions): string {
  const url = new URL("/search", GOOGLE_DOMAIN);
  
  // Build query with modifiers
  let finalQuery = query;
  
  // Add exact phrase if specified
  if (options.exactPhrase) {
    finalQuery = `"${options.exactPhrase}" ${finalQuery}`;
  }
  
  // Add site restriction if specified
  if (options.site) {
    finalQuery = `site:${options.site} ${finalQuery}`;
  }
  
  // Add file type if specified
  if (options.fileType) {
    finalQuery = `filetype:${options.fileType} ${finalQuery}`;
  }
  
  // Add exclude terms if specified
  if (options.excludeTerms && options.excludeTerms.length > 0) {
    finalQuery = `${finalQuery} ${options.excludeTerms.map(t => `-${t}`).join(' ')}`;
  }
  
  url.searchParams.set("q", finalQuery.trim());
  
  // Safe search parameter
  if (options.safe) {
    const safeMap: Record<SafeSearch, string> = {
      [SafeSearch.OFF]: "off",
      [SafeSearch.MEDIUM]: "medium",
      [SafeSearch.HIGH]: "high"
    };
    url.searchParams.set("safe", safeMap[options.safe]);
  }
  
  // Language parameter (hl = host language, lr = language restrict)
  if (options.language) {
    url.searchParams.set("hl", options.language);
    url.searchParams.set("lr", `lang_${options.language}`);
  }
  
  // Region/country parameter (gl = geolocation, cr = country restrict)
  if (options.region) {
    url.searchParams.set("gl", options.region);
    url.searchParams.set("cr", `country${options.region.toUpperCase()}`);
  }
  
  // Time range parameter (tbs = time based search)
  if (options.timeRange && options.timeRange !== TimeRange.ANY) {
    url.searchParams.set("tbs", `qdr:${options.timeRange}`);
  }
  
  // Search type parameter (tbm = to be matched)
  if (options.searchType && options.searchType !== SearchType.ALL) {
    const typeMap: Record<string, string> = {
      [SearchType.IMAGES]: "isch",
      [SearchType.NEWS]: "nws",
      [SearchType.VIDEOS]: "vid",
      [SearchType.SHOPPING]: "shop"
    };
    if (typeMap[options.searchType]) {
      url.searchParams.set("tbm", typeMap[options.searchType]);
    }
  }
  
  return url.toString();
}

// CAPTCHA verification timeout (2 minutes for user to complete)
const CAPTCHA_WAIT_TIMEOUT = 120000;

/**
 * Connect to existing Chromium CDP instance
 */
async function connectBrowser(): Promise<Browser> {
  return await chromium.connectOverCDP(CDP_ENDPOINT);
}

/**
 * Check if URL indicates CAPTCHA or bot detection page
 */
function isBlockedUrl(url: string): boolean {
  const sorryPatterns = [
    "google.com/sorry",
    "recaptcha",
    "captcha",
    "unusual traffic",
  ];
  return sorryPatterns.some(pattern => url.toLowerCase().includes(pattern));
}

/**
 * Wait for CAPTCHA verification to complete
 * Returns the URL where verification is needed
 */
async function waitForCaptchaVerification(page: Page, captchaUrl: string): Promise<void> {
  console.log(`[google-search] CAPTCHA detected at: ${captchaUrl}`);
  console.log(`[google-search] Please complete verification in webtop browser (https://webtopdev.nx.run)`);
  console.log(`[google-search] Waiting up to ${CAPTCHA_WAIT_TIMEOUT / 1000} seconds for verification...`);
  
  // Wait for URL to change away from CAPTCHA page
  await page.waitForURL(
    url => !isBlockedUrl(url.toString()),
    { timeout: CAPTCHA_WAIT_TIMEOUT }
  );
  
  console.log(`[google-search] Verification completed, continuing...`);
}

/**
 * Extract search results from page
 */
async function extractSearchResults(page: Page, limit: number): Promise<SearchResult[]> {
  return await page.evaluate((maxResults: number): SearchResult[] => {
    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();

    // Selector sets ordered by priority
    const selectorSets = [
      { container: '#search div[data-hveid]', title: 'h3', snippet: '.VwiC3b' },
      { container: '#rso div[data-hveid]', title: 'h3', snippet: '[data-sncf="1"]' },
      { container: '.g', title: 'h3', snippet: 'div[style*="webkit-line-clamp"]' },
      { container: 'div[jscontroller][data-hveid]', title: 'h3', snippet: 'div[role="text"]' }
    ];

    // Alternative snippet selectors
    const alternativeSnippetSelectors = [
      '.VwiC3b',
      '[data-sncf="1"]',
      'div[style*="webkit-line-clamp"]',
      'div[role="text"]'
    ];

    // Try each selector set
    for (const selectors of selectorSets) {
      if (results.length >= maxResults) break;

      const containers = document.querySelectorAll(selectors.container);

      for (const container of containers) {
        if (results.length >= maxResults) break;

        const titleElement = container.querySelector(selectors.title);
        if (!titleElement) continue;

        const title = (titleElement.textContent || "").trim();

        // Find link
        let link = '';
        const linkInTitle = titleElement.querySelector('a');
        if (linkInTitle) {
          link = linkInTitle.href;
        } else {
          let current: Element | null = titleElement;
          while (current && current.tagName !== 'A') {
            current = current.parentElement;
          }
          if (current && current instanceof HTMLAnchorElement) {
            link = current.href;
          } else {
            const containerLink = container.querySelector('a');
            if (containerLink) {
              link = containerLink.href;
            }
          }
        }

        // Filter invalid or duplicate links
        if (!link || !link.startsWith('http') || seenUrls.has(link)) continue;

        // Find snippet
        let snippet = '';
        const snippetElement = container.querySelector(selectors.snippet);
        if (snippetElement) {
          snippet = (snippetElement.textContent || "").trim();
        } else {
          for (const altSelector of alternativeSnippetSelectors) {
            const element = container.querySelector(altSelector);
            if (element) {
              snippet = (element.textContent || "").trim();
              break;
            }
          }

          // Fallback: find text in container
          if (!snippet) {
            const textNodes = Array.from(container.querySelectorAll('div')).filter((el: Element) =>
              !el.querySelector('h3') &&
              (el.textContent || "").trim().length > 20
            );
            if (textNodes.length > 0) {
              snippet = (textNodes[0].textContent || "").trim();
            }
          }
        }

        if (title && link) {
          results.push({ title, link, snippet });
          seenUrls.add(link);
        }
      }
    }
    
    // Fallback: generic anchor search
    if (results.length < maxResults) {
      const anchorElements = Array.from(document.querySelectorAll("a[href^='http']"));
      for (const el of anchorElements) {
        if (results.length >= maxResults) break;

        if (!(el instanceof HTMLAnchorElement)) continue;
        
        const link = el.href;
        if (!link || seenUrls.has(link) || 
            link.includes("google.com/") || 
            link.includes("accounts.google") || 
            link.includes("support.google")) {
          continue;
        }

        const title = (el.textContent || "").trim();
        if (!title) continue;

        // Get surrounding text as snippet
        let snippet = "";
        let parent = el.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          const text = (parent.textContent || "").trim();
          if (text.length > 20 && text !== title) {
            snippet = text;
            break;
          }
          parent = parent.parentElement;
        }

        results.push({ title, link, snippet });
        seenUrls.add(link);
      }
    }

    return results.slice(0, maxResults);
  }, limit);
}

/**
 * Perform Google search and return results
 * 
 * @param query - Search keywords
 * @param options - Search options
 * @returns Search response with results
 */
export async function googleSearch(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const { limit = 10, timeout = 30000 } = options;
  
  const browser = await connectBrowser();
  
  // Get default context (shares cookies and localStorage with browser)
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("No browser context available. Is Chromium running?");
  }
  
  const page = await context.newPage();
  
  try {
    // Build search URL with all parameters
    const searchUrl = buildSearchUrl(query, options);
    console.log(`[google-search] Searching: ${searchUrl}`);
    
    // Navigate directly to search URL
    await page.goto(searchUrl, { timeout, waitUntil: "networkidle" });
    
    // Check for bot detection and wait for verification if needed
    if (isBlockedUrl(page.url())) {
      await waitForCaptchaVerification(page, page.url());
      // After verification, try search again
      await page.goto(searchUrl, { timeout, waitUntil: "networkidle" });
    }
    
    // Wait for search results container
    const resultSelectors = ["#search", "#rso", ".g"];
    let resultsFound = false;
    for (const selector of resultSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: timeout / 2 });
        resultsFound = true;
        break;
      } catch {
        // Try next selector
      }
    }
    
    if (!resultsFound) {
      // Check if we're blocked again
      if (isBlockedUrl(page.url())) {
        await waitForCaptchaVerification(page, page.url());
        await page.waitForLoadState("networkidle", { timeout });
      } else {
        console.warn("[google-search] Could not find standard result containers, attempting extraction anyway");
      }
    }
    
    // Small delay for dynamic content
    await page.waitForTimeout(500);
    
    // Extract results
    const results = await extractSearchResults(page, limit);
    
    console.log(`[google-search] Found ${results.length} results`);
    
    return { query, results };
  } finally {
    // Close only the page, keep browser and context alive
    await page.close();
  }
}

/**
 * Get raw HTML content of Google search results page
 * 
 * @param query - Search keywords
 * @param options - Search options
 * @returns HTML response with cleaned content
 */
export async function getGoogleSearchPageHtml(
  query: string,
  options: SearchOptions = {}
): Promise<HtmlResponse> {
  const { timeout = 30000 } = options;
  
  const browser = await connectBrowser();
  
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("No browser context available. Is Chromium running?");
  }
  
  const page = await context.newPage();
  
  try {
    // Build search URL with all parameters
    const searchUrl = buildSearchUrl(query, options);
    console.log(`[google-search-html] Getting HTML for: ${searchUrl}`);
    
    // Navigate directly to search URL
    await page.goto(searchUrl, { timeout, waitUntil: "networkidle" });
    
    // Check for bot detection and wait for verification if needed
    if (isBlockedUrl(page.url())) {
      await waitForCaptchaVerification(page, page.url());
      await page.goto(searchUrl, { timeout, waitUntil: "networkidle" });
    }
    
    // Wait for page to stabilize
    await page.waitForTimeout(1000);
    await page.waitForLoadState("networkidle", { timeout });
    
    // Get full HTML
    const fullHtml = await page.content();
    
    // Clean HTML: remove CSS and JavaScript
    let html = fullHtml
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*>/gi, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    console.log(`[google-search-html] HTML size: ${fullHtml.length} -> ${html.length} (cleaned)`);
    
    return {
      query,
      html,
      url: page.url(),
      originalHtmlLength: fullHtml.length
    };
  } finally {
    await page.close();
  }
}
