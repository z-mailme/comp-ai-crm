"use client";

import Activity from "@carbon/icons-react/es/Activity";
import AiObservability from "@carbon/icons-react/es/AiObservability";
import Analytics from "@carbon/icons-react/es/Analytics";
import Api from "@carbon/icons-react/es/Api";
import Application from "@carbon/icons-react/es/Application";
import Building from "@carbon/icons-react/es/Building";
import Bullhorn from "@carbon/icons-react/es/Bullhorn";
import Calendar from "@carbon/icons-react/es/Calendar";
import ChartLine from "@carbon/icons-react/es/ChartLine";
import Close from "@carbon/icons-react/es/Close";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import Document from "@carbon/icons-react/es/Document";
import Email from "@carbon/icons-react/es/Email";
import Finance from "@carbon/icons-react/es/Finance";
import Flow from "@carbon/icons-react/es/Flow";
import Money from "@carbon/icons-react/es/Money";
import Notebook from "@carbon/icons-react/es/Notebook";
import Partnership from "@carbon/icons-react/es/Partnership";
import Purchase from "@carbon/icons-react/es/Purchase";
import Report from "@carbon/icons-react/es/Report";
import Security from "@carbon/icons-react/es/Security";
import Settings from "@carbon/icons-react/es/Settings";
import Task from "@carbon/icons-react/es/Task";
import Tools from "@carbon/icons-react/es/Tools";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Icon } from "@crm/ui/components/icon";
import Bot from "@crm/ui/components/icons/bot";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import { cn } from "@crm/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
	BUSINESS_OS_NAVIGATION,
	type NavigationItem,
	type NavigationStatus,
} from "@/components/business-os-navigation";
import { usePrefetchSection } from "@/components/crm/section-prefetch";
import { useMobileNav } from "@/components/mobile-nav";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type NavItem = Omit<NavigationItem, "href" | "related"> & {
	href: string;
	section: string;
	related?: string[];
};

type NavGroup = {
	title: string;
	items: NavItem[];
};

const ICONS = new Map<string, CarbonIcon>(
	Object.entries({
		activity: Activity,
		analytics: Analytics,
		api: Api,
		application: Application,
		bot: Bot,
		building: Building,
		calendar: Calendar,
		chart: ChartLine,
		command: AiObservability,
		dashboard: Dashboard,
		deal: Partnership,
		document: Document,
		email: Email,
		finance: Finance,
		flow: Flow,
		marketing: Bullhorn,
		money: Money,
		notebook: Notebook,
		people: UserMultiple,
		purchase: Purchase,
		report: Report,
		security: Security,
		settings: Settings,
		task: Task,
		tools: Tools,
	} satisfies Record<string, CarbonIcon>),
);

function isActive(item: NavItem, pathname: string): boolean {
	return (
		pathname === item.href ||
		(item.match === "prefix" && pathname.startsWith(item.href)) ||
		Boolean(item.related?.some((prefix) => pathname.startsWith(prefix)))
	);
}

function statusLabel(status: NavigationStatus): string | null {
	if (status === "ACTIVE") return null;
	if (status === "NOT_CONFIGURED") return "Setup";
	if (status === "COMING_SOON") return "Soon";
	if (status === "ADMIN_ONLY") return "Admin";
	if (status === "DISABLED") return "Off";
	return null;
}

function NavLink({
	item,
	active,
	onNavigate,
	onPrefetch,
	compact = false,
}: {
	item: NavItem;
	active: boolean;
	onNavigate?: () => void;
	onPrefetch: () => void;
	compact?: boolean;
}) {
	const icon = ICONS.get(item.icon) ?? Application;
	const label = statusLabel(item.status);

	return (
		<Button
			asChild
			variant="ghost"
			size={compact ? "icon" : "sm"}
			className={cn(
				compact
					? "text-muted-foreground"
					: "h-9 w-full justify-start gap-2 px-2 text-muted-foreground",
				active &&
					"bg-muted text-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<Link
				href={item.href}
				prefetch
				onMouseEnter={onPrefetch}
				onFocus={onPrefetch}
				onClick={onNavigate}
				aria-current={active ? "page" : undefined}
				transitionTypes={[
					item.title === "Chat" ? "nav-forward" : "nav-lateral",
				]}
			>
				<Icon
					icon={icon}
					className={item.icon === "bot" ? "size-5" : undefined}
				/>
				{compact ? (
					<span className="sr-only">{item.title}</span>
				) : (
					<>
						<span className="min-w-0 flex-1 truncate text-left">
							{item.title}
						</span>
						{label ? (
							<Badge
								variant="outline"
								className="h-5 shrink-0 px-1.5 text-[10px]"
							>
								{label}
							</Badge>
						) : null}
					</>
				)}
			</Link>
		</Button>
	);
}

function NavGroupView({
	group,
	pathname,
	onNavigate,
	onPrefetch,
}: {
	group: NavGroup;
	pathname: string;
	onNavigate?: () => void;
	onPrefetch: (section: string) => void;
}) {
	return (
		<details open className="group">
			<summary className="flex h-8 cursor-pointer list-none items-center px-2 font-medium text-muted-foreground text-xs uppercase tracking-normal">
				{group.title}
			</summary>
			<div className="grid gap-1">
				{group.items.map((item) => (
					<NavLink
						key={item.href}
						item={item}
						active={isActive(item, pathname)}
						onNavigate={onNavigate}
						onPrefetch={() => onPrefetch(item.section)}
					/>
				))}
			</div>
		</details>
	);
}

function useNavigationGroups(): NavGroup[] {
	const workspaceUrl = useWorkspaceUrl();

	return useMemo(
		() =>
			BUSINESS_OS_NAVIGATION.map((group) => ({
				title: group.title,
				items: group.items.map((item) => ({
					...item,
					section: item.prefetchSection ?? item.href,
					href: workspaceUrl(item.href),
					related: item.related?.map((path) => workspaceUrl(path)),
				})),
			})),
		[workspaceUrl],
	);
}

export function AppIconRailFallback() {
	const groups = BUSINESS_OS_NAVIGATION;

	return (
		<nav
			aria-label="Primary"
			aria-busy="true"
			className="hidden w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-background p-3 md:flex [view-transition-name:app-rail]"
		>
			{groups.map((group) => (
				<div key={group.title} className="grid gap-1">
					<div className="h-8 px-2 font-medium text-muted-foreground text-xs uppercase">
						{group.title}
					</div>
					{group.items.slice(0, 3).map((item) => {
						const icon = ICONS.get(item.icon) ?? Application;
						return (
							<Button
								key={item.href}
								variant="ghost"
								size="sm"
								disabled
								className="h-9 justify-start gap-2 text-muted-foreground"
							>
								<Icon icon={icon} />
								<span>{item.title}</span>
							</Button>
						);
					})}
				</div>
			))}
		</nav>
	);
}

export function AppIconRail() {
	const pathname = usePathname();
	const { open, setOpen } = useMobileNav();
	const prefetchSection = usePrefetchSection();
	const groups = useNavigationGroups();
	const items = groups.flatMap((group) => group.items);

	return (
		<>
			<nav
				aria-label="Primary"
				className="hidden w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-background p-3 md:flex [view-transition-name:app-rail]"
			>
				{groups.map((group) => (
					<NavGroupView
						key={group.title}
						group={group}
						pathname={pathname}
						onPrefetch={prefetchSection}
					/>
				))}
			</nav>

			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent side="left" className="w-80 gap-0 p-0">
					<SheetHeader className="border-b">
						<div className="flex items-center justify-between gap-3">
							<SheetTitle>Navigation</SheetTitle>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Close navigation"
								onClick={() => setOpen(false)}
							>
								<Icon icon={Close} />
							</Button>
						</div>
					</SheetHeader>
					<nav
						aria-label="Primary"
						className="flex flex-1 flex-col gap-3 overflow-y-auto p-3"
					>
						{groups.map((group) => (
							<NavGroupView
								key={group.title}
								group={group}
								pathname={pathname}
								onNavigate={() => setOpen(false)}
								onPrefetch={prefetchSection}
							/>
						))}
					</nav>
					<nav
						aria-label="Quick navigation"
						className="grid grid-cols-6 gap-1 border-t p-2 md:hidden"
					>
						{items.slice(0, 6).map((item) => (
							<NavLink
								key={item.href}
								item={item}
								active={isActive(item, pathname)}
								onNavigate={() => setOpen(false)}
								onPrefetch={() => prefetchSection(item.section)}
								compact
							/>
						))}
					</nav>
				</SheetContent>
			</Sheet>
		</>
	);
}
