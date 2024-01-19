import { KruSource } from "./inject";

export function hashToken(token: string): Promise<string>;
export function source(): Promise<KruSource>;
