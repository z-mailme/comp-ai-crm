import {
	ForbiddenException,
	type Logger,
	ServiceUnavailableException,
} from "@nestjs/common";

export function authorizeBookingInternalRequest(input: {
	secret: string | undefined;
	authorization: string | undefined;
	logger: Pick<Logger, "error">;
}): void {
	if (!input.secret) {
		input.logger.error({
			message:
				"CRON_SECRET is not set — refusing to run the booking internal route.",
		});
		throw new ServiceUnavailableException(
			"Booking internal routes are not configured.",
		);
	}

	if (!timingSafeEquals(input.authorization ?? "", `Bearer ${input.secret}`)) {
		throw new ForbiddenException();
	}
}

function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;

	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}

	return mismatch === 0;
}
