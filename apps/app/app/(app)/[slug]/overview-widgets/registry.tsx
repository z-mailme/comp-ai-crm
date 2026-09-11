import type { ComponentType } from "react";
import type { RouterOutputs } from "@/lib/trpc/types";
import { PendingApprovalsWidget } from "./approvals-widget";
import { InboxUnreadWidget } from "./inbox-widget";
import {
	CampaignPerformanceWidget,
	EmailPerformanceWidget,
	GoogleAdsPerformanceWidget,
	LeadsBySourceWidget,
	MarketingPerformanceWidget,
	MetaAdsPerformanceWidget,
	RevenueByChannelWidget,
	SocialScheduleWidget,
	UpcomingContentWidget,
} from "./marketing-widgets";
import {
	DealsInProgressWidget,
	OverdueTasksWidget,
	RecentActivityWidget,
	SalesDashboardWidget,
} from "./summary-widgets";
import { UpcomingEventsWidget } from "./upcoming-events-widget";
import { WebsiteAnalyticsWidget } from "./website-analytics-widget";
import { WeekFinanceWidget } from "./week-finance-widget";

export type LayoutItem = NonNullable<
	RouterOutputs["dashboard"]["layout"]["layout"]
>[number];

export type WidgetId = LayoutItem["id"];
export type WidgetSize = LayoutItem["size"];

export type WidgetCategory =
	| "BUSINESS"
	| "SALES"
	| "COMMUNICATION"
	| "SCHEDULE"
	| "MARKETING"
	| "OPERATIONS"
	| "AI";

export const WIDGET_CATEGORY_LABELS = {
	BUSINESS: "Business",
	SALES: "Sales",
	COMMUNICATION: "Communication",
	SCHEDULE: "Schedule",
	MARKETING: "Marketing",
	OPERATIONS: "Operations",
	AI: "AI",
} satisfies Record<WidgetCategory, string>;

export type WidgetDefinition = {
	id: WidgetId;
	title: string;
	category: WidgetCategory;
	description: string;
	sizes: WidgetSize[];
	defaultSize: WidgetSize;
	component: ComponentType;
};

export const WIDGETS = {
	"sales-dashboard": {
		id: "sales-dashboard",
		title: "Sales dashboard",
		category: "SALES",
		description: "Pipeline value, win rate and monthly trend charts.",
		sizes: ["full"],
		defaultSize: "full",
		component: SalesDashboardWidget,
	},
	"deals-in-progress": {
		id: "deals-in-progress",
		title: "Deals in progress",
		category: "SALES",
		description: "The largest open deals and their stage age.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: DealsInProgressWidget,
	},
	"overdue-tasks": {
		id: "overdue-tasks",
		title: "Overdue tasks",
		category: "OPERATIONS",
		description: "Tasks past their due date, with one-click completion.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: OverdueTasksWidget,
	},
	"recent-activity": {
		id: "recent-activity",
		title: "Recent activity",
		category: "BUSINESS",
		description: "Every note, task and stage change across the workspace.",
		sizes: ["half", "full"],
		defaultSize: "full",
		component: RecentActivityWidget,
	},
	"website-analytics": {
		id: "website-analytics",
		title: "Website analytics",
		category: "MARKETING",
		description: "GA4 users, sessions, views and engagement for 28 days.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: WebsiteAnalyticsWidget,
	},
	"week-finance": {
		id: "week-finance",
		title: "This week's finance",
		category: "BUSINESS",
		description: "Expected revenue, operator labour and gross profit.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: WeekFinanceWidget,
	},
	"upcoming-events": {
		id: "upcoming-events",
		title: "Upcoming events",
		category: "SCHEDULE",
		description: "The next events on your connected calendar.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: UpcomingEventsWidget,
	},
	"inbox-unread": {
		id: "inbox-unread",
		title: "Inbox",
		category: "COMMUNICATION",
		description: "Unread counts and the latest conversations.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: InboxUnreadWidget,
	},
	"pending-approvals": {
		id: "pending-approvals",
		title: "Agent approvals",
		category: "AI",
		description: "Agent actions waiting for your decision.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: PendingApprovalsWidget,
	},
	"marketing-performance": {
		id: "marketing-performance",
		title: "Marketing performance",
		category: "MARKETING",
		description: "Attributed leads, bookings, revenue and ad spend.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: MarketingPerformanceWidget,
	},
	"google-ads-performance": {
		id: "google-ads-performance",
		title: "Google Ads",
		category: "MARKETING",
		description: "Spend, leads and cost per lead from the Google Ads snapshot.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: GoogleAdsPerformanceWidget,
	},
	"meta-ads-performance": {
		id: "meta-ads-performance",
		title: "Meta Ads",
		category: "MARKETING",
		description: "Spend, leads and cost per lead from the Meta Ads snapshot.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: MetaAdsPerformanceWidget,
	},
	"email-performance": {
		id: "email-performance",
		title: "Email performance",
		category: "MARKETING",
		description: "Sent, opens, clicks and unsubscribes from Listmonk.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: EmailPerformanceWidget,
	},
	"social-schedule": {
		id: "social-schedule",
		title: "Social schedule",
		category: "MARKETING",
		description: "Scheduled posts, content and campaigns for 30 days.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: SocialScheduleWidget,
	},
	"upcoming-content": {
		id: "upcoming-content",
		title: "Upcoming content",
		category: "MARKETING",
		description: "Content with a scheduled date from today onward.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: UpcomingContentWidget,
	},
	"campaign-performance": {
		id: "campaign-performance",
		title: "Campaign performance",
		category: "MARKETING",
		description: "Leads, bookings and closed revenue per campaign.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: CampaignPerformanceWidget,
	},
	"leads-by-source": {
		id: "leads-by-source",
		title: "Leads by source",
		category: "MARKETING",
		description: "First-touch source and medium of attributed leads.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: LeadsBySourceWidget,
	},
	"revenue-by-channel": {
		id: "revenue-by-channel",
		title: "Revenue by channel",
		category: "MARKETING",
		description: "Closed revenue from attributed sources.",
		sizes: ["half", "full"],
		defaultSize: "half",
		component: RevenueByChannelWidget,
	},
} as const satisfies Record<WidgetId, WidgetDefinition>;

export const DEFAULT_LAYOUT: LayoutItem[] = [
	{ id: "sales-dashboard", size: "full" },
	{ id: "deals-in-progress", size: "half" },
	{ id: "overdue-tasks", size: "half" },
	{ id: "recent-activity", size: "full" },
];

export const WIDGET_CATEGORY_ORDER: WidgetCategory[] = [
	"BUSINESS",
	"SALES",
	"COMMUNICATION",
	"SCHEDULE",
	"MARKETING",
	"OPERATIONS",
	"AI",
];
