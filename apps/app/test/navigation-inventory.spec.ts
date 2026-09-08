import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
	NAVIGATION_EXCLUSIONS,
	navigationItems,
} from "../components/business-os-navigation";

describe("Business OS navigation inventory", () => {
	it("covers user-facing workspace routes", () => {
		const routes = discoverRoutes(join(import.meta.dir, "../app/(app)/[slug]"));
		const navigation = new Set<string>(
			navigationItems().map((item) => item.href),
		);
		const exclusions = new Set<string>(
			NAVIGATION_EXCLUSIONS.map((item) => item.route),
		);
		const missing = routes
			.filter((route) => !navigation.has(route))
			.filter((route) => !exclusions.has(route));

		expect(missing).toEqual([]);
	});

	it("keeps coming soon routes on the Business OS capability page", () => {
		const comingSoon = navigationItems().filter(
			(item) => item.status === "COMING_SOON",
		);

		expect(comingSoon.length).toBeGreaterThan(0);
		expect(
			comingSoon.every((item) => item.href.startsWith("/business-os/")),
		).toBe(true);
	});
});

function discoverRoutes(root: string): string[] {
	const routes: string[] = [];
	visit(root, []);
	return routes.sort();

	function visit(directory: string, segments: string[]) {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isFile() && entry.name === "page.tsx") {
				routes.push(toRoute(segments));
			}

			if (entry.isDirectory()) {
				const segment = routeSegment(entry.name);
				visit(
					join(directory, entry.name),
					segment ? [...segments, segment] : segments,
				);
			}
		}
	}
}

function routeSegment(segment: string): string | null {
	if (segment.startsWith("(") && segment.endsWith(")")) return null;
	return segment;
}

function toRoute(segments: string[]): string {
	return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}
