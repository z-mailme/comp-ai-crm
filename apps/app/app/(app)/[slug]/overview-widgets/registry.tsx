import type { ComponentType } from "react";
import type { RouterOutputs } from "@/lib/trpc/types";
import { PendingApprovalsWidget } from "./approvals-widget";
import { InboxUnreadWidget } from "./inbox-widget";
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

export const WIDGET_CATEGORY_LABELS: Record<WidgetCategory, string> = {
	BUSINESS: "Business",
	SALES: "Sales",
	COMMUNICATION: "Communication",
	SCHEDULE: "Schedule",
	MARKETING: "Marketing",
	OPERATIONS: "Operations",
	AI: "AI",
};

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
