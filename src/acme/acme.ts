import { config } from "../config.ts";

const DOMAIN = config.tls?.domains;
const FIRST_DOMAIN = DOMAIN?.split(",")[0];
const EMAIL = config.tls?.email;
const CERT_DIR = "/root/.acme.sh";

async function runCommand(cmd: string, args: string[], options: Deno.CommandOptions = {}, throwOnCode: boolean = true): Promise<boolean> {
  const process = new  Deno.Command(cmd, {
        stderr: "inherit",
        stdout: "inherit",
        stdin: "inherit",
        ...options,
        args
    });
    const {success, code} = await process.output();

  if (!success && throwOnCode) {
    throw new Error(`Command ${cmd} failed with code ${code}`);
  }
  return success;
}

async function setupCertificates() {
  // Check if acme.sh is installed
  if(EMAIL === undefined) throw new Error("Email is required to issue certificates");
  if(DOMAIN === undefined) throw new Error("Domain is required to issue certificates");

    await runCommand("sh", [
        "-c",
        `cd /opt/acme.sh && /opt/acme.sh/acme.sh --install --home ${CERT_DIR} --nocron`
    ]);
    await runCommand(CERT_DIR + "/acme.sh", [
        "--register-account",
        "-m",
        EMAIL
    ]);

  console.log("Issuing certificate...");
  try {
    await runCommand(CERT_DIR + "/acme.sh", [
      "--issue",
      "--standalone",
      "--ecc",
      // we need domain split by comma and set to -d flag array
      ...DOMAIN.split(",").map((d) => ["-d", d]).flat(),
    ], {}, false);
  } catch (error) {
    console.error("Failed to issue certificate:", error);
    throw error;
  }
}

async function renewCertificates() {
    if(EMAIL === undefined) throw new Error("Email is required to issue certificates");
    if(DOMAIN === undefined) throw new Error("Domain is required to issue certificates");
    if(FIRST_DOMAIN === undefined) throw new Error("Invalid domains");

    console.log("Checking for certificate renewal...");
    try {
        const status = await runCommand(CERT_DIR + "/acme.sh", [
            "--renew",
            "-d",
            FIRST_DOMAIN,
        ], {}, false);
        if(status) {
            console.log("Certificate renewed successfully, restarting server...");
            Deno.exit(0);
        }
    } catch (error) {
        console.error("Failed to renew certificate:", error);
    }
}

export { setupCertificates, renewCertificates, DOMAIN, FIRST_DOMAIN, EMAIL, CERT_DIR };