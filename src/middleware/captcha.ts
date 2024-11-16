import type { Context } from "@oak/oak/context";
import * as jose from "@jose/jose";

import { config, encodedJwtSecret } from "../config.ts"

const CAPTCHA_PAGE_PATH = import.meta.dirname + "/resources/captcha.html";

async function renderCaptchaPage(redirectUrl: string, error: string = ""): Promise<string> {
    const captchaPage = await Deno.readTextFile(CAPTCHA_PAGE_PATH);
    return captchaPage
        .replace("{{SITEKEY}}", config.hcaptcha_sitekey)
        .replace("{{REDIRECT_URL}}", redirectUrl)
        .replace("{{ERROR_MSG}}", error == "" ? "" : `<p style="color: red">${error}</p>`);
}

export async function captchaGuard(ctx: Context, next: () => Promise<unknown>) {
    const proxy = ctx.state.proxy;
    if (!proxy.captcha) {
        await next();
        return;
    }

    // Bypass /.well-known/ for api compatibility
    if (ctx.request.url.pathname.startsWith("/.well-known/")) {
        await next();
        return;
    }
    
    // POST request containing form data hcaptcha to /sf-captcha-verify
    if (ctx.request.method === "POST" && ctx.request.url.pathname === "/sf-captcha-verify") {
        const formData = await ctx.request.body.formData();
        if (!formData.has("h-captcha-response")) {
            ctx.response.status = 400;
            ctx.response.body = renderCaptchaPage("", "400 Missing h-captcha-response");
            return;
        }
        if (!formData.has("sf-redirect-url")) {
            ctx.response.status = 400;
            ctx.response.body = renderCaptchaPage("", "400 Missing sf-redirect-url");
            return;
        }

        const response = formData.get("h-captcha-response")! as string;
        const redirect_url = formData.get("sf-redirect-url")! as string;

        const verifyUrl = "https://hcaptcha.com/siteverify";
        const verifyParams = new URLSearchParams({
            secret: config.hcaptcha_secret,
            response: response,
            remoteip: ctx.request.ip,
        });

        const verifyResponse = await fetch(verifyUrl, {
            method: "POST",
            body: verifyParams,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });

        if (!verifyResponse.ok) {
            ctx.response.status = 500;
            ctx.response.body = renderCaptchaPage(redirect_url, "500 Failed to verify captcha!");
            return;
        }

        const verifyJson = await verifyResponse.json();
        if (!verifyJson.success) {
            ctx.response.status = 401;
            ctx.response.body = renderCaptchaPage(redirect_url, "401 Failed to verify captcha!");
            return;
        }

        const jwtPayload = {
            ip: ctx.request.ip,
        };

        const jwt = await new jose.SignJWT(jwtPayload)
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setIssuer("sineware-securefront")
            .setAudience("sineware-securefront")
            .setExpirationTime(ctx.state.proxy.captcha_expire + "m")
            .sign(encodedJwtSecret);

        ctx.cookies.set("x-captcha-token", jwt, {
            httpOnly: true,
            secure: ctx.request.secure,
            sameSite: "strict",
            expires: new Date(Date.now() + ctx.state.proxy.captcha_expire * 60 * 1000),
        });

        ctx.response.status = 302;
        ctx.response.headers.set("Location", redirect_url);
        return;
    }

    const token = await  ctx.cookies.get("x-captcha-token");
    if (!token) {
        ctx.response.status = 401;
        ctx.response.body = await renderCaptchaPage(ctx.request.url.href);
        return;
    }
    try {
        const decoded = await jose.jwtVerify(token, encodedJwtSecret, { algorithms: ["HS256"] });
        if (decoded.payload.exp !== undefined  && decoded.payload.exp < Date.now() / 1000) {
            ctx.response.status = 401;
            ctx.response.body = await renderCaptchaPage(ctx.request.url.href);
            return;
        }
    } catch (error) {
        console.error("Failed to decode token:", error);
        ctx.response.status = 401;
        ctx.response.body = await renderCaptchaPage(ctx.request.url.href, "401 Failed to decode token!");
        return;
    }
    await next();
}