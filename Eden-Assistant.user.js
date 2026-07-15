// ==UserScript==
// @name         Eden Assistant
// @namespace    eden-assistant
// @version      0.5
// @description  Loads the current Eden Assistant DOM Inspector from GitHub
// @match        https://login.eden1vision.com/*
// @match        https://eden.dealfile.co.uk/*
// @updateURL    https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(async function () {
    "use strict";

    const sourceUrl = "https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden_Assistant_v0.5_DOM_Inspector.txt";

    try {
        const response = await fetch(sourceUrl, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`GitHub returned ${response.status}`);
        }

        const source = await response.text();
        const body = source.replace(/^\s*\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/m, "");

        (0, eval)(body);
    } catch (error) {
        console.error("[Eden Assistant] Failed to load script:", error);
        alert(`Eden Assistant failed to load: ${error.message || error}`);
    }
})();