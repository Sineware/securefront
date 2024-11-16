import type { Context } from "@oak/oak/context";
import { proxy } from "@oak/oak/proxy";

export async function reverseProxy(ctx: Context, next: () => Promise<unknown>) {
    console.log(`[ID ${ctx.state.requestId}] Proxying to ${ctx.state.proxy.proxy_url}`);

    if (ctx.request.headers.has("upgrade") && ctx.request.headers.get("upgrade") === "websocket") {
        const url = new URL(ctx.request.url.pathname, ctx.state.proxy.proxy_url);
        console.log(`[ID ${ctx.state.requestId}] Websocket Upgrade: ${url.href}`);
        const ws = ctx.upgrade();

        ws.onopen = () => {
            console.log(`[ID ${ctx.state.requestId}] Websocket connected to downstream, connecting to upstream`);
            const upstream_ws = new WebSocket(url);
            upstream_ws.onopen = () => console.log(`[ID ${ctx.state.requestId}] Websocket connected to upstream`);

            ws.onmessage = (msg) => upstream_ws.send(msg.data);
            upstream_ws.onmessage = (msg) => ws.send(msg.data);

            ws.onclose = () => upstream_ws.close();
            upstream_ws.onclose = () => ws.close();

            ws.onerror = () => upstream_ws.close();
            upstream_ws.onerror = () =>  ws.close();
        }
        
        ctx.response.status = 101;
        ctx.response.body = "Switching Protocols";
        return;
    } else if (ctx.request.headers.has("upgrade")) {
        ctx.response.status = 501;
        ctx.response.body = "Not Implemented";
        return;
    } else {
        await proxy(ctx.state.proxy.proxy_url,
            {
                request: (req) => {
                    return req;
                },
                response: (res) => {
                    return res;
                }
            }
        )(ctx, next);
    }
}