import type { Service } from "../../context";
import { calculatorService } from "./calculator";
import { clipboardService } from "./clipboard";
import { snippetsService } from "./snippets";
import { quicklinksService } from "./quicklinks";
import { notesService } from "./notes";
import { emojiService } from "./emoji";
import { filesService } from "./files";
import { processesService } from "./processes";
import { systemService } from "./system";
import { scriptsService } from "./scripts";
import { themesService } from "./themes";
import { dataService } from "./data";
import { commandsService } from "./commands";

export const coreServices: Service[] = [
  calculatorService,
  clipboardService,
  snippetsService,
  quicklinksService,
  notesService,
  emojiService,
  filesService,
  systemService,
  processesService,
  scriptsService,
  themesService,
  dataService,
  commandsService,
];
