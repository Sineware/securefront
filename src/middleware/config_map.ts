import type { Context } from "@oak/oak/context";
import { config } from "../config.ts";

export async function configMap(ctx: Context, next: () => Promise<unknown>) {
    const host = ctx.request.url.host;
    const proxy = config.proxy.find(p => p.host === host);
    if (!proxy) {
        const wildcardProxy = config.proxy.find(p => p.host === "*");
        if (wildcardProxy) {
            console.log(`[ID ${ctx.state.requestId}] Using wildcard proxy for ${host}`);
            ctx.state.proxy = wildcardProxy;
            await next();
            return;
        } else {
            ctx.response.status = 404;
            ctx.response.body = "Not found";
            return;
        }
    }
    ctx.state.proxy = proxy;
    await next();
}