#!/usr/bin/env node
// Fill manifest.json `tools` in a staged bundle dir from the server's own
// tools/list, so the bundle never carries a hand-copied (drifting) tool list.
// MCPB allows only name + description per tool. Used by scripts/bundle.sh.
//
//   node scripts/manifest-tools.mjs <stage-dir>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const stage = process.argv[2];
const manifestPath = join(stage, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const client = new Client({ name: "manifest-tools", version: "0" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(stage, manifest.server.entry_point)],
  env: { ...process.env, INBED_API_KEY: "" },
}));
const { tools } = await client.listTools();
await client.close();

manifest.tools = tools.map(({ name, description }) => ({ name, description }));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest.json: ${manifest.tools.length} tools from tools/list`);
