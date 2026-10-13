import type { Service } from "../context";
import { hostSettingsService } from "./host-settings";
import { networkService } from "./network";
import { coreServices } from "./core";
import { aiService } from "./ai";
import { extensionsService } from "./extensions";
import { syncService } from "./sync";

/** Registration order matters only for migrations; services talk through ctx registries. */
export const SERVICES: Service[] = [networkService, hostSettingsService, ...coreServices, aiService, extensionsService, syncService];
