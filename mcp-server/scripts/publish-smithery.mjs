#!/usr/bin/env node
// Publish an MCPB bundle to Smithery as a stdio release.
//
//   SMITHERY_API_KEY=... node scripts/publish-smithery.mjs inbed-dating.mcpb [inbed/dating]
//
// Why not `smithery mcp publish`: the CLI copies manifest.json `tools` into
// Smithery's server card, and Smithery requires each tool's `inputSchema` —
// which the MCPB manifest schema rejects. So the card here comes from the
// bundle's own server (tools/list, prompts/list, resources/list): the server
// code stays the single source of truth. Payload shape mirrors @smithery/cli.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [bundleArg, name = "inbed/dating"] = process.argv.slice(2);
const apiKey = process.env.SMITHERY_API_KEY;
if (!bundleArg || !apiKey) {
  console.error("usage: SMITHERY_API_KEY=... node scripts/publish-smithery.mjs <bundle.mcpb> [namespace/server]");
  process.exit(1);
}
const bundlePath = resolve(bundleArg);
const api = "https://api.smithery.ai";
const auth = { Authorization: `Bearer ${apiKey}` };

// 1. Unpack the bundle and ask its server what it offers.
const dir = mkdtempSync(join(tmpdir(), "mcpb-"));
let manifest, tools, prompts, resources;
try {
  execFileSync("unzip", ["-q", bundlePath, "-d", dir]);
  manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const client = new Client({ name: "smithery-publish", version: "0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(dir, manifest.server.entry_point)],
    env: { ...process.env, INBED_API_KEY: "" },
  }));
  ({ tools } = await client.listTools());
  ({ prompts } = await client.listPrompts());
  ({ resources } = await client.listResources());
  await client.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// 2. MCPB user_config (flat keys) -> JSON Schema, as the Smithery CLI does.
const configSchema = { type: "object", properties: {}, required: [] };
for (const [key, opt] of Object.entries(manifest.user_config ?? {})) {
  configSchema.properties[key] = {
    type: opt.type === "directory" || opt.type === "file" ? "string" : opt.type,
    ...(opt.title && { title: opt.title }),
    ...(opt.description && { description: opt.description }),
    ...(opt.default !== undefined && { default: opt.default }),
  };
  if (opt.required) configSchema.required.push(key);
}

const payload = {
  type: "stdio",
  runtime: manifest.server.type, // "node"
  serverCard: { serverInfo: { name: manifest.name, version: manifest.version }, tools, prompts, resources },
  ...(Object.keys(configSchema.properties).length > 0 && { configSchema }),
};
console.log(`Publishing ${name} v${manifest.version}: ${tools.length} tools, ${prompts.length} prompts, ${resources.length} resources`);

// 3. Upload the release (multipart: payload JSON + bundle file).
const form = new FormData();
form.append("payload", JSON.stringify(payload));
form.append("bundle", new Blob([readFileSync(bundlePath)]), basename(bundlePath));
const res = await fetch(`${api}/servers/${name}/releases`, { method: "PUT", headers: auth, body: form });
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Release rejected: HTTP ${res.status}`, JSON.stringify(body));
  process.exit(1);
}
console.log(`Release ${body.deploymentId} accepted (${body.status})`);
for (const w of body.warnings ?? []) console.warn(`warning: ${w}`);

// 4. Wait for the release to finish.
let status = body.status;
for (let i = 0; i < 60 && status === "WORKING"; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const r = await fetch(`${api}/servers/${name}/releases/${body.deploymentId}`, { headers: auth });
  status = (await r.json().catch(() => ({}))).status ?? status;
}
console.log(`Release status: ${status} — https://smithery.ai/servers/${name}`);
if (status !== "SUCCESS") process.exit(1);
