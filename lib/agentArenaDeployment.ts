export function getArenaNodeRole() {
  return process.env.AGENT_ARENA_NODE_ROLE === "runtime" ? "runtime" : "web";
}

export function isArenaRuntimeNode() {
  return getArenaNodeRole() === "runtime";
}

export function getArenaRemoteOrigin() {
  const value = process.env.AGENT_ARENA_REMOTE_ORIGIN?.trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

export function shouldProxyArenaRequests() {
  return !isArenaRuntimeNode() && Boolean(getArenaRemoteOrigin());
}

export function shouldAutoStartArenaRunner() {
  return process.env.AGENT_ARENA_ENABLE_BACKGROUND_RUNNER === "true";
}

export function getArenaRunnerToken() {
  return process.env.AGENT_ARENA_RUNNER_TOKEN?.trim() || "";
}

export function hasValidArenaRunnerToken(request: Request) {
  const expected = getArenaRunnerToken();
  if (!expected) {
    return false;
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return bearer === expected;
}
