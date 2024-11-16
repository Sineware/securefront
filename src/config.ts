import { parse } from "@std/toml";
import { z } from "@zod/zod"

console.log("Reading configuration file...");

async function renderErrorPage(title: string, description: string = ""): Promise<string> {
    // as {{SITEKEY}}, {{REDIRECT_URL}}, {{ERROR}} replaced with the actual values
    const captchaPage = await Deno.readTextFile(import.meta.dirname + "/middleware/resources/error.html");
    return captchaPage
        .replace("{{TITLE}}", title)
        .replace("{{DESCRIPTION}}", description)
}

const proxySchema = z.object({
    host: z.string(),
    path: z.string().optional(),
    proxy_url: z.string(),
    websocket: z.boolean().optional(),
    captcha: z.boolean().optional(),
    captcha_expire: z.number().optional(),
    basic_auth: z.string().optional(),
});

const configToml = parse(Deno.readTextFileSync("./securefront.config.toml"));
const configSchema = z.object({
    port: z.number(),
    tls_port: z.number(),
    hostname: z.string(),
    captcha_jwt_secret: z.string(),
    hcaptcha_sitekey: z.string(),
    hcaptcha_secret: z.string(),
    tls: z.object({
        enabled: z.boolean(),
        domains: z.string(),
        email: z.string(),
    }).optional(),
    tls_manual: z.object({
        enabled: z.boolean(),
        cert: z.string(),
        key: z.string(),
    }).optional(),
    proxy: z.array(proxySchema),
});
const config = configSchema.parse(configToml);

type Proxy = z.infer<typeof proxySchema>;
type Config = z.infer<typeof configSchema>;

const encodedJwtSecret = new TextEncoder().encode(config.captcha_jwt_secret);

console.log(`Port: ${config.port}`);
console.log(`Auto TLS: ${config.tls?.enabled} - ${config.tls?.domains}`);
console.log(`Manual TLS: ${config.tls_manual?.enabled}`);
console.table(config.proxy);
export { config, encodedJwtSecret, renderErrorPage, type Proxy, type Config };