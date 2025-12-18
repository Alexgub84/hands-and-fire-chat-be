/**
 * Fallback response for factual queries when knowledge base context is missing
 * Used to prevent hallucinations on critical information (prices, dates, policies)
 */
export const fallbackResponse =
  "אין לי מידע מדויק על זה כרגע. אבדוק עם הצוות ואחזור אליך.";

/**
 * Keywords that indicate a factual query requiring knowledge base context
 * If these are detected and no KB context is available, fallback response is used
 */
export const factualQueryKeywords = [
  "מחיר",
  "מחירים",
  "תשלום",
  "כמה עולה",
  "עלות",
  "זמן",
  "שעה",
  "מתי",
  "תאריך",
  "מועד",
  "כתובת",
  "מיקום",
  "איפה",
  "נמצא",
  "ביטול",
  "מדיניות",
  "החזר",
  "להחזיר",
  "קיבולת",
  "כמה אנשים",
  "מקום",
  "מתאים",
];
