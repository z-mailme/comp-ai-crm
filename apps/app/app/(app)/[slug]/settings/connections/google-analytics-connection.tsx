"use client";

import { authClient } from "@crm/auth/client";
import { ANALYTICS_SCOPE, SYNC_SCOPES } from "@crm/auth/scopes";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function GoogleAnalyticsConnection({ slug }: { slug: string }) {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const status = useQuery(trpc.googleAnalytics.status.queryOptions());

	const setProperty = useMutation(
		trpc.googleAnalytics.setProperty.mutationOptions({
			onSuccess: async () => {
				await cache.googleAnalytics();
				toast.success("Google Analytics property saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const [pending, setPending] = useState(false);
	const [manualId, setManualId] = useState("");

	if (!status.data) return null;

	const { configured, linked, scopeGranted, property } = status.data;
	if (!configured || !linked) return null;

	async function grantAccess() {
		setPending(true);

		const origin = window.location.origin;
		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...SYNC_SCOPES, ANALYTICS_SCOPE],
			callbackURL: `${origin}/${slug}/settings/connections/google`,
			errorCallbackURL: `${origin}/${slug}/settings/connections/google?provider=google`,
		});

		if (error) {
			setPending(false);
			toast.error(error.message ?? "Could not reach Google.");
		}
	}

	function saveManualId() {
		const id = manualId.trim().replace(/^properties\//i, "");
		if (!/^\d{1,20}$/.test(id)) {
			toast.error("A GA4 property id is a number, for example 123456789.");
			return;
		}
		setProperty.mutate({ property: { id } });
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Google Analytics
						<StatusIndicator
							size="sm"
							tone={scopeGranted ? "success" : "warning"}
							label={scopeGranted ? "Access granted" : "Permission required"}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					Read-only GA4 website reporting. Adds one Google permission; email and
					calendar access stay as they are.
				</CardDescription>

				<CardAction className="flex flex-wrap gap-2">
					{!scopeGranted ? (
						<Button
							size="sm"
							disabled={pending}
							onClick={() => {
								grantAccess().catch(() => {
									setPending(false);
									toast.error("Could not reach Google.");
								});
							}}
							type="button"
						>
							{pending ? (
								<Spinner data-icon="inline-start" />
							) : (
								<GoogleLogo data-icon="inline-start" className="size-4" />
							)}
							Grant analytics access
						</Button>
					) : (
						<Button variant="outline" size="sm" asChild>
							<Link href={`/${slug}/business-os/analytics`}>
								View analytics
							</Link>
						</Button>
					)}
				</CardAction>
			</CardHeader>

			{scopeGranted ? (
				<CardContent className="flex flex-col gap-5">
					<PropertyPicker
						property={property}
						disabled={setProperty.isPending}
						onSelect={(id, name) =>
							setProperty.mutate({ property: { id, name } })
						}
					/>

					<div className="flex flex-col gap-2 border-t pt-4">
						<Field>
							<FieldLabel htmlFor="ga-property-id">
								Property id, if it is not listed
							</FieldLabel>
							<div className="flex gap-2">
								<Input
									id="ga-property-id"
									inputMode="numeric"
									placeholder="123456789"
									value={manualId}
									onChange={(event) => setManualId(event.target.value)}
								/>
								<Button
									variant="outline"
									size="sm"
									disabled={setProperty.isPending || !manualId.trim()}
									onClick={saveManualId}
									type="button"
								>
									Save
								</Button>
							</div>
						</Field>
					</div>
				</CardContent>
			) : null}
		</Card>
	);
}

function PropertyPicker({
	property,
	disabled,
	onSelect,
}: {
	property: { id: string; name: string | null } | null;
	disabled: boolean;
	onSelect: (id: string, name: string) => void;
}) {
	const trpc = useTRPC();
	const properties = useQuery({
		...trpc.googleAnalytics.properties.queryOptions(),
		retry: false,
	});

	return (
		<div className="flex flex-col gap-2">
			<span className="font-medium text-sm">GA4 property</span>
			{properties.data ? (
				properties.data.properties.length > 0 ? (
					<Select
						value={property?.id ?? ""}
						disabled={disabled}
						onValueChange={(id) => {
							const match = properties.data.properties.find(
								(entry) => entry.id === id,
							);
							if (match) onSelect(match.id, match.name);
						}}
					>
						<SelectTrigger className="w-full max-w-md">
							<SelectValue placeholder="Choose a property" />
						</SelectTrigger>
						<SelectContent>
							{properties.data.properties.map((entry) => (
								<SelectItem key={entry.id} value={entry.id}>
									{entry.name} · {entry.id}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<p className="text-muted-foreground text-sm">
						Google did not list any GA4 properties for this account. Enter the
						property id below instead.
					</p>
				)
			) : properties.isError ? (
				<p className="text-muted-foreground text-sm">
					The property list could not be loaded. Enter the property id below
					instead.
				</p>
			) : (
				<Spinner />
			)}
			{property ? (
				<p className="text-muted-foreground text-xs">
					Selected: {property.name ?? "Property"} · {property.id}
				</p>
			) : null}
		</div>
	);
}
