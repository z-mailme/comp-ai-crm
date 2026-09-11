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
