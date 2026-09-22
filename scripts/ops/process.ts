import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { open } from "node:fs/promises";
import type { Readable } from "node:stream";

/** No shell interpolation and no provider stderr/credentials in public logs. */
export function processChild(
  command: string,
  args: string[],
  env = process.env,
) {
  const child = spawn(command, args, {
    windowsHide: true,
    shell: false,
    env,
    stdio: "pipe",
  });
  child.stderr.resume();
  const finished = new Promise<void>((resolve, reject) => {
    child.once("error", () =>
      reject(new Error("No se pudo iniciar una herramienta de respaldo")),
    );
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Falló una herramienta de respaldo; no se emitió un recibo válido",
            ),
          ),
    );
  });
  // A consumer may await the pipe first. Attach a rejection handler immediately.
  void finished.catch(() => undefined);
  return { child, finished };
}

export async function commandText(
  command: string,
  args: string[],
  env = process.env,
) {
  const { child, finished } = processChild(command, args, env);
  child.stdin.end();
  let output = "";
  for await (const chunk of child.stdout) {
    output += chunk.toString();
    if (output.length > 16 * 1024 * 1024) {
      child.kill();
      throw new Error("Salida de herramienta excesiva");
    }
  }
  await finished;
  return output;
}

export async function outputFile(input: Readable, destination: string) {
  const file = await open(destination, "wx", 0o600);
  try {
    // Explicit writes avoid waiting for a close event on an autoClose:false stream.
    for await (const chunk of input) await file.writeFile(chunk);
    await file.sync();
  } finally {
    await file.close();
  }
}

export async function commandFile(
  command: string,
  args: string[],
  destination: string,
  env = process.env,
) {
  const { child, finished } = processChild(command, args, env);
  child.stdin.end();
  try {
    await Promise.all([outputFile(child.stdout, destination), finished]);
  } catch (error) {
    child.kill();
    await finished.catch(() => undefined);
    throw error;
  }
}

export async function stopChildren(children: ChildProcessWithoutNullStreams[]) {
  for (const child of children) if (child.exitCode === null) child.kill();
}
