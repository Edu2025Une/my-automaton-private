import path from "path";

/** Local runtime data directory; it does not initialize wallet or network state. */
export function getAutomatonDir(): string {
  return path.join(process.env.HOME || "/root", ".automaton");
}
