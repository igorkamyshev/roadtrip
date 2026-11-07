// The Worker's secrets, which `wrangler types` does not see: the Owner sets them (`wrangler secret put`), and
// `.dev.vars` holds them for `wrangler dev`. Not `secrets.required` in wrangler.jsonc: that fails a deploy while a
// secret is unset. Both of the generated `Env`s get them.

interface SecretsEnv {
	/** Sherpa's Requirements API key, for `POST /v3/maps` (src/sherpa.ts). */
	SHERPA_API_KEY: string;
}

interface Env extends SecretsEnv {}

declare namespace Cloudflare {
	interface Env extends SecretsEnv {}
}
