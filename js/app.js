import { load } from "./storage.js";
import { setScenarios } from "./state.js";
import { renderBoard } from "./render.js";

const saved = load();

setScenarios(saved);

renderBoard();