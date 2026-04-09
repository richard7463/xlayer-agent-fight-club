import { getArenaRemoteOrigin, getArenaRunnerToken, shouldProxyArenaRequests } from "@/lib/agentArenaDeployment";

export async function maybeProxyArenaRequest(request: Request) {
  if (!shouldProxyArenaRequests()) {
    return null;
  }

  if (request.headers.get("x-agent-arena-proxy") === "1") {
    return null;
  }

  const origin = getArenaRemoteOrigin();
  if (!origin) {
    return null;
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = `${origin}${incomingUrl.pathname}${incomingUrl.search}`;
  const headers = new Headers(request.headers);
  headers.set("x-agent-arena-proxy", "1");
  headers.delete("host");
  headers.delete("content-length");

  const runnerToken = getArenaRunnerToken();
  if (runnerToken) {
    headers.set("authorization", `Bearer ${runnerToken}`);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl, init);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
