// Removes secrets from what we send to PostHog. The Tail Worker does not know
// the other workers' secrets, so it goes by their shape.

const REDACTED = '[redacted]';

const PATTERNS: RegExp[] = [
	// Telegram bot token, also inside https://api.telegram.org/bot<token>/...
	/\d{6,}:[A-Za-z0-9_-]{30,}/gu,
	// PostHog project and personal keys
	/\bph[cxs]_[A-Za-z0-9]{20,}/gu,
	// Anthropic, OpenRouter and other sk-... keys
	/\bsk-[A-Za-z0-9_-]{20,}/gu,
	// JWTs and other bearer tokens
	/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu,
	// R2 / S3 access keys and secrets: long hex strings
	/\b[a-f0-9]{32,}\b/giu,
	// AWS-style access key ids
	/\bAKIA[0-9A-Z]{16}\b/gu,
];

// Authorization: Bearer <token>, Basic <token>
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu;
// ?token=..., &api_key=..., X-Amz-Signature=...
const SECRET_PARAM = /([?&;][^=&\s"']*(?:token|secret|key|pass|signature|credential|auth)[^=&\s"']*=)[^&\s#"']+/giu;
// https://user:password@host
const URL_PASSWORD = /(\/\/[^/:@\s]+:)[^@/\s]+@/gu;

// Context fields whose whole value is a secret.
const SECRET_KEY = /^pass$|passw(or)?d|secret|token|api_?key|authorization|cookie|credential|signature/iu;

export function scrubString(text: string): string {
	let result = text
		.replaceAll(AUTH_SCHEME, `$1 ${REDACTED}`)
		.replaceAll(SECRET_PARAM, `$1${REDACTED}`)
		.replaceAll(URL_PASSWORD, `$1${REDACTED}@`);
	for (const pattern of PATTERNS) {
		result = result.replace(pattern, REDACTED);
	}
	return result;
}

/** A string field of the logger.error context: a field named like a secret is dropped whole. */
export function scrubContextValue(key: string, value: string): string {
	return SECRET_KEY.test(key) ? REDACTED : scrubString(value);
}
