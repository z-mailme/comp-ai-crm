import { describe, expect, test } from "bun:test";
import { splitEmails } from "../app/(app)/[slug]/inbox/[id]/reply-composer";

describe("splitEmails", () => {
	test("splits comma and semicolon separated recipients", () => {
		expect(splitEmails("a@example.com, b@example.com;c@example.com")).toEqual([
			"a@example.com",
			"b@example.com",
			"c@example.com",
		]);
	});

	test("trims whitespace and drops empty entries", () => {
		expect(splitEmails("  a@example.com ,, ; ")).toEqual(["a@example.com"]);
	});

	test("returns an empty list for blank input", () => {
		expect(splitEmails("")).toEqual([]);
		expect(splitEmails("   ")).toEqual([]);
	});
});
