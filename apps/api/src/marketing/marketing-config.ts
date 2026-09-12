const MEGABYTE = 1024 * 1024;

export const MARKETING_MEDIA = {
	maxUploadBytes: 25 * MEGABYTE,
	listLimit: 200,
	allowedMimeTypes: [
		"image/jpeg",
		"image/png",
		"image/webp",
		"image/gif",
		"image/svg+xml",
		"video/mp4",
		"video/quicktime",
		"application/pdf",
	] as const,
} as const;

export const MARKETING_CONTENT_LIMITS = {
	listLimit: 200,
} as const;

export const MARKETING_EMAIL = {
	subscriberPageSize: 50,
	syncContactLimit: 500,
} as const;

export const MARKETING_ADS = {
	queryLimit: 50,
	metaMaxPages: 4,
	snapshotKind: "campaigns",
} as const;

export const MARKETING_AUTOMATION = {
	mediaCooldownDays: 14,
	planHorizonDays: 28,
	planListLimit: 100,
	metricListLimit: 90,
	publishErrorSummaryMaxChars: 500,
	services: [
		"360 Video Booth",
		"Instant Printing Photo Booth",
		"Photography",
		"Backdrops & Decor",
		"Testimonials",
	],
	contentTypes: [
		"promotional",
		"educational",
		"portfolio",
		"testimonial",
		"behind-the-scenes",
		"event highlight",
		"availability",
		"offer",
		"seasonal",
		"engagement/community",
	],
	brainContext: {
		offersLimit: 10,
		pricingLimit: 15,
		servicesLimit: 10,
		faqLimit: 15,
		bookingTrendDays: 90,
		upcomingBookingDays: 60,
	},
} as const;
