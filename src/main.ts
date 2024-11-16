import { Application } from "@oak/oak/application";
/*  
    Sineware Securefront Server - A simple tls-terminating reverse proxy server with captcha protection
    Copyright (C) 2024 Seshan Ravikumar

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Proxy, config, renderErrorPage } from "./config.ts";
import { captchaGuard } from "./middleware/captcha.ts";
import { configMap } from "./middleware/config_map.ts";
import { renewCertificates, setupCertificates, FIRST_DOMAIN, CERT_DIR } from "./acme/acme.ts";
import { reverseProxy } from "./middleware/reverse_proxy.ts";

console.log("~~ Sineware Securefront Server 🍜 ~~");

const app = new Application({
    state: {
        proxy: {} as Proxy,
        requestId: "",
    }
});

// Error handling
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        console.error(err);
        ctx.response.status = 500;
        if (err instanceof Error) {
            ctx.response.body = await renderErrorPage("500 Internal Server Error", err.message);
        } else {
            ctx.response.body = await renderErrorPage("500 Internal Server Error", "Unknown error");
        }
        console.log(`[ID ${ctx.state.requestId}] Error:`, err);
    }
});

// Logging
app.use(async (ctx, next) => {
    const start = Date.now();
    ctx.state.requestId = "SF-" + crypto.randomUUID();

    ctx.response.headers.append("X-Request-ID", ctx.state.requestId);
    ctx.response.headers.append("X-Powered-By", "Sineware Securefront");

    await next();
    
    const ms = Date.now() - start;
    console.log(`[ID ${ctx.state.requestId}] ${ctx.request.ip} - - [${new Date().toISOString()}] "${ctx.request.method} ${ctx.request.url.pathname} ${ctx.request.secure ? "HTTPS" : "HTTP"}" ${ctx.response.status} - "${ctx.request.headers.get("user-agent")}" - "${ms}ms"`);
});

// Host state mapper
app.use(configMap);

// Captcha GUARD
app.use(captchaGuard);

// Proxy
app.use(reverseProxy);

// Start the server
if(config.tls?.enabled) {
    console.log("Running acme.sh certificate setup...");
    await setupCertificates();

    setInterval(async () => { await renewCertificates(); }, 12 * 60 * 60 * 1000);

    app.listen({ port: config.tls_port, hostname: config.hostname, 
        cert: Deno.readTextFileSync(`${CERT_DIR}/${FIRST_DOMAIN}_ecc/fullchain.cer`),
        key: Deno.readTextFileSync(`${CERT_DIR}/${FIRST_DOMAIN}_ecc/${FIRST_DOMAIN}.key`),
    });
} else if(config.tls_manual?.enabled) {
    app.listen({ port: config.tls_port, hostname: config.hostname, 
        cert: config.tls_manual.cert, 
        key: config.tls_manual.key
    });
} else {
    app.listen({ port: config.port, hostname: config.hostname });
}

let protocol = "http"
if(config.tls?.enabled) protocol = "https";
if(config.tls_manual?.enabled) protocol = "https";

console.log("Sineware Securefront running on " + protocol + "://" + config.hostname + ":"  + (config.tls?.enabled ? config.tls_port : config.port));