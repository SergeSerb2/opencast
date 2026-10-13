import { mountWindow } from "../app/mount";
import { NotesApp } from "./NotesApp";
import { captureEarlyRoute } from "./early-route";

captureEarlyRoute();
mountWindow(<NotesApp />);
