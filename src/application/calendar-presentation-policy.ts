const combinedEmojiPattern = /[#*0-9]\uFE0F?\u20E3/gu;
const calendarEmojiPattern =
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D]/gu;
const emojiTagPattern = /[\u{E0020}-\u{E007F}]/gu;
const orphanedLeadingSeparatorPattern = /^[\s\-\u2013\u2014:;|,/]+/u;

export function sanitizeCalendarEventTitle(title: string): string {
  const sanitized = title
    .replace(combinedEmojiPattern, "")
    .replace(calendarEmojiPattern, "")
    .replace(emojiTagPattern, "")
    .replace(orphanedLeadingSeparatorPattern, "")
    .replace(/\s+/gu, " ")
    .trim();

  return sanitized.length > 0 ? sanitized : "Untitled event";
}
