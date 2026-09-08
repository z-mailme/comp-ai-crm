"use client";

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";

const STORAGE_KEY = "comp-ai:calendar:hidden-calendars";
const EMPTY: ReadonlySet<string> = new Set();

const storedHiddenCalendars = z.array(z.string());

const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedSet: ReadonlySet<string> = EMPTY;

export function useHiddenCalendars(): [
	ReadonlySet<string>,
	(calendar: string, visible: boolean) => void,
] {
	const hidden = useSyncExternalStore(subscribe, readHidden, () => EMPTY);

	const toggle = useCallback((calendar: string, visible: boolean) => {
		const next = new Set(readHidden());
		if (visible) {
			next.delete(calendar);
		} else {
			next.add(calendar);
		}
		persist(next);
	}, []);

	return [hidden, toggle];
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	window.addEventListener("storage", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
}

function readHidden(): ReadonlySet<string> {
	if (!("window" in globalThis)) return EMPTY;

	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (raw === cachedRaw) return cachedSet;

	let parsed: string[] = [];
	if (raw) {
		try {
			const result = storedHiddenCalendars.safeParse(JSON.parse(raw));
			parsed = result.success ? result.data : [];
		} catch {
			parsed = [];
		}
	}

	cachedRaw = raw;
	cachedSet = parsed.length === 0 ? EMPTY : new Set(parsed);
	return cachedSet;
}

function persist(next: ReadonlySet<string>): void {
	const raw = JSON.stringify([...next]);
	window.localStorage.setItem(STORAGE_KEY, raw);
	cachedRaw = raw;
	cachedSet = next;
	for (const listener of listeners) listener();
}
