import {type Sign, SIGNS} from "./types.ts";

export function isSign(value: unknown): value is Sign {
    return typeof value === "string" && (SIGNS as readonly string[]).includes(value);
}
