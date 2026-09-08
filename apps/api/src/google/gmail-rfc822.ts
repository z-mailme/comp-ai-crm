export type AddressInput = {
	email: string;
	name: string | null;
};

export type MimeMessageInput = {
	from: AddressInput;
	to: AddressInput[];
	cc: AddressInput[];
	bcc: AddressInput[];
	subject: string;
	body: string;
	messageId: string;
	inReplyTo: string | null;
	references: string[];
	sentAt: Date;
};

export function buildMimeMessage(input: MimeMessageInput): string {
	const headers: string[] = [
		`From: ${formatAddress(input.from)}`,
		`To: ${formatAddressList(input.to)}`,
	];

	if (input.cc.length > 0) headers.push(`Cc: ${formatAddressList(input.cc)}`);
	if (input.bcc.length > 0)
		headers.push(`Bcc: ${formatAddressList(input.bcc)}`);

	headers.push(`Subject: ${encodeHeaderText(input.subject)}`);
	headers.push(`Date: ${input.sentAt.toUTCString()}`);
	headers.push(`Message-ID: <${cleanMessageId(input.messageId)}>`);
	if (input.inReplyTo) {
		headers.push(`In-Reply-To: <${cleanMessageId(input.inReplyTo)}>`);
	}
	if (input.references.length > 0) {
		headers.push(
			`References: ${input.references
				.map((id) => `<${cleanMessageId(id)}>`)
				.join(" ")}`,
		);
	}
	headers.push("MIME-Version: 1.0");
	headers.push('Content-Type: text/plain; charset="UTF-8"');
	headers.push("Content-Transfer-Encoding: base64");

	const body = Buffer.from(
		input.body.replaceAll("\r\n", "\n").replaceAll("\r", "\n"),
		"utf8",
	)
		.toString("base64")
		.replace(/(.{76})/g, "$1\r\n");

	return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export function encodeRawMime(mime: string): string {
	return Buffer.from(mime, "utf8").toString("base64url");
}

export function formatAddress(address: AddressInput): string {
	const email = cleanHeaderValue(address.email);
	const name = address.name ? cleanHeaderValue(address.name).trim() : "";
	if (!name) return `<${email}>`;
	return `${encodeHeaderText(name)} <${email}>`;
}

export function formatAddressList(addresses: AddressInput[]): string {
	return addresses.map(formatAddress).join(", ");
}

export function encodeHeaderText(value: string): string {
	const clean = cleanHeaderValue(value);
	if (isAscii(clean)) return clean;
	return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

export function cleanHeaderValue(value: string): string {
	let result = "";
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code === 13 || code === 10) {
			result += " ";
			continue;
		}
		if (code < 32 || code === 127) continue;
		result += value[index];
	}
	return result;
}

export function cleanMessageId(value: string): string {
	return value
		.trim()
		.replace(/^</, "")
		.replace(/>$/, "")
		.replaceAll(/[\s<>]/g, "");
}

function isAscii(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		if (value.charCodeAt(index) > 126) return false;
	}
	return true;
}
