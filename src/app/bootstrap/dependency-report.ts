import { generateDependencyReport } from "@discordjs/voice";
import { getCiphers } from "node:crypto";

console.log(generateDependencyReport());
console.log("aes-256-gcm supported:", getCiphers().includes("aes-256-gcm"));
