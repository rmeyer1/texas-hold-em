/**
 * A simple utility for detecting and filtering profanity in chat messages.
 * This implementation uses a basic list approach but could be replaced with
 * a more sophisticated solution in production.
 */

// Basic list of offensive words to filter
// In a production environment, this would typically be:
// 1. More comprehensive
// 2. Potentially loaded from an external source
// 3. Possibly use a more sophisticated regex pattern matching
const OFFENSIVE_WORDS = [
  'badword1',
  'badword2',
  // In a real implementation, this would contain actual offensive words
  // For demo purposes, we're using placeholders
];

/**
 * Checks if a message contains profanity
 * @param text The message text to check
 * @returns True if profanity is detected
 */
export const containsProfanity = (text: string): boolean => {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  // Check for exact matches
  return OFFENSIVE_WORDS.some(word => 
    lowerText.includes(word) || 
    // Also check for words with intentional spacing or symbols in between
    new RegExp(`\\b${word.split('').join('[^a-zA-Z0-9]*')}\\b`, 'i').test(lowerText)
  );
};

/**
 * Replaces profanity in a message with asterisks
 * @param text The message text to filter
 * @returns Filtered message with profanity replaced by asterisks
 */
export const filterProfanity = (text: string): string => {
  if (!text) return text;
  
  let filteredText = text;
  
  OFFENSIVE_WORDS.forEach(word => {
    // Replace the word with asterisks of the same length
    const replacement = '*'.repeat(word.length);
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filteredText = filteredText.replace(regex, replacement);
    
    // Also try to catch words with intentional obfuscation (like 'b a d w o r d')
    const obfuscatedRegex = new RegExp(`\\b${word.split('').join('[^a-zA-Z0-9]*')}\\b`, 'gi');
    filteredText = filteredText.replace(obfuscatedRegex, replacement);
  });
  
  return filteredText;
};

/**
 * Validates a message for profanity
 * @param text The message text to validate
 * @returns An object with validation result and filtered text
 */
export const validateMessage = (text: string): { 
  isValid: boolean; 
  filteredText: string;
  containsProfanity: boolean;
} => {
  const hasProfanity = containsProfanity(text);
  const filteredText = hasProfanity ? filterProfanity(text) : text;
  
  return {
    isValid: true, // We're allowing messages but filtering them
    filteredText,
    containsProfanity: hasProfanity,
  };
}; 