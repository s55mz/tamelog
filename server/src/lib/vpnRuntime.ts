import { execFileSync } from "node:child_process";
import { accessSync, constants, readFileSync, writeFileSync } from "node:fs";

export const vpnHelperCommand = process.env.VPN_HELPER_COMMAND?.trim() ?? "";
export const vpnEapSecretsPath = process.env.VPN_EAP_SECRETS_PATH ?? "/etc/ipsec.d/eap-users.secrets";
export const ipsecCommand = process.env.IPSEC_COMMAND ?? "ipsec";
export const wireGuardCommand = process.env.WG_COMMAND ?? "wg";
export const wireGuardInterface = process.env.WG_INTERFACE ?? "wg0";

export class VpnRuntimeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_CONFIGURED"
      | "PERMISSION_DENIED"
      | "COMMAND_FAILED"
      | "INVALID_ARGUMENT"
  ) {
    super(message);
    this.name = "VpnRuntimeError";
  }
}

function hasReadAccess(path: string) {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function hasWriteAccess(path: string) {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function runExec(command: string, args: string[]) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new VpnRuntimeError(`${command} ${args.join(" ")} failed: ${detail}`, "COMMAND_FAILED");
  }
}

function parseCommand(command: string) {
  const parts = command.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new VpnRuntimeError("VPN helper command is not configured", "NOT_CONFIGURED");
  }
  return {
    command: parts[0],
    baseArgs: parts.slice(1)
  };
}

function runVpnHelper(args: string[]) {
  if (!vpnHelperCommand) {
    throw new VpnRuntimeError("VPN helper command is not configured", "NOT_CONFIGURED");
  }

  const parsed = parseCommand(vpnHelperCommand);
  return runExec(parsed.command, [...parsed.baseArgs, ...args]);
}

function rewriteEapSecrets(username: string, password: string | null) {
  if (!hasReadAccess(vpnEapSecretsPath) || !hasWriteAccess(vpnEapSecretsPath)) {
    throw new VpnRuntimeError(
      `VPN secrets file is not writable: ${vpnEapSecretsPath}`,
      "PERMISSION_DENIED"
    );
  }

  const current = readFileSync(vpnEapSecretsPath, "utf8");
  const lines = current.split(/\r?\n/);
  const filtered = lines.filter((line) => !line.startsWith(`${username} : EAP "`));

  if (password !== null) {
    filtered.push(`${username} : EAP "${password}"`);
  }

  const normalized = filtered.filter((line, index, array) =>
    line.length > 0 || index < array.length - 1
  );

  writeFileSync(vpnEapSecretsPath, `${normalized.join("\n")}\n`, { encoding: "utf8" });
  runExec(ipsecCommand, ["rereadsecrets"]);
}

export function provisionVpnCredentials(username: string, password: string) {
  if (!username || !password) {
    throw new VpnRuntimeError("VPN credentials are incomplete", "INVALID_ARGUMENT");
  }

  if (vpnHelperCommand) {
    runVpnHelper(["add-eap", username, password]);
    return "helper";
  }

  rewriteEapSecrets(username, password);
  return "direct";
}

export function revokeVpnCredentials(username: string) {
  if (!username) {
    throw new VpnRuntimeError("VPN username is required", "INVALID_ARGUMENT");
  }

  if (vpnHelperCommand) {
    runVpnHelper(["remove-eap", username]);
    return "helper";
  }

  rewriteEapSecrets(username, null);
  return "direct";
}

export function readIpsecStatus() {
  if (vpnHelperCommand) {
    return runVpnHelper(["ipsec-status"]);
  }

  return runExec(ipsecCommand, ["statusall"]);
}

export function readWireGuardDump() {
  if (vpnHelperCommand) {
    return runVpnHelper(["wg-dump", wireGuardInterface]);
  }

  return runExec(wireGuardCommand, ["show", wireGuardInterface, "dump"]);
}

export function getVpnRuntimeInfo() {
  return {
    helperCommand: vpnHelperCommand || null,
    eapSecretsPath: vpnEapSecretsPath,
    eapSecretsReadable: hasReadAccess(vpnEapSecretsPath),
    eapSecretsWritable: hasWriteAccess(vpnEapSecretsPath),
    provisioningMode: vpnHelperCommand ? "helper" : "direct",
    ipsecCommand,
    wireGuardCommand,
    wireGuardInterface
  };
}
