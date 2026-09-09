const POP_SIGNAL =
	/(proof of payment|\bpop attached|\bpop\b|payment (?:made|sent|confirmation|received)|EFT (?:payment|reference)|deposit (?:paid|received)|paid (?:into|to) your account)/i;

const AMOUNT =
	/(?:^|\s)R\s?(\d[\d\s,]*(?:[.,]\d{2})?|\d)(?=\s|$|[^0-9\s,.]|[.,](?!\d))/m;

const REFERENCE = /ref(?:erence)?[.:]?\s*([A-Za-z0-9][A-Za-z0-9/-]{3,})/i;

export type PopDetection = {
	amount: number | null;
	currency: "ZAR";
	reference: string | null;
	evidence: string;
};

export function detectPop(
	subject: string | null,
	body: string | null,
): PopDetection | null {
	const text = `${subject ?? ""}\n${body ?? ""}`;

	const signal = POP_SIGNAL.exec(text);
	if (!signal) return null;

	const amountMatch = AMOUNT.exec(text);
	const amount = amountMatch?.[1] ? parseAmount(amountMatch[1]) : null;

	const reference = REFERENCE.exec(text)?.[1] ?? null;

	return {
		amount,
		currency: "ZAR",
		reference,
		evidence: signal[0],
	};
}

function parseAmount(raw: string): number | null {
	const trimmed = raw.trim();

	const thousandsDecimal = /^(\d{1,3}(?:[,\s]\d{3})+)[.,](\d{2})$/.exec(
		trimmed,
	);
	if (thousandsDecimal?.[1] && thousandsDecimal[2]) {
		const whole = thousandsDecimal[1].replace(/[\s,]/g, "");
		return Number(`${whole}.${thousandsDecimal[2]}`);
	}

	if (/^\d{1,3}([,\s]\d{3})+$/.test(trimmed)) {
		return Number(trimmed.replace(/[\s,]/g, ""));
	}

	const plainDecimal = /^(\d+)[.,](\d{2})$/.exec(trimmed);
	if (plainDecimal?.[1] && plainDecimal[2]) {
		return Number(`${plainDecimal[1]}.${plainDecimal[2]}`);
	}

	if (/^\d+$/.test(trimmed)) {
		return Number(trimmed);
	}

	return null;
}
