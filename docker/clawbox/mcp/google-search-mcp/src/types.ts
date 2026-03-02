/**
 * Google Search MCP Server - Type Definitions
 */

/**
 * Single search result
 */
export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

/**
 * Search response
 */
export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

/**
 * HTML response for raw page content
 */
export interface HtmlResponse {
  query: string;
  html: string;
  url: string;
  originalHtmlLength?: number;
}

/**
 * Safe Search levels
 */
export enum SafeSearch {
  OFF = "off",
  MEDIUM = "medium",
  HIGH = "high"
}

/**
 * Time range filter for search results
 */
export enum TimeRange {
  ANY = "any",        // No time filter
  HOUR = "h",         // Past hour
  DAY = "d",          // Past 24 hours
  WEEK = "w",         // Past week
  MONTH = "m",        // Past month
  YEAR = "y"          // Past year
}

/**
 * Search type (vertical search)
 */
export enum SearchType {
  ALL = "all",        // Regular web search
  IMAGES = "images",  // Image search
  NEWS = "news",      // News search
  VIDEOS = "videos",  // Video search
  SHOPPING = "shopping" // Shopping search
}

/**
 * Common language codes for Google search
 */
export const LANGUAGE_CODES = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ar: "Arabic",
  hi: "Hindi",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian"
} as const;

/**
 * Common country/region codes for Google search
 */
export const REGION_CODES = {
  us: "United States",
  gb: "United Kingdom",
  ca: "Canada",
  au: "Australia",
  de: "Germany",
  fr: "France",
  es: "Spain",
  it: "Italy",
  br: "Brazil",
  mx: "Mexico",
  jp: "Japan",
  kr: "South Korea",
  cn: "China",
  in: "India",
  ru: "Russia",
  nl: "Netherlands",
  se: "Sweden",
  no: "Norway",
  dk: "Denmark",
  fi: "Finland"
} as const;

/**
 * Search options
 */
export interface SearchOptions {
  limit?: number;
  timeout?: number;
  /** Safe search level: off, medium, high */
  safe?: SafeSearch;
  /** Language code for results (e.g., 'en', 'es', 'ja') */
  language?: string;
  /** Region/country code (e.g., 'us', 'gb', 'jp') */
  region?: string;
  /** Time range filter */
  timeRange?: TimeRange;
  /** Search type (web, images, news, etc.) */
  searchType?: SearchType;
  /** Exclude specific terms */
  excludeTerms?: string[];
  /** Exact phrase to match */
  exactPhrase?: string;
  /** Search within specific site */
  site?: string;
  /** File type to search for (pdf, doc, xls, etc.) */
  fileType?: string;
}

/**
 * Response format enum
 */
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}
