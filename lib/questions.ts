// Familiar entry points with room for stories, values, and personal perspective.
export const questions = [
  "What everyday thing deserves a much bigger fan club?",
  "What would you happily spend an entire afternoon doing?",
  "What's a small thing that makes a place feel like home?",
  "What's something you enjoy that you used to think was boring?",
  "If you could teach everyone one small skill, what would it be?",
  "What's something you're surprisingly picky about?",
  "What's an ordinary moment you wish you could replay?",
  "What's a harmless opinion you'll happily defend?",
  "If a friend visited your neighbourhood, what would you show them first?",
  "What's something you changed your mind about after trying it?",
  "What makes someone easy to spend time with?",
  "What's a small act of kindness that stayed with you?",
  "What's something you learned the slow way that you're glad you learned?",
  "If you could borrow someone else's skill for a day, whose would you choose?",
  "What's a rule you'd invent to make everyday life a little better?",
  "What's something you keep even though it isn't useful anymore?",
  "What's a small decision that turned out to matter more than you expected?",
  "What's something you wish people asked you about more often?",
  "What does a really good ordinary day look like to you?",
  "What's something you hope you'll still be doing when you're older?",
] as const;

export const questionHint =
  "Start with whatever comes to mind. Share a moment or example, and tell us what makes it matter to you.";

// A complete shuffled round; avoid an immediate repeat when a new round begins.
export function shuffledQuestionIndices(previousIndex?: number, random = Math.random): number[] {
  const order = questions.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0] === previousIndex) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}
