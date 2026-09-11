export type NavigationStatus =
	| "ACTIVE"
	| "NOT_CONFIGURED"
	| "DISABLED"
	| "COMING_SOON"
	| "ADMIN_ONLY"
	| "INTERNAL_ONLY";

export type NavigationItem = {
	title: string;
	href: string;
	status: NavigationStatus;
	match: "exact" | "prefix";
	prefetchSection?: string;
	related?: string[];
	icon: string;
};

export type NavigationGroup = {
	title: string;
	items: NavigationItem[];
};

export type NavigationExclusion = {
	route: string;
	status: NavigationStatus;
	reason: string;
};

export const BUSINESS_OS_NAVIGATION: readonly NavigationGroup[] = [
	{
		title: "Home",
		items: [
			{
				title: "Overview",
				href: "/",
				status: "ACTIVE",
				match: "exact",
				prefetchSection: "/",
				icon: "dashboard",
			},
			{
				title: "Command",
				href: "/command",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/command",
				icon: "command",
			},
		],
	},
	{
		title: "Communication",
		items: [
			{
				title: "Inbox",
				href: "/inbox",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/inbox",
				icon: "email",
			},
			{
				title: "Calendar",
				href: "/calendar",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/calendar",
				icon: "calendar",
			},
		],
	},
	{
		title: "CRM",
		items: [
			{
				title: "Companies",
				href: "/companies",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/companies",
				icon: "building",
			},
			{
				title: "Contacts",
				href: "/contacts",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/contacts",
				icon: "people",
			},
			{
				title: "Deals",
				href: "/deals",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/deals",
				icon: "deal",
			},
			{
				title: "Bookings",
				href: "/business-os/bookings",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/business-os/bookings",
				icon: "calendar",
			},
			{
				title: "Activity",
				href: "/business-os/activity",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/business-os/activity",
				icon: "activity",
			},
		],
	},
	{
		title: "Marketing",
		items: [
			{
				title: "Overview",
				href: "/marketing",
				status: "ACTIVE",
				match: "exact",
				prefetchSection: "/marketing",
				icon: "marketing",
			},
			{
				title: "Campaigns",
				href: "/marketing/campaigns",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/marketing/campaigns",
				icon: "marketing",
			},
			{
				title: "Content",
				href: "/marketing/content",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/marketing/content",
				icon: "document",
			},
			{
				title: "Media Library",
				href: "/marketing/media",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/marketing/media",
				icon: "image",
			},
			{
				title: "Social",
				href: "/marketing/social",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/marketing/social",
				icon: "flow",
			},
			{
				title: "Email",
				href: "/marketing/email",
				status: "NOT_CONFIGURED",
				match: "prefix",
				prefetchSection: "/marketing/email",
				icon: "email",
			},
			{
				title: "Google Ads",
				href: "/marketing/ads/google",
				status: "NOT_CONFIGURED",
				match: "prefix",
				prefetchSection: "/marketing/ads/google",
				icon: "analytics",
			},
			{
				title: "Meta Ads",
				href: "/marketing/ads/meta",
				status: "NOT_CONFIGURED",
				match: "prefix",
				prefetchSection: "/marketing/ads/meta",
				icon: "analytics",
			},
			{
				title: "Audiences",
				href: "/business-os/audiences",
				status: "COMING_SOON",
				match: "prefix",
				icon: "people",
			},
		],
	},
	{
		title: "AI",
		items: [
			{
				title: "Chat",
				href: "/chat",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/chat",
				related: ["/agents"],
				icon: "bot",
			},
			{
				title: "Agents",
				href: "/agents",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/agents",
				icon: "bot",
			},
			{
				title: "Approvals",
				href: "/business-os/approvals",
				status: "COMING_SOON",
				match: "prefix",
				icon: "task",
			},
			{
				title: "Knowledge",
				href: "/business-os/knowledge",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/business-os/knowledge",
				icon: "notebook",
			},
			{
				title: "Automations",
				href: "/business-os/automations",
				status: "COMING_SOON",
				match: "prefix",
				icon: "flow",
			},
			{
				title: "Observability",
				href: "/business-os/observability",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/business-os/observability",
				icon: "analytics",
			},
		],
	},
	{
		title: "Operations",
		items: [
			{
				title: "Operations",
				href: "/business-os/operations",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/business-os/operations",
				icon: "tools",
			},
			{
				title: "People",
				href: "/business-os/people",
				status: "COMING_SOON",
				match: "prefix",
				icon: "people",
			},
			{
				title: "Assets",
				href: "/business-os/assets",
				status: "COMING_SOON",
				match: "prefix",
				icon: "application",
			},
			{
				title: "Procurement",
				href: "/business-os/procurement",
				status: "COMING_SOON",
				match: "prefix",
				icon: "purchase",
			},
			{
				title: "Documents",
				href: "/business-os/documents",
				status: "COMING_SOON",
				match: "prefix",
				icon: "document",
			},
		],
	},
	{
		title: "Finance",
		items: [
			{
				title: "Finance",
				href: "/business-os/finance",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/business-os/finance",
				icon: "finance",
			},
			{
				title: "Quotes",
				href: "/business-os/quotes",
				status: "COMING_SOON",
				match: "prefix",
				icon: "document",
			},
			{
				title: "Invoices",
				href: "/business-os/invoices",
				status: "COMING_SOON",
				match: "prefix",
				icon: "document",
			},
			{
				title: "Payments",
				href: "/business-os/payments",
				status: "COMING_SOON",
				match: "prefix",
				icon: "money",
			},
			{
				title: "Expenses",
				href: "/business-os/expenses",
				status: "COMING_SOON",
				match: "prefix",
				icon: "money",
			},
			{
				title: "Accounting",
				href: "/business-os/accounting",
				status: "COMING_SOON",
				match: "prefix",
				icon: "report",
			},
		],
	},
	{
		title: "Analytics",
		items: [
			{
				title: "Tracking",
				href: "/settings/tracking",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/settings/tracking",
				icon: "analytics",
			},
			{
				title: "Business Analytics",
				href: "/business-os/analytics",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/business-os/analytics",
				icon: "chart",
			},
			{
				title: "Reports",
				href: "/business-os/reports",
				status: "ACTIVE",
				match: "prefix",
				prefetchSection: "/business-os/reports",
				icon: "report",
			},
		],
	},
	{
		title: "Admin",
		items: [
			{
				title: "Settings",
				href: "/settings",
				status: "ADMIN_ONLY",
				match: "exact",
				prefetchSection: "/settings",
				icon: "settings",
			},
			{
				title: "Connections",
				href: "/settings/connections",
				status: "ADMIN_ONLY",
				match: "exact",
				prefetchSection: "/settings/connections",
				icon: "application",
			},
			{
				title: "Google",
				href: "/settings/connections/google",
				status: "NOT_CONFIGURED",
				match: "prefix",
				prefetchSection: "/settings/connections/google",
				icon: "application",
			},
			{
				title: "Microsoft",
				href: "/settings/connections/microsoft",
				status: "NOT_CONFIGURED",
				match: "prefix",
				prefetchSection: "/settings/connections/microsoft",
				icon: "application",
			},
			{
				title: "Slack",
				href: "/settings/connections/slack",
				status: "NOT_CONFIGURED",
				match: "exact",
				prefetchSection: "/settings/connections/slack",
				icon: "application",
			},
			{
				title: "Slack People",
				href: "/settings/connections/slack/people",
				status: "ADMIN_ONLY",
				match: "prefix",
				prefetchSection: "/settings/connections/slack/people",
				icon: "people",
			},
			{
				title: "Members",
				href: "/settings/members",
				status: "ADMIN_ONLY",
				match: "prefix",
				prefetchSection: "/settings/members",
				icon: "people",
			},
			{
				title: "API Keys",
				href: "/settings/api-keys",
				status: "ADMIN_ONLY",
				match: "prefix",
				prefetchSection: "/settings/api-keys",
				icon: "api",
			},
			{
				title: "Currencies",
				href: "/settings/currencies",
				status: "ADMIN_ONLY",
				match: "prefix",
				prefetchSection: "/settings/currencies",
				icon: "money",
			},
			{
				title: "SSO",
				href: "/settings/sso",
				status: "ADMIN_ONLY",
				match: "prefix",
				prefetchSection: "/settings/sso",
				icon: "security",
			},
			{
				title: "System Health",
				href: "/business-os/system-health",
				status: "COMING_SOON",
				match: "prefix",
				icon: "analytics",
			},
		],
	},
] as const;

export const NAVIGATION_EXCLUSIONS: readonly NavigationExclusion[] = [
	{
		route: "/business-os/[module]",
		status: "INTERNAL_ONLY",
		reason: "Named Business OS module links own user navigation.",
	},
	{
		route: "/inbox/[id]",
		status: "INTERNAL_ONLY",
		reason: "Conversation detail opens from Inbox.",
	},
	{
		route: "/companies/[companyId]",
		status: "INTERNAL_ONLY",
		reason: "Company detail opens from Companies.",
	},
	{
		route: "/contacts/[contactId]",
		status: "INTERNAL_ONLY",
		reason: "Contact detail opens from Contacts.",
	},
	{
		route: "/deals/[dealId]",
		status: "INTERNAL_ONLY",
		reason: "Deal detail opens from Deals.",
	},
	{
		route: "/chat/[chatId]",
		status: "INTERNAL_ONLY",
		reason: "Chat detail opens from Chat.",
	},
	{
		route: "/agents/[agentId]",
		status: "INTERNAL_ONLY",
		reason: "Agent detail opens from Agents.",
	},
	{
		route: "/settings/connections/intake",
		status: "INTERNAL_ONLY",
		reason: "Connection intake opens from OAuth callback flow.",
	},
] as const;

export function navigationItems(): NavigationItem[] {
	return BUSINESS_OS_NAVIGATION.flatMap((group) => group.items);
}
