export const MACHINES = ["mac", "windows"] as const;

export type Machine = (typeof MACHINES)[number];

export const machineOn = (os: NodeJS.Platform): Machine => (os === "darwin" ? "mac" : "windows");
