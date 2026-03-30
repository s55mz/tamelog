#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { accessSync, constants, readFileSync, writeFileSync } = require("node:fs");

const secretsPath = process.env.VPN_EAP_SECRETS_PATH || "/etc/ipsec.d/eap-users.secrets";
const ipsecCommand = process.env.IPSEC_COMMAND || "ipsec";
const wgCommand = process.env.WG_COMMAND || "wg";
const wgInterface = process.env.WG_INTERFACE || "wg0";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function ensureRoot() {
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    fail("vpn-helper must run as root");
  }
}

function ensureWritable(path) {
  try {
    accessSync(path, constants.R_OK | constants.W_OK);
  } catch {
    fail(`cannot access ${path}`);
  }
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function rewriteUser(username, password) {
  ensureWritable(secretsPath);
  const current = readFileSync(secretsPath, "utf8");
  const filtered = current
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(`${username} : EAP "`));

  if (password !== null) {
    filtered.push(`${username} : EAP "${password}"`);
  }

  const normalized = filtered.filter((line, index, array) =>
    line.length > 0 || index < array.length - 1
  );

  writeFileSync(secretsPath, `${normalized.join("\n")}\n`, { encoding: "utf8" });
  run(ipsecCommand, ["rereadsecrets"]);
}

function main() {
  ensureRoot();

  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    fail("usage: vpn-helper.js <add-eap|remove-eap|ipsec-status|wg-dump> [...]");
  }

  if (command === "add-eap") {
    const [username, password] = args;
    if (!username || !password) {
      fail("usage: vpn-helper.js add-eap <username> <password>");
    }
    rewriteUser(username, password);
    process.stdout.write("ok\n");
    return;
  }

  if (command === "remove-eap") {
    const [username] = args;
    if (!username) {
      fail("usage: vpn-helper.js remove-eap <username>");
    }
    rewriteUser(username, null);
    process.stdout.write("ok\n");
    return;
  }

  if (command === "ipsec-status") {
    process.stdout.write(run(ipsecCommand, ["statusall"]));
    return;
  }

  if (command === "wg-dump") {
    const targetInterface = args[0] || wgInterface;
    process.stdout.write(run(wgCommand, ["show", targetInterface, "dump"]));
    return;
  }

  fail(`unknown command: ${command}`);
}

main();
