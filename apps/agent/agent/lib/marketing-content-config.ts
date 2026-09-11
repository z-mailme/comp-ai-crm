const MINUTE_MS = 60_000;

export const MARKETING_ASSIST = {
	knowledgeRows: 20,
	subjectChars: 120,
	detailChars: 240,
	timeoutMs: MINUTE_MS,
	maxVariants: 3,
	maxHashtags: 30,
	instructionChars: 2000,
} as const;
